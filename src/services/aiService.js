const GEMINI_API_URL =
  'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent';

const SYSTEM_INSTRUCTION = `You are SmartBooks AI, an intelligent accounting assistant for Indian F&B businesses. You have access to real business data provided to you. Always respond in a friendly, concise way. Format currency as ₹. When sales are ₹0, don't just say ₹0 — explain possible reasons and suggest actions. Always give actionable insights, not just raw numbers. If data shows low sales, suggest checking if entries are recorded correctly. Respond in 3-5 lines maximum unless a detailed report is asked.`;

function apiKey() {
  return import.meta.env.VITE_GEMINI_API_KEY ?? '';
}

async function callGemini(contents, systemInstruction = SYSTEM_INSTRUCTION) {
  const res = await fetch(`${GEMINI_API_URL}?key=${apiKey()}`, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify({
      system_instruction: { parts: [{ text: systemInstruction }] },
      contents,
    }),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err?.error?.message ?? `Gemini API error ${res.status}`);
  }

  const data = await res.json();
  return data.candidates?.[0]?.content?.parts?.[0]?.text ?? '';
}

// ─── Ask Your Books: streaming chat ──────────────────────────────────────────
// messages: [{role, content}] conversation history (role: "user" | "assistant")
// businessContext: plain-text summary of aggregated Firestore data
// onDelta: called with each text chunk as it streams in
// onComplete: called with the final complete text
export async function streamChat(messages, businessContext, onDelta, onComplete) {
  // Build Gemini contents array; Gemini uses "model" instead of "assistant"
  const contents = messages.map((m) => ({
    role:  m.role === 'assistant' ? 'model' : 'user',
    parts: [{ text: m.content }],
  }));

  // Append context to the last user message
  if (contents.length > 0 && contents[contents.length - 1].role === 'user') {
    const contextNote = `\n\n[Business data context]\n${businessContext}`;
    const last = contents[contents.length - 1];
    contents[contents.length - 1] = {
      ...last,
      parts: [{ text: last.parts[0].text + contextNote }],
    };
  }

  const fullText = await callGemini(contents);
  onDelta(fullText);
  onComplete(fullText);
  return fullText;
}

// ─── Expense Anomaly Alert ────────────────────────────────────────────────────
// anomalies: [{category, thisMonth, avgLast3, pctIncrease}]
// Returns plain-English explanation string.
export async function explainExpenseAnomalies(anomalies) {
  const lines = anomalies.map(
    (a) =>
      `- ${a.category}: this month ₹${a.thisMonth.toFixed(2)}, 3-month avg ₹${a.avgLast3.toFixed(2)} (+${a.pctIncrease.toFixed(0)}%)`,
  );

  const prompt = `My F&B business has these expense anomalies this month (categories where spending is 20%+ above the 3-month average):\n${lines.join('\n')}\n\nWrite a short, plain-English explanation (3-4 sentences) of what might be causing these anomalies and what action I should consider.`;

  return callGemini([{ role: 'user', parts: [{ text: prompt }] }]);
}

// ─── AI Monthly Summary ───────────────────────────────────────────────────────
// summaryData: { month, totalSales, totalPurchases, totalExpenses, profit,
//               topItem, topCategory, salesTrend, expenseBreakdown }
// Returns a 5-line plain-English summary.
export async function generateMonthlySummary(summaryData) {
  const {
    month,
    totalSales,
    totalPurchases,
    totalExpenses,
    profit,
    topItem,
    topCategory,
    salesTrend,
    expenseBreakdown,
  } = summaryData;

  const expenseLines = expenseBreakdown
    ?.map((e) => `  • ${e.category}: ₹${e.total.toFixed(2)}`)
    .join('\n');

  const prompt = `Generate a 5-line plain-English business summary for ${month} using this data:
- Total Sales: ₹${totalSales.toFixed(2)}
- Total Purchases: ₹${totalPurchases.toFixed(2)}
- Total Expenses: ₹${totalExpenses.toFixed(2)}
- Net Profit/Loss: ₹${profit.toFixed(2)} (${profit >= 0 ? 'profit' : 'loss'})
- Top Selling Item: ${topItem ?? 'N/A'}
- Top Expense Category: ${topCategory ?? 'N/A'}
- Sales Trend vs Prior Month: ${salesTrend ?? 'N/A'}
- Expense Breakdown:\n${expenseLines ?? '  N/A'}

Write exactly 5 lines. Cover: (1) sales performance, (2) top-selling item, (3) biggest expense or cost pressure, (4) profit/loss status, (5) one actionable recommendation.`;

  return callGemini([{ role: 'user', parts: [{ text: prompt }] }]);
}
