import { generateAlleleDosage } from './geneticUtils.js';

// TODO: TESTING PURPOSES
import { testData } from '../test.js';

export async function processProfiles(snpsInfo, numberOfProfiles, minAge, maxAge, followUpPeriod) {
    // Assign random ages evenly distributed within a range
    const assignAges = (num, min, max) =>
        Array.from({ length: num }, () => Math.floor(Math.random() * (max - min + 1)) + min);

    // Validate SNP data
    if (!snpsInfo.length) {
        throw new Error('No SNPs available for profile generation.');
    }

    snpsInfo.forEach((snp, index) => {
        if (!snp.weight || !snp.alleleDosageFrequency) {
            throw new Error(`Missing weight or allele dosage frequency for SNP at index ${index}`);
        }
    });

    const ages = assignAges(numberOfProfiles, minAge, maxAge);
    const profiles = [];
    const expLinearPredictors = [];

    // Generate profiles
    for (let i = 0; i < numberOfProfiles; i++) {
        let prs = 0;

        const allelesDosage = snpsInfo.map(({ weight, alleleDosageFrequency }) => {
            const dosage = generateAlleleDosage(alleleDosageFrequency);
            prs += weight * dosage;
            return dosage;
        });

        profiles.push({
            id: `Q-${i + 1}`,
            ageOfEntry: ages[i],
            ageOfExit: ages[i] + followUpPeriod,
            prs: Math.exp(prs),
            case: false,
            onsetAge: 0,
            allelesDosage: Uint8Array.from(allelesDosage)
        });

        expLinearPredictors.push(Math.exp(prs));
    }

    return [expLinearPredictors, profiles];
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
        weight: headers.indexOf('effect_weight'),
        maf: headers.indexOf('allelefrequency_effect')
    };

    if (indices.maf === -1) {
        throw new Error('Allele frequency data is missing in the PGS file.');
    }

    // Extract SNP data
    let snpInfo = values.map(row => ({
        chromosome: row[indices.chromosome],
        position: row[indices.position],
        weight: row[indices.weight],
        maf: row[indices.maf]
    }));

    // Add rsIDs and validate SNP data
    //snpInfo = await getRsIds(snpInfo, API_KEY);

    if (!snpInfo.length) {
        throw new Error('No valid SNPs processed. Check the input PGS file or SNP lookup results.');
    }

    // Calculate allele dosage frequencies for SNPs with valid rsIDs
    snpInfo.forEach(snp => {
        if (!snp.rsID) {
            console.warn('Missing SNP ID for:', snp);

            snp.rsID = `${snp.chromosome}+${snp.position}`;
        }
        snp.alleleDosageFrequency = calculateHWE(snp.maf);
    });

    return snpInfo;
}
