// worker.js
importScripts(
    'https://cdnjs.cloudflare.com/ajax/libs/pako/1.0.11/pako.min.js',
    'https://cdnjs.cloudflare.com/ajax/libs/localforage/1.9.0/localforage.min.js'
);

self.onmessage = async (e) => {
    const {
        pgsId, build, numberOfProfiles, numberOfCaseControls, ratioOfCaseControls, minAge, maxAge, minFollow, maxFollow,
        incidenceRateFile, globalIncidenceFile
    } = e.data;

    try {
        // Import required functions
        const {
            parseCsv, getSnpsInfo, processPRS, generateWeibullIncidenceCurve,
            processProfiles, matchCasesWithControls
        } = await import('./syntheticDataGenerator.js');

        // Processing
        const incidenceRate = await parseCsv(incidenceRateFile, { delimiter: ',' });
        const snpsInfo = await getSnpsInfo(pgsId, build);
        const trainingLP = processPRS(snpsInfo);
        const [k, b] = [3.6766813031638073, 2.2400292570926646 * Math.pow(10, -8)];
        const predictedIncidenceRate = generateWeibullIncidenceCurve(k, b, trainingLP, incidenceRate.length);
        const {
            header,
            data
        } = await processProfiles(snpsInfo, numberOfProfiles, numberOfCaseControls, ratioOfCaseControls, minAge, maxAge, minFollow, maxFollow, k, b);

        const matchedProfiles = matchCasesWithControls(header, data);
        const idIdx = header.indexOf('id');
        const ageOfEntryIdx = header.indexOf('ageOfEntry');
        const ageOfExitIdx = header.indexOf('ageOfExit');
        const prsIdx = header.indexOf('prs');
        const ageOfOnsetIdx = header.indexOf('ageOfOnset');
        const matchedGroupsHeader = [
            'Group',            // 0
            'Case ID',          // 1
            'Case Age Onset',   // 5
            'Case PRS',         // 4
            'Number of Controls', // 6
            'Controls (IDs)',   // 7
            'Controls (Age of Entry)' // 8
        ];
        const matchedGroupsData = matchedProfiles.map((group, index) => {
            const caseRow = group.case;
            const controlRows = group.controls;

            return [
                index + 1,                  // 0 - Group
                caseRow[idIdx],             // 1 - Case ID
                caseRow[ageOfOnsetIdx],     // 2 - Case Age Onset
                caseRow[prsIdx],            // 3 - Case PRS
                controlRows.length,         // 4 - Number of Controls
                controlRows.map(c => c[idIdx]).join(';'),          // 7 - Control IDs
                controlRows.map(c => c[ageOfEntryIdx]).join(';')   // 8 - Control Ages
            ];
        });

        self.postMessage({
            snpsInfo,
            predictedIncidenceRate,
            generatedProfiles: { header, data },
            matchedGroups: {
                header: matchedGroupsHeader,
                data: matchedGroupsData
            }
        });

    } catch (error) {
        self.postMessage({ error: error.message });
    }
};