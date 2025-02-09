import { asyncPool, httpRequest } from './httpUtils.js';
import { sleep } from './utils.js';
import { parseFile } from './fileParser.js';
import { loadScore } from './loaders.js';
import { processSnpData } from './dataProcessingUtils.js';

import { nelderMead } from './nelderMead.js';


// export async function getRsIds(snpInfo, apiKey) {
//     const requestLimit = 100;
//
//     const results = await asyncPool(requestLimit, snpInfo, async (snpInfo) => {
//         const { chromosome, position } = snpInfo;
//         //const eUtilsURL = `https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esearch.fcgi?db=snp&term=${chromosome}[Chromosome]&${position}[Base Position]&retmode=json&api_key=${apiKey}`;
//         const eUtilsURL = `https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esearch.fcgi?db=snp&term=${position}[BPOSITION]&${chromosome}[BCHR]&retmode=json&api_key=${apiKey}`;
//
//         try {
//             const response = await httpRequest(eUtilsURL);
//             const data = await response.json();
//             const idListLength = data.esearchresult.idlist.length;
//             const rsID = data.esearchresult.idlist[idListLength - 1];
//
//             if (!rsID) {
//                 console.error(`No SNP found at chromosome ${chromosome} and position ${position}.`);
//
//                 return null;
//             }
//             snpInfo.rsID = rsID;
//
//             return snpInfo;
//         } catch (error) {
//             console.error(`Error fetching rsID for chromosome ${chromosome} and position ${position}: ${error.message}`);
//
//             return null;
//         }
//     });
//
//     return results.filter(Boolean);
// }

export async function getRsIds(snpsInfo, apiKey) {
    const requestInterval = 1; // 100ms per request = 10 requests/second

    for (let i = 0; i < snpsInfo.length; i++) {
        const { chromosome, position } = snpsInfo[i];
        const eUtilsURL = `https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esearch.fcgi?db=snp&term=${snpsInfo[i].position}[BPOSITION]&${snpsInfo[i].chromosome}[BCHR]&retmode=json&api_key=${apiKey}`;

        try {
            const response = await httpRequest(eUtilsURL);
            await response.json().then((data) => {
                const rsID = data.esearchresult.idlist[0];

                if (!rsID) {
                    console.error(`No rsID found for chromosome ${chromosome} and position ${position}.`);

                    return;
                }

                console.log(`rs${rsID} was added.`);
                snpsInfo[i].rsID = rsID;
            });
        } catch (error) {
            console.error(`Error fetching rsID for chromosome ${chromosome} and position ${position}: ${error.message}`);
        }

        if (i < snpsInfo.length - 1) await sleep(requestInterval);
    }
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

export function distributeCaseControl(profiles, k, b, randomNumbers) {
    const maxAge = 150;

    // Function to calculate the time of disease onset
    const calculateTimeDiseaseOnset = (age, random, prs, k, b) => {
        const numerator = Math.log(random);
        const innerTerm = Math.pow(age, k) - (prs * Math.exp(b) / numerator);

        return Math.pow(innerTerm, 1 / k);
    };

    profiles.forEach((profile, i) => {
        const onsetAge = calculateTimeDiseaseOnset(profile.ageOfEntry, profile.randomNumber, profile.prs, k, b);

        profile.case = profile.ageOfExit > onsetAge;
        profile.onsetAge = onsetAge < maxAge ? Math.round(onsetAge) : 'inf';
    });
}

export function estimateWeibullParameters(timePoints, incidenceRate, profiles) {
    function f(params, constants = {
        profiles: profiles,
        timePoints: timePoints
    }) {
        console.log(params);
        const [k, log_b] = params;
        const power = (base, exp) =>
            Array.isArray(base)
                ? base.map((x) => Math.pow(x, exp))
                : Math.pow(base, exp);

        const timeOfOnset = power(
            constants.profiles.map((profile, i) => {
                return Math.pow(
                    -Math.log(profile.randomNumber) / (Math.exp(log_b) * profile.prs),
                    1 / k
                );
            }),
            1 / k
        );

        const probabilities = constants.timePoints.map(
            (t) => timeOfOnset.filter((time) => time < t).length / constants.profiles.length
        );

        return probabilities;
    }

    let rmse = function(params) {
        const pred = f(params);
        const error = pred.map((predicted, index) => Math.pow(predicted - incidenceRate[index], 2));
        const average = array => array.reduce((a, b) => a + b, 0) / array.length;
        return Math.sqrt(average(error));
    };

    let initialGuess = [1, 1]; // Initial guess for k and b
    let params = nelderMead(rmse, initialGuess, {
        maxIterations: 1000,
        minErrorDelta: 1e-7,
        minTolerance: 1e-6
    });
    console.log('Fitted parameters (k, b):', params.x);

    return params.x;
}

export async function getSnpsInfo(pgsId, build) {
    const load = await loadScore(pgsId, build);
    const parsedFile = parseFile(load);
    const snpsInfo = await processSnpData(parsedFile);
    const rsIds = snpsInfo.map(snp => snp.rsID);

    return snpsInfo;
}
