async function loadScript(url) {
    return new Promise((resolve, reject) => {
        const script = document.createElement('script');
        script.src = url;
        script.onload = () => resolve();
        script.onerror = () => reject(new Error(`Failed to load script: ${url}`));
        document.head.appendChild(script);
    });
}

async function loadDependencies() {
    const urls = [
        'https://cdnjs.cloudflare.com/ajax/libs/pako/1.0.11/pako.min.js',
        'https://cdnjs.cloudflare.com/ajax/libs/localforage/1.9.0/localforage.min.js',
        'https://cdn.jsdelivr.net/pyodide/v0.26.4/full/pyodide.js'
    ];

    try {
        await Promise.all(urls.map(loadScript));
        pako = window.pako;
        localforage = window.localforage;
        pyodide = await loadPyodide();
        console.log('All dependencies loaded successfully.');
    } catch (error) {
        console.error('Error loading dependencies:', error);
    }
}

async function loadScore(entry = 'PGS000004', build = 37) {
    if (!isNaN(Number(entry))) {
        entry = entry.toString();
        entry = 'PGS000000'.slice(0, -entry.length) + entry;
    }

    // Construct the full URL
    const url = `https://ftp.ebi.ac.uk/pub/databases/spot/pgs/scores/${entry}/ScoringFiles/Harmonized/${entry}_hmPOS_GRCh${build}.txt.gz`;

    // Fetch and inflate the entire file content
    try {
        const response = await httpRequest(url);
        const arrayBuffer = await response.arrayBuffer();

        return pako.inflate(arrayBuffer, { to: 'string' });
    } catch (error) {
        console.error('Error loading score:', error);
    }
}

function parseFile(file) {
    const data = file.split('\n').map(line => line.trim().split(/\s+/)).filter(line => line[0] && !line[0].startsWith('#'));

    return { headers: data[0], values: data.slice(1) };
}

async function asyncPool(poolLimit, array, iteratorFn) {
    const ret = [];
    const executing = [];

    for (const item of array) {
        const p = iteratorFn(item);
        ret.push(p);

        if (poolLimit <= array.length) {
            const e = p.then(() => executing.splice(executing.indexOf(e), 1));
            executing.push(e);

            if (executing.length >= poolLimit) {
                await Promise.race(executing);
            }
        }
    }

    return Promise.all(ret);
}

async function httpRequest(url) {
    const response = await fetch(url);

    if (!response.ok) {
        throw new Error(`Request failed with status ${response.status}`);
    }

    return response;
}

// async function getRsIds(coordinates, apiKey) {
//     const requestLimit = 10;
//
//     const results = await asyncPool(requestLimit, coordinates, async (coordinate) => {
//         const { chromosome, position } = coordinate;
//         //const eUtilsURL = `https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esearch.fcgi?db=snp&term=${chromosome}[Chromosome]&${position}[Base Position]&retmode=json&api_key=${apiKey}`;
//         const eUtilsURL = `https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esearch.fcgi?db=snp&term=${position}[BPOSITION]&${chromosome}[BCHR]&retmode=json&api_key=${apiKey}`;
//
//         try {
//             const response = await httpRequest(eUtilsURL);
//             const data = await response.json();
//             await sleep(100);
//             const idListLength = data.esearchresult.idlist.length;
//             const rsID = data.esearchresult.idlist[idListLength - 1];
//             console.log([chromosome, position, rsID]);
//             if (!rsID) {
//                 console.error(`No SNP found at chromosome ${chromosome} and position ${position}.`);
//
//                 return null;
//             }
//
//             return { chromosome, position, rsID }; // Correctly return the result
//         } catch (error) {
//             console.error(`Error fetching rsID for chromosome ${chromosome} and position ${position}: ${error.message}`);
//
//             return null;
//         }
//     });
//
//     return results;
// }

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

async function getRsIds(snpsInfo, apiKey) {
    const requestInterval = 50; // 100ms per request = 10 requests/second

    for (let i = 0; i < snpsInfo.length; i++) {
        const { chromosome, position } = snpsInfo[i];
        const eUtilsURL = `https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esearch.fcgi?db=snp&term=${snpsInfo[i].position}[BPOSITION]&${snpsInfo[i].chromosome}[BCHR]&retmode=json&api_key=${apiKey}`;

        try {
            const response = await httpRequest(eUtilsURL);
            await response.json().then((data) => {
                const rsID = data.esearchresult.idlist[0];

                if (!rsID) {
                    console.error(`No rsID found for chromosome ${chromosome} and position ${position}.`);

                    return;
                }

                snpsInfo[i].rsID = rsID;
            });
        } catch (error) {
            console.error(`Error fetching rsID for chromosome ${chromosome} and position ${position}: ${error.message}`);
        }

        if (i < snpsInfo.length - 1) await sleep(requestInterval);
    }
}

async function getChromosomeAndPosition(rsIDs, genomeBuild, apiKey) {
    const requestLimit = 10;

    const results = await asyncPool(requestLimit, rsIDs, async (rsID) => {
        rsID = rsID.split('rs')[1];
        const eutilsURL = `https://eutils.ncbi.nlm.nih.gov/entrez/eutils/efetch.fcgi?db=snp&id=${rsID}&retmode=json&api_key=${apiKey}`;

        try {
            const response = await httpRequest(eutilsURL);
            const assembly = response.refsnp[0].placements_with_allele.filter(
                (item) => item.assembly_name === genomeBuild
            )[0];

            if (!assembly) {
                throw new Error(`Genome build ${genomeBuild} not found for rsID ${rsID}.`);
            }

            const chromosome = assembly.seq_id;
            const position = assembly.alleles[0].hgvs.lct.position;

            return { rsID, chromosome, position };
        } catch (error) {
            console.error(`Error fetching SNP information for rsID ${rsID}: ${error.message}`);
            return null;
        }
    });

    return results;
}

function calculateHardyWeinbergEquilibrium(maf) {
    const recessiveHomozygousFreq = Math.pow(maf, 2);
    const dominantHomozygousFreq = Math.pow((1 - maf), 2);
    const heterozygousFreq = 1 - recessiveHomozygousFreq - dominantHomozygousFreq;

    return [dominantHomozygousFreq, heterozygousFreq, recessiveHomozygousFreq];
}

async function processSnpData(snpData) {
    const chrNameIndex = snpData.headers.indexOf('chr_name');
    const chrPositionIndex = snpData.headers.indexOf('chr_position');
    const effectAllele = snpData.headers.indexOf('effect_allele');
    const otherAllele = snpData.headers.indexOf('other_allele');
    const effectWeight = snpData.headers.indexOf('effect_weight');
    const snpAlleleFrequencyIndex = snpData.headers.indexOf('allelefrequency_effect');
    const snpValues = snpData.values;

    if (snpAlleleFrequencyIndex === -1) {
        alert('This PGS file does not have Allele Frequency, please choose another one!');

        return null;
    }

    const snpInfo = snpValues.map(snpValue => ({
        chromosome: snpValue[chrNameIndex],
        position: snpValue[chrPositionIndex],
        weight: snpValue[effectWeight],
        maf: snpValue[snpAlleleFrequencyIndex]
    }));

    // TODO: CHANGE BACK ALLSNPIDS, TESTING PURPOSES ONLY
    //const allSnpIds = await getRsIds(snpInfo, API_KEY);
    const snps = [
        {
            'chromosome': '1',
            'position': '100880328',
            'weight': '0.0373',
            'maf': '0.4097',
            'rsID': '2060248649'
        },
        {
            'chromosome': '1',
            'position': '10566215',
            'weight': '-0.0586',
            'maf': '0.329',
            'rsID': '2074489304'
        },
        {
            'chromosome': '1',
            'position': '110198129',
            'weight': '0.0458',
            'maf': '0.7755',
            'rsID': '1759874306'
        },
        {
            'chromosome': '1',
            'position': '114445880',
            'weight': '0.0621',
            'maf': '0.1664',
            'rsID': '2065358958'
        },
        {
            'chromosome': '1',
            'position': '118141492',
            'weight': '0.0452',
            'maf': '0.2657',
            'rsID': '2112648016'
        },
        {
            'chromosome': '1',
            'position': '120257110',
            'weight': '0.0385',
            'maf': '0.5309',
            'rsID': '1829134625'
        },
        {
            'chromosome': '1',
            'position': '121280613',
            'weight': '0.0881',
            'maf': '0.4053',
            'rsID': '2108441015'
        },
        {
            'chromosome': '1',
            'position': '121287994',
            'weight': '-0.0673',
            'maf': '0.106',
            'rsID': '2128153741'
        },
        {
            'chromosome': '1',
            'position': '145604302',
            'weight': '-0.0399',
            'maf': '0.3515',
            'rsID': '2107891917'
        },
        {
            'chromosome': '1',
            'position': '149906413',
            'weight': '0.0548',
            'maf': '0.4017',
            'rsID': '2090805264'
        },
        {
            'chromosome': '1',
            'position': '155556971',
            'weight': '0.0499',
            'maf': '0.2302',
            'rsID': '1682117096'
        },
        {
            'chromosome': '1',
            'position': '168171052',
            'weight': '-0.068',
            'maf': '0.1097',
            'rsID': '1700211214'
        },
        {
            'chromosome': '1',
            'position': '172328767',
            'weight': '-0.0435',
            'maf': '0.3305',
            'rsID': '1762886181'
        },
        {
            'chromosome': '1',
            'position': '18807339',
            'weight': '-0.0564',
            'maf': '0.5145',
            'rsID': '2141904107'
        },
        {
            'chromosome': '1',
            'position': '201437832',
            'weight': '0.0917',
            'maf': '0.0559',
            'rsID': '1951890285'
        },
        {
            'chromosome': '1',
            'position': '202184600',
            'weight': '-0.0065',
            'maf': '0.3992',
            'rsID': '1692186874'
        },
        {
            'chromosome': '1',
            'position': '203770448',
            'weight': '0.0498',
            'maf': '0.2715',
            'rsID': '60282146'
        },
        {
            'chromosome': '1',
            'position': '204502514',
            'weight': '-0.0321',
            'maf': '0.8028',
            'rsID': '1661058666'
        },
        {
            'chromosome': '1',
            'position': '208076291',
            'weight': '-0.0366',
            'maf': '0.3337',
            'rsID': '1666147179'
        },
        {
            'chromosome': '1',
            'position': '217053815',
            'weight': '0.0417',
            'maf': '0.328',
            'rsID': '1372178533'
        },
        {
            'chromosome': '1',
            'position': '217220574',
            'weight': '-0.044',
            'maf': '0.2107',
            'rsID': '59480477'
        },
        {
            'chromosome': '1',
            'position': '220671050',
            'weight': '0.0418',
            'maf': '0.2415',
            'rsID': '59320025'
        },
        {
            'chromosome': '1',
            'position': '242034263',
            'weight': '0.1428',
            'maf': '0.0305',
            'rsID': '937921037'
        }
    ];

    snps.forEach((snpValue, index) => {
        if (snps[index]) { // Check if SNP ID is valid
            snpValue.alleleDosageFrequency = calculateHardyWeinbergEquilibrium(snpValue.maf);
        }
        else {
            console.warn('Missing SNP ID for:', snpInfo);
        }
    });

    return snps;
}

function generateAlleleDosage([_, heterozygousFreq, recessiveHomozygousFreq]) {
    const r = Math.random();

    return r < recessiveHomozygousFreq ? 2 : (r < recessiveHomozygousFreq + heterozygousFreq ? 1 : 0);
}

function assignAgesUniformly(numPeople, minAge = 0, maxAge = 100) {
    const range = maxAge - minAge + 1; // Total number of unique ages
    const ages = [];

    // Distribute ages evenly, repeating if necessary
    for (let i = 0; i < numPeople; i++) {
        const age = minAge + (i % range);
        ages.push(age);
    }
    return ages;

    // Shuffle ages for randomness
    for (let i = ages.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [ages[i], ages[j]] = [ages[j], ages[i]];
    }

}

async function processProfiles(snpsInfo, numProfiles) {
    const profiles = [];
    const expLinearPredictors = [];
    const ages = assignAgesUniformly(numberOfProfiles, minAge, maxAge);
    const rsIds = snpsInfo.map(snp => snp.rsID);

    // Iterate over the number of profiles
    for (let i = 0; i < numProfiles; i++) {
        let prs = 0;

        const profile = {
            id: `Q-${i + 1}`, // Unique ID for each profile
            age: ages[i],
            prs: 0,
            allelesDosage: new Uint8Array(snpsInfo.length), // Array to store alleles
            control: 0
        };

        snpsInfo.forEach((snp, snpIndex) => {
            const { weight, alleleDosageFrequency } = snp;
            const alleleDosage = generateAlleleDosage(alleleDosageFrequency);
            profile.allelesDosage[snpIndex] = alleleDosage;
            prs += weight * alleleDosage;
        });
        profile.prs = prs;
        expLinearPredictors.push(prs);
        profiles.push(profile); // Add the completed profile to the profiles array
    }

    return [rsIds, expLinearPredictors, profiles];
}

async function estimateWeibullParameters(expLinearPredictors) {
    await pyodide.loadPackage('scipy');
    await pyodide.loadPackage('numpy');
    //expLinearPredictors = [0.4151979020538666, 1.8268624733741343, 0.4832119025036849, 0.6196502952454827, 0.5651862252105405, 0.514427832909567, 0.23692775868212182, 0.31975506440789486, 0.6002554286139826, 0.45443517718131154];

    const jsonExpLinearPredictors = JSON.stringify(expLinearPredictors);
    pyodide.globals.set('jsonExpLinearPredictors', jsonExpLinearPredictors);
    console.log(jsonExpLinearPredictors);
    const temp = pyodide.runPython(`
        import json
        import numpy as np
        from scipy.optimize import minimize
        
        rng = np.random.default_rng(seed=42)
        
        exp_linear_predictors = np.array(json.loads(jsonExpLinearPredictors)).reshape(-1, 1)
        del jsonExpLinearPredictors
        iter = 0
        n = exp_linear_predictors.shape[0]
        
        def f(k, b): 
            global iter
            iter += 1
            print(iter)
            time_of_onset = np.power(- np.log(np.random.uniform(0, 1, n)) / (b * exp_linear_predictors), 1 / k)
            p50 = np.sum(time_of_onset < 50) / n
            p70 = np.sum(time_of_onset < 70) / n

            return p50, p70
        
        
        def objective_function(params):
            k, b = params
            p50, p70 = f(k, np.exp(b))
            target_p50, target_p70 = 0.05, 0.12
            error = (p50 - target_p50)**2 + (p70 - target_p70)**2
            
            return error
        
        initial_guess = [2.15, np.log(0.9E-6)]
        [optimized_k, optimized_b] = [None, None]
        bounds = [(1e-8, None), (None, None)]
        options = {'maxiter': 5000, 'fatol': 4e-6}
        result = minimize(
            objective_function,
            initial_guess,
            method='Nelder-Mead',
            bounds=bounds,
            options=options
            )
        
        if result.success:
            optimized_k, optimized_b = result.x
            print(f"Optimized k: {optimized_k}, Optimized b: {np.exp(optimized_b)}, f(k, b): {f(optimized_k, np.exp(optimized_b))}")
            print(result)
        else:
            print("Optimization failed.")
        
        optimized_k, optimized_b
        `);

    return temp.toJSON();
}

function calculateTimeDiseaseOnset(age, prs, k, b) {
    k = 2.39;
    b = 5;
    const denominator = prs * b;
    const numerator = Math.log(Math.random());
    const innerTerm = age - (denominator / numerator);

    return Math.pow(innerTerm, 1 / k);
}

function distributeCaseControl(profiles, k, b) {
    profiles.forEach(profile => {
        profile.case = calculateTimeDiseaseOnset(profile.age, profile.prs, k, b);
    });
}

function countOccurrences(snpIndex, profiles) {
    const counts = { 0: 0, 1: 0, 2: 0 }; // Initialize counts for 0, 1, and 2

    profiles.forEach(profile => {
        // Use the dynamic key access to get the value of the specified snpId
        const value = profile.allelesDosage[snpIndex];
        if (value in counts) { // Check if the value is a key in counts
            counts[value]++;
        }
    });

    return counts;
}

function renderHistogram(counts, element, numberOfProfiles) {
    window.requestAnimationFrame(() => {
        const canvas = document.getElementById(element);
        const ctx = canvas.getContext('2d');

        const width = canvas.width;
        const height = canvas.height;
        const barWidth = width / 3; // 3 bars for 0, 1, and 2

        // Clear the canvas
        ctx.clearRect(0, 0, width, height);

        // Draw histogram bars for counts of 0, 1, and 2
        for (let i = 0; i <= 2; i++) {
            let scaledCount = counts[i];

            if (scaledCount > 1) {
                scaledCount /= numberOfProfiles;
            }

            // Skip drawing if the scaled count is zero
            if (scaledCount <= 0) continue;

            const barHeight = scaledCount * height; // Scale the height based on the adjusted counts
            const x = i * barWidth; // X position of the bar
            const y = height - barHeight; // Y position (bottom of the canvas)

            ctx.fillStyle = 'blue'; // Set color for the bars
            ctx.fillRect(x, y, barWidth - 2, barHeight); // Draw the bar

            ctx.fillStyle = 'black'; // Set color for the text
            ctx.fillText(scaledCount.toFixed(2), x + (barWidth / 2) - 10, y - 10); // Draw the scaled count above the bar
        }

        // Add x-axis labels
        ctx.fillStyle = 'black';
        ctx.fillText('0', barWidth / 2 - 10, height - 5); // Label for 0
        ctx.fillText('1', barWidth * 1.5 - 10, height - 5); // Label for 1
        ctx.fillText('2', barWidth * 2.5 - 10, height - 5); // Label for 2

        // Add y-axis label (optional)
        ctx.save(); // Save the current context
        ctx.rotate(-Math.PI / 2); // Rotate context to draw y-axis label
        ctx.fillText('Count', -height / 2, 20); // Position of the y-axis label
        ctx.restore(); // Restore the context to original state
    });
}

function displaySNP(snp) {
    document.getElementById('snpDisplay').textContent = `SNP: rs${snp}`;
}

function createTable(data, tableId = 'generatedTable') {
    // Find or create the table container element
    let tableContainer = document.getElementById(tableId);
    if (!tableContainer) {
        tableContainer = document.createElement('div');
        tableContainer.id = tableId;
        document.body.appendChild(tableContainer);
    }

    // Clear any existing table content
    tableContainer.innerHTML = '';

    // Create the table element
    const table = document.createElement('table');
    table.style.borderCollapse = 'collapse';
    table.style.width = '100%';

    // Create the table header
    const headers = Object.keys(data[0]); // Assumes all objects have the same keys
    const headerRow = document.createElement('tr');
    headers.forEach(headerText => {
        const th = document.createElement('th');
        th.textContent = headerText;
        th.style.border = '1px solid black';
        th.style.padding = '8px';
        th.style.backgroundColor = '#f2f2f2';
        th.style.textAlign = 'center';
        headerRow.appendChild(th);
    });
    table.appendChild(headerRow);

    // Add rows
    data.forEach(rowData => {
        const row = document.createElement('tr');
        headers.forEach(header => {
            const td = document.createElement('td');
            td.textContent = rowData[header];
            td.style.border = '1px solid black';
            td.style.padding = '8px';
            td.style.textAlign = 'center';
            row.appendChild(td);
        });
        table.appendChild(row);
    });

    // Append the table to the container
    tableContainer.appendChild(table);
}

async function processPgsData(pgsId, build) {
    try {
        const genomeBuild = 'GRCh38';
        const textFile = await loadScore(pgsId, build);
        const parsedFile = parseFile(textFile);
        const snpsInfo = await processSnpData(parsedFile);
        const [rsIds, expLinearPredictors, generatedProfiles] = await processProfiles(snpsInfo, numberOfProfiles);
        const slicedLinearPredictors = expLinearPredictors.slice(0, 20); // G
        const [optimized_k, optimized_b] = await estimateWeibullParameters(slicedLinearPredictors);
        const data = distributeCaseControl(generatedProfiles, optimized_k, optimized_b);
        console.log('RESULT ');

        const maxSize = 1000;
        const randomIndex = Object.keys(rsIds)[Math.floor(Math.random() * Object.keys(rsIds).length)];
        const slicedProfiles = generatedProfiles.slice(0, maxSize); // G
        const occurrence = countOccurrences(randomIndex, slicedProfiles);
        const randomSnp = snpsInfo.filter(snp => snp.rsID === rsIds[randomIndex]);

        renderHistogram(occurrence, 'generatedHistogram', maxSize);
        renderHistogram(randomSnp[0].alleleDosageFrequency, 'expectedHistogram', maxSize);
        displaySNP(rsIds[randomIndex]);
        createTable(slicedProfiles);
    } catch (error) {
        console.error('An error occurred:', error);
    }
}

(async () => {
    await loadDependencies(); // Wait until dependencies are loaded
})();

// Global variables
let pako;
let localforage;
let pyodide;
const numberOfProfiles = 1000;
const followUpPeriod = 50;
let k = 0;
let b = 0;
const minAge = 0;
const maxAge = 100;

import { API_KEY } from '../apikey.js';
/* TODO: Currently we only get rsId from eutils;
*    If there is no MAF get maf from eutils with rsId
*    If there is MAF, maybe get it from eutils too, ask Jeya
*/

document.getElementById('retrieveButton').addEventListener('click', async () => {
    const pgsIdInput = document.getElementById('pgsId').value.trim();
    const build = document.querySelector('input[name="build"]:checked').value;
    if (pgsIdInput.match(/^[0-9]{1,6}$/)) {
        await processPgsData(pgsIdInput, build);
    }
    else {
        alert('Please enter a valid PGS ID (1 to 6 digits).');
    }
});