import { httpRequest } from './httpUtils.js';
import { GENDER } from '../constants.js';


export async function loadScript(url) {
    return new Promise((resolve, reject) => {
        const script = document.createElement('script');
        script.src = url;
        script.onload = () => resolve();
        script.onerror = () => reject(new Error(`Failed to load script: ${url}`));
        document.head.appendChild(script);
    });
}


export async function loadDependencies(urls) {
    await Promise.all(urls.map(loadScript));

    const pako = window.pako;
    const localforage = window.localforage;
    const Chart = window.Chart;
    const d3 = window.d3;

    if (!pako || !localforage || !Chart || !d3) {
        throw new Error('One or more dependencies failed to load.');
    }

    console.log('All dependencies loaded successfully.');

    return { pako, localforage, Chart, d3 };
}


export async function loadScore(entry = 'PGS000004', build = 38) {
    if (!isNaN(Number(entry))) {
        entry = entry.toString();
        entry = 'PGS000000'.slice(0, -entry.length) + entry;
    }

    const url = `https://ftp.ebi.ac.uk/pub/databases/spot/pgs/scores/${entry}/ScoringFiles/Harmonized/${entry}_hmPOS_GRCh${build}.txt.gz`;

    try {
        const response = await httpRequest(url);
        const arrayBuffer = await response.arrayBuffer();

        return pako.inflate(arrayBuffer, { to: 'string' });
    } catch (error) {
        console.error('Error in loadScore:', error);
        throw new Error(`Failed to load or decompress score file from ${url}: ${error.message}`);
    }
}


export async function loadCountries() {
    const countrySelect = document.getElementById('countrySelect');

    try {
        const response = await httpRequest('https://api.worldbank.org/v2/country?format=json&per_page=300');
        const data = await response.json();
        const countries = data[1];

        countrySelect.innerHTML = '';

        const placeholder = document.createElement('option');
        placeholder.value = '';
        placeholder.textContent = 'Select a country';
        placeholder.disabled = true;
        placeholder.selected = true;
        placeholder.hidden = true;
        countrySelect.appendChild(placeholder);

        // Filter out aggregates and sort alphabetically
        const realCountries = countries
            .filter(c => c.region && c.region.value !== 'Aggregates')
            .sort((a, b) => a.name.localeCompare(b.name));

        // Populate select options
        realCountries.forEach(country => {
            const option = document.createElement('option');
            option.value = country.id;  // ISO 3 code
            option.textContent = country.name;
            countrySelect.appendChild(option);
        });
    } catch (err) {
        console.error('Failed to load countries', err);
        countrySelect.innerHTML = `<option value="">Failed to load countries</option>`;
    }
}


export async function loadPopulation() {
    const countryISO = document.getElementById('countrySelect').value;

    try {
        const ageGroups = [
            '0004', '0509', '1014', '1519', '2024',
            '2529', '3034', '3539', '4044', '4549',
            '5054', '5559', '6064', '6569', '7074',
            '7579'
        ];

        const genders = ['FE', 'MA'];
        const promises = [];

        for (const age of ageGroups) {
            for (const gender of genders) {
                const indicator = `SP.POP.${age}.${gender}.5Y`;
                promises.push(httpRequest(`https://api.worldbank.org/v2/country/${countryISO}/indicator/${indicator}?date=2023&format=json`));
            }
        }

        // Total female population
        promises.push(httpRequest(`https://api.worldbank.org/v2/country/${countryISO}/indicator/SP.POP.TOTL.FE.IN?date=2023&format=json`));
        // Total male population
        promises.push(httpRequest(`https://api.worldbank.org/v2/country/${countryISO}/indicator/SP.POP.TOTL.MA.IN?date=2023&format=json`));

        // Wait all responses
        /** @type {Response[]} */
        const results = await Promise.all(promises);

        // Now process results:
        // The order of results is: for each ageGroup * each gender, then total male, total female, total population
        const populationData = {
            ageGenderPercentages: {},  // { '0004': { FE: %, MA: % }, ... }
            totalFemalePopulation: 0,
            totalMalePopulation: 0
        };

        // Process age-gender percentages:
        const ageGroupCount = ageGroups.length;
        // Each age group has 2 gender entries: FE then MA (because genders=['FE','MA'] order)
        for (let i = 0; i < ageGroupCount; i++) {
            const feIndex = i * 2;
            const maIndex = feIndex + 1;

            // Each response has JSON structure: [metadata, dataArray]
            const feResponse = await results[feIndex].json();
            const maResponse = await results[maIndex].json();

            const feValue = feResponse[1][0]?.value ?? null;
            const maValue = maResponse[1][0]?.value ?? null;

            populationData.ageGenderPercentages[ageGroups[i]] = {
                [GENDER.FEMALE]: feValue,
                [GENDER.MALE]: maValue
            };
        }

        const feTotal = await results[ageGroupCount * 2].json();
        const maTotal = await results[ageGroupCount * 2 + 1].json();

        populationData.totalFemalePopulation = feTotal[1][0]?.value ?? null;
        populationData.totalMalePopulation = maTotal[1][0]?.value ?? null;

        return populationData;
    } catch (err) {
        console.error('Failed to load population data', err);
    }
}
