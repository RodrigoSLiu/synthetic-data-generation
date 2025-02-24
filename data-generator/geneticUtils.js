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

export function generateWeibullIncidenceCurve(k, b, expLp, maxAge) {
    function populationCdf(t) {
        if (t <= 0) return 0.0;
        let sumSurv = 0.0;

        for (let i = 0; i < expLp.length; i++) {
            sumSurv += Math.exp(-b * expLp[i] * Math.pow(t, k));
        }

        const avgSurv = sumSurv / expLp.length;

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

export function estimateWeibullParameters(empiricalCdf, expLp) {
    let ages = empiricalCdf.map((x) => x.age);
    let empCdf = empiricalCdf.map((x) => x.cdf);

    function modelCdf(k, b, ages, expLP) {
        return ages.map((age) => {
            const sumSurvival = expLP.reduce((sum, linearPred) =>
                sum + Math.exp(-b * Math.pow(age, k) * Math.exp(linearPred)), 0
            );

            return 1 - (sumSurvival / expLP.length);
        });
    }

    let rmse = function(pred, truth) {
        const errorSum = pred.reduce((sum, val, i) => sum + Math.pow(val - truth[i], 2), 0);

        return Math.sqrt(errorSum / pred.length);
    };

    let rmse_weibull = function(params) {
        const [k, log_b] = params;
        const b = Math.exp(log_b);
        const modeledCdf = modelCdf(k, b, ages, expLp);

        return rmse(modeledCdf, empCdf);
    };
    console.log(rmse_weibull([3.6759065863735483, -17.6096611078]));
    console.log(rmse_weibull([3.6759065863735483, -18]));
    console.log(rmse_weibull([3.6759065863735483, -19]));
    let initialGuess = [3.7541156178549855, -19.1304750442]; // Initial guess for k and b
    let params = nelderMead(rmse_weibull, initialGuess, {
        maxIterations: 500,
        minErrorDelta: 1e-10,
        minTolerance: 1e-5,
        rho: 1.2,
        chi: 1.5,
        psi: -0.3,
        sigma: 0.5
    });
    console.log('Fitted parameters (k, b):', params.x[0], Math.exp(params.x[1]), params.fx);

    return params.x;
}

export async function getSnpsInfo(pgsId, build) {
    const load = await loadScore(pgsId, build);
    const parsedFile = parseFile(load);
    const snpsInfo = await processSnpData(parsedFile);
    const rsIds = snpsInfo.map(snp => snp.rsID);

    return snpsInfo;
}

export function AestimateWeibullParameters(empiricalCdf, expLp) {
    let ages = empiricalCdf.map((x) => x.age);
    let empCdf = empiricalCdf.map((x) => x.cdf);

    //empCdf = empCdf.map((x) => Math.exp(x));

    function modelCdf(k, b, ages, expLinearPreds) {
        return ages.map((age) => {
            const ageTerm = b * Math.pow(age, k);
            const sumSurvival = expLinearPreds.reduce((sum, expLP) =>
                sum + Math.exp(-ageTerm * expLP), 0
            );

            return 1 - (sumSurvival / expLinearPreds.length);
        });
    }

    let rmse = function(pred, truth) {
        const errorSum = pred.reduce((sum, val, i) => sum + Math.pow(val - truth[i], 2), 0);
        console.log('RMSE', Math.sqrt(errorSum / pred.length));
        return Math.sqrt(errorSum / pred.length);
    };

    let rmse_weibull = function(params) {
        const [k, log_b] = params;
        const b = Math.exp(log_b);
        const modeledCdf = modelCdf(k, b, ages, expLp);
        console.log('PARA', params);
        return rmse(modeledCdf, empCdf);
    };

    let initialGuess = [1, 1]; // Initial guess for k and log_b
    let regModel = fminsearch(rmse_weibull, initialGuess, empCdf, {
        maxIter: 50
    });
    console.log('Fitted parameters (k, b):', regModel.parmf);

    return regModel.parmf;
}

function fminsearch(fun, Parm0, y, Opt) {
    if (!Opt) {
        Opt = {};
    }
    if (!Opt.maxIter) {
        Opt.maxIter = 1000;
    }

    if (!Opt.step) {// initial step is 1/100 of initial value (remember not to use zero in Parm0)
        Opt.step = Parm0.map(function(p) {
            return p / 10;
        });
        console.log(Opt.step);
        Opt.step = Opt.step.map(function(si) {
            if (si === 0) {
                return 1;
            }
            else {
                return si;
            }
        }); // convert null steps into 1's
        console.log(Opt.step);
    }

    if (typeof (Opt.display) == 'undefined') {
        Opt.display = 'console';
    }

    let regModel = {};
    var ya, y0, yb, fP0, fP1;
    var P0 = [...Parm0], P1 = [...Parm0]; // clone parameter array to decouple passing by reference
    var n = P0.length;
    var step = Opt.step;

    function funEval(P) {
        return fun(P);
    }

    regModel = {
        Opt: Opt,
        y: y,
        parmi: P0, // initial parameter values
        fun: fun
    };
    console.log(step);
    for (var i = 0; i < Opt.maxIter; i++) {
        for (var j = 0; j < n; j++) { // take a step for each parameter
            P1 = [...P0];
            P1[j] += step[j];

            if (funEval(P1) < funEval(P0)) { // if parm value going in the righ direction
                step[j] = 1.2 * step[j]; // then go a little faster
                P0 = [...P1];
            }
            else {
                step[j] = -(0.2 * step[j]); // otherwiese reverse and go slower
            }
        }

        if (Opt.display == 'console') {
            if (i == 0) {
                console.log('  i  ', '  ObjFun ', '  Parms ');
            }
            console.log(i + 1, funEval(P0), P0);

            if ((i > 10000) && (funEval(P1) == funEval(P0))) {
                break;
            }
        }

        //{if(i>(Opt.maxIter-10)){console.log(i+1,funEval(P0),P0)}}
    }
    regModel.parmf = P0; // final parameter values

    return regModel;
}
