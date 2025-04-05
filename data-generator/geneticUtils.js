import { asyncPool, httpRequest } from './httpUtils.js';
import { sleep } from './utils.js';
import { parseFile } from './fileParser.js';
import { loadScore } from './loaders.js';
import { processSnpData } from './dataProcessingUtils.js';

import { nelderMead } from './nelderMead.js';


export async function getRsIds(snpsInfo, apiKey) {
    const requestInterval = 100; // 100ms between different SNPs
    const retryDelay = 150;       // 50ms between retries for same SNP
    const maxRetries = 3;

    // Helper function with exponential backoff
    const fetchWithRetry = async (url) => {
        for (let attempt = 1; attempt <= maxRetries; attempt++) {
            let response = await fetch(url);
            console.log(response.ok);
            if (!response.ok) {
                console.log(`Failed to fetch, trying attempt number ${attempt}`);
                if (attempt < maxRetries) {
                    console.log(`Failed to fetch, trying attempt number ${attempt}`);
                    await sleep(retryDelay);
                }
                else throw new Error(`HTTP ${response.status}`);
            }
            else {
                return response.json();
            }
        }
    };

    for (let i = 0; i < snpsInfo.length - 300; i++) { // Removed -310 from loop condition
        const snpString = snpsInfo[i].id;
        const [chromosome, position] = snpString.split(':');
        const eUtilsURL = `https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esearch.fcgi?db=snp&term=${chromosome}[BCHR]+AND+${position}[BPOSITION]&retmode=json${apiKey ? `&api_key=${apiKey}` : ''}`;

        try {
            const data = await fetchWithRetry(eUtilsURL);
            const rsID = data?.esearchresult?.idlist?.[0];

            if (!rsID) {
                console.error(`No rsID found for ${snpString} after ${maxRetries} attempts`);
                continue;
            }

            console.log(`rs${rsID} added for ${snpString}`);
            snpsInfo[i].rsID = rsID;
        } catch (error) {
            console.error(`Failed attempt for ${snpString}: ${error.message}`);
        }

        // Only wait if not last item
        if (i < snpsInfo.length - 1) await sleep(requestInterval);
    }

    return snpsInfo;
}

export async function getChromosomeAndPosition(rsIDs, genomeBuild, apiKey) {
    const requestLimit = 10;

    const results = await asyncPool(requestLimit, rsIDs, async (rsID) => {
        rsID = rsID.split('rs')[1];
        const eutilsURL = `https://eutils.ncbi.nlm.nih.gov/entrez/eutils/efetch.fcgi?db=snp&id=${rsID}&retmode=json&api_key=${apiKey}`;

        try {
            const response = await httpRequest(eutilsURL);
            const assembly = response.refsnp[0].placements_with_allele.filter(
                (item) => item.assembly_name === genomeBuild
            )[0];

            if (!assembly) {
                throw new Error(`Genome build ${genomeBuild} not found for rsID ${rsID}.`);
            }

            const chromosome = assembly.seq_id;
            const position = assembly.alleles[0].hgvs.lct.position;

            return { rsID, chromosome, position };
        } catch (error) {
            console.error(`Error fetching SNP information for rsID ${rsID}: ${error.message}`);
            return null;
        }
    });

    return results;
}

export function generateAlleleDosage([_, heterozygousFreq, recessiveHomozygousFreq]) {
    const r = Math.random();

    return r < recessiveHomozygousFreq ? 2 : (r < recessiveHomozygousFreq + heterozygousFreq ? 1 : 0);
}

export function generateWeibullIncidenceCurve(k, b, linearPredictors, maxAge) {
    function populationCdf(t) {
        if (t <= 0) return 0.0;
        let sumSurv = 0.0;

        for (let i = 0; i < linearPredictors.length; i++) {
            sumSurv += Math.exp(-b * Math.exp(linearPredictors[i]) * Math.pow(t, k));
        }

        const avgSurv = sumSurv / linearPredictors.length;

        return 1 - avgSurv;
    }

    const results = [];

    for (let age = 0; age <= maxAge; age++) {
        const cdf1 = populationCdf(age);
        const cdf2 = populationCdf(age + 1);
        const inc = cdf2 - cdf1; // Probability of event in [age, age+1)
        // probability per year => "annual incidence rate"
        results.push({ age, rate: inc });
    }

    return results;
}

export function estimateWeibullParameters(empiricalCdf, linearPredictors) {
    let ages = new Float64Array(empiricalCdf.map((x) => x.age));
    let empCdf = new Float64Array(empiricalCdf.map((x) => x.cdf));
    const modelCdfBuffer = new Float64Array(ages.length);
    const agePowers = new Float64Array(ages.length);
    const expTerms = new Float64Array(linearPredictors.length);

    function modelCdf(k, b) {
        for (let i = 0; i < ages.length; i++) {
            agePowers[i] = Math.pow(ages[i], k);
        }

        // Calculate survival probabilities
        for (let i = 0; i < ages.length; i++) {
            const ageTerm = b * agePowers[i];
            let sumSurvival = 0;

            // Single loop for exp terms and summation
            for (let j = 0; j < linearPredictors.length; j++) {
                sumSurvival += Math.exp(-ageTerm * Math.exp(linearPredictors[j]));
            }

            modelCdfBuffer[i] = 1 - (sumSurvival / linearPredictors.length);
        }
        return modelCdfBuffer;
    }

    function rmse(pred, truth) {
        let errorSum = 0;
        for (let i = 0; i < pred.length; i++) {
            const diff = pred[i] - truth[i];
            errorSum += diff * diff;
        }
        return Math.sqrt(errorSum / pred.length);
    }

    const rmse_weibull = (params) => {
        const [k, log_b] = params;
        const b = Math.exp(log_b);
        return rmse(modelCdf(k, b), empCdf); // Pass only k/b
    };

    let initialGuess = [1, 1]; // Initial guess for k and b
    let params = nelderMead(rmse_weibull, initialGuess, {
        maxIterations: 500,
        minErrorDelta: 1e-9,
        minTolerance: 1e-8,
        rho: 1.2,
        chi: 1.8,
        psi: -0.6,
        sigma: 0.6
    });
    console.log('Fitted parameters (k, b):', params.x[0], Math.exp(params.x[1]), params.fx);

    return params.x;
}

export async function getSnpsInfo(pgsId, build) {
    const loadPgsModel = await loadScore(pgsId, build);
    const parsedPgsModel = parseFile(loadPgsModel);

    return await processSnpData(parsedPgsModel);
}

export function matchCasesWithControls(
    header,
    data,
    caseVariable = 'case',
    entryVariable = 'ageOfEntry',
    exitVariable = 'ageOfExit',
    totalTarget = 10000,
    caseControlRatio = 0.5
) {
    // Get column indexes from header
    const caseIdx = header.indexOf(caseVariable);
    const entryIdx = header.indexOf(entryVariable);
    const exitIdx = header.indexOf(exitVariable);
    const idIdx = header.indexOf('id');
    const onsetIdx = header.indexOf('ageOfOnset');

    // Validate column indexes
    [caseIdx, entryIdx, exitIdx, idIdx, onsetIdx].forEach((idx, i) => {
        if (idx === -1) throw new Error(`Missing required column: ${[caseVariable, entryVariable, exitVariable, 'id', 'ageOfOnset'][i]}`);
    });

    // Split population (assuming exact case count exists)
    const allCases = data.filter(row => row[caseIdx] === 1);
    const allControls = data.filter(row => row[caseIdx] === 0);

    // Calculate control targets using your original logic
    const targetCases = allCases.length; // Use all available cases
    const targetControls = Math.min(
        Math.round(totalTarget * (1 - caseControlRatio)),
        allControls.length
    );

    const matched = [];
    const controlPool = [...allControls];
    const shuffledCases = shuffleArray(allCases);

    // Your exact control distribution logic
    const minControlsPerCase = 1;
    const baseControlsPerCase = Math.floor(targetControls / targetCases);
    const extraControlProbability = (targetControls % targetCases) / targetCases;

    shuffledCases.forEach(caseRow => {
        let ageOffset = 0;
        let eligibleControls = [];
        const caseOnsetAge = caseRow[onsetIdx];
        console.log(`\n=== Matching case with onset age: ${caseOnsetAge} ===`);

        // Progressive age expansion
        while (eligibleControls.length < minControlsPerCase && ageOffset <= 10) {
            eligibleControls = controlPool.filter(controlRow => {
                const controlEntry = controlRow[entryIdx];
                const controlExit = controlRow[exitIdx];
                return Math.abs(controlEntry - caseOnsetAge) <= ageOffset &&
                    controlExit >= caseOnsetAge;
            });
            console.log(`Age offset: ${ageOffset} (${caseOnsetAge - ageOffset} to ${caseOnsetAge + ageOffset})`);
            console.log(`Potential controls:`, eligibleControls.map(c => ({
                id: c[idIdx],
                entry: c[entryIdx],
                exit: c[exitIdx]
            })));
            ageOffset++;
        }

        console.log(`Final matched controls for case ${caseRow[idIdx]} (onset ${caseOnsetAge}):`,
            eligibleControls.map(c => ({
                id: c[idIdx],
                entry: c[entryIdx],
                exit: c[exitIdx],
                ageDiff: Math.abs(c[entryIdx] - caseOnsetAge)
            }))
        );

        // Your original control assignment logic
        const numToAssign = Math.max(
            minControlsPerCase,
            Math.min(
                baseControlsPerCase + (Math.random() < extraControlProbability ? 1 : 0),
                eligibleControls.length
            )
        );

        const selectedControls = shuffleArray(eligibleControls).slice(0, numToAssign);

        // Remove used controls from pool
        selectedControls.forEach(control => {
            const index = controlPool.findIndex(c => c[idIdx] === control[idIdx]);
            if (index > -1) controlPool.splice(index, 1);
        });

        matched.push({
            case: caseRow,
            controls: selectedControls
        });
    });

    const totalControls = matched.reduce((sum, m) => sum + m.controls.length, 0);

    console.log(
        `Case-Control Matching Complete:\n` +
        `   - Cases matched: ${matched.length}\n` +
        `   - Controls matched: ${totalControls} (available: ${allControls.length})\n` +
        `   - Matching ratio: 1:${(totalControls / matched.length).toFixed(2)}`
    );

    return matched;
}

function shuffleArray(array) {
    const arr = [...array];
    for (let i = arr.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
}