export function renderHistogram(counts, element, numberOfProfiles) {
    window.requestAnimationFrame(() => {
        const canvas = document.getElementById(element);
        const ctx = canvas.getContext('2d');

        const width = canvas.width;
        const height = canvas.height;
        const barWidth = width / 3; // 3 bars for 0, 1, and 2

        // Clear the canvas
        ctx.clearRect(0, 0, width, height);

        // Draw histogram bars for counts of 0, 1, and 2
        for (let i = 0; i <= 2; i++) {
            let scaledCount = counts[i];

            if (scaledCount > 1) {
                scaledCount /= numberOfProfiles;
            }

            // Skip drawing if the scaled count is zero
            if (scaledCount <= 0) continue;

            const barHeight = scaledCount * height; // Scale the height based on the adjusted counts
            const x = i * barWidth; // X position of the bar
            const y = height - barHeight; // Y position (bottom of the canvas)

            ctx.fillStyle = 'blue'; // Set color for the bars
            ctx.fillRect(x, y, barWidth - 2, barHeight); // Draw the bar

            ctx.fillStyle = 'black'; // Set color for the text
            ctx.fillText(scaledCount.toFixed(2), x + (barWidth / 2) - 10, y - 10); // Draw the scaled count above the bar
        }

        // Add x-axis labels
        ctx.fillStyle = 'black';
        ctx.fillText('0', barWidth / 2 - 10, height - 5); // Label for 0
        ctx.fillText('1', barWidth * 1.5 - 10, height - 5); // Label for 1
        ctx.fillText('2', barWidth * 2.5 - 10, height - 5); // Label for 2

        // Add y-axis label (optional)
        ctx.save(); // Save the current context
        ctx.rotate(-Math.PI / 2); // Rotate context to draw y-axis label
        ctx.fillText('Count', -height / 2, 20); // Position of the y-axis label
        ctx.restore(); // Restore the context to original state
    });
}

export function displaySNP(snp) {
    document.getElementById('snpDisplay').textContent = `SNP: rs${snp}`;
}

export function createTable(data, tableId = 'generatedTable') {
    // Find or create the table container element
    let tableContainer = document.getElementById(tableId);
    if (!tableContainer) {
        tableContainer = document.createElement('div');
        tableContainer.id = tableId;
        document.body.appendChild(tableContainer);
    }

    // Clear any existing table content
    tableContainer.innerHTML = '';

    // Create the table element
    const table = document.createElement('table');
    table.style.borderCollapse = 'collapse';
    table.style.width = '100%';

    // Create the table header
    const headers = Object.keys(data[0]); // Assumes all objects have the same keys
    const headerRow = document.createElement('tr');
    headers.forEach(headerText => {
        const th = document.createElement('th');
        th.textContent = headerText;
        th.style.border = '1px solid black';
        th.style.padding = '8px';
        th.style.backgroundColor = '#f2f2f2';
        th.style.textAlign = 'center';
        headerRow.appendChild(th);
    });
    table.appendChild(headerRow);

    // Add rows
    data.forEach(rowData => {
        const row = document.createElement('tr');
        headers.forEach(header => {
            const td = document.createElement('td');
            td.textContent = rowData[header];
            td.style.border = '1px solid black';
            td.style.padding = '8px';
            td.style.textAlign = 'center';
            row.appendChild(td);
        });
        table.appendChild(row);
    });

    // Append the table to the container
    tableContainer.appendChild(table);
}

export function renderSNPHistograms(randomSnp, occurrence, numberOfProfiles, maxNumberOfProfiles) {
    renderHistogram(occurrence, 'generatedHistogram', numberOfProfiles > maxNumberOfProfiles ? maxNumberOfProfiles : numberOfProfiles);
    renderHistogram(randomSnp[0].alleleDosageFrequency, 'expectedHistogram', numberOfProfiles > maxNumberOfProfiles ? maxNumberOfProfiles : numberOfProfiles);
}