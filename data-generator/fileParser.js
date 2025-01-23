export function parseFile(file) {
    const data = file.split('\n').map(line => line.trim().split(/\s+/)).filter(line => line[0] && !line[0].startsWith('#'));

    return { headers: data[0], values: data.slice(1) };
}

export async function parseCsv(filePath, options) {
    if (!options) options = {};
    if (!options.lineSeparator) options.lineSeparator = ['\n', '\r\n', '\r'];
    if (!options.delimiter) options.delimiter = ',';
    if (!options.skip) options.skip = ['data'];
    if (!options.nLines) options.nLines = undefined;

    let response = await fetch(filePath);
    let data;

    if (!response.ok) {
        throw Error(`File Path: ${filePath} does not exist`);
    }
    const text = await response.text();

    for (const separator of options.lineSeparator) {
        data = text.split(separator);

        if (data.length > 1) {
            // Found a valid line separator, break out of the loop
            break;
        }
    }

    if (options.nLines !== undefined) {
        data = data.slice(1, options.nLines + 1);
    }
    else {
        data = data.slice(1);
    }
    const header = data[0].split(options.delimiter);

    data = data.map((d) => {
        if (d.trim() === '') return null;
        let elements = d.split(options.delimiter);

        return header.reduce((obj, k, i) => ({ ...obj, [k]: parseFloat(elements[i]) }), {});
    });

    return data.filter((row) => row !== null);
}
