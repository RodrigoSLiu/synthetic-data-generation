importScripts(
    'https://cdnjs.cloudflare.com/ajax/libs/pako/1.0.11/pako.min.js',
    'https://cdnjs.cloudflare.com/ajax/libs/localforage/1.9.0/localforage.min.js'
);

self.onmessage = async (e) => {
    const {
        workerId, snpsInfo, totalChunks, chunkSize, chunkOffset,
        totalWorkers, minAge, maxAge, minFollow, maxFollow, k, b
    } = e.data;

    try {
        const {
            processProfiles
        } = await import('../syntheticDataGenerator.js');

        const { deflate } = await import('https://cdn.jsdelivr.net/npm/pako@2.1.0/dist/pako.esm.mjs');

        const workerChunks = [];
        for (let i = chunkOffset; i < totalChunks; i += totalWorkers) {
            workerChunks.push(i);
        }

        for (let idx = 0; idx < workerChunks.length; idx++) {
            const chunkIndex = workerChunks[idx];

            const chunkData = await processProfiles(
                snpsInfo,
                chunkSize,
                minAge,
                maxAge,
                minFollow,
                maxFollow,
                k,
                b
            );

            const compressed = deflate(JSON.stringify(chunkData));

            /* global localforage */
            await localforage.setItem(
                `worker_${workerId}_chunk_${chunkIndex}`,
                compressed
            );

            const progress = Math.floor((idx + 1) / workerChunks.length * 100);
            self.postMessage({ type: 'progress', progress });
        }

        self.postMessage({ type: 'complete' });

    } catch (error) {
        self.postMessage({ type: 'error', error: error.message });
    }
};