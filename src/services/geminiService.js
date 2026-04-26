const API_KEY  = import.meta.env.VITE_GEMINI_API_KEY;
const ENDPOINT = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent`;

function cleanJSON(text) {
  text = text.replace(/```json/gi, '').replace(/```/g, '');
  const firstBracket = Math.min(
    text.indexOf('[') === -1 ? Infinity : text.indexOf('['),
    text.indexOf('{') === -1 ? Infinity : text.indexOf('{'),
  );
  if (firstBracket === Infinity) throw new Error('AI could not read this file format. Please check the file and try again.');
  text = text.substring(firstBracket);
  const lastBracket = Math.max(text.lastIndexOf(']'), text.lastIndexOf('}'));
  if (lastBracket === -1) throw new Error('AI could not read this file format. Please check the file and try again.');
  return text.substring(0, lastBracket + 1).trim();
}

const EXTRACT_PROMPT = `Extract all menu items from this content.
For each item return EXACTLY these fields:
- itemName: the name of the dish or drink
- category: exactly one of "Food", "Beverage", "Dessert", "Extras", "Specials"
- sellingPrice: price as a plain number (no currency symbols, no commas)
- description: short description if visible, otherwise empty string

Return ONLY a valid JSON array. No markdown, no explanation, no code blocks. Just raw JSON starting with [ and ending with ]
Example output:
[{"itemName":"Butter Chicken","category":"Food","sellingPrice":280,"description":"Rich creamy tomato curry"},{"itemName":"Mango Lassi","category":"Beverage","sellingPrice":80,"description":""}]`;

// ─── public API ──────────────────────────────────────────────────────────────

export async function extractMenuFromImage(imageFile) {
  if (!API_KEY) throw new Error('VITE_GEMINI_API_KEY is not set in environment variables.');
  const base64   = await fileToBase64(imageFile);
  const mimeType = imageFile.type || 'image/jpeg';
  return callGeminiAndParse([
    { inlineData: { data: base64, mimeType } },
    { text: EXTRACT_PROMPT },
  ]);
}

export async function extractMenuFromText(menuText) {
  if (!API_KEY) throw new Error('VITE_GEMINI_API_KEY is not set in environment variables.');
  if (!menuText.trim()) throw new Error('Please paste some menu text first.');
  return callGeminiAndParse([
    { text: `${EXTRACT_PROMPT}\n\nMenu content:\n${menuText}` },
  ]);
}

// Maps arbitrary CSV/Excel headers to our menu item fields using Gemini.
// Returns an object like { itemName: 'Name', sellingPrice: 'Price', ... }
// with null for fields that have no matching column.
export async function mapCsvColumns(headers, sampleRows) {
  if (!API_KEY) throw new Error('VITE_GEMINI_API_KEY is not set in environment variables.');
  const prompt = `This is a menu/inventory CSV data. Map these columns to these fields:
itemName, category, sellingPrice, description, isVeg (veg/non-veg indicator), HSNCode.

Column headers: ${JSON.stringify(headers)}

First few data rows (arrays matching headers above):
${sampleRows.map((r) => JSON.stringify(r)).join('\n')}

Return ONLY a JSON object mapping each target field to the source column name.
Use null if no matching column exists. Example:
{"itemName":"Name","category":"Category","sellingPrice":"Price","description":"Description","isVeg":"Attributes","HSNCode":"HSN_Code"}`;

  const res = await fetch(`${ENDPOINT}?key=${API_KEY}`, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify({
      contents:         [{ parts: [{ text: prompt }] }],
      generationConfig: { temperature: 0.1, maxOutputTokens: 256 },
    }),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error?.message ?? `Gemini API error ${res.status}`);
  }
  const data = await res.json();
  const raw  = data.candidates?.[0]?.content?.parts?.[0]?.text ?? '';
  try {
    return JSON.parse(cleanJSON(raw));
  } catch {
    throw new Error('Could not parse AI column mapping. Please try again.');
  }
}

// ─── Sales report extraction ─────────────────────────────────────────────────

const SALES_EXTRACT_PROMPT = `This is a sales report from a restaurant or retail POS system. Extract every sales transaction row and return as a JSON array.
For each row return EXACTLY these fields:
- itemName: name of the item sold
- category: item category if visible, otherwise "Food"
- quantity: units sold as a plain number (default 1 if not shown)
- unitPrice: price per unit as a plain number (no currency symbols)
- totalAmount: total for this row as a plain number (quantity x unitPrice; no currency symbols or commas)
- date: date in "YYYY-MM-DD" format (use the report's overall date if not shown per row, use today if unknown)
- paymentMode: exactly one of "Cash", "Card", or "UPI" (use "Cash" if unclear)
- gstAmount: GST/tax amount for this row as a plain number (0 if not visible)

Return ONLY a valid JSON array. No markdown, no explanation, no code blocks. Just raw JSON starting with [ and ending with ]
Example: [{"itemName":"Butter Chicken","category":"Food","quantity":2,"unitPrice":280,"totalAmount":560,"date":"2024-01-15","paymentMode":"UPI","gstAmount":28}]`;

export async function extractSalesFromImage(imageFile) {
  if (!API_KEY) throw new Error('VITE_GEMINI_API_KEY is not set in environment variables.');
  const base64   = await fileToBase64(imageFile);
  const mimeType = imageFile.type || 'image/jpeg';
  return callGeminiAndParseSales([
    { inlineData: { data: base64, mimeType } },
    { text: SALES_EXTRACT_PROMPT },
  ]);
}

// Maps CSV/Excel headers to sales fields via Gemini, returns a column-mapping object.
export async function mapSalesCsvColumns(headers, sampleRows) {
  if (!API_KEY) throw new Error('VITE_GEMINI_API_KEY is not set in environment variables.');
  const prompt = `This is a sales report CSV from a restaurant POS (e.g. Petpooja, Zomato, Swiggy, or similar). Map columns to standard sales fields.

Column headers: ${JSON.stringify(headers)}

First few data rows (arrays matching headers):
${sampleRows.map((r) => JSON.stringify(r)).join('\n')}

Return ONLY a JSON object mapping each target field to the matching source column name (or null if not present):
itemName, category, quantity, unitPrice, totalAmount, date, paymentMode, gstAmount

Example: {"itemName":"Item Name","category":"Category","quantity":"Qty","unitPrice":"Rate","totalAmount":"Net Amount","date":"Order Date","paymentMode":"Payment Mode","gstAmount":"GST"}`;

  const res = await fetch(`${ENDPOINT}?key=${API_KEY}`, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify({
      contents:         [{ parts: [{ text: prompt }] }],
      generationConfig: { temperature: 0.1, maxOutputTokens: 256 },
    }),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error?.message ?? `Gemini API error ${res.status}`);
  }
  const data = await res.json();
  const raw  = data.candidates?.[0]?.content?.parts?.[0]?.text ?? '';
  try {
    return JSON.parse(cleanJSON(raw));
  } catch {
    throw new Error('Could not parse AI column mapping. Please try again.');
  }
}

async function callGeminiAndParseSales(parts) {
  const res = await fetch(`${ENDPOINT}?key=${API_KEY}`, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify({
      contents:         [{ parts }],
      generationConfig: { temperature: 0.1, maxOutputTokens: 8192 },
    }),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error?.message ?? `Gemini API error ${res.status}`);
  }
  const data = await res.json();
  const raw  = data.candidates?.[0]?.content?.parts?.[0]?.text ?? '';
  return parseSalesJson(raw);
}

function parseSalesJson(raw) {
  let parsed;
  try {
    parsed = JSON.parse(cleanJSON(raw));
  } catch {
    throw new Error('AI could not read this file format. Please check the file and try again.');
  }

  if (!Array.isArray(parsed)) throw new Error('AI could not read this file format. Please check the file and try again.');

  return parsed
    .filter((it) => it.itemName && (Number(it.totalAmount) > 0 || Number(it.unitPrice) > 0))
    .map((it, i) => {
      const qty         = Number(it.quantity)    || 1;
      const unitPrice   = Number(it.unitPrice)   || 0;
      const totalAmount = Number(it.totalAmount) || qty * unitPrice;
      return {
        _id:         i + 1,
        _selected:   true,
        itemName:    String(it.itemName ?? '').trim(),
        category:    String(it.category ?? 'Food').trim(),
        quantity:    qty,
        unitPrice,
        totalAmount,
        date:        String(it.date ?? '').trim(),
        paymentMode: normaliseSalesPaymentMode(it.paymentMode),
        gstAmount:   Number(it.gstAmount) || 0,
      };
    });
}

function normaliseSalesPaymentMode(raw) {
  if (!raw) return 'Cash';
  const s = String(raw).toLowerCase();
  if (s.includes('card') || s.includes('credit') || s.includes('debit')) return 'Card';
  if (s.includes('upi') || s.includes('gpay') || s.includes('paytm') || s.includes('phone') || s.includes('online')) return 'UPI';
  return 'Cash';
}

// ─── internal helpers ────────────────────────────────────────────────────────

async function callGeminiAndParse(parts) {
  const res = await fetch(`${ENDPOINT}?key=${API_KEY}`, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify({
      contents:         [{ parts }],
      generationConfig: { temperature: 0.1, maxOutputTokens: 4096 },
    }),
  });

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error?.message ?? `Gemini API error ${res.status}`);
  }

  const data = await res.json();
  const raw  = data.candidates?.[0]?.content?.parts?.[0]?.text ?? '';
  return parseMenuJson(raw);
}

function parseMenuJson(raw) {
  let parsed;
  try {
    parsed = JSON.parse(cleanJSON(raw));
  } catch {
    throw new Error('AI could not read this file format. Please check the file and try again.');
  }

  if (!Array.isArray(parsed)) throw new Error('AI could not read this file format. Please check the file and try again.');

  return parsed
    .filter((it) => it.itemName)
    .map((it, i) => ({
      _id:          i + 1,
      itemName:     String(it.itemName ?? '').trim(),
      category:     normaliseCategory(it.category),
      sellingPrice: Number(it.sellingPrice) || 0,
      gstRate:      5,
      description:  String(it.description ?? '').trim(),
    }));
}

const VALID_CATS = ['Food', 'Beverage', 'Dessert', 'Extras', 'Specials'];
function normaliseCategory(raw) {
  if (!raw) return 'Food';
  const lower = String(raw).toLowerCase();
  const match = VALID_CATS.find((c) => c.toLowerCase() === lower);
  if (match) return match;
  if (lower.includes('drink') || lower.includes('bev')) return 'Beverage';
  if (lower.includes('dessert') || lower.includes('sweet')) return 'Dessert';
  return 'Food';
}

function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload  = () => resolve(reader.result.split(',')[1]);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}
