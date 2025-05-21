import { handleCaseControlRetrieval, handleProfileRetrieval } from '../worker/workerController.js';
import { handleSnpsInfo, parseCsv, downloadProfilesFromChunks, downloadFile } from '../syntheticDataGenerator.js';


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
        dataToVCF
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
    /* global localforage, pako */
    document.getElementById('downloadProfiles').addEventListener('click', async () => {
        await downloadProfilesFromChunks({ prefix: 'worker_', filename: 'all_profiles.csv', splitDataset: false });
    });

    document.getElementById('downloadCaseControl').addEventListener('click', async () => {
        await downloadProfilesFromChunks({ prefix: 'worker_', filename: 'case_controls.csv', splitDataset: true });
    });

    // Download VCF
    document.getElementById('downloadVCF').addEventListener('click', () => {
        const vcfDataCsv = dataToVCF(window.data.generatedProfiles);
        downloadFile(vcfDataCsv, 'genetic_vcf', 'vcf');
    });

    // Button to retrieve data
    document.getElementById('retrieveButton').addEventListener('click', async () => {
        const loadingScreen = document.getElementById('loadingScreen');
        const pgsIdInput = document.getElementById('pgsId').value.trim();
        const numberOfProfiles = document.getElementById('numberOfProfiles').value.trim();
        const caseControlRatio = 0.5;//document.getElementById('numberOfProfiles').value.trim();
        const minAge = document.getElementById('minAge').value.trim();
        const maxAge = document.getElementById('maxAge').value.trim();
        const minFollowUp = document.getElementById('minFollowUp').value.trim();
        const maxFollowUp = document.getElementById('maxFollowUp').value.trim();
        const caseControlMatch = document.getElementById('caseControlMatch')?.checked; // updated ID if relevant

        if (!/^(PGS\d{6}|\d{1,6})$/.test(pgsIdInput)) {
            alert('Please enter a valid PGS ID (e.g., PGS000123 or 123).');
            return;
        }

        if (!numberOfProfiles || isNaN(numberOfProfiles) || Number(numberOfProfiles) <= 0) {
            alert('Please enter a valid number of profiles.');
            return;
        }

        if (!minAge || isNaN(minAge) || !maxAge || isNaN(maxAge) || Number(minAge) < 0 || Number(maxAge) < Number(minAge)) {
            alert('Please enter a valid age range.');
            return;
        }

        if (!minFollowUp || isNaN(minFollowUp) || !maxFollowUp || isNaN(maxFollowUp) || Number(minFollowUp) < 0 || Number(maxFollowUp) < Number(minFollowUp)) {
            alert('Please enter a valid follow-up range.');
            return;
        }

        if (!loadingScreen.style) {
            console.error('Error: HTML element not found');
        }

        loadingScreen.style.display = 'flex';

        // TODO: Remove in production
        await localforage.clear();

        let snpsInfo, predictedIncidenceRate, k, b;

        try {
            ({ snpsInfo, predictedIncidenceRate, k, b } = await handleSnpsInfo(
                pgsIdInput,
                incidenceRateFile,
                pgsModelFile
            ));
        } catch (error) {
            console.error(error.message);
            alert('Failed to load SNPs info: ' + error.message);
            loadingScreen.style.display = 'none';
            return;
        }

        try {
            if (caseControlMatch) {
                const config = {
                    totalProfiles: Number(numberOfProfiles),
                    chunkSize: 25_000,
                    minAge: Number(minAge),
                    maxAge: Number(maxAge),
                    minFollowUp: Number(minFollowUp),
                    maxFollowUp: Number(maxFollowUp)
                };

                await handleCaseControlRetrieval(config, caseControlRatio, snpsInfo, k, b, incidenceRateFile, pgsModelFile, loadingScreen, renderData);
            }
            else {
                const config = {
                    totalProfiles: Number(numberOfProfiles),
                    chunkSize: 25_000,
                    minAge: Number(minAge),
                    maxAge: Number(maxAge),
                    minFollowUp: Number(minFollowUp),
                    maxFollowUp: Number(maxFollowUp)
                };

                await handleProfileRetrieval(config, snpsInfo, k, b, incidenceRateFile, pgsModelFile, loadingScreen, renderData);
            }
        } catch (error) {
            console.error(error.message);
            alert('Error during profile generation: ' + error.message);
            loadingScreen.style.display = 'none';
        }
    });
}
