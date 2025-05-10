export function updateLoadingProgress(percentage) {
    const bar = document.getElementById('progressBar');
    if (bar) {
        bar.style.width = `${percentage}%`;
    }
}


async function handleSnpsInfo(pgsIdInput, buildInput, incidenceRateFile, pgsModelFile) {
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


export async function handleProfileRetrieval(pgsIdInput, buildInput, caseControlMatch, incidenceRateFile, pgsModelFile, loadingScreen, onComplete) {
    if (!pgsIdInput.match(/^[0-9]{1,6}$/)) {
        alert('Please enter a valid PGS ID (1 to 6 digits).');
        return;
    }

    loadingScreen.style.display = 'flex';
    await localforage.clear();

    const totalProfiles = 1_000_000;
    const workersCount = 2;
    const profilesPerWorker = totalProfiles / workersCount;

    let completed = 0;
    let snpsInfo, predictedIncidenceRate, k, b;

    try {
        ({ snpsInfo, predictedIncidenceRate, k, b } = await handleSnpsInfo(
            pgsIdInput,
            buildInput,
            incidenceRateFile,
            pgsModelFile
        ));
    } catch (error) {
        console.error(error.message);
        alert('Failed to load SNPs info: ' + error.message);
        loadingScreen.style.display = 'none';
        return;
    }

    for (let i = 0; i < workersCount; i++) {
        const profileWorker = new Worker('worker/profilesWorker.js');

        profileWorker.postMessage({
            workerId: i,
            snpsInfo: snpsInfo,
            numberOfProfiles: profilesPerWorker,
            minAge: 30,
            maxAge: 70,
            minFollow: 15,
            maxFollow: 30,
            k: k,
            b: b,
            profileIdOffset: i * profilesPerWorker,
        });

        profileWorker.onmessage = async (e) => {
            if (e.data.type === 'progress') {
                const overallProgress = ((completed + e.data.progress / 100) / workersCount) * 100;
                updateLoadingProgress(overallProgress);
            } else if (e.data.type === 'complete') {
                completed++;
                profileWorker.terminate();
                updateLoadingProgress((completed / workersCount) * 100);

                if (completed === workersCount) {
                    console.log(await localforage.keys());
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
