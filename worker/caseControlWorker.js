self.onmessage = async (e) => {
    const {
        taskId, snpsInfo, numberOfCases, controlsPerCase, chunkSize, gender,
        minAge, maxAge, minFollow, maxFollow, k, b
    } = e.data;

    try {
        const { processProfiles, matchCasesControls } = await import('../syntheticDataGenerator.js');
        const { INDEX } = await import('../constants.js');
        const {
            compressAndStoreResults,
            reportProgress,
            reportComplete
        } = await import('../utils/workerUtils.js');

        let generatedCases = 0;
        let chunkIndex = 0;

        while (generatedCases < numberOfCases) {
            // STEP 1: Generate batch for the defined age group
            let batchProfiles = await processProfiles(
                snpsInfo,
                chunkSize,
                gender,
                minAge,
                maxAge,
                minFollow,
                maxFollow,
                k,
                b
            );

            const casesPool = batchProfiles.filter(p => p[INDEX.CASE] === 1);
            if (casesPool.length === 0) continue;

            // STEP 2: Compute age of onset for each case
            const onsetAges = casesPool.map(p => p[INDEX.ONSET]);
            const minOnset = Math.min(...onsetAges);
            const maxOnset = Math.max(...onsetAges);

            // STEP 3: Generate controls that could match those onset ages
            let controlProfiles = await processProfiles(
                snpsInfo,
                chunkSize * 2,
                gender,
                minOnset,
                maxOnset,
                minFollow,
                maxFollow,
                k,
                b
            );

            const controlsPool = controlProfiles.filter(p => p[INDEX.CASE] === 0);

            if (controlsPool.length === 0) continue;

            // STEP 4: Match cases to controls based on onset age proximity
            const { casesMatched, results } = matchCasesControls(casesPool, controlsPool, controlsPerCase);

            if (casesMatched === 0) continue;

            const forageKey = `${taskId}_chunk_${chunkIndex}`;

            await compressAndStoreResults(forageKey, results);
            generatedCases += casesMatched;
            chunkIndex++;
            reportProgress(generatedCases, numberOfCases);
            batchProfiles = null;
            controlProfiles = null;
        }

        reportComplete();

    } catch (error) {
        const { reportError } = await import('../utils/workerUtils.js');
        reportError(error);
    }
};