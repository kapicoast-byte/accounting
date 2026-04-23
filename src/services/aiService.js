import Anthropic from '@anthropic-ai/sdk';

const client = new Anthropic({
  apiKey: import.meta.env.VITE_ANTHROPIC_API_KEY,
  dangerouslyAllowBrowser: true,
});

const MODEL = 'claude-sonnet-4-6';

const SYSTEM_PROMPT = [
  {
    type: 'text',
    text: `You are SmartBooks AI, a friendly financial assistant for an F&B (food & beverage) business accounting app.
You help business owners understand their finances in plain, simple language — no jargon.
Always be concise, specific to the numbers provided, and actionable.
When amounts are mentioned, format them as Indian Rupees (₹).
Never make up data that wasn't provided to you.`,
    cache_control: { type: 'ephemeral' },
  },
];

// ─── Ask Your Books: streaming chat ──────────────────────────────────────────
// businessContext: plain-text summary of aggregated Firestore data
// messages: [{role, content}] conversation history
// onDelta: called with each text chunk as it streams in
// onComplete: called with the final complete text
export async function streamChat(messages, businessContext, onDelta, onComplete) {
  const systemWithContext = [
    ...SYSTEM_PROMPT,
    {
      type: 'text',
      text: `Here is the current business data context:\n\n${businessContext}`,
    },
  ];

  const stream = await client.messages.stream({
    model: MODEL,
    max_tokens: 1024,
    system: systemWithContext,
    messages,
  });

  let fullText = '';
  for await (const chunk of stream) {
    if (
      chunk.type === 'content_block_delta' &&
      chunk.delta.type === 'text_delta'
    ) {
      fullText += chunk.delta.text;
      onDelta(chunk.delta.text);
    }
  }

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

  const userMessage = `My F&B business has these expense anomalies this month (categories where spending is 20%+ above the 3-month average):\n${lines.join('\n')}\n\nWrite a short, plain-English explanation (3-4 sentences) of what might be causing these anomalies and what action I should consider.`;

  const response = await client.messages.create({
    model: MODEL,
    max_tokens: 512,
    system: SYSTEM_PROMPT,
    messages: [{ role: 'user', content: userMessage }],
  });

  return response.content[0]?.text ?? '';
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

  const userMessage = `Generate a 5-line plain-English business summary for ${month} using this data:
- Total Sales: ₹${totalSales.toFixed(2)}
- Total Purchases: ₹${totalPurchases.toFixed(2)}
- Total Expenses: ₹${totalExpenses.toFixed(2)}
- Net Profit/Loss: ₹${profit.toFixed(2)} (${profit >= 0 ? 'profit' : 'loss'})
- Top Selling Item: ${topItem ?? 'N/A'}
- Top Expense Category: ${topCategory ?? 'N/A'}
- Sales Trend vs Prior Month: ${salesTrend ?? 'N/A'}
- Expense Breakdown:\n${expenseLines ?? '  N/A'}

Write exactly 5 lines. Cover: (1) sales performance, (2) top-selling item, (3) biggest expense or cost pressure, (4) profit/loss status, (5) one actionable recommendation.`;

  const response = await client.messages.create({
    model: MODEL,
    max_tokens: 512,
    system: SYSTEM_PROMPT,
    messages: [{ role: 'user', content: userMessage }],
  });

  return response.content[0]?.text ?? '';
}
