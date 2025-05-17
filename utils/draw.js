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

export function createTable(header, data, tableId = 'groupedTable', useDividers = true) {
    if (!data || !data.length) {
        console.error('No data provided for table');
        return;
    }

    const tableContainer = document.getElementById(tableId) || document.createElement('div');
    tableContainer.id = tableId;
    tableContainer.innerHTML = '';
    document.body.appendChild(tableContainer);

    const table = document.createElement('table');
    table.style.borderCollapse = 'collapse';
    table.style.width = '100%';
    table.style.margin = '20px 0';

    // Create header row
    const headerRow = document.createElement('tr');
    header.forEach(headerText => {
        const th = document.createElement('th');
        th.textContent = headerText;
        th.style.border = '1px solid #222';
        th.style.padding = '12px';
        th.style.backgroundColor = '#f8f9fa';
        th.style.fontWeight = '600';
        headerRow.appendChild(th);
    });
    table.appendChild(headerRow);

    // Create data rows
    data.forEach((row, rowIndex) => {
        const tr = document.createElement('tr');

        row.forEach((cellValue, cellIndex) => {
            const td = document.createElement('td');
            const headerName = header[cellIndex];
            let formattedValue = cellValue;

            // Format based on header name and data type
            if (typeof cellValue === 'number') {
                if (headerName.toLowerCase().includes('prs')) {
                    formattedValue = cellValue.toFixed(4);
                }
                else {
                    formattedValue = Number.isInteger(cellValue)
                        ? cellValue
                        : parseInt(cellValue, 10);
                }
            }
            else if (Array.isArray(cellValue)) {
                formattedValue = cellValue.join(', ');
            }

            td.textContent = formattedValue;
            td.style.border = '1px solid #ddd';
            td.style.padding = '10px';
            td.style.textAlign = 'center';
            tr.appendChild(td);
        });

        table.appendChild(tr);

        // Add optional divider
        if (useDividers && rowIndex < data.length - 1) {
            const dividerRow = document.createElement('tr');
            const dividerCell = document.createElement('td');
            dividerCell.colSpan = header.length;
            dividerCell.style.height = '2px';
            dividerCell.style.backgroundColor = '#eee';
            dividerRow.appendChild(dividerCell);
            table.appendChild(dividerRow);
        }
    });

    tableContainer.appendChild(table);
}

export function renderSNPHistograms(randomSnp, occurrence, numberOfProfiles, maxNumberOfProfiles) {
    renderHistogram(occurrence, 'generatedHistogram', numberOfProfiles > maxNumberOfProfiles ? maxNumberOfProfiles : numberOfProfiles);
    renderHistogram(randomSnp[0].alleleDosageFrequency, 'expectedHistogram', numberOfProfiles > maxNumberOfProfiles ? maxNumberOfProfiles : numberOfProfiles);
}