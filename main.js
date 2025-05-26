import { loadCountries, loadDependencies } from './utils/loadersUtils.js';
import { initializeUI } from './ui/uiHandlers.js';
import { initializeRouting, handleRouting } from './ui/routing.js';

const dependencyUrls = [
    'https://cdnjs.cloudflare.com/ajax/libs/pako/1.0.11/pako.min.js',
    'https://cdnjs.cloudflare.com/ajax/libs/localforage/1.9.0/localforage.min.js'
];

// Initial configuration for inputs, files, etc.
const config = {
    incidenceRateFile: 'data/age_specific_breast_cancer_incidence_rates.csv',
    globalIncidenceFile: 'data/incidence.csv', // future use
    pgsModelFile: 'data/pgs_model_test.txt',
    maxProfilesSlice: 100
};

// App entry point
(async function main() {
    try {
        await loadDependencies(dependencyUrls);
        initializeRouting(); // Initialize first
        initializeUI(config); // Then set up UI
        await loadCountries();
        window.addEventListener('popstate', handleRouting);
    } catch (error) {
        console.error('Initialization failed:', error);
        alert(`Error: ${error.message}`);
    }
})();