// Main app controller: views, capture flow, AI autofill, export, settings.
window.App = (() => {
  const $ = (id) => document.getElementById(id);

  let pendingBlob = null;
  let pendingIsPdf = false;
  let businesses = []; // [{name, type, status}]

  // ---------- profile ----------

  function profile() { return localStorage.getItem("profile") || ""; }

  function ensureProfile() {
    if (profile()) return;
    const box = $("profileChoices");
    box.innerHTML = "";
    CONFIG.profiles.forEach(name => {
      const b = document.createElement("button");
      b.className = "big-btn";
      b.textContent = name;
      b.onclick = () => {
        localStorage.setItem("profile", name);
        $("profileModal").classList.add("hidden");
        $("setProfile").value = name;
      };
      box.appendChild(b);
    });
    $("profileModal").classList.remove("hidden");
  }

  // ---------- businesses ----------

  function activeBusinesses() {
    return businesses.filter(b => b.status === "active");
  }

  function bizType(name) {
    const b = businesses.find(x => x.name === name);
    return b ? b.type : "business";
  }

  function loadBusinessCache() {
    try {
      const cached = JSON.parse(localStorage.getItem("businessesCache") || "null");
      businesses = cached && cached.length ? cached : CONFIG.seedBusinesses.map(b => ({ ...b, status: "active" }));
    } catch (e) {
      businesses = CONFIG.seedBusinesses.map(b => ({ ...b, status: "active" }));
    }
  }

  async function refreshBusinesses() {
    if (!navigator.onLine || !GAuth.isConnected() || !Sheets.spreadsheetId()) return;
    try {
      businesses = await Sheets.loadBusinesses();
      localStorage.setItem("businessesCache", JSON.stringify(businesses));
      renderBusinessSelects();
      renderBizList();
    } catch (e) { /* keep cache */ }
  }

  function renderBusinessSelects() {
    const last = localStorage.getItem("lastBusiness");
    for (const sel of [$("capBusiness"), $("expBusiness")]) {
      sel.innerHTML = "";
      activeBusinesses().forEach(b => {
        const o = document.createElement("option");
        o.value = b.name;
        o.textContent = b.name;
        sel.appendChild(o);
      });
      if (last && [...sel.options].some(o => o.value === last)) sel.value = last;
    }
    renderCategoryOptions();
  }

  function renderCategoryOptions(suggested) {
    const type = bizType($("capBusiness").value);
    const cats = CONFIG.categories[type] || CONFIG.categories.business;
    const sel = $("fCategory");
    sel.innerHTML = "";
    cats.forEach(c => {
      const o = document.createElement("option");
      o.value = c;
      o.textContent = c;
      sel.appendChild(o);
    });
    if (suggested && cats.includes(suggested)) sel.value = suggested;
  }

  // ---------- navigation ----------

  function showView(name) {
    document.querySelectorAll(".view").forEach(v => v.classList.add("hidden"));
    $("view-" + name).classList.remove("hidden");
    document.querySelectorAll(".nav-btn").forEach(b => b.classList.toggle("active", b.dataset.view === name));
    if (name === "receipts") renderReceiptList();
    if (name === "settings") renderSettings();
  }

  // ---------- capture ----------

  function resetCapture() {
    pendingBlob = null;
    pendingIsPdf = false;
    $("capPreview").classList.add("hidden");
    $("capPreview").innerHTML = "";
    $("aiStatus").classList.add("hidden");
    $("capForm").classList.add("hidden");
    $("capForm").reset();
  }

  async function fileChosen(file) {
    if (!file) return;
    resetCapture();
    pendingBlob = file;
    pendingIsPdf = file.type === "application/pdf" || /\.pdf$/i.test(file.name || "");

    const preview = $("capPreview");
    preview.classList.remove("hidden");
    if (pendingIsPdf) {
      preview.innerHTML = '<div class="pdf-chip">📄 ' + (file.name || "receipt.pdf") + "</div>";
    } else {
      const img = document.createElement("img");
      img.src = URL.createObjectURL(file);
      preview.appendChild(img);
    }

    $("capForm").classList.remove("hidden");
    $("fDate").value = new Date().toISOString().slice(0, 10);
    renderCategoryOptions();

    if (AI.hasKey() && navigator.onLine) {
      const status = $("aiStatus");
      status.classList.remove("hidden");
      status.textContent = "🤖 Reading receipt…";
      try {
        const type = bizType($("capBusiness").value);
        const cats = CONFIG.categories[type] || CONFIG.categories.business;
        const data = await AI.extractReceipt(pendingBlob, pendingIsPdf, cats);
        if (data.vendor) $("fVendor").value = data.vendor;
        if (data.date && /^\d{4}-\d{2}-\d{2}$/.test(data.date)) $("fDate").value = data.date;
        if (data.total !== null && data.total !== undefined) $("fAmount").value = data.total;
        if (data.sales_tax !== null && data.sales_tax !== undefined) $("fTax").value = data.sales_tax;
        if (data.payment_method) $("fPayment").value = data.payment_method;
        if (data.description) $("fDescription").value = data.description;
        renderCategoryOptions(data.category);
        status.textContent = "✅ Auto-read — double-check the fields, then save.";
      } catch (e) {
        status.textContent = "⚠️ " + (e.message || "Auto-read failed") + " — enter the details by hand.";
      }
    } else if (!AI.hasKey()) {
      const status = $("aiStatus");
      status.classList.remove("hidden");
      status.textContent = "Tip: add a Claude API key in Settings and receipts fill themselves in.";
    }
  }

  async function saveEntry(e) {
    e.preventDefault();
    if (!pendingBlob) { alert("Take or upload a receipt photo first."); return; }
    const business = $("capBusiness").value;
    if (!business) { alert("Pick a business first."); return; }
    localStorage.setItem("lastBusiness", business);

    const entry = {
      entryID: crypto.randomUUID(),
      business,
      date: $("fDate").value,
      vendor: $("fVendor").value.trim(),
      amount: parseFloat($("fAmount").value),
      salesTax: $("fTax").value === "" ? "" : parseFloat($("fTax").value),
      paymentMethod: $("fPayment").value.trim(),
      category: $("fCategory").value,
      description: $("fDescription").value.trim(),
      notes: $("fNotes").value.trim(),
      isPdf: pendingIsPdf,
      driveId: "",
      loggedBy: profile(),
      createdAt: new Date().toISOString(),
      syncState: "pending",
      lastSyncError: "",
    };
    await DB.put("photos", { id: entry.entryID, blob: pendingBlob });
    await DB.put("entries", entry);
    resetCapture();
    setToast("Saved ✅ — syncing to the sheet…");
    Sync.syncNow(false);
  }

  // ---------- receipts list ----------

  async function renderReceiptList() {
    const list = $("receiptList");
    const entries = (await DB.all("entries"))
      .sort((a, b) => (b.createdAt || "").localeCompare(a.createdAt || ""))
      .slice(0, 100);
    if (!entries.length) {
      list.innerHTML = '<p class="hint">No receipts yet — snap your first one on the Capture tab.</p>';
      return;
    }
    list.innerHTML = "";
    for (const e of entries) {
      const div = document.createElement("div");
      div.className = "receipt-item";
      const icon = e.syncState === "synced" ? "✅" : e.syncState === "failed" ? "❌" : "⏳";
      const amount = (e.amount || e.amount === 0) ? "$" + Number(e.amount).toFixed(2) : "";
      div.innerHTML =
        '<div class="ri-top"><strong>' + escapeHtml(e.vendor || "(no vendor)") + "</strong><span>" + amount + "</span></div>" +
        '<div class="ri-sub">' + escapeHtml(Sync.usDate(e.date)) + " · " + escapeHtml(e.business) + " · " + escapeHtml(e.category || "") + " " + icon +
        (e.syncState === "failed" ? '<div class="ri-err">' + escapeHtml(e.lastSyncError || "") + "</div>" : "") +
        "</div>";
      list.appendChild(div);
    }
  }

  function escapeHtml(s) {
    return String(s || "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  }

  // ---------- export ----------

  function csvCell(v) {
    const s = String(v === undefined || v === null ? "" : v);
    return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  }

  function downloadCsv(rows, filename) {
    const csv = rows.map(r => r.map(csvCell).join(",")).join("\r\n");
    const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 5000);
  }

  function parseUsDate(s) {
    const m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(String(s || "").trim());
    if (!m) return null;
    return m[3] + "-" + m[1].padStart(2, "0") + "-" + m[2].padStart(2, "0");
  }

  async function exportCsv(kind) {
    const statusEl = $("expStatus");
    const business = $("expBusiness").value;
    if (!business) { statusEl.textContent = "Pick a business first."; return; }
    statusEl.textContent = "Fetching from the sheet…";
    try {
      const values = await Sheets.readTab(business);
      if (values.length < 2) { statusEl.textContent = "No receipts logged for " + business + " yet."; return; }
      const headers = values[0];
      const col = (name) => headers.indexOf(name);
      const from = $("expFrom").value || "0000-00-00";
      const to = $("expTo").value || "9999-99-99";
      const rows = values.slice(1).filter(r => {
        const iso = parseUsDate(r[col("Date")]);
        return iso && iso >= from && iso <= to;
      });
      if (!rows.length) { statusEl.textContent = "No receipts in that date range."; return; }

      const slug = business.replace(/[^A-Za-z0-9]+/g, "-");
      const range = ($("expFrom").value || "all") + "_to_" + ($("expTo").value || "all");
      if (kind === "qb") {
        const out = [["Date", "Description", "Amount"]];
        for (const r of rows) {
          const desc = [r[col("Vendor")], r[col("Description")]].filter(Boolean).join(" - ");
          const amt = parseFloat(r[col("Amount")]) || 0;
          out.push([r[col("Date")], desc, (-Math.abs(amt)).toFixed(2)]);
        }
        downloadCsv(out, "QuickBooks_" + slug + "_" + range + ".csv");
      } else {
        const keep = ["Date", "Vendor", "Description", "Category", "Amount", "Sales Tax", "Payment Method", "Notes", "Logged By"];
        const out = [keep];
        for (const r of rows) out.push(keep.map(h => r[col(h)] || ""));
        downloadCsv(out, "Receipts_" + slug + "_" + range + ".csv");
      }
      statusEl.textContent = "Exported " + rows.length + " receipt" + (rows.length === 1 ? "" : "s") + " ⬇️";
    } catch (e) {
      statusEl.textContent = "Export failed: " + (e.message || e);
    }
  }

  // ---------- settings ----------

  function renderSettings() {
    const prof = $("setProfile");
    prof.innerHTML = "";
    CONFIG.profiles.forEach(p => {
      const o = document.createElement("option");
      o.value = p; o.textContent = p;
      prof.appendChild(o);
    });
    if (profile()) prof.value = profile();

    $("googleStatus").textContent = GAuth.isConnected()
      ? "Connected" + (GAuth.connectedEmail() ? " as " + GAuth.connectedEmail() : "") + " ✅"
      : "Not connected";

    renderSheetStatus();
    $("keyStatus").textContent = AI.hasKey() ? "Key saved on this phone ✅" : "No key yet — receipts must be typed in by hand.";
    renderBizList();
  }

  function renderSheetStatus() {
    const id = Sheets.spreadsheetId();
    $("sheetStatus").textContent = id ? "Linked ✅  (ID: " + id.slice(0, 12) + "…)" : "No spreadsheet yet.";
    const link = $("lnkOpenSheet");
    if (id) {
      link.href = "https://docs.google.com/spreadsheets/d/" + id + "/edit";
      link.classList.remove("hidden");
    } else {
      link.classList.add("hidden");
    }
  }

  function renderBizList() {
    const div = $("bizList");
    if (!div) return;
    div.innerHTML = "";
    businesses.forEach(b => {
      const row = document.createElement("div");
      row.className = "biz-row" + (b.status !== "active" ? " archived" : "");
      const label = document.createElement("span");
      label.textContent = b.name + " (" + b.type + (b.status !== "active" ? ", archived" : "") + ")";
      row.appendChild(label);
      const btn = document.createElement("button");
      btn.className = "small-btn secondary";
      btn.textContent = b.status === "active" ? "Archive" : "Restore";
      btn.onclick = () => toggleBusiness(b);
      row.appendChild(btn);
      div.appendChild(row);
    });
  }

  async function toggleBusiness(b) {
    const status = b.status === "active" ? "archived" : "active";
    if (status === "archived" && !confirm("Archive " + b.name + "? Its tab and receipts stay in the sheet; it just leaves the pickers.")) return;
    try {
      await Sheets.setBusinessStatus(b.name, status);
      $("bizStatus").textContent = b.name + (status === "archived" ? " archived." : " restored.");
      await refreshBusinesses();
    } catch (e) {
      $("bizStatus").textContent = "Failed: " + (e.message || e);
    }
  }

  async function addBusiness() {
    const name = $("newBizName").value.trim();
    const type = $("newBizType").value;
    if (!name) { $("bizStatus").textContent = "Type a business name first."; return; }
    if (businesses.some(b => b.name.toLowerCase() === name.toLowerCase())) {
      $("bizStatus").textContent = "That business already exists."; return;
    }
    $("bizStatus").textContent = "Adding…";
    try {
      await Sheets.addBusiness(name, type);
      $("newBizName").value = "";
      $("bizStatus").textContent = name + " added — its tab is in the sheet. ✅";
      await refreshBusinesses();
    } catch (e) {
      $("bizStatus").textContent = "Failed: " + (e.message || e);
    }
  }

  async function createSheet() {
    if (Sheets.spreadsheetId() && !confirm("A spreadsheet is already linked. Create a brand-new one anyway?")) return;
    $("sheetStatus").textContent = "Creating spreadsheet…";
    try {
      await GAuth.getToken(true);
      const id = await Sheets.createSpreadsheet();
      renderSheetStatus();
      await refreshBusinesses();
      alert("Spreadsheet created!\n\nID:\n" + id + "\n\nTo use it on the other phone: paste this ID into that phone's Settings (or into js/config.js on GitHub so both phones get it automatically). Also share the sheet with the other Google account as Editor.");
    } catch (e) {
      $("sheetStatus").textContent = "Create failed: " + (e.message || e);
    }
  }

  async function testSheet() {
    $("sheetStatus").textContent = "Testing…";
    try {
      await GAuth.getToken(true);
      const list = await Sheets.loadBusinesses();
      $("sheetStatus").textContent = "Connected ✅ — " + list.length + " businesses found.";
    } catch (e) {
      $("sheetStatus").textContent = "Test failed: " + (e.message || e);
    }
  }

  // ---------- misc ----------

  let toastTimer = null;
  function setToast(text) {
    const el = $("syncStatus");
    el.textContent = text;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { el.textContent = Sync.getStatus().status; }, 4000);
  }

  // ---------- init ----------

  async function init() {
    await DB.open();
    loadBusinessCache();
    renderBusinessSelects();
    ensureProfile();

    document.querySelectorAll(".nav-btn").forEach(b => b.onclick = () => showView(b.dataset.view));

    $("btnSnap").onclick = () => $("fileSnap").click();
    $("btnUpload").onclick = () => $("fileUpload").click();
    $("fileSnap").onchange = (e) => fileChosen(e.target.files[0]);
    $("fileUpload").onchange = (e) => fileChosen(e.target.files[0]);
    $("capBusiness").onchange = () => renderCategoryOptions();
    $("capForm").onsubmit = saveEntry;
    $("btnCancelCap").onclick = resetCapture;

    $("btnSyncNow").onclick = () => Sync.syncNow(true);
    $("btnExpQB").onclick = () => exportCsv("qb");
    $("btnExpFull").onclick = () => exportCsv("full");

    $("setProfile").onchange = (e) => localStorage.setItem("profile", e.target.value);
    $("btnGoogleConnect").onclick = async () => {
      try { await GAuth.connect(); } catch (e) { alert(e.message || e); }
      renderSettings();
      refreshBusinesses();
    };
    $("btnGoogleDisconnect").onclick = () => { GAuth.disconnect(); renderSettings(); };
    $("btnSaveKey").onclick = () => {
      const key = $("setApiKey").value.trim();
      if (key) localStorage.setItem("claudeApiKey", key);
      $("setApiKey").value = "";
      renderSettings();
    };
    $("btnCreateSheet").onclick = createSheet;
    $("btnLinkSheet").onclick = () => {
      const id = $("setSheetId").value.trim().replace(/^.*\/d\//, "").replace(/\/.*$/, "");
      if (!id) return;
      Sheets.setSpreadsheetId(id);
      $("setSheetId").value = "";
      renderSheetStatus();
      refreshBusinesses();
    };
    $("btnTestSheet").onclick = testSheet;
    $("btnAddBiz").onclick = addBusiness;

    Sync.onChange((status) => { $("syncStatus").textContent = status; renderReceiptList(); });

    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("sw.js").catch(() => {});
    }

    refreshBusinesses();
    Sync.syncNow(false);
  }

  document.addEventListener("DOMContentLoaded", init);

  return { init };
})();
