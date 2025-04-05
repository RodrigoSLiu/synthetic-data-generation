export function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

export function countOccurrences(snpIndex, profiles) {
    const counts = { 0: 0, 1: 0, 2: 0 }; // Initialize counts for 0, 1, and 2

    profiles.forEach(profile => {
        // Use the dynamic key access to get the value of the specified snpId
        const value = profile.allelesDosage[snpIndex];
        if (value in counts) { // Check if the value is a key in counts
            counts[value]++;
        }
    });

    return counts;
}

export function dataToProfiles(info) {
    const { header, data } = info;
    const csvRows = [];

    // Add header row
    csvRows.push(header.join(','));

    // Add data rows
    for (const row of data) {
        const values = header.map((_, index) => {
            const value = row[index];

            // Handle string escaping and formatting
            if (typeof value === 'string') {
                return `"${value.replace(/"/g, '""')}"`;
            }

            // Format numbers (PRS to 4 decimals, others as integers)
            if (typeof value === 'number') {
                return header[index].toLowerCase().includes('prs')
                    ? value.toFixed(4)
                    : Math.round(value);
            }

            return value !== undefined ? value : '';
        });

        csvRows.push(values.join(','));
    }

    return csvRows.join('\n');
}

export function dataToVCF(snpInfo, profiles) {
    const vcfInfo = [];
    const header = [];
}

export function downloadCSV(data, filename) {
    try {
        // Create CSV blob directly
        const blob = new Blob([data], {
            type: 'text/csv;charset=utf-8;'
        });

        // Create download link
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${filename}.csv`;
        document.body.appendChild(a);
        a.click();

        // Cleanup
        setTimeout(() => {
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
        }, 100);

    } catch (error) {
        console.error('Download error:', error);
        alert('Error generating download: ' + error.message);
    }
}