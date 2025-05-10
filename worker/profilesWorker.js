importScripts(
    'https://cdnjs.cloudflare.com/ajax/libs/pako/1.0.11/pako.min.js',
    'https://cdnjs.cloudflare.com/ajax/libs/localforage/1.9.0/localforage.min.js'
);

self.onmessage = async (e) => {
    const {
        workerId,
        snpsInfo,
        numberOfProfiles,
        minAge,
        maxAge,
        minFollow,
        maxFollow,
        k,
        b,
        profileIdOffset
    } = e.data;

    try {
        /* global localforage */
        const {
            parseCsv, processPRS, generateWeibullIncidenceCurve,
            processProfiles, matchCasesWithControls
        } = await import('../syntheticDataGenerator.js');

        // Load necessary files and data
        const CHUNK_SIZE = 100_000;
        const data = await processProfiles(snpsInfo, numberOfProfiles, profileIdOffset, minAge, maxAge, minFollow, maxFollow, k, b);

        // Send metadata and initialization signal
        self.postMessage({
            type: 'meta',
            snpsInfo,
            totalData: data.length
        });

        // Update progress and process data
        const progressInterval = 100;  // Report progress every 100 records
        let progress = 0;

        // Process all the data (directly send all data in one go)
        self.postMessage({
            type: 'progress',
            progress: 0
        });

        // Simulate a delay for processing and report progress
        for (let i = 0; i < data.length; i++) {
            progress = (i / data.length) * 100;
            if (i % progressInterval === 0) {
                self.postMessage({
                    type: 'progress',
                    progress: progress
                });
            }
        }

        for (let j = 0; j < data.length; j += CHUNK_SIZE) {
            const chunk = data.slice(j, j + CHUNK_SIZE);

            await localforage.setItem(`generatedProfiles_worker_${workerId}_chunk_${j / CHUNK_SIZE}`, chunk);
        }

        // Once data is fully processed, send the full dataset back
        self.postMessage({
            type: 'complete',
        });

    } catch (error) {
        self.postMessage({ type: 'error', error: error.message });
    }
};
