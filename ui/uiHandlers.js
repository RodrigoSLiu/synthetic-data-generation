import { handleProfileRetrieval } from "../worker/workerController.js";
import { parseCsv, dataToProfilesBlob, downloadFile } from "../data-generator";



async function loadIncidenceChart(incidenceRateFile, predictedData, htmlElement) {
    try {
        const observedData = await parseCsv(incidenceRateFile);
        const observedRates = observedData.map(entry => entry.rate);

        if (observedRates.some(rate => isNaN(rate))) {
            console.error('Non-numeric rate found in observedData');
            return;
        }

        const labels = observedData.map(entry => entry.age);

        const config = {
            type: 'line',
            data: {
                labels: labels,
                datasets: [
                    {
                        label: 'Observed Incidence',
                        data: observedRates,
                        borderColor: 'red',
                        borderWidth: 2,
                        fill: false,
                        pointRadius: 0,
                        borderDash: [2, 2]
                    },
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

        const ctx = document.getElementById(htmlElement).getContext('2d');
        new Chart(ctx, config);
    } catch (error) {
        console.error('Error loading incidence rate data:', error);
    }
}


export function initializeUI(config) {
    const {
        incidenceRateFile,
        globalIncidenceFile,
        pgsModelFile,
        parseCsv,
        dataToVCF,
    } = config;

    // Table and chart rendering callback
    const renderData = (data) => {
        // Draw the profiles in a table
        if (!data) return;
        if (data.snpsInfo && data.generatedProfiles) {
            // Optionally, load the incidence chart
            loadIncidenceChart(
                incidenceRateFile,
                data.predictedIncidenceRate,
                'expectedIncidenceChart'
            );
        }
    };

    // Download profiles
    document.getElementById('downloadProfiles').addEventListener('click', async () => {
        /* global localforage */
        const combinedGeneratedProfiles = [];

        // Gather all profile chunks
        await localforage.iterate((value, key) => {
            if (key.startsWith('generatedProfiles_worker')) {
                combinedGeneratedProfiles.push({ key, data: value });
            }
        });

        // Sort to ensure correct order
        combinedGeneratedProfiles.sort((a, b) => {
            const extractNumbers = (k) => k.match(/\d+/g).map(Number);
            const [wA, cA] = extractNumbers(a.key);
            const [wB, cB] = extractNumbers(b.key);
            return wA - wB || cA - cB;
        });

        // Flatten into one data array
        const finalProfiles = combinedGeneratedProfiles.flatMap(entry => entry.data);
        const header = await localforage.getItem('header');

        const profilesInfo = { header, data: finalProfiles };

        // Use Blob-based CSV generation
        const blob = dataToProfilesBlob(profilesInfo);

        // Trigger file download
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'all_profiles.csv';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    });

    // Download case-control profiles
    document.getElementById('downloadCaseControl').addEventListener('click', () => {
        const caseControlDataCsv = dataToProfiles(window.data.matchedGroups);

        downloadFile(caseControlDataCsv, 'case_control_profiles', 'csv');
    });

    // Download VCF
    document.getElementById('downloadVCF').addEventListener('click', () => {
        const vcfDataCsv = dataToVCF(window.data.generatedProfiles);
        downloadFile(vcfDataCsv, 'genetic_vcf', 'vcf');
    });

    // Button to retrieve data
    document.getElementById('retrieveButton').addEventListener('click', async() => {
        const loadingScreen = document.getElementById('loadingScreen');
        const pgsIdInput = document.getElementById('pgsId').value.trim();
        const buildInput = document.querySelector('input[name="build"]:checked').value;
        const caseControlMatch = document.getElementById('caseControlMatch').checked;

        loadingScreen.style.display = 'flex';

        // Pass the renderData function as a callback to handleProfileRetrieval
        await handleProfileRetrieval(pgsIdInput, buildInput, caseControlMatch, incidenceRateFile, pgsModelFile, loadingScreen, renderData);
    });
}
