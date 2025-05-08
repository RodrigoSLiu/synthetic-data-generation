importScripts(
    'https://cdnjs.cloudflare.com/ajax/libs/pako/1.0.11/pako.min.js',
    'https://cdnjs.cloudflare.com/ajax/libs/localforage/1.9.0/localforage.min.js'
);

self.onmessage = async (e) => {
    const {
        pgsId,
        build,
        numberOfProfiles,
        caseControlMatch,
        numberOfCaseControls,
        ratioOfCaseControls,
        minAge,
        maxAge,
        minFollow,
        maxFollow,
        incidenceRateFile,
        pgsModelFile
    } = e.data;

    try {
        const {
            parseCsv, getSnpsInfo, processPRS, generateWeibullIncidenceCurve,
            processProfiles, matchCasesWithControls
        } = await import('./syntheticDataGenerator.js');

        const incidenceRate = await parseCsv(incidenceRateFile, { delimiter: ',' });
        const snpsInfo = await getSnpsInfo(pgsId, build, pgsModelFile);
        const trainingLP = processPRS(snpsInfo);
        const [k, b] = [3.6766813031638073, 2.2400292570926646e-8];
        const predictedIncidenceRate = generateWeibullIncidenceCurve(k, b, trainingLP, incidenceRate.length);

        const {
            header,
            data
        } = await processProfiles(snpsInfo, numberOfProfiles, caseControlMatch, numberOfCaseControls, ratioOfCaseControls, minAge, maxAge, minFollow, maxFollow, k, b);

        // Send metadata and start signal
        self.postMessage({
            type: 'meta',
            snpsInfo,
            predictedIncidenceRate,
            header,
            totalChunks: Math.ceil(data.length / 10000)
        });

        // Send in chunks
        const chunkSize = 10000;
        for (let i = 0; i < data.length; i += chunkSize) {
            const chunk = data.slice(i, i + chunkSize);
            self.postMessage({
                type: 'chunk',
                index: i / chunkSize,
                chunk
            });
        }

        if (caseControlMatch) {
            const matchedProfiles = matchCasesWithControls(header, data, 50000, 0.5);
            const idIdx = header.indexOf('id');
            const ageOfEntryIdx = header.indexOf('ageOfEntry');
            const prsIdx = header.indexOf('prs');
            const ageOfOnsetIdx = header.indexOf('ageOfOnset');

            const matchedGroups = matchedProfiles.map((group, index) => {
                const caseRow = group.case;
                const controlRows = group.controls;

                return [
                    index + 1,
                    caseRow[idIdx],
                    caseRow[ageOfOnsetIdx],
                    caseRow[prsIdx],
                    controlRows.length,
                    controlRows.map(c => c[idIdx]).join(';'),
                    controlRows.map(c => c[ageOfEntryIdx]).join(';')
                ];
            });

            self.postMessage({
                type: 'matchedGroups',
                matchedGroups
            });
        }

        // Signal completion
        self.postMessage({ type: 'done' });

    } catch (error) {
        self.postMessage({ type: 'error', error: error.message });
    }
};