const axios = require('axios');
const fs = require('fs');
const xlsx = require('xlsx');

async function run() {
    const sheetUrl = "https://docs.google.com/spreadsheets/d/1Qm_q8YRXKzGMYzB7PAYlLCdSbbfmPKZQIf6kEKZ5IyQ/export?format=csv&gid=754251948";
    const response = await axios.get(sheetUrl);
    const csvText = response.data;

    const lines = csvText.split(/\r?\n/);
    // line 0 is header
    const outputData = []; // array of arrays for the excel sheet

    for (let i = 1; i < lines.length; i++) {
        const line = lines[i].trim();
        if (line === '' || line.replace(/,/g, '').trim() === '') {
            outputData.push(['']);
            continue;
        }

        // Parse CSV line simply
        let curVal = "";
        let inQuote = false;
        let cols = [];
        for (let j = 0; j < line.length; ++j) {
            const c = line[j];
            if (inQuote) {
                if (c === '"') {
                    if (j + 1 < line.length && line[j + 1] === '"') {
                        curVal += '"';
                        j++;
                    } else {
                        inQuote = false;
                    }
                } else {
                    curVal += c;
                }
            } else {
                if (c === '"') {
                    inQuote = true;
                } else if (c === ',') {
                    cols.push(curVal.trim());
                    curVal = "";
                } else {
                    curVal += c;
                }
            }
        }
        cols.push(curVal.trim());

        // Trọng lượng is at index 12 (0-indexed)
        const weightStr = cols[12] || "";
        const weight = parseFloat(weightStr.replace(/,/g, '').trim());

        let price = "-";
        if (!isNaN(weight) && weight >= 15000) {
            price = "17"; // Leave as string or number
        }

        outputData.push([price]);
    }

    // Create new workbook and sheet
    const wb = xlsx.utils.book_new();
    // Initialize sheet with header if needed, but for direct copy maybe just the values are best. Let's just output data directly from row 0.
    const ws = xlsx.utils.aoa_to_sheet(outputData);
    xlsx.utils.book_append_sheet(wb, ws, "Prices");

    xlsx.writeFile(wb, "C:/Users/Asus/OneDrive/Tài liệu/prices_to_copy.xlsx");
    console.log("Generated Excel file with " + outputData.length + " rows.");
}

run();
