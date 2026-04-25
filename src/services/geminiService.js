const API_KEY  = import.meta.env.VITE_GEMINI_API_KEY;
const ENDPOINT = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent`;

const EXTRACT_PROMPT = `Extract all menu items from this content.
For each item return EXACTLY these fields:
- itemName: the name of the dish or drink
- category: exactly one of "Food", "Beverage", "Dessert", "Extras", "Specials"
- sellingPrice: price as a plain number (no currency symbols, no commas)
- description: short description if visible, otherwise empty string

Return ONLY a valid JSON array with no markdown, no explanation, no extra text.
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
  // Strip markdown code fences if Gemini wraps its output
  const cleaned = raw
    .replace(/^```json\s*/i, '')
    .replace(/^```\s*/i, '')
    .replace(/\s*```$/i, '')
    .trim();

  let parsed;
  try {
    parsed = JSON.parse(cleaned);
  } catch {
    // Try to extract just the JSON array from the response
    const match = cleaned.match(/\[[\s\S]*\]/);
    if (match) {
      try { parsed = JSON.parse(match[0]); } catch { /* fall through */ }
    }
    if (!parsed) throw new Error('Could not parse AI response. Please try again or use the text option.');
  }

  if (!Array.isArray(parsed)) throw new Error('AI returned unexpected format. Please try again.');

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
