import { handleCaseControlRetrieval, handleProfileRetrieval } from '../worker/workerController.js';
import { handleSnpsInfo, parseCsv, downloadProfilesFromChunks, downloadFile } from '../syntheticDataGenerator.js';
import { loadPopulation } from '../utils/loadersUtils.js';


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


async function handleDataGeneration({
                                        isRetrospective = false,
                                        countryISO,
                                        gender = 'both',
                                        pgsIdInput,
                                        numberOfProfiles,
                                        minAge,
                                        maxAge,
                                        minFollowUp,
                                        maxFollowUp,
                                        controlsPerCase = 1
                                    }) {
    /* global localforage */
    const loadingScreen = document.getElementById('loadingScreen');

    if (!/^(PGS\d{6}|\d{1,6})$/.test(pgsIdInput)) {
        alert('Please enter a valid PGS ID (e.g., PGS000123 or 123).');
        return;
    }

    if (!countryISO) {
        alert('Please select a country first to load population data.');
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

    if (!controlsPerCase || isNaN(controlsPerCase)) {
        alert('Please enter a valid number of controls per cases.');
    }

    if (!loadingScreen.style) {
        console.error('Error: HTML element not found');
    }

    loadingScreen.style.display = 'flex';
    await localforage.clear();

    let snpsInfo, predictedIncidenceRate, k, b;

    const incidenceRateFile = 'data/age_specific_breast_cancer_incidence_rates.csv';
    const pgsModelFile = 'data/pgs_model_test.txt';

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
        const config = {
            totalProfiles: Number(numberOfProfiles),
            chunkSize: Math.min(25_000, Number(numberOfProfiles)),
            minAge: Number(minAge),
            maxAge: Number(maxAge),
            minFollowUp: Number(minFollowUp),
            maxFollowUp: Number(maxFollowUp)
        };

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

        if (isRetrospective) {
            await handleCaseControlRetrieval(config, controlsPerCase, snpsInfo, k, b, incidenceRateFile, pgsModelFile, loadingScreen, renderData);
        }
        else {
            await handleProfileRetrieval(config, snpsInfo, k, b, incidenceRateFile, pgsModelFile, loadingScreen, renderData);
        }
    } catch (error) {
        console.error(error.message);
        alert('Error during profile generation: ' + error.message);
        loadingScreen.style.display = 'none';
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

    // Download profiles
    /* global localforage, pako */
    document.getElementById('downloadProfiles').addEventListener('click', async () => {
        await downloadProfilesFromChunks({
            prefix: 'worker_',
            filename: 'all_profiles.csv',
            splitDataset: false
        });
    });

    document.getElementById('downloadCaseControl').addEventListener('click', async () => {
        await downloadProfilesFromChunks({
            prefix: 'worker_',
            filename: 'case_controls.csv',
            splitDataset: true
        });
    });

    // Download VCF
    // document.getElementById('downloadVCF').addEventListener('click', () => {
    //     const vcfDataCsv = dataToVCF(window.data.generatedProfiles);
    //     downloadFile(vcfDataCsv, 'genetic_vcf', 'vcf');
    // });

    document.getElementById('countrySelect').addEventListener('change', async (e) => {
        const countryISO = e.target.value;

        if (countryISO) {
            const ageData = await loadPopulation(countryISO);
            await localforage.setItem('populationData', ageData);
        }
    });

    document.getElementById('retrieveButton').addEventListener('click', async () => {
        await handleDataGeneration({
            isRetrospective: false,
            countryISO: document.getElementById('countrySelect').value.trim(),
            gender: document.getElementById('genderSelect').value.trim(),
            pgsIdInput: document.getElementById('pgsId').value.trim(),
            numberOfProfiles: document.getElementById('numberOfProfiles').value.trim(),
            minAge: document.getElementById('minAge').value.trim(),
            maxAge: document.getElementById('maxAge').value.trim(),
            minFollowUp: document.getElementById('minFollowUp').value.trim(),
            maxFollowUp: document.getElementById('maxFollowUp').value.trim()
        });
    });

    document.getElementById('retrospectiveGenerate').addEventListener('click', async () => {
        const selectedCountryCode = document.getElementById('countrySelect').value;

        await handleDataGeneration({
            isRetrospective: true,
            countryISO: document.getElementById('countrySelect').value.trim(),
            gender: document.getElementById('genderSelect').value.trim(),
            pgsIdInput: document.getElementById('pgsId').value.trim(),
            numberOfProfiles: document.getElementById('retrospectiveNumberOfProfiles').value.trim(),
            minAge: document.getElementById('retrospectiveMinAge').value.trim(),
            maxAge: document.getElementById('retrospectiveMaxAge').value.trim(),
            minFollowUp: document.getElementById('retrospectiveMinFollowUp').value.trim(),
            maxFollowUp: document.getElementById('retrospectiveMaxFollowUp').value.trim(),
            controlsPerCase: document.getElementById('controlsPerCase').value.trim()
        });
    });
}
