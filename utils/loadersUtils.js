import { httpRequest } from './httpUtils.js';

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

    if (!pako) {
        throw new Error('Pako library is not loaded.');
    }

    if (!localforage) {
        throw new Error('LocalForage library is not loaded.');
    }

    console.log('All dependencies loaded successfully.');

    return [pako, localforage];
}

export async function loadScore(entry = 'PGS000004', build = 37) {
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
