import { loadDependencies } from '../utils/loaders.js';
import { processPgsData } from '../utils/data.js';


(async () => {
    try {
        await loadDependencies();
    } catch (error) {
        console.error('Failed to load dependencies:', error);
    }
})();

let incidenceRateFile = 'data/age_specific_breast_cancer_incidence_rates.csv';
let numberOfProfiles = 10000;
let followUpPeriod = 50;
let profilesSliceSize = 100;
let minAge = 1;
let maxAge = 100;

/* TODO: Currently we only get rsId from eutils;
*    If there is no MAF get maf from eutils with rsId
*    If there is MAF, maybe get it from eutils too, ask Jeya
*/

document.getElementById('retrieveButton').addEventListener('click', async () => {
    const pgsIdInput = document.getElementById('pgsId').value.trim();
    const build = document.querySelector('input[name="build"]:checked').value;
    if (pgsIdInput.match(/^[0-9]{1,6}$/)) {
        await processPgsData(pgsIdInput, build, incidenceRateFile, numberOfProfiles, minAge, maxAge, followUpPeriod);
    }
    else {
        alert('Please enter a valid PGS ID (1 to 6 digits).');
    }
});