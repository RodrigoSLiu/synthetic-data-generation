import {
    distributeProfilesByAgeGroups,
    getAgeGroupsBetween,
    updateLoadingProgress
} from '../syntheticDataGenerator.js';


export async function handleSnpsInfo(pgsIdInput, incidenceRateFile, pgsModelFile) {
    return new Promise((resolve, reject) => {
        const snpWorker = new Worker('worker/snpsWorker.js');

        snpWorker.postMessage({
            pgsId: pgsIdInput,
            incidenceRateFile,
            pgsModelFile
        });

        snpWorker.onmessage = (e) => {
            const { type, snpsInfo, observedIncidenceRate, predictedIncidenceRate, k, b } = e.data;

            if (type === 'meta') {
                snpWorker.terminate();
                resolve({ snpsInfo, observedIncidenceRate, predictedIncidenceRate, k, b });
            }
            else if (e.data.type === 'error') {
                console.error(`Snp Worker error:`, e.data.error);
            }
        };

        snpWorker.onerror = (error) => {
            snpWorker.terminate();
            reject(new Error(`SNP Worker error: ${error.message}`));
        };
    });
}


function startWorkerPool(workerScript, tasks, loadingScreen) {
    return new Promise((resolve, reject) => {
        const workerCount = 4;
        const workers = Array(workerCount).fill(null);
        let activeWorkers = 0;
        let completedTasks = 0;
        const totalTasks = tasks.length;
        const progressMap = Array(workerCount).fill(0);

        const updateOverallProgress = () => {
            const totalProgress = progressMap.reduce((sum, p) => sum + p, 0);
            const averageProgress = totalProgress / workerCount;
            updateLoadingProgress(averageProgress);
        };

        const finishProcessing = () => {
            workers.forEach(worker => {
                if (worker) worker.terminate();
            });

            loadingScreen.style.display = 'none';
            resolve(); // <== This will now work correctly
        };

        const processNextTask = (workerIndex) => {
            if (tasks.length === 0) {
                workers[workerIndex] = null;
                activeWorkers--;

                if (activeWorkers === 0 && completedTasks === totalTasks) finishProcessing();
                return;
            }

            const task = tasks.shift();
            const worker = new Worker(workerScript);
            workers[workerIndex] = worker;

            worker.postMessage({ workerId: workerIndex, ...task });

            worker.onmessage = (e) => {
                if (e.data.type === 'progress') {
                    progressMap[workerIndex] = e.data.progress;
                    updateOverallProgress();
                }
                else if (e.data.type === 'complete') {
                    worker.terminate();
                    completedTasks++;
                    processNextTask(workerIndex);

                    if (completedTasks === totalTasks) finishProcessing();
                }
                else if (e.data.type === 'error') {
                    console.error(`Worker ${workerIndex} error:`, e.data.error);
                    worker.terminate();
                    activeWorkers--;
                    reject(new Error(`Worker ${workerIndex} error: ${e.data.error}`));
                }
            };

            worker.onerror = (error) => {
                console.error(`Worker ${workerIndex} error:`, error.message);
                alert(`Error during data generation: ${error.message}`);
                worker.terminate();
                activeWorkers--;
                reject(new Error(`Worker ${workerIndex} error: ${error.message}`));
            };
        };

        for (let i = 0; i < workerCount; i++) {
            if (tasks.length > 0) {
                activeWorkers++;
                processNextTask(i);
            }
        }

        if (totalTasks === 0) {
            loadingScreen.style.display = 'none';
            resolve(); // Resolve immediately if no tasks
        }
    });
}


export async function handleProfileRetrieval(config, snpsInfo, k, b, incidenceRateFile, pgsModelFile, loadingScreen) {
    loadingScreen.style.display = 'flex';
    const {
        totalProfiles, minAge, maxAge, minFollowUp, maxFollowUp, populationData, gender
    } = config;
    const selectedAgeGroups = getAgeGroupsBetween(minAge, maxAge, populationData.ageGenderPercentages);
    const profilesByAgeGroup = distributeProfilesByAgeGroups(totalProfiles, minAge, maxAge, populationData, gender, selectedAgeGroups);

    const tasks = [];
    let taskId = 0;

    Object.entries(profilesByAgeGroup).forEach(([currentGender, groupMap]) => {
        Object.entries(groupMap).forEach(([ageGroup, count]) => {
            if (count <= 0) return;

            const startAge = parseInt(ageGroup.substring(0, 2));
            const endAge = parseInt(ageGroup.substring(2));
            const chunkSize = 25_000;
            const numChunks = Math.ceil(count / chunkSize);

            for (let i = 0; i < numChunks; i++) {
                const profilesInTask = Math.min(chunkSize, count - i * chunkSize);

                tasks.push({
                    taskId: `task_${taskId++}`,
                    snpsInfo,
                    totalProfiles: profilesInTask,
                    chunkSize,
                    gender: currentGender,
                    minAge: startAge,
                    maxAge: endAge,
                    minFollow: minFollowUp,
                    maxFollow: maxFollowUp,
                    k,
                    b
                });
            }
        });
    });

    await startWorkerPool('worker/profilesWorker.js', tasks, loadingScreen);
}


export async function handleCaseControlRetrieval(
    config, controlsPerCase, snpsInfo, k, b, incidenceRateFile, pgsModelFile, loadingScreen
) {
    loadingScreen.style.display = 'flex';
    const {
        totalProfiles, chunkSize, minAge, maxAge, minFollowUp, maxFollowUp, populationData, gender
    } = config;

    const selectedAgeGroups = getAgeGroupsBetween(minAge, maxAge, populationData.ageGenderPercentages);
    const profilesByAgeGroup = distributeProfilesByAgeGroups(totalProfiles, minAge, maxAge, populationData, gender, selectedAgeGroups);
    const tasks = [];
    let taskId = 0;

    Object.entries(profilesByAgeGroup).forEach(([currentGender, groupMap]) => {
        Object.entries(groupMap).forEach(([ageGroup, count]) => {
            if (count <= 0) return;

            const startAge = parseInt(ageGroup.substring(0, 2));
            const endAge = parseInt(ageGroup.substring(2));
            const cases = count;
            const totalInGroup = cases + cases * controlsPerCase;
            const numChunks = Math.ceil(totalInGroup / chunkSize);

            for (let i = 0; i < numChunks; i++) {
                tasks.push({
                    taskId: `task_${taskId++}`,
                    snpsInfo,
                    numberOfCases: cases,
                    controlsPerCase,
                    chunkSize,
                    gender: currentGender,
                    minAge: startAge,
                    maxAge: endAge,
                    minFollow: minFollowUp,
                    maxFollow: maxFollowUp,
                    k,
                    b
                });
            }
        });
    });

    await startWorkerPool('worker/caseControlWorker.js', tasks, loadingScreen);
}