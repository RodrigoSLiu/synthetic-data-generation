export function parseFile(file) {
    const data = file.split('\n').map(line => line.trim().split(/\s+/)).filter(line => line[0] && !line[0].startsWith('#'));

    return { headers: data[0], values: data.slice(1) };
}

export async function parseCsv(filePath, lineSeparator = '\n', nLines) {
    let response = await fetch(filePath);

    if (!response.ok) {
        throw Error(`File Path: ${filePath} does not exist`);
    }

    let data = (await response.text()).split(lineSeparator);
    let header = data[0].replace('"', '').split(',').map(header => header.replace(/"/g, '').trim());

    if (nLines !== undefined) {
        data = data.slice(1, nLines + 1);
    }
    else {
        data = data.slice(1);
    }
    data = data.map((d) => {
        if (d.trim() === '') return null;
        let elements = d.split(',');
        return header.reduce((obj, k, i) => ({ ...obj, [k]: parseFloat(elements[i]) }), {});
    });

    return data.filter((row) => row !== null);
}

export async function httpRequest(url) {
    const response = await fetch(url);

    if (!response.ok) {
        throw new Error(`Request failed with status ${response.status}`);
    }

    return response;
}

export async function asyncPool(poolLimit, array, iteratorFn) {
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

export function cdf(incidenceRates, t, value) {
    const cumulativeHazard = incidenceRates
        .filter((x) => x.age <= t)
        .map((x) => parseFloat(x[value]))
        .reduce((acc, curr) => {
            return acc + curr;
        }, 0);

    const cumulativeIncidence = 1 - Math.exp(-cumulativeHazard);

    return cumulativeIncidence;
}

export function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

export function countOccurrences(snpIndex, profiles) {
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
