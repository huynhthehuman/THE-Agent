function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu('THE Tools')
    .addItem('Gắn link PDF + Short link + Barcode (chỉ dòng mới)', 'runFast')
    .addItem('Gắn link PDF + Short link + Barcode (chạy lại toàn bộ)', 'runFull')
    .addSeparator()
    .addItem('Xuất PDF BARCODE (dòng đang chọn)', 'exportSelectedBarcodePdf')
    .addItem('Xuất PDF BARCODE (toàn bộ)', 'exportAllBarcodePdf')
    .addItem('Xuất PDF BARCODE (theo tick PRINT BARCODE)', 'exportCheckedBarcodePdf')
    .addSeparator()
    .addItem('Xuất PDF BARCODE TEXT (dòng đang chọn)', 'exportSelectedBarcodeTextPdf')
    .addItem('Xuất PDF BARCODE TEXT (toàn bộ)', 'exportAllBarcodeTextPdf')
    .addItem('Xuất PDF BARCODE TEXT (theo tick PRINT BARCODE TEXT)', 'exportCheckedBarcodeTextPdf')
    .addToUi();
}

function runFast() {
  runMain(false);
}

function runFull() {
  runMain(true);
}

function runMain(FORCE_UPDATE) {
  const TARGET_SHEET_NAME = 'USPS';
  const FOLDER_ID = '1yI7yx15j5oE1RNvaFQq96kzX9y7axEt2';
  const LOG_SHEET_NAME = 'LOG';

  const OCR_ENABLED = true;
  const OCR_LANGUAGE = 'en';
  const OCR_MAX_FILES_PER_RUN = 120;
  const OCR_CACHE_HOURS = 24;
  const SHORTLINK_CACHE_HOURS = 72;

  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sh = ss.getSheetByName(TARGET_SHEET_NAME);
  const ui = SpreadsheetApp.getUi();

  if (!sh) {
    ui.alert('Không tìm thấy sheet: ' + TARGET_SHEET_NAME);
    return;
  }

  if (sh.getLastRow() < 2) {
    ui.alert('Sheet USPS chưa có dữ liệu.');
    return;
  }

  const descCol = getOrCreateColumn(sh, 'Description');
  const linkCol = getOrCreateColumn(sh, 'LINK driver');
  const barcodeCol = getOrCreateColumn(sh, 'BARCODE');
  const shortLinkCol = getOrCreateColumn(sh, 'SHORT LINK');
  const barcodeTextCol = getOrCreateColumn(sh, 'BARCODE TEXT');
  const printBarcodeCol = getOrCreateCheckboxColumn(sh, 'PRINT BARCODE');
  const printBarcodeTextCol = getOrCreateCheckboxColumn(sh, 'PRINT BARCODE TEXT');

  const headersNow = sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0];
  const trackCol = findColumn(headersNow, ['TRACK', 'Track']);
  const ref1Col = findColumn(headersNow, ['Reference1', 'Reference 1', 'Ref1', 'Ref 1']);

  const lastRow = sh.getLastRow();
  const lastCol = sh.getLastColumn();
  const numRows = lastRow - 1;

  const data = sh.getRange(1, 1, lastRow, lastCol).getValues();
  const existingRichTexts = sh.getRange(2, linkCol, numRows, 1).getRichTextValues();

  if (FORCE_UPDATE) {
    sh.getRange(2, linkCol, numRows, 1).clearContent();
    sh.getRange(2, barcodeCol, numRows, 1).clearContent();
    sh.getRange(2, shortLinkCol, numRows, 1).clearContent();
    sh.getRange(2, barcodeTextCol, numRows, 1).clearContent();
  }

  ensureCheckboxRange(sh, printBarcodeCol, lastRow);
  ensureCheckboxRange(sh, printBarcodeTextCol, lastRow);

  const scanResult = buildFileIndexes(FOLDER_ID);

  const richTextValues = [];
  const barcodeFormulas = [];
  const shortLinkValues = [];
  const barcodeTextFormulas = [];
  const logRows = [];
  const unmatchedRows = [];

  let skippedExisting = 0;
  let matchedFilenameExact = 0;
  let matchedOcr = 0;
  let blankAll = 0;
  let barcodeCreated = 0;
  let barcodeTextCreated = 0;
  let notFound = 0;
  let shortLinkCreated = 0;

  for (let r = 2; r <= lastRow; r++) {
    const rowIndex = r - 2;
    const existingRich = existingRichTexts[rowIndex][0];
    const rowData = data[r - 1];

    const description = getCellString(rowData, descCol);
    const track = getCellString(rowData, trackCol);
    const reference1 = getCellString(rowData, ref1Col);
    const barcodeLabel = description || track || reference1 || '';
    const barcodeTextFormula = buildBarcodeTextFormula(description);

    if (!FORCE_UPDATE && hasExistingLink(existingRich)) {
      const oldUrl = getRichTextUrl(existingRich);
      const shortUrl = oldUrl ? shortenUrlCached(oldUrl, SHORTLINK_CACHE_HOURS) : '';

      richTextValues.push([existingRich]);
      barcodeFormulas.push([
        shortUrl
          ? buildBarcodeFormula(shortUrl, barcodeLabel)
          : (oldUrl ? buildBarcodeFormula(oldUrl, barcodeLabel) : '')
      ]);
      shortLinkValues.push([shortUrl || '']);
      barcodeTextFormulas.push([barcodeTextFormula]);

      if (shortUrl || oldUrl) barcodeCreated++;
      if (description) barcodeTextCreated++;
      if (shortUrl) shortLinkCreated++;
      skippedExisting++;

      logRows.push([
        TARGET_SHEET_NAME,
        r,
        description || track || reference1 || '',
        'SKIPPED_EXISTING',
        shortUrl ? 'Đã có LINK, giữ nguyên LINK và tạo/giữ SHORT LINK + BARCODE + BARCODE TEXT' : 'Đã có LINK nhưng không rút gọn được',
        oldUrl || '',
        shortUrl || '',
        oldUrl ? 'YES' : 'NO',
        shortUrl ? 'YES' : 'NO',
        'NO',
        new Date()
      ]);
      continue;
    }

    const exactKeys = buildExactFilenameKeys(description, track, reference1);

    if (exactKeys.length === 0) {
      richTextValues.push([emptyCell()]);
      barcodeFormulas.push(['']);
      shortLinkValues.push(['']);
      barcodeTextFormulas.push([barcodeTextFormula]);
      if (description) barcodeTextCreated++;
      blankAll++;

      logRows.push([
        TARGET_SHEET_NAME,
        r,
        '',
        'BLANK_MATCH_KEY',
        'Description / TRACK / Reference1 đều trống',
        '',
        '',
        'NO',
        'NO',
        'NO',
        new Date()
      ]);
      continue;
    }

    const filenameMatch = findByFilenameExact(exactKeys, scanResult.exactMap);

    if (filenameMatch.found) {
      const longUrl = filenameMatch.file.url;
      const shortUrl = shortenUrlCached(longUrl, SHORTLINK_CACHE_HOURS);

      richTextValues.push([createLink(filenameMatch.file.name, longUrl)]);
      barcodeFormulas.push([
        shortUrl
          ? buildBarcodeFormula(shortUrl, barcodeLabel)
          : buildBarcodeFormula(longUrl, barcodeLabel)
      ]);
      shortLinkValues.push([shortUrl || longUrl]);
      barcodeTextFormulas.push([barcodeTextFormula]);

      matchedFilenameExact++;
      barcodeCreated++;
      if (description) barcodeTextCreated++;
      if (shortUrl) shortLinkCreated++;

      logRows.push([
        TARGET_SHEET_NAME,
        r,
        description || track || reference1 || '',
        'FILENAME_EXACT',
        shortUrl ? 'Match exact theo tên file PDF + short link + barcode + barcode text' : 'Match exact theo tên file PDF + barcode từ long URL + barcode text',
        longUrl,
        shortUrl || '',
        'YES',
        shortUrl ? 'YES' : 'NO',
        'NO',
        new Date()
      ]);
    } else {
      richTextValues.push([emptyCell()]);
      barcodeFormulas.push(['']);
      shortLinkValues.push(['']);
      barcodeTextFormulas.push([barcodeTextFormula]);
      if (description) barcodeTextCreated++;

      unmatchedRows.push({
        rowNumber: r,
        description: description,
        track: track,
        reference1: reference1,
        barcodeLabel: barcodeLabel,
        ocrKeys: buildOcrKeys(description, track)
      });
    }
  }

  if (OCR_ENABLED && unmatchedRows.length > 0) {
    const ocrResult = runOcrMatching(
      unmatchedRows,
      scanResult.files,
      OCR_LANGUAGE,
      OCR_MAX_FILES_PER_RUN,
      OCR_CACHE_HOURS
    );

    for (let i = 0; i < ocrResult.matches.length; i++) {
      const item = ocrResult.matches[i];
      const longUrl = item.file.url;
      const shortUrl = shortenUrlCached(longUrl, SHORTLINK_CACHE_HOURS);

      richTextValues[item.rowNumber - 2] = [createLink(item.file.name, longUrl)];
      barcodeFormulas[item.rowNumber - 2] = [
        shortUrl
          ? buildBarcodeFormula(shortUrl, item.barcodeLabel)
          : buildBarcodeFormula(longUrl, item.barcodeLabel)
      ];
      shortLinkValues[item.rowNumber - 2] = [shortUrl || longUrl];
      barcodeTextFormulas[item.rowNumber - 2] = [buildBarcodeTextFormula(item.description)];

      matchedOcr++;
      barcodeCreated++;
      if (item.description) barcodeTextCreated++;
      if (shortUrl) shortLinkCreated++;

      logRows.push([
        TARGET_SHEET_NAME,
        item.rowNumber,
        item.description || item.track || item.reference1 || '',
        'OCR',
        shortUrl ? 'Match bằng OCR nội dung PDF + short link + barcode + barcode text' : 'Match bằng OCR nội dung PDF + barcode từ long URL + barcode text',
        longUrl,
        shortUrl || '',
        'YES',
        shortUrl ? 'YES' : 'NO',
        'YES',
        new Date()
      ]);
    }

    for (let i = 0; i < ocrResult.unmatched.length; i++) {
      const miss = ocrResult.unmatched[i];
      notFound++;

      logRows.push([
        TARGET_SHEET_NAME,
        miss.rowNumber,
        miss.description || miss.track || miss.reference1 || '',
        'NOT_FOUND',
        buildMissNote(miss.description, miss.track, miss.reference1),
        '',
        '',
        'NO',
        'NO',
        'NO',
        new Date()
      ]);
    }

    for (let i = 0; i < ocrResult.ocrErrors.length; i++) {
      const err = ocrResult.ocrErrors[i];

      logRows.push([
        TARGET_SHEET_NAME,
        '',
        err.fileName,
        'OCR_ERROR',
        err.message,
        '',
        '',
        'NO',
        'NO',
        'YES',
        new Date()
      ]);
    }
  } else {
    for (let i = 0; i < unmatchedRows.length; i++) {
      const miss = unmatchedRows[i];
      notFound++;

      logRows.push([
        TARGET_SHEET_NAME,
        miss.rowNumber,
        miss.description || miss.track || miss.reference1 || '',
        'NOT_FOUND',
        buildMissNote(miss.description, miss.track, miss.reference1),
        '',
        '',
        'NO',
        'NO',
        'NO',
        new Date()
      ]);
    }
  }

  sh.getRange(2, linkCol, numRows, 1).setRichTextValues(richTextValues);
  sh.getRange(2, barcodeCol, numRows, 1).setFormulas(barcodeFormulas);
  sh.getRange(2, shortLinkCol, numRows, 1).setValues(shortLinkValues);
  sh.getRange(2, barcodeTextCol, numRows, 1).setFormulas(barcodeTextFormulas);

  try {
    sh.setColumnWidth(barcodeCol, 320);
    sh.setColumnWidth(barcodeTextCol, 320);

    sh.getRange(2, barcodeCol, numRows, 1).setHorizontalAlignment('center');
    sh.getRange(2, barcodeCol, numRows, 1).setVerticalAlignment('middle');
    sh.getRange(2, barcodeTextCol, numRows, 1).setHorizontalAlignment('center');
    sh.getRange(2, barcodeTextCol, numRows, 1).setVerticalAlignment('middle');

    sh.setRowHeights(2, numRows, 80);
  } catch (e) {}

  writeLogSheet(ss, LOG_SHEET_NAME, logRows, scanResult.duplicateLogs);

  ui.alert(
    'Xong USPS\n' +
    'Bỏ qua dòng đã có link: ' + skippedExisting + '\n' +
    'Match exact filename: ' + matchedFilenameExact + '\n' +
    'Match OCR: ' + matchedOcr + '\n' +
    'Short link đã tạo: ' + shortLinkCreated + '\n' +
    'Barcode link đã tạo: ' + barcodeCreated + '\n' +
    'Barcode text đã tạo: ' + barcodeTextCreated + '\n' +
    'Không tìm thấy PDF: ' + notFound + '\n' +
    'Thiếu dữ liệu match: ' + blankAll + '\n' +
    'Chi tiết xem tab LOG'
  );
}

/* ===================== EXPORT PDF - BARCODE LINK ===================== */

function exportSelectedBarcodePdf() {
  exportPdfByMode('link', 'selected');
}

function exportAllBarcodePdf() {
  exportPdfByMode('link', 'all');
}

function exportCheckedBarcodePdf() {
  exportPdfByMode('link', 'checked');
}

/* ===================== EXPORT PDF - BARCODE TEXT ===================== */

function exportSelectedBarcodeTextPdf() {
  exportPdfByMode('text', 'selected');
}

function exportAllBarcodeTextPdf() {
  exportPdfByMode('text', 'all');
}

function exportCheckedBarcodeTextPdf() {
  exportPdfByMode('text', 'checked');
}

function exportPdfByMode(kind, mode) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sh = ss.getSheetByName('USPS');
  const ui = SpreadsheetApp.getUi();

  if (!sh) {
    ui.alert('Không tìm thấy sheet USPS');
    return;
  }

  const lastRow = sh.getLastRow();
  if (lastRow < 2) {
    ui.alert('Không có dữ liệu để xuất');
    return;
  }

  let items = [];

  if (mode === 'selected') {
    const rangeList = sh.getActiveRangeList();
    if (!rangeList) {
      ui.alert('Hãy chọn các dòng cần xuất PDF');
      return;
    }

    const ranges = rangeList.getRanges();
    const selectedRows = [];

    // Quét tất cả các mảng đang chọn (kể cả chọn rời rạc bằng phím Ctrl)
    for (let i = 0; i < ranges.length; i++) {
      const start = ranges[i].getRow();
      const count = ranges[i].getNumRows();
      for (let j = 0; j < count; j++) {
        const r = start + j;
        // Bỏ qua header (dòng 1) và lọc trùng lặp nếu chọn đè lên nhau
        if (r >= 2 && selectedRows.indexOf(r) === -1) {
          selectedRows.push(r);
        }
      }
    }

    // Sắp xếp lại thứ tự dòng từ trên xuống dưới
    selectedRows.sort(function(a, b) { return a - b; });

    // Thu thập dữ liệu từng dòng
    for (let i = 0; i < selectedRows.length; i++) {
      const rowItems = collectPdfItemsByRowRange(sh, selectedRows[i], 1, kind);
      if (rowItems.length > 0) {
        items.push(rowItems[0]);
      }
    }
  }

  if (mode === 'all') {
    items = collectPdfItemsByRowRange(sh, 2, lastRow - 1, kind);
  }

  if (mode === 'checked') {
    items = collectPdfItemsByCheckedColumn(sh, kind);
  }

  if (items.length === 0) {
    if (kind === 'link') {
      ui.alert('Không có dòng hợp lệ để xuất PDF BARCODE. Cần có SHORT LINK hoặc LINK driver.');
    } else {
      ui.alert('Không có dòng hợp lệ để xuất PDF BARCODE TEXT. Cần có Description.');
    }
    return;
  }

  const prefix = kind === 'link' ? 'USPS_BARCODE' : 'USPS_BARCODE_TEXT';
  const suffix = mode === 'selected' ? 'SELECTED' : (mode === 'all' ? 'ALL' : 'CHECKED');

  const file = createBarcodeBatchPdfA7(items, prefix + '_' + suffix + '_' + timestampForFileName(), kind);
  ui.alert('Đã tạo PDF:\n' + file.url);
}

function collectPdfItemsByRowRange(sh, startRow, numRows, kind) {
  const lastRow = sh.getLastRow();
  const lastCol = sh.getLastColumn();

  if (lastRow < 2 || numRows <= 0) return [];

  const data = sh.getRange(1, 1, lastRow, lastCol).getValues();
  const headers = data[0];

  const descCol = findColumn(headers, ['Description', 'Desc']);
  const receiverNameCol = findColumn(headers, ['Receiver Name', 'ReceiverName', 'Receiver', 'Recipient Name']);
  const trackCol = findColumn(headers, ['TRACK', 'Track']);
  const ref1Col = findColumn(headers, ['Reference1', 'Reference 1', 'Ref1', 'Ref 1']);
  const shortLinkCol = findColumn(headers, ['SHORT LINK', 'Short Link', 'ShortLink', 'SHORTLINK']);
  const linkCol = findColumn(headers, ['LINK driver', 'Link driver', 'LINK', 'Link']);

  const richLinks = (linkCol > 0 && lastRow > 1)
    ? sh.getRange(2, linkCol, lastRow - 1, 1).getRichTextValues()
    : [];

  const items = [];
  const endRow = Math.min(startRow + numRows - 1, lastRow);

  for (let r = startRow; r <= endRow; r++) {
    if (r < 2) continue;

    const rowData = data[r - 1];
    const description = getCellString(rowData, descCol);
    const receiverName = getCellString(rowData, receiverNameCol);
    const track = getCellString(rowData, trackCol);
    const reference1 = getCellString(rowData, ref1Col);
    const label = sanitizeBarcodeLabel(description || track || reference1 || ('ROW ' + r));

    let value = '';
    let fixedText = '';

    if (kind === 'link') {
      if (shortLinkCol > 0) {
        value = getCellString(rowData, shortLinkCol);
      }

      if (!value && linkCol > 0) {
        const rich = richLinks[r - 2] ? richLinks[r - 2][0] : null;
        value = getRichTextUrl(rich) || getCellString(rowData, linkCol);
      }
    } else {
      value = description;
      fixedText = receiverName;
    }

    value = String(value || '').trim();
    if (!value) continue;

    items.push({
      rowNumber: r,
      label: label,
      value: value,
      fixedText: fixedText
    });
  }

  return items;
}

function collectPdfItemsByCheckedColumn(sh, kind) {
  const lastRow = sh.getLastRow();
  const lastCol = sh.getLastColumn();

  if (lastRow < 2) return [];

  const data = sh.getRange(1, 1, lastRow, lastCol).getValues();
  const headers = data[0];

  const printCol = kind === 'link'
    ? findColumn(headers, ['PRINT BARCODE', 'Print Barcode'])
    : findColumn(headers, ['PRINT BARCODE TEXT', 'Print Barcode Text']);

  if (printCol <= 0) return [];

  const items = [];
  for (let r = 2; r <= lastRow; r++) {
    const checked = data[r - 1][printCol - 1];
    if (checked === true) {
      const rowItems = collectPdfItemsByRowRange(sh, r, 1, kind);
      if (rowItems.length > 0) items.push(rowItems[0]);
    }
  }

  return items;
}

function createBarcodeBatchPdfA7(items, fileBaseName, kind) {
  try {
    // Gọi trực tiếp đến Folder ID bạn đã cung cấp
    const folder = DriveApp.getFolderById('14d8D4p-6zx4Fue2gxUx1zwozsYtOF54S');
    
    const html = kind === 'text'
      ? buildBarcodeBatchHtmlA7Text(items)
      : buildBarcodeBatchHtmlA7Link(items);

    const htmlBlob = Utilities.newBlob(html, 'text/html', fileBaseName + '.html');
    const pdfBlob = htmlBlob.getAs(MimeType.PDF).setName(fileBaseName + '.pdf');
    const pdfFile = folder.createFile(pdfBlob);

    return {
      id: pdfFile.getId(),
      url: 'https://drive.google.com/file/d/' + pdfFile.getId() + '/view'
    };
  } catch (err) {
    throw new Error('Lỗi tạo PDF barcode: ' + err);
  }
}

function buildBarcodeBatchHtmlA7Link(items) {
  const pageWidthMm = 74;
  const pageHeightMm = 105;
  const boxWidthMm = 54;
  const borderColor = '#d9d9d9';
  const titleFontSizePt = 16;
  const titlePaddingTopMm = 1.8;
  const titlePaddingBottomMm = 2.8;
  const barcodeWidthMm = 48;
  const barcodeMarginTopMm = 2.6;
  const barcodeMarginBottomMm = 1.0;
  const barcodeScale = 3;
  const barcodeHeight = 16;

  let pagesHtml = '';

  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    const safeLabel = escapeHtml(item.label || '');
    const barcodeDataUri = buildBarcodeDataUri(item.value, barcodeScale, barcodeHeight);

    pagesHtml +=
      '<div class="page">' +
        '<div class="label-box">' +
          '<div class="label-title">' + safeLabel + '</div>' +
          '<div class="barcode-box">' +
            '<img class="barcode" src="' + barcodeDataUri + '">' +
          '</div>' +
        '</div>' +
      '</div>';
  }

  return '<!DOCTYPE html>' +
    '<html>' +
    '<head>' +
      '<meta charset="UTF-8">' +
      '<style>' +
        '@page {' +
          'size: ' + pageWidthMm + 'mm ' + pageHeightMm + 'mm;' +
          'margin: 0;' +
        '}' +
        'html, body {' +
          'margin: 0;' +
          'padding: 0;' +
          'background: #ffffff;' +
          'font-family: "Times New Roman", Arial, sans-serif;' +
        '}' +
        '.page {' +
          'width: ' + pageWidthMm + 'mm;' +
          'height: ' + pageHeightMm + 'mm;' +
          'page-break-after: always;' +
          'display: flex;' +
          'align-items: flex-start;' +
          'justify-content: center;' +
          'box-sizing: border-box;' +
          'padding-top: 32mm;' +
        '}' +
        '.page:last-child {' +
          'page-break-after: auto;' +
        '}' +
        '.label-box {' +
          'width: ' + boxWidthMm + 'mm;' +
          'border: 1px solid ' + borderColor + ';' +
          'box-sizing: border-box;' +
          'background: #ffffff;' +
        '}' +
        '.label-title {' +
          'width: 100%;' +
          'box-sizing: border-box;' +
          'text-align: center;' +
          'font-size: ' + titleFontSizePt + 'pt;' +
          'font-weight: 700;' +
          'line-height: 1.15;' +
          'padding-top: ' + titlePaddingTopMm + 'mm;' +
          'padding-bottom: ' + titlePaddingBottomMm + 'mm;' +
          'padding-left: 2mm;' +
          'padding-right: 2mm;' +
          'border-bottom: 1px solid ' + borderColor + ';' +
          'word-break: break-word;' +
        '}' +
        '.barcode-box {' +
          'display: flex;' +
          'justify-content: center;' +
          'align-items: center;' +
          'padding-top: ' + barcodeMarginTopMm + 'mm;' +
          'padding-bottom: ' + barcodeMarginBottomMm + 'mm;' +
          'padding-left: 2mm;' +
          'padding-right: 2mm;' +
          'box-sizing: border-box;' +
        '}' +
        '.barcode {' +
          'display: block;' +
          'width: ' + barcodeWidthMm + 'mm;' +
          'height: auto;' +
        '}' +
      '</style>' +
    '</head>' +
    '<body>' +
      pagesHtml +
    '</body>' +
    '</html>';
}

function buildBarcodeBatchHtmlA7Text(items) {
  const pageWidthMm = 74;
  const pageHeightMm = 105;
  const boxWidthMm = 54;
  const borderColor = '#d9d9d9';
  const titleFontSizePt = 16;
  const subFontSizePt = 11;
  const titlePaddingTopMm = 1.8;
  const titlePaddingBottomMm = 1.2;
  const subPaddingTopMm = 1.2;
  const subPaddingBottomMm = 2.0;
  const barcodeWidthMm = 48;
  const barcodeMarginTopMm = 2.0;
  const barcodeMarginBottomMm = 1.0;
  const barcodeScale = 3;
  const barcodeHeight = 16;

  let pagesHtml = '';

  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    const safeLabel = escapeHtml(item.label || '');
    const safeFixedText = escapeHtml(item.fixedText || '');
    const barcodeDataUri = buildBarcodeDataUri(item.value, barcodeScale, barcodeHeight);

    pagesHtml +=
      '<div class="page">' +
        '<div class="label-box">' +
          '<div class="label-title">' + safeLabel + '</div>' +
          '<div class="label-fixed-text">' + safeFixedText + '</div>' +
          '<div class="barcode-box">' +
            '<img class="barcode" src="' + barcodeDataUri + '">' +
          '</div>' +
        '</div>' +
      '</div>';
  }

  return '<!DOCTYPE html>' +
    '<html>' +
    '<head>' +
      '<meta charset="UTF-8">' +
      '<style>' +
        '@page {' +
          'size: ' + pageWidthMm + 'mm ' + pageHeightMm + 'mm;' +
          'margin: 0;' +
        '}' +
        'html, body {' +
          'margin: 0;' +
          'padding: 0;' +
          'background: #ffffff;' +
          'font-family: "Times New Roman", Arial, sans-serif;' +
        '}' +
        '.page {' +
          'width: ' + pageWidthMm + 'mm;' +
          'height: ' + pageHeightMm + 'mm;' +
          'page-break-after: always;' +
          'display: flex;' +
          'align-items: flex-start;' +
          'justify-content: center;' +
          'box-sizing: border-box;' +
          'padding-top: 28mm;' +
        '}' +
        '.page:last-child {' +
          'page-break-after: auto;' +
        '}' +
        '.label-box {' +
          'width: ' + boxWidthMm + 'mm;' +
          'border: 1px solid ' + borderColor + ';' +
          'box-sizing: border-box;' +
          'background: #ffffff;' +
        '}' +
        '.label-title {' +
          'width: 100%;' +
          'box-sizing: border-box;' +
          'text-align: center;' +
          'font-size: ' + titleFontSizePt + 'pt;' +
          'font-weight: 700;' +
          'line-height: 1.15;' +
          'padding-top: ' + titlePaddingTopMm + 'mm;' +
          'padding-bottom: ' + titlePaddingBottomMm + 'mm;' +
          'padding-left: 2mm;' +
          'padding-right: 2mm;' +
          'border-bottom: 1px solid ' + borderColor + ';' +
          'word-break: break-word;' +
        '}' +
        '.label-fixed-text {' +
          'width: 100%;' +
          'box-sizing: border-box;' +
          'text-align: center;' +
          'font-size: ' + subFontSizePt + 'pt;' +
          'font-weight: 700;' +
          'line-height: 1.2;' +
          'padding-top: ' + subPaddingTopMm + 'mm;' +
          'padding-bottom: ' + subPaddingBottomMm + 'mm;' +
          'padding-left: 2mm;' +
          'padding-right: 2mm;' +
          'word-break: break-word;' +
          'min-height: 8mm;' +
        '}' +
        '.barcode-box {' +
          'display: flex;' +
          'justify-content: center;' +
          'align-items: center;' +
          'padding-top: ' + barcodeMarginTopMm + 'mm;' +
          'padding-bottom: ' + barcodeMarginBottomMm + 'mm;' +
          'padding-left: 2mm;' +
          'padding-right: 2mm;' +
          'box-sizing: border-box;' +
        '}' +
        '.barcode {' +
          'display: block;' +
          'width: ' + barcodeWidthMm + 'mm;' +
          'height: auto;' +
        '}' +
      '</style>' +
    '</head>' +
    '<body>' +
      pagesHtml +
    '</body>' +
    '</html>';
}

function buildBarcodeDataUri(value, scale, height) {
  const url =
    'https://bwipjs-api.metafloor.com/?bcid=code128' +
    '&scale=' + scale +
    '&height=' + height +
    '&paddingwidth=0' +
    '&paddingheight=0' +
    '&includetext=false' +
    '&text=' + encodeURIComponent(value);

  const res = UrlFetchApp.fetch(url, {
    muteHttpExceptions: true,
    followRedirects: true
  });

  const code = res.getResponseCode();
  if (code < 200 || code >= 300) {
    throw new Error('Không tải được barcode image: ' + code);
  }

  const base64 = Utilities.base64Encode(res.getBlob().getBytes());
  return 'data:image/png;base64,' + base64;
}

/* ===================== OCR PDF ===================== */

function extractPdfTextWithOcr(fileId, fileName, ocrLanguage) {
  const resource = {
    title: 'TMP_OCR_' + new Date().getTime() + '_' + fileName,
    mimeType: MimeType.GOOGLE_DOCS
  };

  const copied = Drive.Files.copy(resource, fileId, {
    convert: true,
    ocr: true,
    ocrLanguage: ocrLanguage
  });

  if (!copied || !copied.id) {
    throw new Error('Không OCR được file: ' + fileName);
  }

  try {
    const doc = DocumentApp.openById(copied.id);
    return doc.getBody().getText() || '';
  } finally {
    DriveApp.getFileById(copied.id).setTrashed(true);
  }
}

/* ===================== SHORT LINK ===================== */

function shortenUrlCached(longUrl, cacheHours) {
  const cleanUrl = String(longUrl || '').trim();
  if (!cleanUrl) return '';

  const cache = CacheService.getScriptCache();
  const cacheKey = 'short_' + Utilities.base64EncodeWebSafe(cleanUrl).substring(0, 220);

  const cached = cache.get(cacheKey);
  if (cached) return cached;

  const shortUrl = shortenUrlViaIsgd(cleanUrl);

  if (shortUrl) {
    cache.put(cacheKey, shortUrl, cacheHours * 3600);
    return shortUrl;
  }

  return '';
}

function shortenUrlViaIsgd(longUrl) {
  try {
    const api = 'https://is.gd/create.php?format=simple&url=' + encodeURIComponent(longUrl);
    const response = UrlFetchApp.fetch(api, {
      muteHttpExceptions: true,
      followRedirects: true
    });

    const code = response.getResponseCode();
    const body = String(response.getContentText() || '').trim();

    if (code >= 200 && code < 300 && /^https?:\/\/is\.gd\//i.test(body)) {
      return body;
    }

    return '';
  } catch (e) {
    return '';
  }
}

/* ===================== SHEET WRITE ===================== */

function createLink(text, url) {
  return SpreadsheetApp.newRichTextValue()
    .setText(text)
    .setLinkUrl(url)
    .build();
}

function emptyCell() {
  return SpreadsheetApp.newRichTextValue()
    .setText('')
    .build();
}

function hasExistingLink(richTextValue) {
  if (!richTextValue) return false;

  try {
    const text = richTextValue.getText();
    const url = richTextValue.getLinkUrl();
    return !!(text && url);
  } catch (e) {
    return false;
  }
}

function getRichTextUrl(richTextValue) {
  if (!richTextValue) return '';
  try {
    return String(richTextValue.getLinkUrl() || '').trim();
  } catch (e) {
    return '';
  }
}

function buildBarcodeFormula(value, label) {
  const cleanValue = String(value || '').trim();
  if (!cleanValue) return '';

  const safeLabel = sanitizeBarcodeLabel(label);
  const encodedValue = encodeURIComponent(cleanValue);
  const encodedLabel = encodeURIComponent(safeLabel);

  return '=IMAGE("https://bwipjs-api.metafloor.com/?bcid=code128' +
    '&scale=2' +
    '&height=10' +
    '&paddingwidth=8' +
    '&paddingheight=8' +
    '&includetext=true' +
    '&textxalign=center' +
    '&text=' + encodedValue +
    (safeLabel ? '&alttext=' + encodedLabel : '') +
    '")';
}

function buildBarcodeTextFormula(text) {
  const cleanText = String(text || '').trim();
  if (!cleanText) return '';

  const encodedValue = encodeURIComponent(cleanText);

  return '=IMAGE("https://bwipjs-api.metafloor.com/?bcid=code128' +
    '&scale=2' +
    '&height=10' +
    '&paddingwidth=8' +
    '&paddingheight=8' +
    '&includetext=true' +
    '&textxalign=center' +
    '&text=' + encodedValue + '")';
}

function sanitizeBarcodeLabel(label) {
  return String(label || '')
    .replace(/[\r\n\t]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .substring(0, 80);
}

function writeLogSheet(ss, name, errors, duplicates) {
  let sh = ss.getSheetByName(name);

  if (!sh) {
    sh = ss.insertSheet(name);
  } else {
    sh.clearContents();
    sh.clearFormats();
  }

  const header = [[
    'Sheet',
    'Row',
    'Description',
    'Status',
    'Note',
    'LONG_URL',
    'SHORT_URL',
    'LINK_CREATED',
    'SHORTLINK_CREATED',
    'OCR_USED',
    'Time'
  ]];

  sh.getRange(1, 1, 1, header[0].length).setValues(header);
  sh.getRange(1, 1, 1, header[0].length).setFontWeight('bold');

  const allLogs = errors.concat(duplicates);

  if (allLogs.length > 0) {
    sh.getRange(2, 1, allLogs.length, header[0].length).setValues(allLogs);
  } else {
    sh.getRange(2, 1).setValue('OK - không lỗi');
  }

  sh.autoResizeColumns(1, header[0].length);
}

/* ===================== FOLDER ===================== */

function timestampForFileName() {
  return Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyyMMdd_HHmmss');
}

function escapeHtml(text) {
  return String(text || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&quot;')
    .replace(/"/g, '&#39;');
}

/* ===================== UTIL ===================== */

function getCellString(rowData, colIndex) {
  if (!colIndex || colIndex <= 0) return '';
  return String(rowData[colIndex - 1] || '').trim();
}

function buildMissNote(description, track, reference1) {
  return 'Description=' + (description || '') +
    ' | TRACK=' + (track || '') +
    ' | Reference1=' + (reference1 || '');
}

function findColumn(headers, candidates) {
  const normalizedHeaders = headers.map(function(h) {
    return String(h || '').toLowerCase().replace(/\s+/g, '').trim();
  });

  for (let i = 0; i < candidates.length; i++) {
    const target = String(candidates[i] || '').toLowerCase().replace(/\s+/g, '').trim();
    const idx = normalizedHeaders.indexOf(target);
    if (idx !== -1) return idx + 1;
  }

  return -1;
}

function getOrCreateColumn(sh, headerName) {
  const lastCol = sh.getLastColumn();
  const headers = sh.getRange(1, 1, 1, lastCol).getValues()[0];

  for (let i = 0; i < headers.length; i++) {
    const val = String(headers[i] || '').trim().toLowerCase().replace(/\s+/g, ' ');
    if (val === String(headerName).trim().toLowerCase().replace(/\s+/g, ' ')) {
      return i + 1;
    }
  }

  const newCol = lastCol + 1;
  sh.getRange(1, newCol).setValue(headerName);
  return newCol;
}

function getOrCreateCheckboxColumn(sh, headerName) {
  const col = getOrCreateColumn(sh, headerName);
  ensureCheckboxRange(sh, col, sh.getLastRow());
  return col;
}

function ensureCheckboxRange(sh, col, lastRow) {
  if (col <= 0 || lastRow < 2) return;

  const range = sh.getRange(2, col, lastRow - 1, 1);
  const rule = SpreadsheetApp.newDataValidation().requireCheckbox().build();
  range.setDataValidation(rule);
}

function normalizeKey(text) {
  return String(text || '')
    .trim()
    .replace(/\.pdf$/i, '')
    .replace(/\s+/g, ' ')
    .toLowerCase();
}

function uniqueNonEmpty(arr) {
  const out = [];
  const seen = {};

  for (let i = 0; i < arr.length; i++) {
    const val = String(arr[i] || '').trim();
    if (!val) continue;
    if (seen[val]) continue;
    seen[val] = true;
    out.push(val);
  }

  return out;
}

/* ===================== MATCH ENGINE ===================== */

function buildFileIndexes(folderId) {
  const folder = DriveApp.getFolderById(folderId);
  const files = [];
  const exactMap = new Map();
  const duplicateLogs = [];

  scanFolderRecursive(folder, files, exactMap, duplicateLogs, '');

  return {
    files: files,
    exactMap: exactMap,
    duplicateLogs: duplicateLogs
  };
}

function scanFolderRecursive(folder, files, exactMap, duplicateLogs, parentPath) {
  const folderName = folder.getName();
  const currentPath = parentPath ? parentPath + ' / ' + folderName : folderName;

  const fileIterator = folder.getFiles();
  while (fileIterator.hasNext()) {
    const file = fileIterator.next();
    const name = String(file.getName() || '').trim();

    if (!/\.pdf$/i.test(name)) continue;

    const baseName = name.replace(/\.pdf$/i, '').trim();
    const normalizedBase = normalizeKey(baseName);

    const fileObj = {
      id: file.getId(),
      name: name,
      url: 'https://drive.google.com/file/d/' + file.getId() + '/view',
      path: currentPath,
      baseName: baseName,
      normalizedBase: normalizedBase
    };

    files.push(fileObj);

    if (normalizedBase) {
      if (exactMap.has(normalizedBase)) {
        duplicateLogs.push([
          '',
          '',
          baseName,
          'DUPLICATE_FILENAME',
          'Trùng key trong folder/subfolder: ' + currentPath,
          '',
          '',
          '',
          '',
          '',
          new Date()
        ]);
      } else {
        exactMap.set(normalizedBase, fileObj);
      }
    }
  }

  const subfolders = folder.getFolders();
  while (subfolders.hasNext()) {
    scanFolderRecursive(subfolders.next(), files, exactMap, duplicateLogs, currentPath);
  }
}

function buildExactFilenameKeys(description, track, reference1) {
  return uniqueNonEmpty([
    normalizeKey(description),
    normalizeKey(track),
    normalizeKey(reference1)
  ]);
}

function buildOcrKeys(description, track) {
  return uniqueNonEmpty([
    normalizeKey(description),
    normalizeKey(track)
  ]);
}

function findByFilenameExact(exactKeys, exactMap) {
  for (let i = 0; i < exactKeys.length; i++) {
    const key = exactKeys[i];
    if (exactMap.has(key)) {
      return {
        found: true,
        file: exactMap.get(key)
      };
    }
  }

  return { found: false };
}

function runOcrMatching(unmatchedRows, files, ocrLanguage, maxFilesPerRun, cacheHours) {
  const matches = [];
  const unmatched = [];
  const ocrErrors = [];

  const ocrFiles = files.slice(0, Math.min(files.length, maxFilesPerRun));
  const ocrTexts = buildOcrTextIndex(ocrFiles, ocrLanguage, cacheHours, ocrErrors);

  for (let r = 0; r < unmatchedRows.length; r++) {
    const row = unmatchedRows[r];
    const result = findByOcrText(row.ocrKeys, ocrTexts);

    if (result.found) {
      matches.push({
        rowNumber: row.rowNumber,
        file: result.file,
        description: row.description,
        track: row.track,
        reference1: row.reference1,
        barcodeLabel: row.barcodeLabel
      });
    } else {
      unmatched.push(row);
    }
  }

  return {
    matches: matches,
    unmatched: unmatched,
    ocrErrors: ocrErrors
  };
}

function buildOcrTextIndex(files, ocrLanguage, cacheHours, ocrErrors) {
  const cache = CacheService.getScriptCache();
  const items = [];

  for (let i = 0; i < files.length; i++) {
    const file = files[i];

    try {
      const cacheKey = 'ocr_' + file.id;
      let text = cache.get(cacheKey);

      if (!text) {
        text = extractPdfTextWithOcr(file.id, file.name, ocrLanguage) || '';
        if (text) {
          cache.put(cacheKey, text.substring(0, 90000), cacheHours * 3600);
        }
      }

      items.push({
        file: file,
        text: normalizeKey(text)
      });
    } catch (err) {
      ocrErrors.push({
        fileName: file.name,
        message: String(err)
      });
    }
  }

  return items;
}

function findByOcrText(ocrKeys, ocrTexts) {
  for (let i = 0; i < ocrTexts.length; i++) {
    const item = ocrTexts[i];
    if (!item.text) continue;

    for (let j = 0; j < ocrKeys.length; j++) {
      const key = ocrKeys[j];
      if (!key) continue;
      if (key.length < 5) continue;

      if (item.text.indexOf(key) !== -1) {
        return {
          found: true,
          file: item.file
        };
      }
    }
  }

  return { found: false };
}

function onEdit(e) {
  try {
    if (!e || !e.range) return;

    const sh = e.range.getSheet();
    if (!sh || sh.getName() !== 'USPS') return;

    const lastCol = sh.getLastColumn();
    const headers = sh.getRange(1, 1, 1, lastCol).getValues()[0];

    const descCol = findColumn(headers, ['Description', 'Desc']);
    let barcodeTextCol = findColumn(headers, ['BARCODE TEXT', 'Barcode Text', 'BARCODE_TEXT', 'BarcodeText']);
    let printBarcodeCol = findColumn(headers, ['PRINT BARCODE', 'Print Barcode']);
    let printBarcodeTextCol = findColumn(headers, ['PRINT BARCODE TEXT', 'Print Barcode Text']);

    if (descCol <= 0) return;

    if (barcodeTextCol <= 0) {
      barcodeTextCol = sh.getLastColumn() + 1;
      sh.getRange(1, barcodeTextCol).setValue('BARCODE TEXT');
    }

    if (printBarcodeCol <= 0) {
      printBarcodeCol = sh.getLastColumn() + 1;
      sh.getRange(1, printBarcodeCol).setValue('PRINT BARCODE');
      ensureCheckboxRange(sh, printBarcodeCol, sh.getLastRow());
    }

    if (printBarcodeTextCol <= 0) {
      printBarcodeTextCol = sh.getLastColumn() + 1;
      sh.getRange(1, printBarcodeTextCol).setValue('PRINT BARCODE TEXT');
      ensureCheckboxRange(sh, printBarcodeTextCol, sh.getLastRow());
    }

    const editColStart = e.range.getColumn();
    const editColEnd = editColStart + e.range.getNumColumns() - 1;

    if (descCol < editColStart || descCol > editColEnd) return;

    const startRow = e.range.getRow();
    const numRows = e.range.getNumRows();

    if (startRow < 2) return;

    const actualStartRow = Math.max(2, startRow);
    const actualNumRows = startRow < 2 ? numRows - (2 - startRow) : numRows;
    if (actualNumRows <= 0) return;

    const descValues = sh.getRange(actualStartRow, descCol, actualNumRows, 1).getValues();
    const out = descValues.map(function(row) {
      return [buildBarcodeTextFormula(String(row[0] || '').trim())];
    });

    sh.getRange(actualStartRow, barcodeTextCol, actualNumRows, 1).setFormulas(out);
    ensureCheckboxRange(sh, printBarcodeCol, sh.getLastRow());
    ensureCheckboxRange(sh, printBarcodeTextCol, sh.getLastRow());
  } catch (err) {
    Logger.log('onEdit error: ' + err);
  }
}
function doGet() {
  return HtmlService.createTemplateFromFile('Index')
      .evaluate()
      .setTitle('Hệ thống Quản lý Fulfillment')
      .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}
