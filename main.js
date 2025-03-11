import { loadDependencies } from './data-generator/loaders.js';
import { main } from './data-generator/incidenceRate.js';
import {
    createTable,
    parseCsv,
    dataToCSV,
    downloadCSV
} from './syntheticDataGenerator.js';


window.profileStore = {
    generatedProfiles: null,
    matchedGroups: null
};
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

function draw(numberOfProfiles, profiles, maxNumberOfProfiles) {
    const profilesHeader = profiles.header;
    const profilesData = profiles.data;
    const slicedProfiles = profilesData.slice(0, maxNumberOfProfiles);

    // Display SNP and Table
    createTable(profilesHeader, slicedProfiles);
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

document.getElementById('downloadProfiles').addEventListener('click', () => {
    const csvData = dataToCSV(window.profileStore.generatedProfiles);
    downloadCSV(csvData, 'all_profiles');
});

document.getElementById('downloadCasesControls').addEventListener('click', () => {
    const csvData = dataToCSV(window.profileStore.matchedGroups);
    downloadCSV(csvData, 'cases_controls');
});

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
    const loadingScreen = document.getElementById('loadingScreen');
    const pgsIdInput = document.getElementById('pgsId').value.trim();
    const buildInput = document.querySelector('input[name="build"]:checked').value;

    loadingScreen.style.display = 'flex';

    try {
        if (pgsIdInput.match(/^[0-9]{1,6}$/)) {
            const worker = new Worker('worker.js');

            worker.postMessage({
                pgsId: pgsIdInput,
                build: buildInput,
                numberOfProfiles: 10000,//document.getElementById('numberOfProfiles').value,
                minAge: 54,//document.getElementById('minAge').value,
                maxAge: 63,//document.getElementById('maxAge').value,
                minFollow: 5,//document.getElementById('followUp').value,
                maxFollow: 13,//document.getElementById('followUp').value,
                incidenceRateFile: 'data/age_specific_breast_cancer_incidence_rates.csv',
                globalIncidenceFile: 'data/incidence.csv'
            });

            worker.onmessage = async (e) => {
                if (e.data.error) {
                    throw new Error(e.data.error);
                }

                // Store profiles globally
                window.profileStore = {
                    snpsInfo: e.data.snpsInfo,
                    predictedIncidenceRate: e.data.predictedIncidenceRate,
                    generatedProfiles: e.data.generatedProfiles,
                    matchedProfiles: e.data.matchedProfiles,
                    matchedGroups: e.data.matchedGroups
                };

                draw(e.data.snpsInfo, e.data.matchedGroups, 100);
                await main(globalIncidenceFile);
                await loadIncidenceChart(
                    await parseCsv(incidenceRateFile),
                    e.data.predictedIncidenceRate,
                    'expectedIncidenceChart'
                );

                worker.terminate();
                loadingScreen.style.display = 'none';
            };

            worker.onerror = (error) => {
                console.error('Worker error:', error);
                loadingScreen.style.display = 'none';
                alert('Error during data generation: ' + error.message);
            };
        }
        else {
            alert('Please enter a valid PGS ID (1 to 6 digits).');
            loadingScreen.style.display = 'none';
        }
    } catch (error) {
        console.error(error);
        loadingScreen.style.display = 'none';
        alert('Error: ' + error.message);
    }
});
