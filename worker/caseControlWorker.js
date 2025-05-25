importScripts(
    'https://cdnjs.cloudflare.com/ajax/libs/pako/1.0.11/pako.min.js',
    'https://cdnjs.cloudflare.com/ajax/libs/localforage/1.9.0/localforage.min.js'
);

self.onmessage = async (e) => {
    const {
        workerId, snpsInfo, chunkSize, numberOfCases, controlsPerCase,
        minAge, maxAge, minFollow, maxFollow, k, b
    } = e.data;

    try {
        /* global pako, localforage */
        const { processProfiles, matchCasesControls } = await import('../syntheticDataGenerator.js');
        let generatedCases = 0;
        let chunkIndex = 0;
        let profileIdOffset = 0;
        const isCaseIdx = 4;

        // Pools to hold unmatched cases and controls
        let casesPool = [];
        let controlsPool = [];

        while (generatedCases < numberOfCases) {
            const profiles = await processProfiles(
                snpsInfo,
                chunkSize,
                minAge,
                maxAge,
                minFollow,
                maxFollow,
                k,
                b
            );
            casesPool = profiles.filter(p => p[isCaseIdx] === 1);
            controlsPool = profiles.filter(p => p[isCaseIdx] === 0);

            const {
                results
            } = matchCasesControls(casesPool, controlsPool, controlsPerCase);
            const compressed = pako.deflate(JSON.stringify(results));

            await localforage.setItem(`worker_${workerId}_chunk_${chunkIndex}`, compressed);

            generatedCases += Math.floor(results.length / 2); // 1 case per matched pair
            profileIdOffset += chunkSize;
            chunkIndex++;

            const progress = Math.min(100, Math.floor((generatedCases / numberOfCases) * 100));
            self.postMessage({ type: 'progress', progress });
        }

        self.postMessage({ type: 'progress', progress: 100 });
        self.postMessage({ type: 'complete' });

    } catch (error) {
        self.postMessage({ type: 'error', error: error.message });
    }
};
