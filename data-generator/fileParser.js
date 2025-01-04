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
