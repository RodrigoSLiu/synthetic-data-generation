export function updateLoadingProgress(percentage) {
    const bar = document.getElementById('progressBar');
    if (bar) {
        bar.style.width = `${percentage}%`;
    }
}


export async function handleSnpsInfo(pgsIdInput, buildInput, incidenceRateFile, pgsModelFile) {
    return new Promise((resolve, reject) => {
        const snpWorker = new Worker('worker/snpsWorker.js');
        snpWorker.postMessage({
            pgsId: pgsIdInput,
            build: buildInput,
            incidenceRateFile,
            pgsModelFile
        });

        snpWorker.onmessage = (e) => {
            const { type, snpsInfo, predictedIncidenceRate, k, b } = e.data;

            if (type === 'meta') {
                snpWorker.terminate();
                resolve({ snpsInfo, predictedIncidenceRate, k, b });
            }
        };

        snpWorker.onerror = (error) => {
            snpWorker.terminate();
            reject(new Error(`SNP Worker error: ${error.message}`));
        };
    });
}


export async function handleProfileRetrieval(config, snpsInfo, k, b, incidenceRateFile, pgsModelFile, loadingScreen, onComplete) {
    /* global localforage */
    loadingScreen.style.display = 'flex';
    const {
        totalProfiles, chunkSize, minAge, maxAge, minFollowUp, maxFollowUp
    } = config;
    const totalChunks = Math.ceil(totalProfiles / chunkSize);
    const workersCount = 4;

    let completed = 0;

    for (let i = 0; i < workersCount; i++) {
        const profileWorker = new Worker('worker/profilesWorker.js');

        profileWorker.postMessage({
            workerId: i,
            snpsInfo,
            totalChunks,
            chunkSize: chunkSize,
            chunkOffset: i, // So each worker starts at different points
            totalWorkers: workersCount,
            minAge: 30,
            maxAge: 70,
            minFollow: 15,
            maxFollow: 30,
            k,
            b
        });

        profileWorker.onmessage = async (e) => {
            if (e.data.type === 'progress') {
                updateLoadingProgress(e.data.progress);
            }
            else if (e.data.type === 'complete') {
                completed++;
                profileWorker.terminate();

                if (completed === workersCount) {
                    loadingScreen.style.display = 'none';

                    if (onComplete) onComplete();
                }
            }
        };

        profileWorker.onerror = (error) => {
            console.error('Worker error:', error.message);
            alert('Error during data generation: ' + error.message);
            loadingScreen.style.display = 'none';
            profileWorker.terminate();
        };
    }
}


export async function handleCaseControlRetrieval(
    config, caseControlRatio, snpsInfo, k, b, incidenceRateFile, pgsModelFile, loadingScreen, onComplete
) {
    const {
        totalProfiles, chunkSize, minAge, maxAge, minFollowUp, maxFollowUp
    } = config;
    const targetCases = totalProfiles * caseControlRatio;
    const numberOfWorkers = 4;
    const casesPerWorker = Math.ceil(targetCases / numberOfWorkers);

    loadingScreen.style.display = 'flex';

    let completedWorkers = 0;
    let totalProgress = Array(numberOfWorkers).fill(0); // track per-worker progress

    for (let i = 0; i < numberOfWorkers; i++) {
        const caseControlWorker = new Worker('worker/caseControlWorker.js');

        caseControlWorker.postMessage({
            workerId: i,
            snpsInfo,
            chunkSize: chunkSize,
            numberOfProfiles: totalProfiles,
            caseControlRatio: caseControlRatio,
            minAge: 30,
            maxAge: 70,
            minFollow: 15,
            maxFollow: 30,
            k,
            b
        });

        caseControlWorker.onmessage = async (e) => {
            if (e.data.type === 'progress') {
                totalProgress[i] = e.data.progress;
                const averageProgress = totalProgress.reduce((a, b) => a + b, 0) / numberOfWorkers;
                updateLoadingProgress(averageProgress);
            }
            else if (e.data.type === 'complete') {
                caseControlWorker.terminate();
                completedWorkers++;

                if (completedWorkers === numberOfWorkers) {
                    loadingScreen.style.display = 'none';
                    if (onComplete) onComplete();
                }
            }
        };

        caseControlWorker.onerror = (error) => {
            console.error('Worker error:', error.message);
            alert('Error during data generation: ' + error.message);
            loadingScreen.style.display = 'none';
            caseControlWorker.terminate();
        };
    }
}