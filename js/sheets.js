// Google Sheets + Drive REST calls. One tab per business; a "Businesses"
// tab is the shared source of truth for the business list (both phones
// see the same list). Columns are matched by header name so the sheet
// can be extended safely. Rows are kept sorted by transaction date.
window.Sheets = (() => {
  const EXPECTED_HEADERS = [
    "Date", "Vendor", "Description", "Category", "Amount", "Sales Tax",
    "Payment Method", "Notes", "Receipt", "Logged By", "Logged At", "Entry ID",
  ];
  const BIZ_TAB = "Businesses";

  let sheetIdMap = null; // tab title -> numeric sheetId

  function spreadsheetId() {
    return localStorage.getItem("spreadsheetId") || CONFIG.spreadsheetId || "";
  }

  function setSpreadsheetId(id) {
    localStorage.setItem("spreadsheetId", id.trim());
    sheetIdMap = null;
  }

  async function call(url, options) {
    const token = await GAuth.getToken(false);
    const response = await fetch(url, {
      ...options,
      headers: {
        Authorization: "Bearer " + token,
        ...(options && options.json ? { "Content-Type": "application/json" } : {}),
        ...(options ? options.headers : {}),
      },
      body: options && options.json ? JSON.stringify(options.json) : options ? options.body : undefined,
    });
    if (!response.ok) {
      const text = await response.text();
      throw new Error("Google API error " + response.status + ": " + text.slice(0, 300));
    }
    return response.status === 204 ? null : response.json();
  }

  const base = () => {
    if (!spreadsheetId()) throw new Error("No spreadsheet linked yet — open Settings.");
    return "https://sheets.googleapis.com/v4/spreadsheets/" + spreadsheetId();
  };
  const quote = (title) => "'" + title.replace(/'/g, "''") + "'";
  const valuesURL = (range, params) => {
    const p = new URLSearchParams(params || {});
    return base() + "/values/" + encodeURIComponent(range) + (p.toString() ? "?" + p : "");
  };

  function columnLetter(index) {
    let letters = "";
    do {
      letters = String.fromCharCode(65 + (index % 26)) + letters;
      index = Math.floor(index / 26) - 1;
    } while (index >= 0);
    return letters;
  }

  // ---- Spreadsheet creation (first run) ----

  async function createSpreadsheet() {
    const businesses = CONFIG.seedBusinesses;
    const created = await call("https://sheets.googleapis.com/v4/spreadsheets", {
      method: "POST",
      json: {
        properties: { title: CONFIG.spreadsheetName },
        sheets: [{ properties: { title: BIZ_TAB } }]
          .concat(businesses.map(b => ({ properties: { title: b.name } }))),
      },
    });
    setSpreadsheetId(created.spreadsheetId);
    const data = [
      { range: quote(BIZ_TAB) + "!A1", values: [["Name", "Type", "Status"]].concat(businesses.map(b => [b.name, b.type, "active"])) },
    ].concat(businesses.map(b => ({ range: quote(b.name) + "!A1", values: [EXPECTED_HEADERS] })));
    await call(base() + "/values:batchUpdate", {
      method: "POST",
      json: { valueInputOption: "RAW", data },
    });
    return created.spreadsheetId;
  }

  // ---- Sheet metadata ----

  async function getSheetIdMap(force) {
    if (sheetIdMap && !force) return sheetIdMap;
    const meta = await call(base() + "?fields=sheets.properties(sheetId,title)");
    sheetIdMap = {};
    for (const s of meta.sheets || []) sheetIdMap[s.properties.title] = s.properties.sheetId;
    return sheetIdMap;
  }

  // ---- Business list (shared via the Businesses tab) ----

  async function loadBusinesses() {
    const data = await call(valuesURL(quote(BIZ_TAB) + "!A2:C1000"));
    return (data.values || [])
      .filter(r => r[0])
      .map(r => ({ name: r[0], type: r[1] || "business", status: r[2] || "active" }));
  }

  async function addBusiness(name, type) {
    const map = await getSheetIdMap(true);
    if (map[name] === undefined) {
      await call(base() + ":batchUpdate", {
        method: "POST",
        json: { requests: [{ addSheet: { properties: { title: name } } }] },
      });
      sheetIdMap = null;
      await call(valuesURL(quote(name) + "!1:1", { valueInputOption: "RAW" }), {
        method: "PUT",
        json: { values: [EXPECTED_HEADERS] },
      });
    }
    await call(appendURL(BIZ_TAB, "RAW"), {
      method: "POST", json: { values: [[name, type, "active"]] },
    });
  }

  // Archiving keeps the tab and every logged receipt; the business just
  // stops appearing in the app's pickers.
  async function setBusinessStatus(name, status) {
    const data = await call(valuesURL(quote(BIZ_TAB) + "!A1:C1000"));
    const rows = data.values || [];
    for (let i = 1; i < rows.length; i++) {
      if (rows[i][0] === name) {
        await call(valuesURL(quote(BIZ_TAB) + "!C" + (i + 1), { valueInputOption: "RAW" }), {
          method: "PUT",
          json: { values: [[status]] },
        });
        return;
      }
    }
    throw new Error("Business not found: " + name);
  }

  // ---- Entry rows ----

  async function headerMap(title) {
    const data = await call(valuesURL(quote(title) + "!1:1"));
    let headers = (data.values && data.values[0]) || [];
    const missing = EXPECTED_HEADERS.filter(h => !headers.includes(h));
    if (missing.length) {
      headers = headers.concat(missing);
      await call(valuesURL(quote(title) + "!1:1", { valueInputOption: "RAW" }), {
        method: "PUT",
        json: { values: [headers] },
      });
    }
    const map = {};
    headers.forEach((name, i) => { map[name.trim()] = i; });
    return map;
  }

  async function findRow(entryID, map, title) {
    if (map["Entry ID"] === undefined) return null;
    const col = columnLetter(map["Entry ID"]);
    const data = await call(valuesURL(quote(title) + "!" + col + ":" + col));
    const values = data.values || [];
    for (let i = 0; i < values.length; i++) {
      if (values[i][0] === entryID) return i + 1;
    }
    return null;
  }

  // The ":append" verb must stay OUTSIDE the URL-encoded range — encoding
  // the colon makes Google return 404.
  function appendURL(title, valueInputOption) {
    const p = new URLSearchParams({ valueInputOption, insertDataOption: "INSERT_ROWS" });
    return base() + "/values/" + encodeURIComponent(quote(title) + "!A1") + ":append?" + p;
  }

  async function appendRow(row, title) {
    await call(appendURL(title, "USER_ENTERED"), { method: "POST", json: { values: [row] } });
  }

  async function updateRow(row, rowNumber, title) {
    const last = columnLetter(row.length - 1);
    await call(valuesURL(quote(title) + "!A" + rowNumber + ":" + last + rowNumber, {
      valueInputOption: "USER_ENTERED",
    }), { method: "PUT", json: { values: [row] } });
  }

  // Keeps every tab in true transaction-date order no matter when the
  // photo was taken or which phone logged it.
  async function sortTab(title, map) {
    const ids = await getSheetIdMap();
    if (ids[title] === undefined) { await getSheetIdMap(true); }
    const sheetId = (await getSheetIdMap())[title];
    if (sheetId === undefined) throw new Error("Tab not found: " + title);
    const sortSpecs = [{ dimensionIndex: map["Date"], sortOrder: "ASCENDING" }];
    if (map["Logged At"] !== undefined) {
      sortSpecs.push({ dimensionIndex: map["Logged At"], sortOrder: "ASCENDING" });
    }
    await call(base() + ":batchUpdate", {
      method: "POST",
      json: {
        requests: [{
          sortRange: {
            range: { sheetId, startRowIndex: 1 }, // skip the header row
            sortSpecs,
          },
        }],
      },
    });
  }

  async function readTab(title) {
    const data = await call(valuesURL(quote(title) + "!A1:Z10000"));
    return data.values || [];
  }

  // ---- Drive receipt archive ----

  async function driveSearch(q) {
    const url = "https://www.googleapis.com/drive/v3/files?fields=files(id)&q=" + encodeURIComponent(q);
    const data = await call(url);
    return data.files && data.files[0] ? data.files[0].id : null;
  }

  async function makeFolder(name, parentId) {
    const created = await call("https://www.googleapis.com/drive/v3/files?fields=id", {
      method: "POST",
      json: { name, mimeType: "application/vnd.google-apps.folder", ...(parentId ? { parents: [parentId] } : {}) },
    });
    return created.id;
  }

  async function findOrMakeFolder(name, parentId) {
    const esc = name.replace(/'/g, "\\'");
    let q = "name = '" + esc + "' and mimeType = 'application/vnd.google-apps.folder' and trashed = false";
    if (parentId) q += " and '" + parentId + "' in parents";
    return (await driveSearch(q)) || (await makeFolder(name, parentId));
  }

  // Receipt Tracker Receipts/<Business>/<Year>/
  async function ensureFolder(businessName, year) {
    const rootId = await findOrMakeFolder(CONFIG.driveFolderName, null);
    const bizId = await findOrMakeFolder(businessName, rootId);
    return await findOrMakeFolder(String(year), bizId);
  }

  async function uploadReceipt(blob, filename, folderId, mimeType) {
    const boundary = "receipt" + Date.now();
    const meta = JSON.stringify({ name: filename, parents: [folderId] });
    const body = new Blob([
      "--" + boundary + "\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n",
      meta,
      "\r\n--" + boundary + "\r\nContent-Type: " + mimeType + "\r\n\r\n",
      blob,
      "\r\n--" + boundary + "--\r\n",
    ]);
    const uploaded = await call(
      "https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id",
      { method: "POST", body, headers: { "Content-Type": "multipart/related; boundary=" + boundary } }
    );
    // Anyone-with-link read access so the thumbnail renders inside the
    // sheet cell (links are unguessable; only the receipt is shared).
    await call("https://www.googleapis.com/drive/v3/files/" + uploaded.id + "/permissions", {
      method: "POST",
      json: { role: "reader", type: "anyone" },
    });
    return uploaded.id;
  }

  // Image shown inside the cell; the link opens the full-size original.
  function imageCellFormula(fileId) {
    return '=HYPERLINK("https://drive.google.com/file/d/' + fileId + '/view", IMAGE("https://drive.google.com/thumbnail?id=' + fileId + '&sz=w400"))';
  }

  function pdfCellFormula(fileId) {
    return '=HYPERLINK("https://drive.google.com/file/d/' + fileId + '/view", "View PDF")';
  }

  return {
    EXPECTED_HEADERS, spreadsheetId, setSpreadsheetId, createSpreadsheet,
    loadBusinesses, addBusiness, setBusinessStatus,
    headerMap, findRow, appendRow, updateRow, sortTab, readTab,
    ensureFolder, uploadReceipt, imageCellFormula, pdfCellFormula,
  };
})();
