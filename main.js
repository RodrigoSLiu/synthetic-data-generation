import { loadDependencies } from './data-generator/loaders.js';
import { main } from './data-generator/incidenceRate.js';
import {
    getSnpsInfo,
    processProfiles,
    estimateWeibullParameters,
    distributeCaseControl,
    createTable,
    displaySNP,
    renderSNPHistograms,
    parseCsv,
    countOccurrences,
    empiricalCdf,
    generateWeibullIncidenceCurve
} from './syntheticDataGenerator.js';


let incidenceRateFile = 'data/age_specific_breast_cancer_incidence_rates.csv';
let globalIncidenceFile = 'data/incidence.csv';
let profilesSliceSize = 100;
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

async function generateData(pgsId, build, numberOfProfiles, minAge, maxAge, followUpPeriod) {
    const snpsInfo = await getSnpsInfo(pgsId, build);
    const [expLinearPredictors, generatedProfiles] = await processProfiles(snpsInfo, numberOfProfiles, minAge, maxAge, followUpPeriod);
    const incidenceRate = await parseCsv(incidenceRateFile, { delimiter: ',' });
    const weibullParameters = estimateWeibullParameters(empiricalCdf(incidenceRate), expLinearPredictors);
    //const [k, b] = weibullParameters;
    const [k, b] = [3.7627159210102077, 4.741080717191016e-9];
    const predictedIncidenceRate = generateWeibullIncidenceCurve(k, b, expLinearPredictors, maxAge);
    distributeCaseControl(generatedProfiles, k, b);

    return { snpsInfo, generatedProfiles, predictedIncidenceRate };
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

async function loadIncidenceChart(observedData, predictedData, htmlElement) {
    try {
        const labels = observedData.map(entry => entry.age);

        const config = {
            type: 'line',
            data: {
                labels: labels,
                datasets: [
                    // Observed Data (original curve)
                    {
                        label: 'Observed Incidence',
                        data: observedData.map(entry => entry.rate),
                        borderColor: 'red',
                        borderWidth: 2,
                        fill: false,
                        pointRadius: 0,
                        borderDash: [5, 5] // Optional: dashed line
                    },
                    // Predicted Data (second curve)
                    {
                        label: 'Predicted Incidence',
                        data: predictedData.map(entry => entry.rate),
                        borderColor: 'blue',
                        borderWidth: 2,
                        fill: false,
                        pointRadius: 0
                    }
                ]
            },
            options: {
                responsive: true,
                plugins: {
                    title: {
                        display: true,
                        text: 'Observed vs. Predicted Incidence Rates',
                        font: { size: 20 }
                    },
                    tooltip: {
                        callbacks: {
                            label: function(tooltipItem) {
                                const datasetLabel = tooltipItem.dataset.label;
                                const value = tooltipItem.raw.toFixed(4);
                                return `${datasetLabel} - Age ${tooltipItem.label}: ${value}`;
                            }
                        }
                    }
                },
                scales: {
                    x: { title: { display: true, text: 'Age →' } },
                    y: {
                        title: { display: true, text: '↑ Incidence Rate' },
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
    let incidenceRates = [];
    for (let age in ageCounts) {
        let cases = caseCounts[age] || 0;
        let total = ageCounts[age];
        let rate = cases / total;
        incidenceRates.push({ age: parseInt(age, 10), rate });
    }

    return incidenceRates;
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

    let numberOfProfiles = '100000';
    let minAge = '1';
    let maxAge = '81';
    let followUpPeriod = '10';

    if (pgsIdInput.match(/^[0-9]{1,6}$/)) {
        const {
            snpsInfo,
            generatedProfiles,
            predictedIncidenceRate
        } = await generateData(pgsIdInput, buildInput, parseFloat(numberOfProfiles), parseFloat(minAge), parseFloat(maxAge), parseFloat(followUpPeriod));
        draw(snpsInfo, numberOfProfiles, generatedProfiles, 100);


        await main(globalIncidenceFile);
        console.log(predictedIncidenceRate);
        await loadIncidenceChart(
            await parseCsv(incidenceRateFile),  // Array of {age: number, rate: number}
            predictedIncidenceRate, // Array of {age: number, rate: number}
            'expectedIncidenceChart'
        );
    }
    else {
        alert('Please enter a valid PGS ID (1 to 6 digits).');
    }
});
