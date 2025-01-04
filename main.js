import { loadDependencies } from './data-generator/loaders.js';
import {
    getSnpsInfo,
    processProfiles,
    estimateWeibullParameters,
    distributeCaseControl,
    createTable,
    displaySNP,
    renderSNPHistograms,
    parseCsv,
    countOccurrences
} from './syntheticDataGenerator.js';


let incidenceRateFile = 'data/age_specific_breast_cancer_incidence_rates.csv';
let numberOfProfiles = 1000;
let followUpPeriod = 1;
let profilesSliceSize = 100;
let minAge = 1;
let maxAge = 50;
let dependeciesUrl = [
    'https://cdnjs.cloudflare.com/ajax/libs/pako/1.0.11/pako.min.js',
    'https://cdnjs.cloudflare.com/ajax/libs/localforage/1.9.0/localforage.min.js'
];
let sliceMaxSize = 100000;


(async () => {
    try {
        await loadDependencies(dependeciesUrl);
    } catch (error) {
        console.error('Failed to load dependencies:', error);
    }
})();

async function generateCaseControlLabels(profiles) {
    const slicedEntryAges = profiles.slice(0, sliceMaxSize).map((profile) => profile.ageOfEntry);
    const slicedLinearPredictors = profiles.slice(0, sliceMaxSize).map((profile) => profile.prs);

    // Calculate Weibull parameters and distribute case/control data
    const timePoints = [30, 50];
    const incidenceRate = await parseCsv(incidenceRateFile);
    const probabilities = timePoints.map(value => cdf(incidenceRate, value, 'rate'));
    const [optimized_k, optimized_b] = estimateWeibullParameters(timePoints, probabilities, slicedEntryAges, slicedLinearPredictors);
    distributeCaseControl(profiles, optimized_k, optimized_b);
    //
    // // Calculate rates
    // const sliceMaxSize = numberOfProfiles * 1;
    // const isOnset = generatedProfiles.slice(0, sliceMaxSize).map((profile) => profile.case);
    //
    // const rates = timePoints.map(t => {
    //     let count = isOnset.filter(onset => onset === true).length;
    //     return count / isOnset.length;
    // });
}

async function generateData(pgsId, build) {
    const snpsInfo = await getSnpsInfo(pgsId, build);
    const [expLinearPredictors, generatedProfiles] = await processProfiles(snpsInfo, numberOfProfiles, minAge, maxAge, followUpPeriod);

    return { snpsInfo, generatedProfiles };
}

function draw(snpsInfo, profiles, maxNumberOfProfiles) {
    // SNP Occurrence
    const rsIds = snpsInfo.map(snp => snp.rsID);
    const randomIndex = Object.keys(rsIds)[Math.floor(Math.random() * Object.keys(rsIds).length)];
    const slicedProfiles = profiles.slice(0, maxNumberOfProfiles);
    const occurrence = countOccurrences(randomIndex, profiles);

    // Render histograms
    const randomSnp = snpsInfo.filter(snp => snp.rsID === rsIds[randomIndex]);
    renderSNPHistograms(randomSnp, occurrence, numberOfProfiles, maxNumberOfProfiles);

    // Display SNP and Table
    displaySNP(rsIds[randomIndex]);
    createTable(slicedProfiles);
}

// try {
//     // Generate profiles
//     const incidenceRate = await parseCsv(incidenceRateFile);
//
//     const sliceMaxSize = 100000;
//     const [expLinearPredictors, generatedProfiles] = await processProfiles(snpsInfo, numberOfProfiles, minAge, maxAge, followUpPeriod);
//     const slicedEntryAges = generatedProfiles.slice(0, sliceMaxSize).map((profile) => profile.ageOfEntry);
//     const slicedLinearPredictors = generatedProfiles.slice(0, sliceMaxSize).map((profile) => profile.prs);
//
//     // Calculate Weibull parameters and distribute case/control data
//     const timePoints = [30, 50];
//     const probabilities = timePoints.map(value => cdf(incidenceRate, value, 'rate'));
//     const [optimized_k, optimized_b] = estimateWeibullParameters(timePoints, probabilities, slicedEntryAges, slicedLinearPredictors);
//     distributeCaseControl(generatedProfiles, optimized_k, optimized_b);
//
//     // Calculate rates
//     const isOnset = generatedProfiles.slice(0, sliceMaxSize).map((profile) => profile.case);
//
//     const rates = timePoints.map(t => {
//         let count = isOnset.filter(onset => onset === true).length;
//         return count / isOnset.length;
//     });
//
//     console.log('Expected rates: ', probabilities.map(value => (value * 100000) / sliceMaxSize), 'Obtained rates', rates);
//
//     // SNP Occurrence
//     const maxNumberOfProfiles = 10000;
//     const rsIds = snpsInfo.map(snp => snp.rsID);
//     const randomIndex = Object.keys(rsIds)[Math.floor(Math.random() * Object.keys(rsIds).length)];
//     const slicedProfiles = generatedProfiles.slice(0, maxNumberOfProfiles);
//     const occurrence = countOccurrences(randomIndex, generatedProfiles);
//
//     // Render histograms
//     const randomSnp = snpsInfo.filter(snp => snp.rsID === rsIds[randomIndex]);
//     renderSNPHistograms(randomSnp, occurrence, numberOfProfiles, maxNumberOfProfiles);
//
//     // Display SNP and Table
//     displaySNP(rsIds[randomIndex]);
//     createTable(slicedProfiles);
//
// }
/* TODO: Currently we only get rsId from eutils;
*    If there is no MAF get maf from eutils with rsId
*    If there is MAF, maybe get it from eutils too, ask Jeya
*/
document.getElementById('retrieveButton').addEventListener('click', async () => {
    const pgsIdInput = document.getElementById('pgsId').value.trim();
    const buildInput = document.querySelector('input[name="build"]:checked').value;
    //const minAge = document.getElementById('minAge').value;
    //const maxAge = document.getElementById('maxAge').value;

    if (pgsIdInput.match(/^[0-9]{1,6}$/)) {
        const { snpsInfo, generatedProfiles } = await generateData(pgsIdInput, buildInput);
        draw(snpsInfo, generatedProfiles, sliceMaxSize);
    }
    else {
        alert('Please enter a valid PGS ID (1 to 6 digits).');
    }
});
