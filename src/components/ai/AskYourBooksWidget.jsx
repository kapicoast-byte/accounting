import { useState, useRef, useEffect } from 'react';
import { streamChat } from '../../services/aiService';

// Formats aggregated dashboard + extra data into a plain-text context block for Claude.
function buildBusinessContext(snapshot) {
  if (!snapshot) return 'No business data available yet.';
  const { todaysSales, todaysPurchases, receivables, payables, lowStock, topSelling, cashBank, weeklyChart } = snapshot;

  const topItems = (topSelling ?? [])
    .slice(0, 3)
    .map((i) => `${i.itemName} (${i.qty} units, ₹${i.amount?.toFixed(2)})`)
    .join(', ');

  const lowItems = (lowStock?.items ?? [])
    .slice(0, 5)
    .map((i) => `${i.name} (${i.quantity} left)`)
    .join(', ');

  const weekTotals = (weeklyChart ?? []).reduce(
    (acc, d) => ({ sales: acc.sales + d.sales, purchases: acc.purchases + d.purchases }),
    { sales: 0, purchases: 0 },
  );

  return [
    `Today's Sales: ₹${(todaysSales?.total ?? 0).toFixed(2)} (${todaysSales?.count ?? 0} invoices)`,
    `Today's Purchases: ₹${(todaysPurchases?.total ?? 0).toFixed(2)} (${todaysPurchases?.count ?? 0} bills)`,
    `Outstanding Receivables: ₹${(receivables?.total ?? 0).toFixed(2)} (${receivables?.count ?? 0} invoices)`,
    `Outstanding Payables: ₹${(payables?.total ?? 0).toFixed(2)} (${payables?.count ?? 0} bills)`,
    `Cash Balance: ₹${(cashBank?.cashTotal ?? 0).toFixed(2)}`,
    `Bank Balance: ₹${(cashBank?.bankTotal ?? 0).toFixed(2)}`,
    `Last 7 Days — Total Sales: ₹${weekTotals.sales.toFixed(2)}, Total Purchases: ₹${weekTotals.purchases.toFixed(2)}`,
    topItems ? `Top Selling Items This Month: ${topItems}` : '',
    lowItems ? `Low Stock Items: ${lowItems}` : '',
  ]
    .filter(Boolean)
    .join('\n');
}

function Message({ msg }) {
  const isUser = msg.role === 'user';
  return (
    <div className={`flex ${isUser ? 'justify-end' : 'justify-start'}`}>
      <div
        className={`max-w-[85%] rounded-2xl px-4 py-2.5 text-sm leading-relaxed whitespace-pre-wrap ${
          isUser
            ? 'bg-blue-600 text-white rounded-br-sm'
            : 'bg-gray-100 text-gray-800 rounded-bl-sm'
        }`}
      >
        {msg.content}
        {msg.streaming && (
          <span className="ml-1 inline-block h-3 w-0.5 animate-pulse bg-gray-400" />
        )}
      </div>
    </div>
  );
}

export default function AskYourBooksWidget({ dashboardSnapshot }) {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const bottomRef = useRef(null);
  const inputRef = useRef(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  useEffect(() => {
    if (open) {
      setTimeout(() => inputRef.current?.focus(), 100);
      if (messages.length === 0) {
        setMessages([
          {
            role: 'assistant',
            content: "Hi! I'm SmartBooks AI. Ask me anything about your business — sales, expenses, stock, receivables, and more.",
          },
        ]);
      }
    }
  }, [open]);

  async function handleSend() {
    const text = input.trim();
    if (!text || busy) return;

    const userMsg = { role: 'user', content: text };
    const historyForApi = [
      ...messages.filter((m) => !m.streaming).map((m) => ({ role: m.role, content: m.content })),
      userMsg,
    ];

    setMessages((prev) => [...prev, userMsg]);
    setInput('');
    setBusy(true);

    // placeholder streaming message
    setMessages((prev) => [...prev, { role: 'assistant', content: '', streaming: true }]);

    try {
      const context = buildBusinessContext(dashboardSnapshot);
      await streamChat(
        historyForApi,
        context,
        (delta) => {
          setMessages((prev) => {
            const copy = [...prev];
            const last = copy[copy.length - 1];
            if (last?.streaming) {
              copy[copy.length - 1] = { ...last, content: last.content + delta };
            }
            return copy;
          });
        },
        (fullText) => {
          setMessages((prev) => {
            const copy = [...prev];
            const last = copy[copy.length - 1];
            if (last?.streaming) {
              copy[copy.length - 1] = { role: 'assistant', content: fullText, streaming: false };
            }
            return copy;
          });
        },
      );
    } catch (err) {
      setMessages((prev) => {
        const copy = [...prev];
        const last = copy[copy.length - 1];
        if (last?.streaming) {
          copy[copy.length - 1] = {
            role: 'assistant',
            content: 'Sorry, I ran into an error. Please try again.',
            streaming: false,
          };
        }
        return copy;
      });
    } finally {
      setBusy(false);
    }
  }

  function handleKey(e) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  }

  return (
    <>
      {/* Floating button */}
      <button
        type="button"
        onClick={() => setOpen(true)}
        title="Ask Your Books"
        className="fixed bottom-6 right-6 z-50 flex h-14 w-14 items-center justify-center rounded-full bg-blue-600 text-white shadow-lg hover:bg-blue-700 transition-colors"
      >
        <svg viewBox="0 0 24 24" fill="currentColor" className="h-6 w-6">
          <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 15v-4H7l5-8v4h4l-5 8z" />
        </svg>
      </button>

      {/* Chat modal */}
      {open && (
        <div className="fixed inset-0 z-50 flex items-end justify-end p-4 sm:p-6">
          {/* Backdrop */}
          <div
            className="absolute inset-0 bg-black/20"
            onClick={() => setOpen(false)}
          />

          {/* Panel */}
          <div className="relative flex w-full max-w-md flex-col rounded-2xl bg-white shadow-2xl"
            style={{ height: '520px' }}
          >
            {/* Header */}
            <div className="flex items-center justify-between rounded-t-2xl bg-blue-600 px-4 py-3 text-white">
              <div className="flex items-center gap-2">
                <svg viewBox="0 0 24 24" fill="currentColor" className="h-5 w-5">
                  <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 15v-4H7l5-8v4h4l-5 8z" />
                </svg>
                <span className="font-semibold">Ask Your Books</span>
              </div>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="rounded-md p-1 hover:bg-blue-500 transition"
              >
                <svg viewBox="0 0 20 20" fill="currentColor" className="h-5 w-5">
                  <path d="M6.28 5.22a.75.75 0 00-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 101.06 1.06L10 11.06l3.72 3.72a.75.75 0 101.06-1.06L11.06 10l3.72-3.72a.75.75 0 00-1.06-1.06L10 8.94 6.28 5.22z" />
                </svg>
              </button>
            </div>

            {/* Messages */}
            <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-3">
              {messages.map((msg, i) => (
                <Message key={i} msg={msg} />
              ))}
              <div ref={bottomRef} />
            </div>

            {/* Input */}
            <div className="border-t border-gray-100 p-3">
              <div className="flex items-end gap-2 rounded-xl border border-gray-200 bg-gray-50 px-3 py-2">
                <textarea
                  ref={inputRef}
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={handleKey}
                  rows={1}
                  placeholder="Ask about your sales, expenses, stock…"
                  disabled={busy}
                  className="flex-1 resize-none bg-transparent text-sm text-gray-800 placeholder-gray-400 outline-none disabled:opacity-50"
                  style={{ maxHeight: '96px' }}
                />
                <button
                  type="button"
                  onClick={handleSend}
                  disabled={!input.trim() || busy}
                  className="flex-shrink-0 rounded-lg bg-blue-600 p-1.5 text-white disabled:opacity-40 hover:bg-blue-700 transition"
                >
                  <svg viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4">
                    <path d="M3.105 2.289a.75.75 0 00-.826.95l1.903 6.557H13.5a.75.75 0 010 1.5H4.182l-1.903 6.557a.75.75 0 00.826.95 28.896 28.896 0 0015.293-7.154.75.75 0 000-1.115A28.897 28.897 0 003.105 2.289z" />
                  </svg>
                </button>
              </div>
              <p className="mt-1 text-center text-xs text-gray-400">Powered by Claude AI</p>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
