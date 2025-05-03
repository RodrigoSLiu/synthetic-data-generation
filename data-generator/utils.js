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

export function dataToVCF(info) {
    const { header, data } = info;
    const ageOfOnsetIdx = header.indexOf('ageOfOnset');
    const variants = header.slice(ageOfOnsetIdx + 1);
    const profilesId = data.map(row => 'NA' + String(row[0]).padStart(7, '0')); // Convert to NA0000000, NA0000001, etc.
    const profilesGenetic = data.map(row => row.slice(ageOfOnsetIdx + 1));
    const headerLines = [
        '##fileformat=VCFv4.2',
        '##FORMAT=<ID=GT,Number=1,Type=String,Description="Genotype">',
        `#CHROM\tPOS\tID\tREF\tALT\tQUAL\tFILTER\tINFO\tFORMAT\t${profilesId.join('\t')}`
    ];
    const vcfLines = [...headerLines];

    // Process each variant
    for (let variantIdx = 0; variantIdx < variants.length; variantIdx++) {
        const variant_id_str = variants[variantIdx];
        const chrom = variant_id_str.split(':')[0];
        const pos_ref_alt = variant_id_str.slice(variant_id_str.indexOf(':') + 1);
        const [pos, ref, alt] = pos_ref_alt.split(':');

        // Create variant info columns
        const vcfLineVariant = [
            chrom, pos, '.', ref, alt,    // CHROM to ALT
            '.', 'PASS', '.', 'GT'       // QUAL to FORMAT
        ];

        // Generate genotype calls for all profiles
        const genotypeProfiles = profilesId.map((_, profileIdx) => {
            const alleleDosage = profilesGenetic[profileIdx][variantIdx];

            if (isNaN(alleleDosage)) return './.';
            switch (alleleDosage) {
                case 0:
                    return '0/0';
                case 1:
                    return '0/1';
                case 2:
                    return '1/1';
                default:
                    return './.';
            }
        });

        // Combine into full VCF line
        const vcfLine = [...vcfLineVariant, ...genotypeProfiles].join('\t');
        vcfLines.push(vcfLine);
    }

    // Return complete VCF file content
    return vcfLines.join('\n');
}

export function downloadFile(data, filename, format = 'csv') {
    // Determine MIME type and extension based on format
    const mimeTypes = {
        csv: 'text/csv;charset=utf-8;',
        vcf: 'text/x-vcard;charset=utf-8;'  // or 'text/vcard' for VCF
    };

    const fileExtensions = {
        csv: 'csv',
        vcf: 'vcf'
    };

    // Validate format
    if (!mimeTypes[format.toLowerCase()]) {
        throw new Error(`Unsupported format: ${format}. Use 'csv' or 'vcf'.`);
    }

    // Create file blob
    const blob = new Blob([data], {
        type: mimeTypes[format.toLowerCase()]
    });

    // Create download link
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${filename}.${fileExtensions[format.toLowerCase()]}`;
    document.body.appendChild(a);
    a.click();

    // Cleanup
    setTimeout(() => {
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    }, 100);
}