import {
    handleCaseControlRetrieval,
    handleProfileRetrieval,
    handleSnpsInfo,
    downloadVcfFromChunks,
    downloadCohortFromChunks,
    loadPopulation, showAlert, hideAlert, displayResults, displayResultsHTML
} from '../syntheticDataGenerator.js';
import { GENDER, DEFAULT_CHUNK_SIZE } from '../constants.js';


async function handleDataGeneration(params) {
    const {
        isRetrospective = false,
        countryISO,
        gender = 'both',
        pgsIdInput,
        numberOfProfiles,
        minAge,
        maxAge,
        minFollowUp,
        maxFollowUp,
        controlsPerCase = 1,
        loadingScreen
    } = params;

    let hasError = false;

    hideAlert('country');
    hideAlert('pgs');
    hideAlert('profiles');
    hideAlert('cases');
    hideAlert('age-range');
    hideAlert('age-follow');
    hideAlert('controls');

    if (!countryISO) {
        showAlert('country');
        hasError = true;
    }

    if (!/^(PGS\d{6}|\d{1,6})$/.test(pgsIdInput)) {
        showAlert('pgs');
        hasError = true;
    }

    if (!numberOfProfiles || isNaN(numberOfProfiles) || Number(numberOfProfiles) <= 0) {
        if (isRetrospective) showAlert('cases');
        else showAlert('profiles');
        hasError = true;
    }

    if (!minAge || isNaN(minAge) || !maxAge || isNaN(maxAge) || Number(minAge) < 0 || Number(maxAge) < Number(minAge)) {
        showAlert('age-range');
        hasError = true;
    }

    if (!minFollowUp || isNaN(minFollowUp) || !maxFollowUp || isNaN(maxFollowUp) || Number(minFollowUp) < 0 || Number(maxFollowUp) < Number(minFollowUp)) {
        showAlert('age-follow');
        hasError = true;
    }

    if (!controlsPerCase || isNaN(controlsPerCase)) {
        showAlert('controls');
        hasError = true;
    }

    if (hasError) return;

    if (!loadingScreen.style) {
        console.error('Error: HTML element not found');
    }

    /* global localforage */
    loadingScreen.style.display = 'flex';

    let snpsInfo, observedIncidenceRate, predictedIncidenceRate, k, b;

    const incidenceRateFile = '../data/age_specific_breast_cancer_incidence_rates.csv';
    const pgsModelFile = 'data/pgs_model_test.txt';

    try {
        ({ snpsInfo, observedIncidenceRate, predictedIncidenceRate, k, b } = await handleSnpsInfo(
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
        const populationData = await localforage.getItem('populationData');

        let config = {
            totalProfiles: Number(numberOfProfiles),
            chunkSize: 0,
            minAge: Number(minAge),
            maxAge: Number(maxAge),
            minFollowUp: Number(minFollowUp),
            maxFollowUp: Number(maxFollowUp),
            populationData: populationData,
            gender: GENDER.FEMALE//TODO: gender
        };

        if (isRetrospective) {
            config.chunkSize = DEFAULT_CHUNK_SIZE;
            await handleCaseControlRetrieval(config, controlsPerCase, snpsInfo, k, b, incidenceRateFile, pgsModelFile, loadingScreen);
        }
        else {
            config.chunkSize = Math.min(DEFAULT_CHUNK_SIZE, Number(numberOfProfiles));
            await handleProfileRetrieval(config, snpsInfo, k, b, incidenceRateFile, pgsModelFile, loadingScreen);
        }

        return { observedIncidenceRate, predictedIncidenceRate };
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
    document.getElementById('downloadProspective')?.addEventListener('click', async () => {
        await downloadCohortFromChunks({
            prefix: 'task_',
            filename: 'all_profiles.csv',
            splitDataset: false
        });
    });

    document.getElementById('downloadRetrospective')?.addEventListener('click', async () => {
        await downloadCohortFromChunks({
            prefix: 'task_',
            filename: 'case_controls.csv',
            splitDataset: true
        });
    });

    // Download VCF
    document.getElementById('downloadProspectiveVCF').addEventListener('click', async () => {
        const header = await localforage.getItem('header');

        await downloadVcfFromChunks({
            header: header,
            prefix: 'task_',
            filename: 'profiles.vcf'
        });
    });


    document.getElementById('reset').addEventListener('click', async () => {
        await displayResultsHTML();
    });


    document.getElementById('countrySelect').addEventListener('change', async (e) => {
        const countryISO = e.target.value;

        if (countryISO) {
            const ageData = await loadPopulation(countryISO);
            await localforage.setItem('populationData', ageData);
        }
    });


    document.getElementById('genderSelect').innerHTML = `
        <option value="${GENDER.BOTH}" selected>Both</option>
        <option value="${GENDER.MALE}">Male</option>
        <option value="${GENDER.FEMALE}">Female</option>
    `;

    document.getElementById('prospectiveGenerate').addEventListener('click', async () => {
        const params = {
            isRetrospective: false,
            countryISO: document.getElementById('countrySelect').value.trim(),
            gender: document.getElementById('genderSelect').value.trim(),
            pgsIdInput: document.getElementById('pgsId').value.trim(),
            numberOfProfiles: document.getElementById('numberOfProfiles').value.trim(),
            minAge: document.getElementById('minAge').value.trim(),
            maxAge: document.getElementById('maxAge').value.trim(),
            minFollowUp: document.getElementById('minFollowUp').value.trim(),
            maxFollowUp: document.getElementById('maxFollowUp').value.trim(),
            loadingScreen: document.getElementById('loadingScreen')
        };

        const { observedIncidenceRate, predictedIncidenceRate } = await handleDataGeneration(params);

        await displayResults(params.isRetrospective, observedIncidenceRate, predictedIncidenceRate);
    });

    document.getElementById('retrospectiveGenerate').addEventListener('click', async () => {
        const params = {
            isRetrospective: true,
            countryISO: document.getElementById('countrySelect').value.trim(),
            gender: document.getElementById('genderSelect').value.trim(),
            pgsIdInput: document.getElementById('pgsId').value.trim(),
            numberOfProfiles: document.getElementById('numberOfCases').value.trim(),
            minAge: document.getElementById('minAge').value.trim(),
            maxAge: document.getElementById('maxAge').value.trim(),
            minFollowUp: document.getElementById('minFollowUp').value.trim(),
            maxFollowUp: document.getElementById('maxFollowUp').value.trim(),
            controlsPerCase: document.getElementById('controlsPerCase').value.trim(),
            loadingScreen: document.getElementById('loadingScreen')
        };
        const { observedIncidenceRate, predictedIncidenceRate } = await handleDataGeneration(params);

        await displayResults(params.isRetrospective, observedIncidenceRate, predictedIncidenceRate);
    });
}
