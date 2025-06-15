import { asyncPool, httpRequest } from './httpUtils.js';
import { downloadCohortFromChunks, sleep } from './generalUtils.js';
import { parseFile } from './fileParser.js';
import { processSnpData } from './dataProcessingUtils.js';
import { nelderMead } from './nelderMead.js';
import { INDEX } from '../constants.js';


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

    return await asyncPool(requestLimit, rsIDs, async (rsID) => {
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
}


export function generateAlleleDosage(maf) {
    const r = Math.random();
    const p0 = (1 - maf) ** 2;
    const p1 = 2 * maf * (1 - maf);
    const p2 = maf ** 2;

    const recessive = maf ** 2;
    const dominant = (1 - maf) ** 2;

    let dosage = 0;

    if (r < p0) {
        dosage = 0;
    }
    else if (r < p0 + p1) {
        dosage = 1;
    }
    else {
        dosage = 2;
    }

    return dosage;
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


export async function generateKaplanMeierData(cohort) {
    /* global localforage */
    if (!cohort) {
        throw new Error('Invalid cohort input');
    }

    const header = await localforage.getItem('header');

    if (!header) {
        throw new Error('Header missing');
    }

    const indices = {
        ageOfEntry: header.indexOf('ageOfEntry'),
        ageOfExit: header.indexOf('ageOfExit'),
        ageOfOnset: header.indexOf('ageOfOnset')

    };

    if (
        indices.ageOfEntry === -1 ||
        indices.ageOfExit === -1 ||
        indices.ageOfOnset === -1
    ) {
        throw new Error('Missing required columns in cohort data');
    }

    const subjects = cohort.map((profile) => {
        const entryAge = profile[indices.ageOfEntry];
        const exitAge = profile[indices.ageOfExit];
        const followup = exitAge - entryAge;
        const onsetAge = profile[indices.ageOfOnset];

        // The event occurs if time_of_onset <= study_exit_age
        // timeSinceEntryOfEvent = onsetAge - entryAge
        const eventTimeSinceEntry = onsetAge - entryAge;
        const censorTime = followup;  // = exitAge - entryAge

        // Observed time is min(eventTimeSinceEntry, censorTime)
        const observedTime = Math.min(eventTimeSinceEntry, censorTime);

        // eventIndicator = 1 if onsetAge <= exitAge, 0 otherwise
        const isEvent = eventTimeSinceEntry <= censorTime ? 1 : 0;

        return {
            time: observedTime,
            event: isEvent
        };
    });

    // Exclude any negative or zero times (shouldn't happen if T>=entryAge)
    //    but just in case numeric rounding etc.
    const cleaned = subjects.filter((subj) => subj.time >= 0);

    // Sort by time ascending
    cleaned.sort((a, b) => a.time - b.time);

    // Kaplan-Meier calculation
    //    S(0) = 1
    //    For each unique event time t_j:
    //       r_j = number at risk just prior to t_j
    //       d_j = number of events at t_j
    //       S(t_j) = S(t_{j-1}) * (1 - d_j / r_j)
    //
    //    Greenwood variance:
    //       var( S(t_j) ) = S(t_j)^2 * sum_{i=1..j} [ d_i / ( r_i * (r_i - d_i) ) ]
    //    95% CI => S(t_j) +/- 1.96 * sqrt( var( S(t_j) ) )

    let atRisk = cleaned.length;    // at time=0
    let prevSurv = 1.0;            // S(0)
    let prevVarTerm = 0.0;         // sum_{i} [ d_i / (r_i*(r_i - d_i)) ]

    const kmData = [];
    kmData.push({
        time: 0,
        survival: 1.0,
        lower: 1.0,
        upper: 1.0
    });

    let idx = 0;

    while (idx < cleaned.length) {
        const currentTime = cleaned[idx].time;

        let nEventsAtThisTime = 0;
        let nTotalAtThisTime = 0;

        const thisTime = currentTime;
        while (idx < cleaned.length && cleaned[idx].time === thisTime) {
            nTotalAtThisTime++;
            if (cleaned[idx].event === 1) {
                nEventsAtThisTime++;
            }
            idx++;
        }

        // r_j = 'atRisk' just prior to t_j
        const rj = atRisk;
        const dj = nEventsAtThisTime;

        // If no events at this time, survival does not jump down
        if (dj > 0) {
            const newSurv = prevSurv * (1 - dj / rj);
            // Greenwood increment
            const increment = dj / (rj * (rj - dj));
            prevVarTerm += increment;

            // variance of S(t_j)
            const varSurv = (newSurv * newSurv) * prevVarTerm;
            const sdSurv = Math.sqrt(varSurv);
            const z = 1.96; // ~95% normal approximation
            const lower = Math.max(0, newSurv - z * sdSurv);
            const upper = Math.min(1, newSurv + z * sdSurv);

            prevSurv = newSurv;

            kmData.push({
                time: thisTime,
                survival: newSurv,
                lower,
                upper
            });
        }
        else {
            // push a point in case we want a step at an event-free time
            kmData.push({
                time: thisTime,
                survival: prevSurv,
                lower: Math.max(0, prevSurv - 1e-8),
                upper: Math.min(1, prevSurv + 1e-8)
            });
        }

        // Everyone who had time == thisTime is no longer at risk after
        // (whether event or censored).
        atRisk -= nTotalAtThisTime;
    }

    return kmData;
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
    //const loadPgsModel = await loadScore(pgsId, build);
    const loadPgsModel = await fetch('../data/pgs_model_test.txt');
    const parsedPgsModel = parseFile(await loadPgsModel.text());

    return await processSnpData(parsedPgsModel);
}


export function matchCasesControls(cases, controls, controlsPerCase = 1) {
    const results = [];
    const baseControls = Math.floor(controlsPerCase);
    const extraControlChance = (controlsPerCase - baseControls) / 100;
    const unusedControls = [...controls];
    let casesMatched = 0;

    for (let caseIndividual of cases) {
        const caseAgeOfOnset = caseIndividual[INDEX.ONSET];
        const caseGender = caseIndividual[INDEX.GENDER];
        const matchedControls = [];

        // Try to find `baseControls` number of matches
        for (let j = 0; j < baseControls; j++) {
            const matchIndex = unusedControls.findIndex(p => p[INDEX.ENTRY] === caseAgeOfOnset && p[INDEX.GENDER] === caseGender);

            if (matchIndex === -1) break;

            matchedControls.push(unusedControls.splice(matchIndex, 1)[0]);
        }

        // If enough base controls were found, maybe add an extra
        if (matchedControls.length === baseControls) {
            if (Math.random() < extraControlChance) {
                const matchIndex = unusedControls.findIndex(p => p[INDEX.ENTRY] === caseAgeOfOnset);
                if (matchIndex !== -1) {
                    matchedControls.push(unusedControls.splice(matchIndex, 1)[0]);
                }
            }

            results.push(caseIndividual, ...matchedControls);
        }

        casesMatched++;
    }

    return { casesMatched, results };
}