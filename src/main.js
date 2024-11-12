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
        'https://cdnjs.cloudflare.com/ajax/libs/localforage/1.9.0/localforage.min.js'
    ];

    try {
        await Promise.all(urls.map(loadScript));
        pako = window.pako;
        localforage = window.localforage;
        console.log('All dependencies loaded successfully.');
    } catch (error) {
        console.error('Error loading dependencies:', error);
    }
}

async function loadScore(entry = 'PGS000004', build = 37) {
    // Format the entry as a string with leading zeros if needed
    if (typeof entry === 'number') {
        entry = entry.toString();
        entry = 'PGS000000'.slice(0, -entry.length) + entry;
    }

    // Construct the full URL
    const url = `https://ftp.ebi.ac.uk/pub/databases/spot/pgs/scores/${entry}/ScoringFiles/Harmonized/${entry}_hmPOS_GRCh${build}.txt.gz`;

    // Fetch and inflate the entire file content
    const response = await fetch(url);
    const arrayBuffer = await response.arrayBuffer();

    return pako.inflate(arrayBuffer, { to: 'string' });
}

function parseFile(file) {
    const data = file.split('\n').map(line => line.trim().split(/\s+/)).filter(line => line[0] && !line[0].startsWith('#'));

    return { headers: data[0], values: data.slice(1) };
}

async function getRsId(snpInfo) {
    let url = 'https://myvariant.info/v1/variant/';
    url += `chr${snpInfo[0]}:g.${snpInfo[1]}${snpInfo[3]}>${snpInfo[2]}?fields=dbsnp.rsid`;

    try {
        const response = await fetch(url);

        if (!response.ok) {
            console.log(`Warning: 404 Not Found for URL: ${url}`); // Log with console.log or console.warn

            return null;
        }

        const data = await response.json();

        return data.dbsnp ? data.dbsnp.rsid : null; // Check if rsid exists in the response
    } catch (error) {
        console.log('Fetch error:', error);

        return null;
    }
}

function calculateHardyWeinbergEquilibrium(maf) {
    const recessiveHomozygousFreq = maf ** 2;
    const dominantHomozygousFreq = (1 - maf) ** 2;
    const heterozygousFreq = 1 - recessiveHomozygousFreq - dominantHomozygousFreq;

    return [dominantHomozygousFreq, heterozygousFreq, recessiveHomozygousFreq];
}

async function processSnpData(snpData) {
    const chrNameIndex = snpData.headers.indexOf('chr_name');
    const chrPositionIndex = snpData.headers.indexOf('chr_position');
    const effectAllele = snpData.headers.indexOf('effect_allele');
    const otherAllele = snpData.headers.indexOf('other_allele');
    const snpAlleleFrequencyIndex = snpData.headers.indexOf('allelefrequency_effect');
    const snpValues = snpData.values;
    const alleleDosageFrequency = {};

    if (snpAlleleFrequencyIndex === -1) {
        alert('This PGS file does not have Allele Frequency, please choose another one!');

        return null;
    }

    await Promise.all(
        snpValues.map(async (snpValue) => {
            const snpInfo = [snpValue[chrNameIndex], snpValue[chrPositionIndex], snpValue[effectAllele], snpValue[otherAllele]];
            const snpId = await getRsId(snpInfo);

            if (snpId) { // Check if snpId is valid
                const maf = snpValue[snpAlleleFrequencyIndex];
                alleleDosageFrequency[snpId] = calculateHardyWeinbergEquilibrium(maf);
            }
            else {
                console.warn('Missing SNP ID for:', snpInfo);
            }
        })
    );

    return alleleDosageFrequency;
}

function generateRandomProfile([_, heterozygousFreq, recessiveHomozygousFreq]) {
    const r = Math.random();
    return r < recessiveHomozygousFreq ? 2 : r < recessiveHomozygousFreq + heterozygousFreq ? 1 : 0;
}

function processProfiles(alleleData, numberOfProfiles) {
    const queryProfiles = [];

    Array.from({ length: numberOfProfiles }).forEach((_, i) => {
        const profile = { id: `Q-${i}` };

        Object.keys(alleleData).forEach(key => {
            profile[key] = generateRandomProfile(alleleData[key]);
        });
        queryProfiles.push(profile);
    });

    return queryProfiles;
}

function countOccurrences(snpId, profiles) {
    const counts = { 0: 0, 1: 0, 2: 0 }; // Initialize counts for 0, 1, and 2

    profiles.forEach(profile => {
        // Use the dynamic key access to get the value of the specified snpId
        const value = profile[snpId];
        if (value in counts) { // Check if the value is a key in counts
            counts[value]++;
        }
    });

    return counts;
}

function renderHistogram(counts, element, numberOfProfiles) {
    const canvas = document.getElementById(element);
    const ctx = canvas.getContext('2d');

    const width = canvas.width;
    const height = canvas.height;
    const barWidth = width / 3; // 3 bars for 0, 1, and 2

    // Clear the canvas
    ctx.clearRect(0, 0, width, height);

    // Draw histogram bars for counts of 0, 1, and 2
    for (let i = 0; i <= 2; i++) {
        let scaledCount = counts[i]; // Scale the count by dividing by 100

        if (scaledCount > 1) {
            scaledCount /= numberOfProfiles;
        }

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
}

function displaySNP(snp) {
    document.getElementById('snpDisplay').textContent = `SNP: ${snp}`;
}

// Global variables
let pako;
let localforage;
const numberOfProfiles = 100;

async function processPgsData(pgsId, build) {
    try {
        const textFile = await loadScore(pgsId, build);
        const parsedFile = parseFile(textFile);
        const alleleDosage = await processSnpData(parsedFile);
        const generatedProfiles = processProfiles(alleleDosage, numberOfProfiles);

        const randomKey = Object.keys(alleleDosage)[Math.floor(Math.random() * Object.keys(alleleDosage).length)];
        const occurrence = countOccurrences(randomKey, generatedProfiles);

        renderHistogram(occurrence, 'generatedHistogram', numberOfProfiles);
        renderHistogram(alleleDosage[randomKey], 'expectedHistogram', numberOfProfiles);
        displaySNP(randomKey);
    } catch (error) {
        console.error('An error occurred:', error);
    }
}

(async () => {
    await loadDependencies(); // Wait until dependencies are loaded
})();

document.getElementById('retrieveButton').addEventListener('click', async () => {
    const pgsIdInput = document.getElementById('pgsId').value.trim();
    const build = document.querySelector('input[name="build"]:checked').value;
    if (/^PGS\d{6}$/.test(pgsIdInput)) await processPgsData(pgsIdInput, build);
    else alert('Please enter a valid PGS ID');
});