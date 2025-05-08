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


export function generateAlleleDosage(maf) {
    // Calculate Hardy-Weinberg equilibrium frequencies
    const calculateHWE = (maf) => {
        const recessive = maf ** 2;
        const dominant = (1 - maf) ** 2;

        return [dominant, 1 - dominant - recessive, recessive];
    };

    const r = Math.random();
    const [domHom, het, recHom] = calculateHWE(maf);

    return [r < recHom ? 2 : (domHom > r < recHom ? 1 : 0)];
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


export async function getSnpsInfo(pgsId, build, file) {
    //const loadPgsModel = await loadScore(pgsId, build);
    const loadPgsModel = await fetch(file);
    const text = await loadPgsModel.text();
    const parsedPgsModel = parseFile(text);

    return await processSnpData(parsedPgsModel);
}


export function matchCasesWithControls(
    header,
    data,
    totalTarget = 10000,
    caseControlRatio = 0.5
) {
    // Get column indexes from header
    const caseIdx = header.indexOf('case');
    const onsetIdx = header.indexOf('ageOfOnset');
    const entryIdx = header.indexOf('ageOfEntry');
    const exitIdx = header.indexOf('ageOfExit');
    const idIdx = header.indexOf('id');

    // Validate column indexes
    [caseIdx, entryIdx, exitIdx, idIdx].forEach((idx) => {
        if (idx === -1) throw new Error('Missing required column');
    });

    // Split population
    const allCases = data.filter(row => row[caseIdx] === 1);
    const allControls = data.filter(row => row[caseIdx] === 0);

    // Pre-process controls into Map by entryAge for O(1) lookups
    const controlsByEntryAge = new Map();
    allControls.forEach(control => {
        const entryAge = control[entryIdx];

        if (!controlsByEntryAge.has(entryAge)) {
            controlsByEntryAge.set(entryAge, []);
        }

        controlsByEntryAge.get(entryAge).push(control);
    });

    // Calculate targets
    const targetCases = Math.round(totalTarget * caseControlRatio);
    const targetControls = totalTarget - targetCases;

    // Resample cases using Fisher-Yates shuffle
    const selectedCases = [];
    const caseCopies = [...allCases];
    for (let i = 0; i < Math.min(targetCases, caseCopies.length); i++) {
        const randIndex = Math.floor(Math.random() * (caseCopies.length - i)) + i;
        [caseCopies[i], caseCopies[randIndex]] = [caseCopies[randIndex], caseCopies[i]];
        selectedCases.push(caseCopies[i]);
    }

    const matched = [];
    let totalControls = 0;

    // Main matching loop
    for (const caseRow of selectedCases) {
        const caseEntryAge = caseRow[entryIdx];
        const eligibleControls = controlsByEntryAge.get(caseEntryAge) || [];

        // Calculate needed controls
        const remaining = targetControls - totalControls;
        const remainingCases = selectedCases.length - matched.length;
        const needed = Math.max(1, Math.min(
            Math.ceil(remaining / remainingCases),
            eligibleControls.length
        ));

        // Select random controls without modifying original array
        const selected = selectRandomItems(eligibleControls, needed);

        matched.push({
            case: caseRow,
            controls: selected
        });
        totalControls += selected.length;
    }

    console.log(
        `Case-Control Matching Complete:\n` +
        `   - Cases matched: ${matched.length} (target: ${targetCases})\n` +
        `   - Controls matched: ${totalControls} (target: ${targetControls})\n` +
        `   - Matching ratio: 1:${(totalControls / matched.length).toFixed(2)}`
    );

    return matched;
}


// Efficient random selection without full shuffle
function selectRandomItems(array, count) {
    const result = [];
    const taken = new Set();

    for (let i = 0; i < count && i < array.length; i++) {
        let index;
        do {
            index = Math.floor(Math.random() * array.length);
        } while (taken.has(index));

        taken.add(index);
        result.push(array[index]);
    }
    return result;
}
