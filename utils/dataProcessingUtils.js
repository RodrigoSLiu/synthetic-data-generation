import { generateAlleleDosage, getRsIds, getSnpsInfo } from './geneticUtils.js';
import { GENDER } from '../constants.js';

// TODO: TESTING PURPOSES
import { testData } from '../test.js';


export function processPRS(snpsInfo) {
    // Validate SNP data
    if (!snpsInfo.length) {
        throw new Error('No SNPs available for profile generation.');
    }

    snpsInfo.forEach((snp, index) => {
        if (!snp.weight) {
            throw new Error(`Missing weight for SNP at index ${index}`);
        }
    });

    const populationSize = 100000;
    let linearPredictors = [];

    // Generate profiles
    for (let i = 0; i < populationSize; i++) {
        let prs = 0;
        const allelesDosage = snpsInfo.map(({ weight, maf }) => {
            const dosage = generateAlleleDosage(maf);
            prs += weight * dosage;

            return dosage;
        });

        linearPredictors.push(prs);
    }

    return Float64Array.from(linearPredictors);
}


export async function processSnpData(snpData) {
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

    if (!snpInfo.length) {
        throw new Error('No valid SNPs processed. Check the input PGS file or SNP lookup results.');
    }

    // Calculate allele dosage frequencies for SNPs with valid rsIDs
    snpInfo.forEach(snp => {
        if (!snp.rsID) {
            // TODO: Currently RS Id is not used, so this warning is turned off
            //console.warn('Missing SNP ID for:', snp);

            snp.rsID = snp.id;
        }
    });

    return snpInfo;
}


export async function processHeader(snpsInfo) {
    // Validate SNP data
    if (!snpsInfo.length) {
        throw new Error('No SNPs available for profile generation.');
    }

    // Generate header structure
    const baseHeader = ['id', 'ageOfEntry', 'ageOfExit', 'gender', 'prs', 'case', 'ageOfOnset'];
    const snpHeaders = snpsInfo.map(snp => snp.id);

    return [...baseHeader, ...snpHeaders];
}


export async function processProfiles(snpsInfo, numberOfProfiles, gender, minAge, maxAge, minFollowUp, maxFollowUp, k, b) {
    if (!snpsInfo.length) {
        throw new Error('No SNPs available for profile generation.');
    }

    // Helper functions
    let avgU = 0;
    const getRandomInt = (min, max) => Math.floor(Math.random() * (max - min + 1)) + min;

    function calculateTimeDiseaseOnset(ageEntry, prs, k, b) {
        const u = Math.random();  // Should be between 0 and 1
        const ageTerm = Math.pow(ageEntry, k);
        const denominator = b * Math.exp(prs); // <-- must use actual PRS here
        const logArgument = ageTerm - Math.log(u) / denominator;

        return logArgument > 0 ? Math.pow(logArgument, 1 / k) : Infinity;
    }

    // Generate profiles data
    const data = [];
    let numberOfCases = 0;

    // Stats
    let ages = {};
    for (let i = minAge; i <= maxAge; i++) {
        ages[i] = 0;
    }
    let maxPrs = 0;
    let maxIsCase = false;
    let minPrs = 0;
    let minIsCase = false;
    let totalAvg = 0;
    let caseAvg = 0;
    let controlAvg = 0;
    let maxDosage = { 0: 0, 1: 0, 2: 0 };

    while (data.length < numberOfProfiles) {
        let prs = 0.0;
        const snpDosages = snpsInfo.map(({ weight, maf }) => {
            const dosage = generateAlleleDosage(maf);
            prs += parseFloat(weight) * dosage;

            maxDosage[dosage] += 1;

            return dosage;
        });
        const ageOfEntry = getRandomInt(minAge, maxAge);
        ages[ageOfEntry] += 1;
        const ageOfExit = ageOfEntry + getRandomInt(minFollowUp, maxFollowUp);
        const rawOnset = calculateTimeDiseaseOnset(ageOfEntry, prs, k, b);
        const isCase = Number.isFinite(rawOnset) &&
        rawOnset >= ageOfEntry &&
        rawOnset <= ageOfExit ? 1 : 0;

        // Create profile array
        const profileArray = [
            0, // The correct ID will be given at download
            ageOfEntry,
            ageOfExit,
            gender === GENDER.FEMALE ? 1 : 0,
            prs,
            isCase,
            rawOnset < ageOfExit ? Math.round(rawOnset) : Infinity,
            ...snpDosages
        ];

        if (isCase === 1) {
            numberOfCases++;
            caseAvg += prs;
            totalAvg += prs;
        }
        else if (isCase === 0) {
            controlAvg += prs;
            totalAvg += prs;
        }

        if (prs > maxPrs) {
            maxPrs = prs;
            maxIsCase = isCase;
        }
        else if (prs < minPrs) {
            minPrs = prs;
            minIsCase = isCase;
        }

        data.push(profileArray);
    }

    // console.log(
    //     `Profiles creation complete:\n` +
    //     `   - Average total prs: ${totalAvg / numberOfProfiles}\n` +
    //     `   - Max Dosage: ${maxDosage[0] + maxDosage[1] + maxDosage[2]}: \n\t0: ${maxDosage[0]} \n\t1: ${maxDosage[1]} \n\t2: ${maxDosage[2]}\n` +
    //     `   - Cases created: ${numberOfCases}\n` +
    //     `   - Controls created: ${data.length - numberOfCases}\n` +
    //     `   - Case to Control ratio: ${(numberOfCases / (data.length - numberOfCases)).toFixed(2) * 100}%\n` +
    //     `   - Max PRS: ${maxPrs.toFixed(4)} (Is case: ${maxIsCase})\n` +
    //     `   - Min PRS: ${minPrs.toFixed(4)} (Is case: ${minIsCase})\n` +
    //     `   - Case Average PRS: ${(caseAvg / numberOfCases).toFixed(4)}\n` +
    //     `   - Control Average PRS: ${(controlAvg / (data.length - numberOfCases)).toFixed(4)}\n`
    // );
    console.log('Worker created cohort batch');

    return data;
}


export function getAgeGroupsBetween(minAge, maxAge, populationAgePercentages) {
    const allGroups = Object.keys(populationAgePercentages);
    const parsedGroups = allGroups.map(group => {
        const start = parseInt(group.substring(0, 2));
        const end = parseInt(group.substring(2));

        return { group, start, end };
    });

    return parsedGroups
        .filter(({ start, end }) => start <= maxAge && end >= minAge)
        .map(({ group }) => group);
}

export function distributeProfilesByAgeGroups(totalProfiles, minAge, maxAge, populationData, gender = GENDER.BOTH, selectedAgeGroups) {
    const profilesByAgeGroup = { [GENDER.MALE]: {}, [GENDER.FEMALE]: {} };

    // Compute total population by gender
    let totalFemalePercentage = 0;
    let totalMalePercentage = 0;

    let totalFemalePopulation = populationData.totalFemalePopulation;
    let totalMalePopulation = populationData.totalMalePopulation;

    selectedAgeGroups.forEach(group => {
        totalFemalePercentage += populationData.ageGenderPercentages[group]?.[GENDER.FEMALE] || 0;
        totalMalePercentage += populationData.ageGenderPercentages[group]?.[GENDER.MALE] || 0;
    });

    if (gender === GENDER.FEMALE || gender === GENDER.MALE) {
        const genderKey = gender;
        let totalGenderPercent = 0;

        selectedAgeGroups.forEach(group => {
            totalGenderPercent += populationData.ageGenderPercentages[group]?.[genderKey] || 0;
        });

        if (totalGenderPercent === 0) {
            const uniformCount = Math.floor(totalProfiles / selectedAgeGroups.length);
            selectedAgeGroups.forEach(group => {
                profilesByAgeGroup[gender][group] = uniformCount;
            });

            return profilesByAgeGroup;
        }

        let totalAssigned = 0;

        selectedAgeGroups.forEach(group => {
            const groupPercent = populationData.ageGenderPercentages[group]?.[genderKey] || 0;
            const count = Math.round(totalProfiles * (groupPercent / totalGenderPercent));
            profilesByAgeGroup[gender][group] = count;
            totalAssigned += count;
        });

        const diff = totalProfiles - totalAssigned;

        if (diff !== 0) {
            const lastGroup = selectedAgeGroups[selectedAgeGroups.length - 1];
            profilesByAgeGroup[gender][lastGroup] += diff;
        }

        return profilesByAgeGroup;
    }

    if (gender === GENDER.BOTH) {
        const totalPopulation = totalFemalePopulation + totalMalePopulation;
        const femaleRatio = totalFemalePopulation / totalPopulation;
        const maleRatio = totalMalePopulation / totalPopulation;
        const femaleProfiles = Math.round(totalProfiles * femaleRatio);
        const maleProfiles = totalProfiles - femaleProfiles;
        const femaleDist = distributeProfilesByAgeGroups(femaleProfiles, minAge, maxAge, populationData, GENDER.FEMALE, selectedAgeGroups);
        const maleDist = distributeProfilesByAgeGroups(maleProfiles, minAge, maxAge, populationData, GENDER.MALE, selectedAgeGroups);

        // Merge female and male distributions
        selectedAgeGroups.forEach(group => {
            profilesByAgeGroup[GENDER.FEMALE][group] = femaleDist[GENDER.FEMALE][group] || 0;
            profilesByAgeGroup[GENDER.MALE][group] = maleDist[GENDER.MALE][group] || 0;
        });

        return profilesByAgeGroup;
    }

    throw new Error(`Invalid gender: ${gender}`);
}
