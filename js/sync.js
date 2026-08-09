// Local-first sync queue: receipts save to IndexedDB instantly (offline
// OK); this pushes pending entries to Drive + the Sheet whenever the
// phone is online, and retries failures. An entry is only marked synced
// after both its receipt file and its row are written. Tabs touched
// during a sync get re-sorted by transaction date at the end.
window.Sync = (() => {
  let syncing = false;
  let status = "";
  const listeners = [];

  function onChange(fn) { listeners.push(fn); }
  function setStatus(text) {
    status = text;
    listeners.forEach(fn => fn(status, syncing));
  }
  function getStatus() { return { status, syncing }; }

  async function pendingCount() {
    const entries = await DB.all("entries");
    return entries.filter(e => e.syncState !== "synced").length;
  }

  function usDate(iso) {
    if (!iso || !/^\d{4}-\d{2}-\d{2}$/.test(iso)) return iso || "";
    const [y, m, d] = iso.split("-");
    return Number(m) + "/" + Number(d) + "/" + y;
  }

  function usDateTime(iso) {
    const d = new Date(iso);
    return (d.getMonth() + 1) + "/" + d.getDate() + "/" + d.getFullYear() + " " +
      d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
  }

  async function syncNow(interactive) {
    if (syncing) return;
    if (!navigator.onLine) {
      setStatus("Offline — receipts are saved and will sync automatically.");
      return;
    }
    if (!GAuth.isConnected()) {
      setStatus("Not connected to Google — open Settings to connect.");
      return;
    }
    if (!Sheets.spreadsheetId()) {
      setStatus("No spreadsheet linked — open Settings.");
      return;
    }
    syncing = true;
    setStatus("Syncing…");
    try {
      if (interactive) await GAuth.getToken(true);
      const entries = (await DB.all("entries"))
        .filter(e => e.syncState !== "synced")
        .sort((a, b) => (a.createdAt || "").localeCompare(b.createdAt || ""));

      let failed = 0;
      const touchedTabs = {};
      for (const entry of entries) {
        try {
          const map = touchedTabs[entry.business] || await Sheets.headerMap(entry.business);
          await syncEntry(entry, map);
          touchedTabs[entry.business] = map;
          entry.syncState = "synced";
          entry.lastSyncError = "";
        } catch (e) {
          entry.syncState = "failed";
          entry.lastSyncError = String(e.message || e);
          failed++;
        }
        await DB.put("entries", entry);
      }
      for (const [tab, map] of Object.entries(touchedTabs)) {
        try { await Sheets.sortTab(tab, map); } catch (e) { /* sorted next sync */ }
      }
      setStatus(failed === 0 ? "All receipts synced." : failed + " receipt" + (failed === 1 ? "" : "s") + " failed — will retry.");
    } catch (e) {
      setStatus("Sync failed: " + (e.message || e));
    } finally {
      syncing = false;
      listeners.forEach(fn => fn(status, syncing));
    }
  }

  async function syncEntry(entry, map) {
    if (!entry.driveId) {
      const photo = await DB.get("photos", entry.entryID);
      if (photo) {
        const year = (entry.date || entry.createdAt || "").slice(0, 4) || String(new Date().getFullYear());
        const folderId = await Sheets.ensureFolder(entry.business, year);
        const ext = entry.isPdf ? ".pdf" : ".jpg";
        const mime = entry.isPdf ? "application/pdf" : "image/jpeg";
        const vendorSlug = (entry.vendor || "receipt").replace(/[^A-Za-z0-9]+/g, "-").slice(0, 30);
        const filename = (entry.date || "undated") + "_" + vendorSlug + "_" + entry.entryID.slice(0, 8) + ext;
        let blob = photo.blob;
        if (!entry.isPdf) blob = await AI.compressImage(photo.blob, 2000, 0.75);
        entry.driveId = await Sheets.uploadReceipt(blob, filename, folderId, mime);
        await DB.put("entries", entry);
      }
    }

    const row = buildRow(entry, map);
    const existing = await Sheets.findRow(entry.entryID, map, entry.business);
    if (existing) {
      await Sheets.updateRow(row, existing, entry.business);
    } else {
      await Sheets.appendRow(row, entry.business);
    }
    entry.updatedAt = new Date().toISOString();
  }

  function buildRow(entry, map) {
    const num = (v) => (v === null || v === undefined || v === "" || isNaN(v)) ? "" : Number(v);
    let receiptCell = "";
    if (entry.driveId) {
      receiptCell = entry.isPdf ? Sheets.pdfCellFormula(entry.driveId) : Sheets.imageCellFormula(entry.driveId);
    }
    const byHeader = {
      "Date": usDate(entry.date),
      "Vendor": entry.vendor || "",
      "Description": entry.description || "",
      "Category": entry.category || "",
      "Amount": num(entry.amount),
      "Sales Tax": num(entry.salesTax),
      "Payment Method": entry.paymentMethod || "",
      "Notes": entry.notes || "",
      "Receipt": receiptCell,
      "Logged By": entry.loggedBy || "",
      "Logged At": usDateTime(entry.createdAt),
      "Entry ID": entry.entryID,
    };
    const width = Math.max(...Object.values(map)) + 1;
    const row = new Array(width).fill("");
    for (const [header, value] of Object.entries(byHeader)) {
      if (map[header] !== undefined) row[map[header]] = value;
    }
    return row;
  }

  window.addEventListener("online", () => syncNow(false));

  return { syncNow, pendingCount, onChange, getStatus, usDate };
})();
