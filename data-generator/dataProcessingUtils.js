import { generateAlleleDosage, getRsIds } from './geneticUtils.js';

// TODO: TESTING PURPOSES
import { testData } from '../test.js';

export function processPRS(snpsInfo) {
    // Validate SNP data
    if (!snpsInfo.length) {
        throw new Error('No SNPs available for profile generation.');
    }

    snpsInfo.forEach((snp, index) => {
        if (!snp.weight || !snp.alleleDosageFrequency) {
            throw new Error(`Missing weight or allele dosage frequency for SNP at index ${index}`);
        }
    });

    const populationSize = 100000;
    let linearPredictors = [];

    // Generate profiles
    for (let i = 0; i < populationSize; i++) {
        let prs = 0;
        const allelesDosage = snpsInfo.map(({ weight, alleleDosageFrequency }) => {
            const dosage = generateAlleleDosage(alleleDosageFrequency);
            prs += weight * dosage;
            return dosage;
        });

        linearPredictors.push(prs);
    }

    return Float64Array.from(linearPredictors);
}

export async function processSnpData(snpData) {
    // Calculate Hardy-Weinberg equilibrium frequencies
    const calculateHWE = (maf) => {
        const recessive = maf ** 2;
        const dominant = (1 - maf) ** 2;

        return [dominant, 1 - dominant - recessive, recessive];
    };

    // Validate and extract relevant indices from headers
    const { headers, values } = snpData;
    const indices = {
        chromosome: headers.indexOf('chr_name'),
        position: headers.indexOf('chr_position'),
        effect: headers.indexOf('effect_allele'),
        other: headers.indexOf('other_allele'),
        weight: headers.indexOf('effect_weight'),
        maf: headers.indexOf('allelefrequency_effect')
    };

    if (indices.maf === -1) {
        throw new Error('Allele frequency data is missing in the PGS file.');
    }

    // Extract SNP data
    let snpInfo = values.map(row => ({
        id: `${row[indices.chromosome]}:${row[indices.position]}:${row[indices.effect]}:${row[indices.other]}`,
        weight: row[indices.weight],
        maf: row[indices.maf]
    }));

    // Add rsIDs and validate SNP data
    //snpInfo = await getRsIds(snpInfo);//, API_KEY);
    console.log(snpInfo);
    if (!snpInfo.length) {
        throw new Error('No valid SNPs processed. Check the input PGS file or SNP lookup results.');
    }

    // Calculate allele dosage frequencies for SNPs with valid rsIDs
    snpInfo.forEach(snp => {
        if (!snp.rsID) {
            console.warn('Missing SNP ID for:', snp);

            snp.rsID = snp.id;
        }
        snp.alleleDosageFrequency = calculateHWE(snp.maf);
    });

    return snpInfo;
}

export async function processProfiles(snpsInfo, numberOfProfiles, numberOfCaseControls, ratioOfCaseControls, minAge, maxAge, minFollowUp, maxFollowUp, k, b) {
    // Validate SNP data
    if (!snpsInfo.length) {
        throw new Error('No SNPs available for profile generation.');
    }

    // Generate header structure
    const baseHeader = ['id', 'ageOfEntry', 'ageOfExit', 'prs', 'case', 'ageOfOnset'];
    const snpHeaders = snpsInfo.map(snp => snp.id);
    const header = [...baseHeader, ...snpHeaders];

    // Helper functions
    const getRandomInt = (min, max) => Math.floor(Math.random() * (max - min + 1)) + min;

    const calculateTimeDiseaseOnset = (age, prs, k, b) => {
        while (true) {
            const numerator = Math.log(Math.random());
            const val = Math.pow(age, k) - numerator / (b * Math.exp(prs));
            if (val >= 0) return Math.pow(val, 1 / k);
        }
    };

    // Generate profiles data
    const data = [];
    let numberOfCases = 0;

    while (numberOfCases < numberOfCaseControls * ratioOfCaseControls || data.length < numberOfProfiles) {
        let prs = 0;
        const ageOfEntry = getRandomInt(minAge, maxAge);
        const ageOfExit = ageOfEntry + getRandomInt(minFollowUp, maxFollowUp);
        const onsetAge = Math.round(calculateTimeDiseaseOnset(ageOfEntry, prs, k, b));
        const isCase = onsetAge < ageOfExit ? 1 : 0;

        // Generate SNP dosages and calculate PRS
        const snpDosages = snpsInfo.map(({ weight, alleleDosageFrequency }) => {
            const dosage = generateAlleleDosage(alleleDosageFrequency);
            prs += weight * dosage;

            return dosage;
        });

        // Create profile array
        const profileArray = [
            data.length, // Numerical ID
            ageOfEntry,
            ageOfExit,
            Number(prs.toFixed(8)), // Rounded PRS
            isCase,
            isCase ? onsetAge : null, // Use null instead of Infinity for missing values
            ...snpDosages
        ];

        if (isCase === 1) numberOfCases++;

        data.push(profileArray);
    }

    return { header, data };
}
