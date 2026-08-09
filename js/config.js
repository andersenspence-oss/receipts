// ====================================================================
// EVERYTHING you might ever need to edit lives in this one file.
// After editing on GitHub, both phones pick up the change the next
// time the app is opened (may take one extra open to refresh).
// ====================================================================
window.CONFIG = {

  // Names offered on first launch; written to "Logged By".
  profiles: ["Spence", "Carey"],

  // Reused from the Mileage Tracker Google Cloud project — GitHub Pages
  // apps on the same account share one origin, so no new setup needed.
  googleClientId: "312332218243-3q5a4710p7t78aj3k1k381g825fv18a0.apps.googleusercontent.com",

  // The Receipt Tracker spreadsheet ID. Leave blank; the app's Settings
  // screen creates the spreadsheet on first run and shows the ID. Paste
  // it here (GitHub pencil icon) so BOTH phones use the same sheet, or
  // paste it into Settings on the second phone.
  spreadsheetId: "1jsTSmC2Eo34ESo0KxS6-1B-a-IznMz80d900JhpFT00",

  spreadsheetName: "Receipt Tracker",

  // Google Drive folder where receipt images/PDFs are archived,
  // organized as  Receipt Tracker Receipts/<Business>/<Year>/
  driveFolderName: "Receipt Tracker Receipts",

  // Claude model that reads receipts. "claude-opus-5" is the most
  // accurate; "claude-haiku-4-5" is ~5x cheaper per receipt if costs
  // ever matter (each phone's API key is entered in Settings, never here
  // — this file is public).
  claudeModel: "claude-opus-5",

  // Businesses seeded into the spreadsheet on first-run creation.
  // AFTER creation, the "Businesses" tab in the sheet (managed from the
  // app's Settings screen) is the source of truth — not this list.
  // type controls which category list is offered:
  //   business = Schedule C, rental = Schedule E, personal = personal
  seedBusinesses: [
    { name: "Whiplash Center of Utah",  type: "business" },
    { name: "Family Health and Rehab",  type: "business" },
    { name: "Running Wild Utah",        type: "business" },
    { name: "PI Warriors",              type: "business" },
    { name: "SandCastle 1 LLC",         type: "rental"   },
    { name: "SandCastle 2 LLC",         type: "rental"   },
    { name: "SandCastle 4 LLC",         type: "rental"   },
    { name: "SandCastle 5 LLC",         type: "rental"   },
    { name: "Personal",                 type: "personal" },
  ],

  // IRS-based expense categories, offered per business type.
  categories: {
    // Schedule C / 1120-S line items (operating businesses)
    business: [
      "Advertising & Marketing",
      "Bank & Merchant Fees",
      "Car & Truck Expenses",
      "Contract Labor",
      "Cost of Goods Sold / Inventory",
      "Education & Training",
      "Equipment (Section 179)",
      "Insurance",
      "Legal & Professional Services",
      "Meals (50%)",
      "Medical / Clinic Supplies",
      "Office Expense",
      "Rent / Lease",
      "Repairs & Maintenance",
      "Software & Subscriptions",
      "Supplies",
      "Taxes & Licenses",
      "Travel",
      "Utilities & Phone",
      "Wages",
      "Other",
    ],
    // Schedule E line items (rental LLCs)
    rental: [
      "Advertising",
      "Auto & Travel",
      "Cleaning & Maintenance",
      "HOA Dues",
      "Insurance",
      "Legal & Professional Services",
      "Management Fees",
      "Mortgage Interest",
      "Repairs",
      "Supplies",
      "Property Taxes",
      "Utilities",
      "Depreciation / Improvements",
      "Other",
    ],
    personal: [
      "Groceries",
      "Dining",
      "Household",
      "Medical",
      "Clothing",
      "Entertainment",
      "Travel",
      "Auto",
      "Gifts & Donations",
      "Other",
    ],
  },
};
