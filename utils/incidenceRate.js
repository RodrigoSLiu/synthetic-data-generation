import { parseCsv } from './fileParser.js';

function getCountry() {
}

function getSpecificLocation() {
}

function getDisease() {
}

function getIncidenceRate() {
}

export async function main(incidenceRateFile) {
    const incidenceCsv = await parseCsv(incidenceRateFile, { delimiter: ';' });

    const uniqueProfiles = Array.from(
        new Map(incidenceCsv.map(profile => [profile.id_code, profile])).values()
    );
    console.log(uniqueProfiles);
}