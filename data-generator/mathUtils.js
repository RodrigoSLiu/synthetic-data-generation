export function cdf(incidenceRates, t, value) {
    const cumulativeHazard = incidenceRates
        .filter((x) => x.age <= t)
        .map((x) => parseFloat(x[value]))
        .reduce((acc, curr) => {
            return acc + curr;
        }, 0);

    const cumulativeIncidence = 1 - Math.exp(-cumulativeHazard);

    return cumulativeIncidence;
}

export function calculateRates(timePoints, timeOfOnset) {
    return timePoints.map(t => {
        let count = timeOfOnset.filter(time => time < t).length;
        return count / timeOfOnset.length;
    });
}
