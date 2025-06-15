importScripts('https://cdn.jsdelivr.net/npm/localforage@1.10.0/dist/localforage.js');


self.onmessage = async (e) => {
    /* global localforage */
    const {
        pgsId,
        build,
        incidenceRateFile,
        pgsModelFile
    } = e.data;
    try {
        const {
            parseCsv, getSnpsInfo, processHeader, processPRS, generateWeibullIncidenceCurve
        } = await import('../syntheticDataGenerator.js');

        const snpsInfo = await getSnpsInfo(pgsId, build, pgsModelFile);
        const header = await processHeader(snpsInfo);
        const observedIncidenceRate = await parseCsv(incidenceRateFile, { delimiter: ',' });
        //const trainingLP = processPRS(snpsInfo);
        const [k, b] = [3.6766813031638073, 2.2400292570926646e-8];
        //const predictedIncidenceRate = generateWeibullIncidenceCurve(k, b, trainingLP, observedIncidenceRate.length);
        //const predictedIncidenceRate = generateWeibullIncidenceCurve(k, b, trainingLP, incidenceRate.length);
        const predictedIncidenceRate = [
            {
                'age': 0,
                'rate': 1.5598683233974953e-8
            },
            {
                'age': 1,
                'rate': 1.83871975312222e-7
            },
            {
                'age': 2,
                'rate': 6.862775191462944e-7
            },
            {
                'age': 3,
                'rate': 0.0000016650123735306721
            },
            {
                'age': 4,
                'rate': 0.0000032432059838827243
            },
            {
                'age': 5,
                'rate': 0.000005532607835978531
            },
            {
                'age': 6,
                'rate': 0.000008636989627386349
            },
            {
                'age': 7,
                'rate': 0.000012654058437755467
            },
            {
                'age': 8,
                'rate': 0.000017676667374733057
            },
            {
                'age': 9,
                'rate': 0.00002379364095839165
            },
            {
                'age': 10,
                'rate': 0.000031090364830288486
            },
            {
                'age': 11,
                'rate': 0.00003964922135457627
            },
            {
                'age': 12,
                'rate': 0.000049549919291513866
            },
            {
                'age': 13,
                'rate': 0.00006086974607366624
            },
            {
                'age': 14,
                'rate': 0.00007368376231242646
            },
            {
                'age': 15,
                'rate': 0.00008806495163860006
            },
            {
                'age': 16,
                'rate': 0.00010408433481701174
            },
            {
                'age': 17,
                'rate': 0.00012181105412234494
            },
            {
                'age': 18,
                'rate': 0.00014131243481529943
            },
            {
                'age': 19,
                'rate': 0.00016265402390613914
            },
            {
                'age': 20,
                'rate': 0.00018589961298631774
            },
            {
                'age': 21,
                'rate': 0.00021111124381090196
            },
            {
                'age': 22,
                'rate': 0.00023834920047827168
            },
            {
                'age': 23,
                'rate': 0.0002676719892883428
            },
            {
                'age': 24,
                'rate': 0.00029913630622691034
            },
            {
                'age': 25,
                'rate': 0.00033279699444321853
            },
            {
                'age': 26,
                'rate': 0.00036870699220648007
            },
            {
                'age': 27,
                'rate': 0.0004069172708797142
            },
            {
                'age': 28,
                'rate': 0.00044747676545275894
            },
            {
                'age': 29,
                'rate': 0.0004904322967127506
            },
            {
                'age': 30,
                'rate': 0.0005358284858106854
            },
            {
                'age': 31,
                'rate': 0.0005837076624264359
            },
            {
                'age': 32,
                'rate': 0.0006341097662611039
            },
            {
                'age': 33,
                'rate': 0.0006870722425327269
            },
            {
                'age': 34,
                'rate': 0.0007426299319795993
            },
            {
                'age': 35,
                'rate': 0.0008008149558486055
            },
            {
                'age': 36,
                'rate': 0.000861656596256255
            },
            {
                'age': 37,
                'rate': 0.0009251811725318193
            },
            {
                'age': 38,
                'rate': 0.0009914119134440957
            },
            {
                'age': 39,
                'rate': 0.001060368827297653
            },
            {
                'age': 40,
                'rate': 0.0011320685681557308
            },
            {
                'age': 41,
                'rate': 0.0012065243012862048
            },
            {
                'age': 42,
                'rate': 0.0012837455660427155
            },
            {
                'age': 43,
                'rate': 0.001363738138821402
            },
            {
                'age': 44,
                'rate': 0.0014465038951703146
            },
            {
                'age': 45,
                'rate': 0.0015320406726458957
            },
            {
                'age': 46,
                'rate': 0.0016203421344306301
            },
            {
                'age': 47,
                'rate': 0.001711397635548173
            },
            {
                'age': 48,
                'rate': 0.0018051920905859387
            },
            {
                'age': 49,
                'rate': 0.0019017058456519687
            },
            {
                'age': 50,
                'rate': 0.0020009145537972506
            },
            {
                'age': 51,
                'rate': 0.002102789055742238
            },
            {
                'age': 52,
                'rate': 0.002207295265953313
            },
            {
                'age': 53,
                'rate': 0.002314394065846881
            },
            {
                'age': 54,
                'rate': 0.0024240412033036396
            },
            {
                'age': 55,
                'rate': 0.0025361872019057374
            },
            {
                'age': 56,
                'rate': 0.0026507772774753136
            },
            {
                'age': 57,
                'rate': 0.00276775126610751
            },
            {
                'age': 58,
                'rate': 0.002887043562377345
            },
            {
                'age': 59,
                'rate': 0.003008583068510595
            },
            {
                'age': 60,
                'rate': 0.003132293157088295
            },
            {
                'age': 61,
                'rate': 0.0032580916461990572
            },
            {
                'age': 62,
                'rate': 0.003385890789010304
            },
            {
                'age': 63,
                'rate': 0.0035155972775765543
            },
            {
                'age': 64,
                'rate': 0.0036471122627538266
            },
            {
                'age': 65,
                'rate': 0.003780331389614866
            },
            {
                'age': 66,
                'rate': 0.003915144849829466
            },
            {
                'age': 67,
                'rate': 0.004051437451444984
            },
            {
                'age': 68,
                'rate': 0.004189088706008204
            },
            {
                'age': 69,
                'rate': 0.004327972934404345
            },
            {
                'age': 70,
                'rate': 0.0044679593905843085
            },
            {
                'age': 71,
                'rate': 0.004608912404889032
            },
            {
                'age': 72,
                'rate': 0.004750691545526653
            },
            {
                'age': 73,
                'rate': 0.004893151799778561
            },
            {
                'age': 74,
                'rate': 0.0050361437740910064
            },
            {
                'age': 75,
                'rate': 0.005179513913235012
            },
            {
                'age': 76,
                'rate': 0.005323104738257811
            },
            {
                'age': 77,
                'rate': 0.005466755102990439
            },
            {
                'age': 78,
                'rate': 0.0056103004690476466
            },
            {
                'age': 79,
                'rate': 0.0057535731979401206
            },
            {
                'age': 80,
                'rate': 0.005896402861048089
            },
            {
                'age': 81,
                'rate': 0.0060386165651052925
            },
            {
                'age': 82,
                'rate': 0.00618003929431532
            },
            {
                'age': 83,
                'rate': 0.00632049426607284
            },
            {
                'age': 84,
                'rate': 0.006459803301407163
            },
            {
                'age': 85,
                'rate': 0.006597787207247796
            }
        ];

        await localforage.setItem('header', header);
        await localforage.setItem('observedIncidenceRate', observedIncidenceRate);
        await localforage.setItem('predictedIncidenceRate', predictedIncidenceRate);

        // Send metadata and initialization signal
        self.postMessage({
            type: 'meta',
            snpsInfo: snpsInfo,
            observedIncidenceRate,
            predictedIncidenceRate,
            k: k,
            b: b
        });
    } catch (error) {
        self.postMessage({ type: 'error', error: error.message });
    }
};
