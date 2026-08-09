// Claude-powered receipt reading. The photo (or PDF) goes straight from
// the browser to the Claude API, which returns structured JSON: vendor,
// transaction date, total, tax, payment method, and a suggested category.
// The API key lives only in this phone's localStorage (Settings screen).
window.AI = (() => {

  function apiKey() {
    return localStorage.getItem("claudeApiKey") || "";
  }

  function hasKey() {
    return !!apiKey();
  }

  // Downscale + JPEG-compress before upload; receipts stay perfectly
  // readable and the request gets much smaller/cheaper.
  function compressImage(blob, maxDim, quality) {
    return new Promise((resolve, reject) => {
      const url = URL.createObjectURL(blob);
      const img = new Image();
      img.onload = () => {
        URL.revokeObjectURL(url);
        const scale = Math.min(1, maxDim / Math.max(img.width, img.height));
        const canvas = document.createElement("canvas");
        canvas.width = Math.round(img.width * scale);
        canvas.height = Math.round(img.height * scale);
        canvas.getContext("2d").drawImage(img, 0, 0, canvas.width, canvas.height);
        canvas.toBlob(b => b ? resolve(b) : reject(new Error("Image compression failed")), "image/jpeg", quality);
      };
      img.onerror = () => { URL.revokeObjectURL(url); reject(new Error("Couldn't read that image")); };
      img.src = url;
    });
  }

  function blobToBase64(blob) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result.split(",")[1]);
      reader.onerror = () => reject(reader.error);
      reader.readAsDataURL(blob);
    });
  }

  // categories: the list valid for the chosen business, so the suggestion
  // always lands on a real option.
  async function extractReceipt(blob, isPdf, categories) {
    if (!hasKey()) throw new Error("No Claude API key — add one in Settings to enable auto-read.");

    let mediaBlock;
    if (isPdf) {
      const data = await blobToBase64(blob);
      mediaBlock = { type: "document", source: { type: "base64", media_type: "application/pdf", data } };
    } else {
      const compressed = await compressImage(blob, 1568, 0.8);
      const data = await blobToBase64(compressed);
      mediaBlock = { type: "image", source: { type: "base64", media_type: "image/jpeg", data } };
    }

    const schema = {
      type: "object",
      properties: {
        vendor: { type: "string", description: "Merchant/store name as printed on the receipt" },
        date: { type: "string", description: "Transaction date in YYYY-MM-DD format. Empty string if not visible." },
        total: { type: ["number", "null"], description: "Grand total charged, in dollars" },
        sales_tax: { type: ["number", "null"], description: "Sales tax amount if itemized, else null" },
        payment_method: { type: "string", description: "e.g. 'Visa ...1234', 'Cash', 'Amex'. Empty string if not visible." },
        description: { type: "string", description: "Very short summary of what was purchased (a few words)" },
        category: { type: "string", enum: categories, description: "Best-fit expense category from the allowed list" },
      },
      required: ["vendor", "date", "total", "sales_tax", "payment_method", "description", "category"],
      additionalProperties: false,
    };

    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey(),
        "anthropic-version": "2023-06-01",
        "anthropic-dangerous-direct-browser-access": "true",
      },
      body: JSON.stringify({
        model: CONFIG.claudeModel,
        max_tokens: 1024,
        output_config: {
          effort: "low",
          format: { type: "json_schema", schema },
        },
        messages: [{
          role: "user",
          content: [
            mediaBlock,
            { type: "text", text: "Read this receipt and extract the purchase details. Use the transaction date printed on the receipt, not today's date." },
          ],
        }],
      }),
    });

    if (!response.ok) {
      const text = await response.text();
      let message = "Claude API error " + response.status;
      try { message = JSON.parse(text).error.message || message; } catch (e) {}
      if (response.status === 401) message = "Claude API key was rejected — check it in Settings.";
      throw new Error(message);
    }

    const result = await response.json();
    if (result.stop_reason === "refusal") throw new Error("Claude couldn't process this image.");
    const textBlock = (result.content || []).find(b => b.type === "text");
    if (!textBlock) throw new Error("Claude returned no data for this receipt.");
    return JSON.parse(textBlock.text);
  }

  return { hasKey, extractReceipt, compressImage };
})();
