import { loadDependencies } from './data-generator/loaders.js';
import { main } from './data-generator/incidenceRate.js';
import {
    getSnpsInfo,
    processProfiles,
    estimateWeibullParameters,
    testEstimateWeibullParameters,


    distributeCaseControl,
    createTable,
    displaySNP,
    renderSNPHistograms,
    parseCsv,
    countOccurrences,
    cdf
} from './syntheticDataGenerator.js';


let incidenceRateFile = 'data/age_specific_breast_cancer_incidence_rates.csv';
let globalIncidenceFile = 'data/incidence.csv';
let profilesSliceSize = 100;
let dependeciesUrl = [
    'https://cdnjs.cloudflare.com/ajax/libs/pako/1.0.11/pako.min.js',
    'https://cdnjs.cloudflare.com/ajax/libs/localforage/1.9.0/localforage.min.js'
];
let sliceMaxSize = 1000;


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
    const timePoints = [30, 50, 70];
    const incidenceRate = await parseCsv(incidenceRateFile, { delimiter: ',' });
    const probabilities = timePoints.map(value => cdf(incidenceRate, value, 'rate'));
    //const [optimized_k, optimized_b] = estimateWeibullParameters(timePoints, probabilities, slicedEntryAges, slicedLinearPredictors);
    //distributeCaseControl(profiles, optimized_k, optimized_b);
    distributeCaseControl(profiles, 1.01, 2.5);
    //const optimized = testEstimateWeibullParameters(timePoints, probabilities, slicedEntryAges, slicedLinearPredictors);
    //distributeCaseControl(profiles, optimized[0], optimized[1]);

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

async function generateData(pgsId, build, numberOfProfiles, minAge, maxAge, followUpPeriod) {
    const timePoints = [30, 50, 70];
    const snpsInfo = await getSnpsInfo(pgsId, build);
    const [expLinearPredictors, generatedProfiles] = await processProfiles(snpsInfo, numberOfProfiles, minAge, maxAge, followUpPeriod);
    await generateCaseControlLabels(generatedProfiles);

    return { snpsInfo, generatedProfiles };
}

function draw(snpsInfo, numberOfProfiles, profiles, maxNumberOfProfiles) {
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

async function loadIncidenceChart(incidenceRate, htmlElement) {
    try {
        console.log(incidenceRate);
        const labels = Object.keys(incidenceRate);
        const ageData = Object.values(incidenceRate);
        const config = {
            type: 'line',
            data: {
                labels: labels,
                datasets: [{
                    label: 'Incidence Rate',
                    data: ageData,
                    borderColor: 'red',
                    borderWidth: 2,
                    fill: false,
                    pointRadius: 0,
                    pointHoverRadius: 5
                }]
            },
            options: {
                responsive: true,
                plugins: {
                    title: {
                        display: true,
                        text: 'Breast Cancer Incidence Rates',
                        font: {
                            size: 20
                        }
                    },
                    tooltip: {
                        callbacks: {
                            label: function(tooltipItem) {
                                return `Age: ${tooltipItem.label}, Rate: ${tooltipItem.raw.toFixed(4)}`;
                            }
                        }
                    }
                },
                scales: {
                    x: {
                        title: {
                            display: true,
                            text: 'Age →'
                        }
                    },
                    y: {
                        title: {
                            display: true,
                            text: '↑ Rate'
                        },
                        beginAtZero: true
                    }
                }
            }
        };

        new Chart(document.getElementById(htmlElement).getContext('2d'), config);
    } catch (error) {
        console.error('Error loading incidence rate data:', error);
    }
}

function calculatePredictedIncidenceRate(profiles, minAge, maxAge) {
    let ageCounts = {};  // Tracks how many people are at each age
    let caseCounts = {}; // Tracks how many cases occurred at each age

    profiles.forEach(profile => {
        for (let age = minAge; age <= maxAge; age++) {
            // Count the number of people at each age
            ageCounts[age] = (ageCounts[age] || 0) + 1;

            // If a case occurred at this age, increment case count
            if (profile.case && age === profile.onsetAge) {
                caseCounts[age] = (caseCounts[age] || 0) + 1;
            }
        }
    });

    // Calculate the incidence rate per age
    let incidenceRates = {};
    for (let age in ageCounts) {
        let cases = caseCounts[age] || 0;
        let total = ageCounts[age];
        incidenceRates[age] = cases / total;
    }

    return incidenceRates;
}

async function transformData() {
    const dataArray = await parseCsv(incidenceRateFile);
    let result = {};
    dataArray.forEach((item, index) => {
        result[index] = item[0];
    });
    return result;
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
    // const numberOfProfiles = document.getElementById('numberOfProfiles').value;
    // const minAge = document.getElementById('minAge').value;
    // const maxAge = document.getElementById('maxAge').value;
    // const followUpPeriod = document.getElementById('followUp').value;

    let numberOfProfiles = '10000';
    let minAge = '1';
    let maxAge = '81';
    let followUpPeriod = '10';

    if (pgsIdInput.match(/^[0-9]{1,6}$/)) {
        const {
            snpsInfo,
            generatedProfiles
        } = await generateData(pgsIdInput, buildInput, parseFloat(numberOfProfiles), parseFloat(minAge), parseFloat(maxAge), parseFloat(followUpPeriod));
        draw(snpsInfo, numberOfProfiles, generatedProfiles, sliceMaxSize);

        const predictedIncidenceRate = calculatePredictedIncidenceRate(generatedProfiles, minAge, maxAge);
        await main(globalIncidenceFile);

        await loadIncidenceChart(await transformData(), 'expectedIncidenceChart');
        await loadIncidenceChart(predictedIncidenceRate, 'predictedIncidenceChart');
    }
    else {
        alert('Please enter a valid PGS ID (1 to 6 digits).');
    }
});
