export function updateLoadingProgress(percentage) {
    const bar = document.getElementById('progressBar');
    if (bar) {
        bar.style.width = `${percentage}%`;
    }
}


export async function handleProfileRetrieval(pgsIdInput, buildInput, caseControlMatch, incidenceRateFile, pgsModelFile, loadingScreen, onComplete) {
    try {
        if (!pgsIdInput.match(/^[0-9]{1,6}$/)) {
            alert('Please enter a valid PGS ID (1 to 6 digits).');
            loadingScreen.style.display = 'none';

            return;
        }
        const totalProfiles = 1_000_000;
        const workersCount = 6;
        const profilesPerWorker = totalProfiles / workersCount;

        let completed = 0;
        let combinedMatchedProfiles = [];
        let combinedMatchedGroups = [];
        let snpsInfo = null;
        let predictedIncidenceRate = null;
        await localforage.clear(); // run before starting workers

        for (let i = 0; i < workersCount; i++) {
            const worker = new Worker('worker.js');

            worker.postMessage({
                workerId: i,
                pgsId: pgsIdInput,
                build: buildInput,
                numberOfProfiles: profilesPerWorker,
                minAge: 30,
                maxAge: 70,
                minFollow: 15,
                maxFollow: 30,
                incidenceRateFile,
                pgsModelFile,
                profileIdOffset: i * profilesPerWorker,
            });

            worker.onmessage = async (e) => {
                if (e.data.type === 'progress') {
                    const overallProgress = ((completed + e.data.progress / 100) / workersCount) * 100;
                    updateLoadingProgress(overallProgress);
                }
                else if (e.data.type === 'complete') {
                    if (!snpsInfo) snpsInfo = e.data.snpsInfo;
                    if (!predictedIncidenceRate) predictedIncidenceRate = e.data.predictedIncidenceRate;

                    completed++;
                    worker.terminate();
                    updateLoadingProgress((completed / workersCount) * 100);

                    if (completed === workersCount) {
                        window.data = {
                            snpsInfo,
                            predictedIncidenceRate,
                            header: e.data.header,
                        };
                        console.log(await localforage.keys())
                        loadingScreen.style.display = 'none';
                    }
                }
            };

            worker.onerror = (error) => {
                console.error('Worker error:', error);
                loadingScreen.style.display = 'none';
                alert('Error during data generation: ' + error.message);
            };
        }
    } catch (error) {
        console.error(error);
        loadingScreen.style.display = 'none';
        alert('Error: ' + error.message);
    }
}
