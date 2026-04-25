import { useMemo, useState } from 'react';
import { computeInvoiceTotals, PAYMENT_MODES } from '../../services/saleService';
import { MENU_CATEGORIES } from '../../services/menuItemService';
import { formatCurrency } from '../../utils/format';

const ORDER_TYPES = ['Dine In', 'Takeaway', 'Delivery'];

// Category order for tabs — follows MENU_CATEGORIES order
function sortedCategories(map) {
  return Object.keys(map).sort((a, b) => {
    const ai = MENU_CATEGORIES.findIndex((c) => c.toLowerCase() === a.toLowerCase());
    const bi = MENU_CATEGORIES.findIndex((c) => c.toLowerCase() === b.toLowerCase());
    return (ai === -1 ? 99 : ai) - (bi === -1 ? 99 : bi);
  });
}

// Build ingredient deductions for a menu item sold at qty `saleQty`
function buildIngredientDeductions(menuItem, recipes) {
  if (!menuItem.linkedRecipeId) return null;
  const recipe = recipes.find((r) => r.recipeId === menuItem.linkedRecipeId);
  if (!recipe?.ingredients?.length) return null;
  return recipe.ingredients
    .filter((ing) => ing.itemId)
    .map((ing) => ({
      itemId:   ing.itemId,
      itemName: ing.itemName,
      qty:      (Number(ing.qty) || 0),   // per-unit qty; multiplied by saleQty at line-item build time
      unit:     ing.unit ?? '',
    }));
}

export default function FnbBillingPanel({ menuItems, recipes, onSubmit, submitting, error }) {
  // Build menu grouped by category, sorted by displayOrder within each category.
  // Only available items appear as active; unavailable items are shown greyed-out.
  const menu = useMemo(() => {
    const sorted = [...menuItems].sort(
      (a, b) => (a.displayOrder ?? 0) - (b.displayOrder ?? 0),
    );
    return sorted.reduce((acc, item) => {
      const cat = item.category ?? 'Other';
      if (!acc[cat]) acc[cat] = [];
      acc[cat].push(item);
      return acc;
    }, {});
  }, [menuItems]);

  const categories = sortedCategories(menu);

  const [activeCategory, setActiveCategory] = useState(() => categories[0] ?? '');
  const [order, setOrder]                   = useState({}); // menuItemId → { item, qty }
  const [tableNumber, setTableNumber]       = useState('');
  const [orderType, setOrderType]           = useState(ORDER_TYPES[0]);
  const [paymentMode, setPaymentMode]       = useState('Cash');
  const [discountValue, setDiscountValue]   = useState('0');
  const [notes, setNotes]                   = useState('');
  const [customerName, setCustomerName]     = useState('');

  function qty(id) { return order[id]?.qty ?? 0; }

  function setQty(item, delta) {
    if (!item.isAvailable) return;
    setOrder((prev) => {
      const cur  = prev[item.menuItemId]?.qty ?? 0;
      const next = Math.max(0, cur + delta);
      if (next === 0) {
        const { [item.menuItemId]: _, ...rest } = prev;
        return rest;
      }
      return { ...prev, [item.menuItemId]: { item, qty: next } };
    });
  }

  const orderEntries = Object.values(order).filter((e) => e.qty > 0);

  // Build line items with ingredient deductions attached
  const lineItems = useMemo(
    () =>
      orderEntries.map((e) => {
        const perUnitDeductions = buildIngredientDeductions(e.item, recipes);
        return {
          itemId:    'custom',
          itemName:  e.item.itemName,
          unit:      e.item.unit ?? 'portion',
          quantity:  e.qty,
          unitPrice: Number(e.item.sellingPrice) || 0,
          gstRate:   Number(e.item.gstRate) || 0,
          // Pre-multiply ingredient qty by sale qty so createSale can aggregate without needing qty context
          ingredientDeductions: perUnitDeductions
            ? perUnitDeductions.map((d) => ({ ...d, qty: d.qty * e.qty }))
            : [],
        };
      }),
    [order, recipes], // eslint-disable-line react-hooks/exhaustive-deps
  );

  const totals = useMemo(
    () => computeInvoiceTotals({ lineItems, discountType: 'flat', discountValue }),
    [lineItems, discountValue],
  );

  function printKot() {
    const win = window.open('', '_blank', 'width=400,height=600');
    if (!win) return;
    const now  = new Date().toLocaleString('en-IN');
    const rows = orderEntries
      .map((e) => `<tr><td>${e.item.itemName}</td><td style="text-align:right">${e.qty}</td></tr>`)
      .join('');
    win.document.write(`
      <!DOCTYPE html><html><head>
        <title>KOT</title>
        <style>
          body { font-family: monospace; font-size: 13px; margin: 16px; }
          h2 { text-align: center; font-size: 16px; }
          .meta { margin-bottom: 12px; font-size: 12px; }
          table { width: 100%; border-collapse: collapse; }
          th, td { padding: 4px 0; vertical-align: top; }
          th { border-bottom: 1px solid #000; }
          hr { border: none; border-top: 1px dashed #000; margin: 12px 0; }
        </style>
      </head><body>
        <h2>Kitchen Order Ticket</h2>
        <hr>
        <div class="meta">
          <div>Type: <b>${orderType}</b></div>
          ${tableNumber ? `<div>Table: <b>${tableNumber}</b></div>` : ''}
          ${customerName ? `<div>Customer: <b>${customerName}</b></div>` : ''}
          <div>Time: ${now}</div>
        </div>
        <hr>
        <table>
          <thead><tr><th>Item</th><th style="text-align:right">Qty</th></tr></thead>
          <tbody>${rows}</tbody>
        </table>
        <hr>
        ${notes ? `<div style="font-size:12px">Notes: ${notes}</div>` : ''}
      </body></html>
    `);
    win.document.close();
    win.focus();
    win.print();
  }

  async function handleSave() {
    if (orderEntries.length === 0) return;
    const today = new Date().toISOString().slice(0, 10);
    await onSubmit({
      customer:     { name: customerName || 'Walk-in Customer', phone: '', address: '', GSTIN: '' },
      lineItems,
      discountType:  'flat',
      discountValue,
      paymentMode,
      date:          today,
      dueDate:       null,
      notes,
      tableNumber:   tableNumber || null,
      orderType,
    });
  }

  const hasOrder = orderEntries.length > 0;

  return (
    <div className="flex h-full gap-0 rounded-xl border border-gray-200 bg-white overflow-hidden" style={{ minHeight: '70vh' }}>
      {/* ── LEFT: Menu panel ── */}
      <div className="flex flex-col flex-1 min-w-0 border-r border-gray-200">
        {/* Category tabs */}
        <div className="flex gap-0 border-b border-gray-200 overflow-x-auto">
          {categories.map((cat) => (
            <button
              key={cat}
              type="button"
              onClick={() => setActiveCategory(cat)}
              className={`flex-shrink-0 px-4 py-3 text-sm font-medium border-b-2 -mb-px transition ${
                activeCategory === cat
                  ? 'border-blue-600 text-blue-600'
                  : 'border-transparent text-gray-500 hover:text-gray-800'
              }`}
            >
              {cat}
            </button>
          ))}
        </div>

        {/* Menu items grid */}
        <div className="flex-1 overflow-y-auto p-4">
          {categories.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-40 gap-2 text-gray-400 text-sm">
              <p>No menu items yet.</p>
              <p className="text-xs">Go to F&amp;B Ops → Menu Master to add items.</p>
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              {(menu[activeCategory] ?? []).map((item) => {
                const q           = qty(item.menuItemId);
                const unavailable = !item.isAvailable;
                return (
                  <div
                    key={item.menuItemId}
                    className={`rounded-lg border p-3 flex flex-col gap-2 transition ${
                      unavailable
                        ? 'border-gray-100 bg-gray-50 opacity-50 cursor-not-allowed'
                        : q > 0
                        ? 'border-blue-400 bg-blue-50'
                        : 'border-gray-200 bg-white hover:border-gray-300'
                    }`}
                  >
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-gray-900 text-sm leading-tight truncate">{item.itemName}</p>
                      <p className="text-xs text-gray-500 mt-0.5">
                        {formatCurrency(Number(item.sellingPrice) || 0)} / {item.unit ?? 'portion'}
                      </p>
                      {item.description && (
                        <p className="text-[10px] text-gray-400 mt-0.5 leading-tight line-clamp-2">{item.description}</p>
                      )}
                      {unavailable && (
                        <p className="text-[10px] text-red-400 mt-1 font-medium">Unavailable</p>
                      )}
                    </div>
                    {!unavailable && (
                      <div className="flex items-center justify-between">
                        {q === 0 ? (
                          <button
                            type="button"
                            onClick={() => setQty(item, 1)}
                            className="w-full rounded-md bg-blue-600 py-1 text-xs font-semibold text-white hover:bg-blue-700 transition"
                          >
                            + Add
                          </button>
                        ) : (
                          <div className="flex items-center gap-2 w-full justify-center">
                            <button type="button" onClick={() => setQty(item, -1)}
                              className="h-7 w-7 rounded-full border border-gray-300 text-gray-700 hover:bg-gray-100 font-bold text-sm flex items-center justify-center">
                              −
                            </button>
                            <span className="text-sm font-bold text-blue-700 w-5 text-center">{q}</span>
                            <button type="button" onClick={() => setQty(item, 1)}
                              className="h-7 w-7 rounded-full bg-blue-600 text-white hover:bg-blue-700 font-bold text-sm flex items-center justify-center">
                              +
                            </button>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* ── RIGHT: Order summary ── */}
      <div className="w-72 flex-shrink-0 flex flex-col">
        {/* Order meta */}
        <div className="border-b border-gray-200 p-4 space-y-3">
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="block text-xs text-gray-500 mb-1">Table #</label>
              <input
                type="text"
                placeholder="e.g. T4"
                className="w-full rounded border border-gray-300 px-2 py-1.5 text-sm"
                value={tableNumber}
                onChange={(e) => setTableNumber(e.target.value)}
              />
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">Order Type</label>
              <select
                className="w-full rounded border border-gray-300 px-2 py-1.5 text-sm"
                value={orderType}
                onChange={(e) => setOrderType(e.target.value)}
              >
                {ORDER_TYPES.map((t) => <option key={t}>{t}</option>)}
              </select>
            </div>
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">Customer (optional)</label>
            <input
              type="text"
              placeholder="Walk-in Customer"
              className="w-full rounded border border-gray-300 px-2 py-1.5 text-sm"
              value={customerName}
              onChange={(e) => setCustomerName(e.target.value)}
            />
          </div>
        </div>

        {/* Order items */}
        <div className="flex-1 overflow-y-auto p-4">
          {orderEntries.length === 0 ? (
            <p className="text-xs text-gray-400 text-center py-8">No items added yet</p>
          ) : (
            <div className="space-y-2">
              {orderEntries.map((e) => (
                <div key={e.item.menuItemId} className="flex items-center justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-medium text-gray-800 truncate">{e.item.itemName}</p>
                    <p className="text-xs text-gray-400">
                      {formatCurrency(Number(e.item.sellingPrice))} × {e.qty}
                    </p>
                  </div>
                  <div className="flex items-center gap-1.5 flex-shrink-0">
                    <button type="button" onClick={() => setQty(e.item, -1)}
                      className="h-5 w-5 rounded border border-gray-300 text-xs flex items-center justify-center text-gray-600 hover:bg-gray-100">−</button>
                    <span className="text-xs font-bold w-4 text-center">{e.qty}</span>
                    <button type="button" onClick={() => setQty(e.item, 1)}
                      className="h-5 w-5 rounded bg-blue-600 text-white text-xs flex items-center justify-center hover:bg-blue-700">+</button>
                  </div>
                  <p className="text-xs font-semibold text-gray-900 w-14 text-right flex-shrink-0">
                    {formatCurrency(Number(e.item.sellingPrice) * e.qty)}
                  </p>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Totals + actions */}
        <div className="border-t border-gray-200 p-4 space-y-3">
          <div>
            <label className="block text-xs text-gray-500 mb-1">Discount (₹)</label>
            <input
              type="number" min="0" step="0.01"
              className="w-full rounded border border-gray-300 px-2 py-1.5 text-sm"
              value={discountValue}
              onChange={(e) => setDiscountValue(e.target.value)}
            />
          </div>

          <dl className="text-sm space-y-1">
            <div className="flex justify-between text-gray-500">
              <dt>Subtotal</dt>
              <dd>{formatCurrency(totals.subtotal)}</dd>
            </div>
            <div className="flex justify-between text-gray-500">
              <dt>GST</dt>
              <dd>{formatCurrency(totals.totalGST)}</dd>
            </div>
            {totals.discountAmount > 0 && (
              <div className="flex justify-between text-red-500">
                <dt>Discount</dt>
                <dd>− {formatCurrency(totals.discountAmount)}</dd>
              </div>
            )}
            <div className="flex justify-between font-bold text-gray-900 text-base pt-1 border-t border-gray-200">
              <dt>Total</dt>
              <dd className="text-blue-700">{formatCurrency(totals.grandTotal)}</dd>
            </div>
          </dl>

          <div>
            <label className="block text-xs text-gray-500 mb-1">Payment</label>
            <div className="flex flex-wrap gap-2">
              {PAYMENT_MODES.map((m) => (
                <label key={m} className="flex items-center gap-1 text-xs text-gray-700 cursor-pointer">
                  <input type="radio" name="fnb-payment" value={m}
                    checked={paymentMode === m} onChange={() => setPaymentMode(m)} />
                  {m}
                </label>
              ))}
            </div>
          </div>

          <div>
            <label className="block text-xs text-gray-500 mb-1">Notes</label>
            <textarea
              rows={2}
              className="w-full rounded border border-gray-300 px-2 py-1.5 text-xs resize-none"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
          </div>

          {error && <p className="text-xs text-red-600 rounded bg-red-50 p-2">{error}</p>}

          <div className="flex gap-2">
            <button
              type="button"
              onClick={printKot}
              disabled={!hasOrder}
              className="flex-1 rounded-md border border-gray-300 py-2 text-xs font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-40"
            >
              Print KOT
            </button>
            <button
              type="button"
              onClick={handleSave}
              disabled={!hasOrder || submitting}
              className="flex-1 rounded-md bg-blue-600 py-2 text-xs font-semibold text-white hover:bg-blue-700 disabled:opacity-40"
            >
              {submitting ? 'Saving…' : 'Save Bill'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
