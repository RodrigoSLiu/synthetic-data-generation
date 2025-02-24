export function empiricalCdf(incidenceRates) {
    let cumulativeHazard = 0;
    const cdfArray = incidenceRates.map((ageRate) => {
        cumulativeHazard += ageRate.rate;
        const cdf = 1 - Math.exp(-cumulativeHazard);
        return { age: ageRate.age, cdf };
    });

    return cdfArray;
}

export function calculateRates(timePoints, timeOfOnset) {
    return timePoints.map(t => {
        let count = timeOfOnset.filter(time => time < t).length;
        return count / timeOfOnset.length;
    });
}
