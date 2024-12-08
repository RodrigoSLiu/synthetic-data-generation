import { asyncPool, cdf, countOccurrences, httpRequest, parseCsv, parseFile } from './utils.js';
import { API_KEY } from '../apikey.js';
import { createTable, displaySNP, renderHistogram } from './draw.js';
import { loadScore } from './loaders.js';
import { fminsearch } from './fminsearch.js';

// TODO: TESTING PURPOSES
import { testData } from '../test.js';


async function getRsIds(snpInfo, apiKey) {
    const requestLimit = 2;

    const results = await asyncPool(requestLimit, snpInfo, async (snpInfo) => {
        const { chromosome, position } = snpInfo;
        //const eUtilsURL = `https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esearch.fcgi?db=snp&term=${chromosome}[Chromosome]&${position}[Base Position]&retmode=json&api_key=${apiKey}`;
        const eUtilsURL = `https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esearch.fcgi?db=snp&term=${position}[BPOSITION]&${chromosome}[BCHR]&retmode=json&api_key=${apiKey}`;

        try {
            const response = await httpRequest(eUtilsURL);
            const data = await response.json();
            const idListLength = data.esearchresult.idlist.length;
            const rsID = data.esearchresult.idlist[idListLength - 1];

            if (!rsID) {
                console.error(`No SNP found at chromosome ${chromosome} and position ${position}.`);

                return null;
            }
            snpInfo.rsID = rsID;

            return snpInfo;
        } catch (error) {
            console.error(`Error fetching rsID for chromosome ${chromosome} and position ${position}: ${error.message}`);

            return null;
        }
    });

    return results.filter(Boolean);
}

// async function getRsIds(snpsInfo, apiKey) {
//     const requestInterval = 1; // 100ms per request = 10 requests/second
//
//     for (let i = 0; i < snpsInfo.length; i++) {
//         const { chromosome, position } = snpsInfo[i];
//         const eUtilsURL = `https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esearch.fcgi?db=snp&term=${snpsInfo[i].position}[BPOSITION]&${snpsInfo[i].chromosome}[BCHR]&retmode=json&api_key=${apiKey}`;
//
//         try {
//             const response = await httpRequest(eUtilsURL);
//             await response.json().then((data) => {
//                 const rsID = data.esearchresult.idlist[0];
//
//                 if (!rsID) {
//                     console.error(`No rsID found for chromosome ${chromosome} and position ${position}.`);
//
//                     return;
//                 }
//
//                 snpsInfo[i].rsID = rsID;
//             });
//         } catch (error) {
//             console.error(`Error fetching rsID for chromosome ${chromosome} and position ${position}: ${error.message}`);
//         }
//
//         if (i < snpsInfo.length - 1) await sleep(requestInterval);
//     }
// }

async function getChromosomeAndPosition(rsIDs, genomeBuild, apiKey) {
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

function calculateHardyWeinbergEquilibrium(maf) {
    // if (typeof maf !== 'number' || maf < 0 || maf > 1) {
    //     throw new Error('Invalid MAF value: MAF must be a number between 0 and 1.');
    // }

    const recessiveHomozygousFreq = Math.pow(maf, 2);
    const dominantHomozygousFreq = Math.pow((1 - maf), 2);
    const heterozygousFreq = 1 - recessiveHomozygousFreq - dominantHomozygousFreq;

    return [dominantHomozygousFreq, heterozygousFreq, recessiveHomozygousFreq];
}

async function processSnpData(snpData) {
    const chrNameIndex = snpData.headers.indexOf('chr_name');
    const chrPositionIndex = snpData.headers.indexOf('chr_position');
    const weightIndex = snpData.headers.indexOf('effect_weight');
    const snpAlleleFrequencyIndex = snpData.headers.indexOf('allelefrequency_effect');

    if (snpAlleleFrequencyIndex === -1) {
        throw new Error('Allele frequency data is missing in the PGS file.');
    }

    let snpInfo = snpData.values.map((snpValue) => ({
        chromosome: snpValue[chrNameIndex],
        position: snpValue[chrPositionIndex],
        weight: snpValue[weightIndex],
        maf: snpValue[snpAlleleFrequencyIndex]
    }));

    snpInfo = await getRsIds(snpInfo, API_KEY);

    if (!snpInfo.length) {
        throw new Error('No valid SNPs processed. Check the input PGS file or SNP lookup results.');
    }

    snpInfo.forEach((snpValue) => {
        if (!snpValue.rsID) {
            console.warn('Missing SNP ID for:', snpValue);
        }
        else {
            snpValue.alleleDosageFrequency = calculateHardyWeinbergEquilibrium(snpValue.maf);
        }
    });

    return snpInfo;
}

function generateAlleleDosage([_, heterozygousFreq, recessiveHomozygousFreq]) {
    const r = Math.random();

    return r < recessiveHomozygousFreq ? 2 : (r < recessiveHomozygousFreq + heterozygousFreq ? 1 : 0);
}

function assignAgesRandomly(numPeople, minAge = 0, maxAge = 100) {
    const range = maxAge - minAge + 1; // Total number of unique ages
    const ages = [];

    // Distribute ages evenly, repeating if necessary
    for (let i = 0; i < numPeople; i++) {
        const age = minAge + (i % range);
        ages.push(age);
    }

    return ages;
}

async function processProfiles(snpsInfo, numberOfProfiles, minAge, maxAge, followUpPeriod) {
    const profiles = [];
    const expLinearPredictors = [];
    const ages = assignAgesRandomly(numberOfProfiles, minAge, maxAge);
    const rsIds = snpsInfo.map(snp => snp.rsID);

    if (!snpsInfo.length) {
        throw new Error('No SNPs available for profile generation.');
    }

    snpsInfo.forEach((snp, index) => {
        if (!snp.weight || !snp.alleleDosageFrequency) {
            throw new Error(`Missing weight or allele dosage frequency for SNP at index ${index}`);
        }
    });

    // Iterate over the number of profiles
    for (let i = 0; i < numberOfProfiles; i++) {
        let prs = 0;

        const profile = {
            id: `Q-${i + 1}`, // Unique ID for each profile
            ageOfEntry: ages[i],
            ageOfExit: ages[i] + followUpPeriod,
            prs: 0,
            case: false,
            onsetAge: 0,
            allelesDosage: new Uint8Array(snpsInfo.length)
        };

        snpsInfo.forEach((snp, snpIndex) => {
            const { weight, alleleDosageFrequency } = snp;
            const alleleDosage = generateAlleleDosage(alleleDosageFrequency);
            profile.allelesDosage[snpIndex] = alleleDosage;
            prs += weight * alleleDosage;
        });
        profile.prs = Math.exp(prs);
        expLinearPredictors.push(prs);
        profiles.push(profile); // Add the completed profile to the profiles array
    }

    return [rsIds, expLinearPredictors, profiles];
}

function calculateTimeDiseaseOnset(age, prs, k, b) {
    const denominator = prs * b;
    const numerator = Math.log(Math.random());
    const innerTerm = Math.pow(age, k) - (denominator / numerator);

    return Math.pow(innerTerm, 1 / k);
}

function distributeCaseControl(profiles, k, b) {
    const maxAge = 150;

    profiles.forEach(profile => {
        const onsetAge = calculateTimeDiseaseOnset(profile.ageOfEntry, profile.prs, k, b);
        profile.case = profile.ageOfExit > onsetAge;
        profile.onsetAge = onsetAge < maxAge ? Math.round(onsetAge) : 'inf';
    });
}

function estimateWeibullParameters(timePoints, probabilities, studyEntryAge, expLinearPredictors) {
    const rng = Array.from({ length: studyEntryAge.length }, () => Math.random());

    // Weibull CDF function
    let weibullCDF = function(params) {
        const [k, b] = params;

        let timeOfOnset = studyEntryAge.map((age, index) =>
            Math.pow(
                Math.pow(age, k) - Math.log(rng[index]) / (b * expLinearPredictors[index]),
                1 / k
            )
        );

        return timePoints.map(t => {
            let count = timeOfOnset.filter(time => time < t).length;
            return count / expLinearPredictors.length;
        });
    };

    let rmse = function(pred, truth) {
        const error = pred.map((predicted, index) => Math.pow(predicted - truth[index], 2));
        const average = array => array.reduce((a, b) => a + b, 0) / array.length;

        return Math.sqrt(average(error));
    };

    // Objective function (sum of squared differences)
    let objFun = function(yp, y) {
        return rmse(yp, y); // Use RMSE instead of SSD
    };

    // Simulated data for fitting
    let x = timePoints;
    let y = probabilities;
    let initialGuess = [1, 1]; // Initial guess for k and b
    let params = fminsearch(weibullCDF, initialGuess, x, y, { objFun: objFun, maxIter: 100 });
    console.log('Fitted parameters (k, b):', params);

    return params;
}

export async function processPgsData(pgsId, build, incidenceRateFile, numberOfProfiles = 1000, minAge = 1, maxAge = 100, followUpPeriod = 50) {
    try {
        const genomeBuild = 'GRCh38';
        const incidenceRate = await parseCsv(incidenceRateFile);
        const textFile = await loadScore(pgsId, build);
        const parsedFile = parseFile(textFile);
        //const snpsInfo = await processSnpData(parsedFile);
        // TODO: CHANGE testData BACK TO snpsInfo
        const [rsIds, expLinearPredictors, generatedProfiles] = await processProfiles(testData, numberOfProfiles, minAge, maxAge, followUpPeriod);
        const slicedEntryAges = generatedProfiles.slice(0, 1000).map((profile) => profile.ageOfEntry);
        const slicedLinearPredictors = generatedProfiles.slice(0, 1000).map((profile) => profile.prs);
        const timePoints = [30, 50, 70];
        const probabilities = timePoints.map(value => cdf(incidenceRate, value, 'rate'));

        const [optimized_k, optimized_b] = estimateWeibullParameters(timePoints, probabilities, slicedEntryAges, slicedLinearPredictors);
        distributeCaseControl(generatedProfiles, optimized_k, optimized_b, 50);

        const timeOfOnset = generatedProfiles.slice(0, 5000).map((profile) => profile.onsetAge);
        const rates = timePoints.map(t => {
            let count = timeOfOnset.filter(time => time < t).length;
            return count / expLinearPredictors.length;
        });

        console.log('Expected rates: ', probabilities, 'Obtained rates', rates);

        const randomIndex = Object.keys(rsIds)[Math.floor(Math.random() * Object.keys(rsIds).length)];
        const slicedProfiles = generatedProfiles.slice(0, numberOfProfiles * 0.5); // G
        const occurrence = countOccurrences(randomIndex, slicedProfiles);
        //const randomSnp = snpsInfo.filter(snp => snp.rsID === rsIds[randomIndex]);

        // TODO: CHANGE THIS TOO
        const randomSnp = testData.filter(snp => snp.rsID === rsIds[randomIndex]);


        renderHistogram(occurrence, 'generatedHistogram', numberOfProfiles * 0.5);
        renderHistogram(randomSnp[0].alleleDosageFrequency, 'expectedHistogram', numberOfProfiles * 0.5);
        displaySNP(rsIds[randomIndex]);
        createTable(slicedProfiles);
    } catch (error) {
        console.error('An error occurred:', error);
    }
}
