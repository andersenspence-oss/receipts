# Receipt Tracker — Web App

One app for every receipt across all the businesses (Whiplash Center of Utah, Family Health and Rehab, Running Wild Utah, PI Warriors, the four SandCastle LLCs) plus personal. Snap a photo or upload an image/PDF, Claude reads the vendor / date / total / tax and suggests an IRS-based category, you confirm, and the receipt lands in a shared Google Sheet — one tab per business, **always sorted by the transaction date printed on the receipt**, with the receipt image archived in Google Drive and embedded in the row. A QuickBooks-ready CSV export is built in.

This is the same free stack as the Mileage Tracker web app: GitHub Pages hosting, your existing Google sign-in, offline-first with automatic sync. **It even reuses the Mileage Tracker's Google Cloud setup — no new Google configuration needed.**

---

## Setup — about 15 minutes, once

### Step 1 — Put the app online (GitHub Pages, free)

You already have the GitHub account from the mileage app (`andersenspence-oss`).

1. Sign in at https://github.com → top-right **+** → **New repository**. Name: `receipts`. Leave it **Public** → **Create repository**.
2. On the new repo page click **uploading an existing file**, then drag in **everything inside this `web` folder** (index.html, sw.js, manifest.webmanifest, the css/, js/ and icons/ folders — not the `web` folder itself). **Commit changes**.
3. Repo **Settings** → **Pages** → Branch: **main**, folder **/ (root)** → Save.
4. In a minute or two the app is live at: `https://andersenspence-oss.github.io/receipts/`

**No Google Cloud work needed.** The mileage app's OAuth client already allows `https://andersenspence-oss.github.io`, and all GitHub Pages apps on your account share that address — the client ID is already filled into `js/config.js`. (Both Google accounts are already in the OAuth Test users list from the mileage setup.)

### Step 2 — First run on your phone

In **Safari** on the iPhone:

1. Go to `https://andersenspence-oss.github.io/receipts/` → Share → **Add to Home Screen**.
2. Open it, pick your name.
3. **Settings tab** → **Connect Google account** → sign in (tap Advanced → Continue if Google shows its "unverified app" note — it's your own app).
4. **Settings → Create my Receipt Tracker spreadsheet.** The app builds the sheet with a tab for every business + Personal + a Businesses tab, and links it. Copy the ID it shows you.
5. So the second phone (and future re-installs) use the same sheet: edit `js/config.js` in the GitHub repo (pencil icon) and paste the ID into `spreadsheetId`, **or** paste it into Settings on the other phone. Also open the sheet → **Share** → give the other Google account **Editor** access.

### Step 3 — Turn on Claude receipt reading (recommended)

This is what makes photos fill in the form automatically.

1. Go to https://console.anthropic.com → sign up / sign in → **API Keys** → **Create key**. Add a few dollars of credit (each receipt costs roughly 1–2¢ to read).
2. In the app: **Settings → Claude receipt reading** → paste the key → **Save key**.
3. The key stays on that phone only (it is never uploaded to GitHub or the sheet). Do this on each phone that should have auto-read.

Without a key everything still works — you just type the fields in yourself.

---

## Everyday use

- **Capture tab** → pick the business → **Snap receipt** (or **Upload image / PDF** for online purchases) → Claude fills in the fields → glance, fix anything, **Save**. Done — it syncs in the background.
- **No signal?** Save anyway. Receipts queue on the phone and sync automatically when you're back online.
- **The sheet**: one tab per business, rows in true transaction-date order (the app re-sorts after every sync, so a receipt found in a coat pocket three weeks later files itself into the right spot). The Receipt column shows the image (set row height to ~80 to see thumbnails); clicking opens the full-size original in Drive (`Receipt Tracker Receipts/<Business>/<Year>/`).
- **Add or archive a business**: Settings → Businesses. Adding creates the tab in the sheet automatically; archiving keeps the tab and all its data, it just leaves the pickers. Both phones see the change.
- **QuickBooks**: Export tab → pick business + date range → **QuickBooks CSV** (3-column: Date, Description, Amount as negatives = money out). In QuickBooks: Transactions → Banking → Upload from file. **Full detail CSV** has every column for your accountant.
- **Categories** are IRS-based and depend on the business type: Schedule C for the operating businesses, Schedule E for the SandCastle rentals, a simple personal list for Personal. Edit the lists in `js/config.js` on GitHub any time.

## Troubleshooting

- **Sign-in popup errors** — that Google account isn't in the OAuth Test users list (Google Cloud → APIs & Services → OAuth consent screen → Audience), or you're not on the `andersenspence-oss.github.io` address.
- **"Test connection" fails** — the account doesn't have Editor access to the sheet, or the spreadsheet ID is wrong (it's the long string between `/d/` and `/edit` in the sheet URL).
- **Auto-read says the key was rejected** — re-paste the API key in Settings; make sure the Anthropic account has credit.
- **Receipt stuck on ⏳/❌** — open the Receipts tab and tap **Sync now**; the row shows the error. Usually it's sign-in (Settings → Connect) or sheet access.
- **Images don't show in the sheet cells** — give Drive a minute to make thumbnails, then refresh; set row height taller.
- **Phone shows an old version** — close the app fully and reopen twice.
- **Don't delete the Entry ID column** — it's how the app avoids duplicate rows when a sync retries.
