import { loadDependencies } from './data-generator/loaders.js';
import { main } from './data-generator/incidenceRate.js';
import {
    createTable,
    parseCsv,
    dataToProfiles,
    dataToVCF,
    downloadFile
} from './syntheticDataGenerator.js';


window.data = {
    snpsInfo: null,
    generatedProfiles: null,
    matchedGroups: null
};


let profilesSliceSize = 100;
let dependeciesUrl = [
    'https://cdnjs.cloudflare.com/ajax/libs/pako/1.0.11/pako.min.js',
    'https://cdnjs.cloudflare.com/ajax/libs/localforage/1.9.0/localforage.min.js'
];
let incidenceRateFile = 'data/age_specific_breast_cancer_incidence_rates.csv';
let globalIncidenceFile = 'data/incidence.csv'; //UNFINISHED
let pgsModelFile = 'data/pgs_model_test.txt';
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
    const profilesDataCsv = dataToProfiles(window.data.generatedProfiles);
    downloadFile(profilesDataCsv, 'all_profiles', 'csv');
});

document.getElementById('downloadCaseControl').addEventListener('click', () => {
    const caseControlDataCsv = dataToProfiles(window.data.matchedGroups);
    downloadFile(caseControlDataCsv, 'case_control_profiles', 'csv');
});

document.getElementById('downloadVCF').addEventListener('click', () => {
    const vcfDataCsv = dataToVCF(window.data.generatedProfiles);
    downloadFile(vcfDataCsv, 'genetic_vcf', 'vcf');
});


/* TODO: Currently we only get rsId from eutils;
*    If there is no MAF get maf from eutils with rsId
*    If there is MAF, maybe get it from eutils too, ask Jeya
*/
document.getElementById('retrieveButton').addEventListener('click', async () => {
    const loadingScreen = document.getElementById('loadingScreen');
    const pgsIdInput = document.getElementById('pgsId').value.trim();
    const buildInput = document.querySelector('input[name="build"]:checked').value;
    const caseControlMatch = document.getElementById('caseControlMatch').checked;

    const allChunks = [];
    let receivedChunks = 0;
    let expectedChunks = 0;
    let header = null;


    loadingScreen.style.display = 'flex';

    try {
        if (pgsIdInput.match(/^[0-9]{1,6}$/)) {
            const worker = new Worker('worker.js');

            worker.postMessage({
                pgsId: pgsIdInput,
                build: buildInput,
                numberOfProfiles: 1000000,//document.getElementById('numberOfProfiles').value,
                caseControlMatch: caseControlMatch,
                numberOfCaseControls: 20000,
                ratioOfCaseControls: 0.5,
                minAge: 30,//document.getElementById('minAge').value,
                maxAge: 70,//document.getElementById('maxAge').value,
                minFollow: 15,//document.getElementById('followUp').value,
                maxFollow: 30,//document.getElementById('followUp').value,
                incidenceRateFile: incidenceRateFile,
                pgsModelFile: pgsModelFile
            });

            worker.onmessage = async (e) => {
                const { type } = e.data;

                if (type === 'meta') {
                    header = e.data.header;
                    expectedChunks = e.data.totalChunks;
                    window.data.snpsInfo = e.data.snpsInfo;
                    window.data.predictedIncidenceRate = e.data.predictedIncidenceRate;
                }
                else if (type === 'chunk') {
                    allChunks[e.data.index] = e.data.chunk;
                    receivedChunks++;

                    if (receivedChunks === expectedChunks) {
                        const fullData = allChunks.flat();
                        window.data.generatedProfiles = { header, data: fullData };

                        const useMatched = document.getElementById('caseControlMatch').checked;
                        if (!useMatched) draw(header, { header, data: fullData }, 100);
                    }
                }
                else if (type === 'matchedGroups') {
                    window.data.matchedGroups = e.data.matchedGroups;
                    draw(null, { header: null, data: window.data.matchedGroups }, 100);
                }
                else if (type === 'done') {
                    document.getElementById('loadingScreen').style.display = 'none';
                }
                else if (type === 'error') {
                    alert('Error: ' + e.data.error);
                    document.getElementById('loadingScreen').style.display = 'none';
                }
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
