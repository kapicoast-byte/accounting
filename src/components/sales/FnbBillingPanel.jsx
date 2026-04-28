import { useMemo, useState } from 'react';
import { computeInvoiceTotals, PAYMENT_MODES } from '../../services/saleService';
import { MENU_CATEGORIES } from '../../services/menuItemService';
import { formatCurrency } from '../../utils/format';

const ORDER_TYPES = ['Dine In', 'Takeaway', 'Delivery'];

function sortedCategories(map) {
  return Object.keys(map).sort((a, b) => {
    const ai = MENU_CATEGORIES.findIndex((c) => c.toLowerCase() === a.toLowerCase());
    const bi = MENU_CATEGORIES.findIndex((c) => c.toLowerCase() === b.toLowerCase());
    return (ai === -1 ? 99 : ai) - (bi === -1 ? 99 : bi);
  });
}

function buildIngredientDeductions(menuItem) {
  if (!menuItem.ingredients?.length) return null;
  return menuItem.ingredients
    .filter((ing) => ing.inventoryItemId)
    .map((ing) => ({
      itemId:   ing.inventoryItemId,
      itemName: ing.inventoryItemName,
      qty:      Number(ing.quantity) || 0,
      unit:     ing.unit ?? '',
    }));
}

export default function FnbBillingPanel({ menuItems, onSubmit, submitting, error }) {
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
  const [search, setSearch]                 = useState('');
  const [order, setOrder]                   = useState({});
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

  const lineItems = useMemo(
    () =>
      orderEntries.map((e) => {
        const perUnitDeductions = buildIngredientDeductions(e.item);
        return {
          itemId:    'custom',
          itemName:  e.item.itemName,
          unit:      e.item.unit ?? 'portion',
          quantity:  e.qty,
          unitPrice: Number(e.item.sellingPrice) || 0,
          gstRate:   Number(e.item.gstRate) || 0,
          ingredientDeductions: perUnitDeductions
            ? perUnitDeductions.map((d) => ({ ...d, qty: d.qty * e.qty }))
            : [],
        };
      }),
    [order], // eslint-disable-line react-hooks/exhaustive-deps
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

  // When searching, show results across all categories; otherwise show active category
  const displayItems = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return menu[activeCategory] ?? [];
    return Object.values(menu).flat().filter(
      (item) => item.itemName.toLowerCase().includes(q),
    );
  }, [menu, activeCategory, search]);

  return (
    <div className="flex overflow-hidden rounded-xl" style={{ minHeight: '80vh', background: '#111827' }}>

      {/* ── LEFT 60%: Menu panel ── */}
      <div className="flex flex-col" style={{ width: '60%', borderRight: '1px solid #1f2937' }}>

        {/* Search bar */}
        <div className="px-4 pt-4 pb-3" style={{ borderBottom: '1px solid #1f2937' }}>
          <input
            type="search"
            placeholder="Search menu…"
            className="w-full rounded-lg px-3 py-2 text-sm focus:outline-none"
            style={{
              background: '#1f2937',
              border: '1px solid #374151',
              color: '#f3f4f6',
            }}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>

        {/* Category tabs */}
        <div className="flex overflow-x-auto" style={{ borderBottom: '1px solid #1f2937', background: '#111827' }}>
          {categories.map((cat) => (
            <button
              key={cat}
              type="button"
              onClick={() => { setActiveCategory(cat); setSearch(''); }}
              className="flex-shrink-0 px-4 py-3 text-sm font-medium transition-colors"
              style={{
                borderBottom: activeCategory === cat && !search ? '2px solid #10b981' : '2px solid transparent',
                color: activeCategory === cat && !search ? '#34d399' : '#9ca3af',
                marginBottom: '-1px',
              }}
            >
              {cat}
            </button>
          ))}
        </div>

        {/* Menu items grid */}
        <div className="flex-1 overflow-y-auto p-4">
          {categories.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-40 gap-2 text-sm" style={{ color: '#6b7280' }}>
              <p>No menu items yet.</p>
              <p className="text-xs">Go to F&amp;B Ops → Menu Master to add items.</p>
            </div>
          ) : search && displayItems.length === 0 ? (
            <p className="text-sm text-center py-10" style={{ color: '#6b7280' }}>
              No items match &ldquo;{search}&rdquo;
            </p>
          ) : (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              {displayItems.map((item) => {
                const q           = qty(item.menuItemId);
                const unavailable = !item.isAvailable;
                return (
                  <div
                    key={item.menuItemId}
                    onClick={() => !unavailable && q === 0 && setQty(item, 1)}
                    className="rounded-xl flex flex-col gap-2 transition-colors"
                    style={{
                      padding: '12px',
                      border: unavailable
                        ? '1px solid #1f2937'
                        : q > 0
                        ? '1px solid #10b981'
                        : '1px solid #374151',
                      background: unavailable
                        ? '#1f2937'
                        : q > 0
                        ? '#064e3b22'
                        : '#1f2937',
                      opacity: unavailable ? 0.45 : 1,
                      cursor: unavailable ? 'not-allowed' : q === 0 ? 'pointer' : 'default',
                    }}
                  >
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5 mb-0.5">
                        {item.isVeg === true  && <span className="flex-shrink-0 h-2.5 w-2.5 rounded-full" style={{ background: '#22c55e' }} title="Vegetarian" />}
                        {item.isVeg === false && <span className="flex-shrink-0 h-2.5 w-2.5 rounded-full" style={{ background: '#ef4444' }} title="Non-vegetarian" />}
                        <p className="font-semibold text-sm leading-tight truncate" style={{ color: '#f3f4f6' }}>{item.itemName}</p>
                      </div>
                      <p className="text-xs font-medium" style={{ color: '#34d399' }}>
                        {formatCurrency(Number(item.sellingPrice) || 0)}
                        <span className="font-normal" style={{ color: '#6b7280' }}> / {item.unit ?? 'portion'}</span>
                      </p>
                      {item.description && (
                        <p className="text-[10px] mt-0.5 leading-tight line-clamp-2" style={{ color: '#6b7280' }}>{item.description}</p>
                      )}
                      {unavailable && (
                        <p className="text-[10px] mt-1 font-medium" style={{ color: '#f87171' }}>Unavailable</p>
                      )}
                    </div>

                    {!unavailable && (
                      <div className="flex items-center justify-center">
                        {q === 0 ? (
                          <button
                            type="button"
                            onClick={(ev) => { ev.stopPropagation(); setQty(item, 1); }}
                            className="w-full rounded-lg py-1.5 text-xs font-semibold text-white transition-colors"
                            style={{ background: '#059669' }}
                            onMouseEnter={(ev) => { ev.currentTarget.style.background = '#10b981'; }}
                            onMouseLeave={(ev) => { ev.currentTarget.style.background = '#059669'; }}
                          >
                            + Add
                          </button>
                        ) : (
                          <div className="flex items-center gap-2 w-full justify-between">
                            <button
                              type="button"
                              onClick={(ev) => { ev.stopPropagation(); setQty(item, -1); }}
                              className="h-7 w-7 rounded-full flex items-center justify-center font-bold text-sm transition-colors"
                              style={{ background: '#374151', border: '1px solid #4b5563', color: '#d1d5db' }}
                            >
                              −
                            </button>
                            <span className="text-sm font-bold w-5 text-center" style={{ color: '#34d399' }}>{q}</span>
                            <button
                              type="button"
                              onClick={(ev) => { ev.stopPropagation(); setQty(item, 1); }}
                              className="h-7 w-7 rounded-full flex items-center justify-center font-bold text-sm text-white transition-colors"
                              style={{ background: '#059669' }}
                            >
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

      {/* ── RIGHT 40%: Order summary ── */}
      <div className="flex flex-col" style={{ width: '40%', background: '#1f2937' }}>

        {/* Order meta */}
        <div className="p-4 space-y-3" style={{ borderBottom: '1px solid #374151' }}>
          <div className="flex gap-2">
            <div className="flex-1">
              <label className="block text-xs font-medium mb-1" style={{ color: '#9ca3af' }}>Table #</label>
              <input
                type="text"
                placeholder="e.g. T4"
                className="w-full rounded-lg px-3 py-2 text-sm focus:outline-none"
                style={{ background: '#374151', border: '1px solid #4b5563', color: '#f3f4f6' }}
                value={tableNumber}
                onChange={(e) => setTableNumber(e.target.value)}
              />
            </div>
            <div className="flex-1">
              <label className="block text-xs font-medium mb-1" style={{ color: '#9ca3af' }}>Customer</label>
              <input
                type="text"
                placeholder="Walk-in"
                className="w-full rounded-lg px-3 py-2 text-sm focus:outline-none"
                style={{ background: '#374151', border: '1px solid #4b5563', color: '#f3f4f6' }}
                value={customerName}
                onChange={(e) => setCustomerName(e.target.value)}
              />
            </div>
          </div>

          {/* Order type pill buttons */}
          <div>
            <label className="block text-xs font-medium mb-2" style={{ color: '#9ca3af' }}>Order Type</label>
            <div className="flex gap-1.5">
              {ORDER_TYPES.map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => setOrderType(t)}
                  className="flex-1 rounded-full py-1.5 text-xs font-semibold transition-colors"
                  style={{
                    background: orderType === t ? '#059669' : '#374151',
                    color: orderType === t ? '#ffffff' : '#9ca3af',
                  }}
                >
                  {t}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Order items list */}
        <div className="flex-1 overflow-y-auto p-4">
          {orderEntries.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full gap-3" style={{ color: '#4b5563' }}>
              <svg className="w-12 h-12 opacity-40" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                  d="M3 3h2l.4 2M7 13h10l4-8H5.4M7 13L5.4 5M7 13l-2.293 2.293c-.63.63-.184 1.707.707 1.707H17m0 0a2 2 0 100 4 2 2 0 000-4zm-8 2a2 2 0 11-4 0 2 2 0 014 0z" />
              </svg>
              <p className="text-sm" style={{ color: '#6b7280' }}>No items added yet</p>
            </div>
          ) : (
            <div className="space-y-0">
              {orderEntries.map((e) => (
                <div
                  key={e.item.menuItemId}
                  className="flex items-center gap-2 py-2.5"
                  style={{ borderBottom: '1px solid #374151' }}
                >
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-semibold truncate" style={{ color: '#f3f4f6' }}>{e.item.itemName}</p>
                    <p className="text-xs" style={{ color: '#6b7280' }}>
                      {formatCurrency(Number(e.item.sellingPrice))} × {e.qty}
                    </p>
                  </div>
                  <div className="flex items-center gap-1.5 flex-shrink-0">
                    <button
                      type="button"
                      onClick={() => setQty(e.item, -1)}
                      className="h-6 w-6 rounded-full flex items-center justify-center text-xs transition-colors"
                      style={{ background: '#374151', border: '1px solid #4b5563', color: '#d1d5db' }}
                    >
                      −
                    </button>
                    <span className="text-xs font-bold w-4 text-center" style={{ color: '#f3f4f6' }}>{e.qty}</span>
                    <button
                      type="button"
                      onClick={() => setQty(e.item, 1)}
                      className="h-6 w-6 rounded-full flex items-center justify-center text-xs text-white transition-colors"
                      style={{ background: '#059669' }}
                    >
                      +
                    </button>
                  </div>
                  <p className="text-xs font-bold w-14 text-right flex-shrink-0" style={{ color: '#34d399' }}>
                    {formatCurrency(Number(e.item.sellingPrice) * e.qty)}
                  </p>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Totals + payment + actions */}
        <div className="p-4 space-y-3" style={{ borderTop: '1px solid #374151' }}>

          {/* Discount */}
          <div className="flex items-center gap-3">
            <label className="text-xs font-medium whitespace-nowrap" style={{ color: '#9ca3af' }}>Discount (₹)</label>
            <input
              type="number" min="0" step="0.01"
              className="flex-1 rounded-lg px-2 py-1.5 text-sm focus:outline-none"
              style={{ background: '#374151', border: '1px solid #4b5563', color: '#f3f4f6' }}
              value={discountValue}
              onChange={(e) => setDiscountValue(e.target.value)}
            />
          </div>

          {/* Totals card */}
          <div className="rounded-xl p-3 space-y-1.5" style={{ background: '#111827' }}>
            <div className="flex justify-between text-xs" style={{ color: '#9ca3af' }}>
              <span>Subtotal</span>
              <span>{formatCurrency(totals.subtotal)}</span>
            </div>
            <div className="flex justify-between text-xs" style={{ color: '#9ca3af' }}>
              <span>GST</span>
              <span>{formatCurrency(totals.totalGST)}</span>
            </div>
            {totals.discountAmount > 0 && (
              <div className="flex justify-between text-xs" style={{ color: '#f87171' }}>
                <span>Discount</span>
                <span>− {formatCurrency(totals.discountAmount)}</span>
              </div>
            )}
            <div
              className="flex justify-between font-bold text-base pt-2 mt-1"
              style={{ borderTop: '1px solid #1f2937', color: '#f3f4f6' }}
            >
              <span>Total</span>
              <span style={{ color: '#34d399' }}>{formatCurrency(totals.grandTotal)}</span>
            </div>
          </div>

          {/* Payment mode toggle */}
          <div>
            <label className="block text-xs font-medium mb-1.5" style={{ color: '#9ca3af' }}>Payment</label>
            <div className="flex flex-wrap gap-1.5">
              {PAYMENT_MODES.map((m) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => setPaymentMode(m)}
                  className="rounded-full px-3 py-1 text-xs font-semibold transition-colors"
                  style={{
                    background: paymentMode === m ? '#059669' : '#374151',
                    color: paymentMode === m ? '#ffffff' : '#9ca3af',
                  }}
                >
                  {m}
                </button>
              ))}
            </div>
          </div>

          {/* Notes */}
          <div>
            <label className="block text-xs font-medium mb-1" style={{ color: '#9ca3af' }}>Notes</label>
            <textarea
              rows={2}
              className="w-full rounded-lg px-3 py-2 text-xs resize-none focus:outline-none"
              style={{ background: '#374151', border: '1px solid #4b5563', color: '#f3f4f6' }}
              placeholder="Special instructions…"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
          </div>

          {error && (
            <p className="text-xs rounded-lg p-2" style={{ background: '#450a0a44', border: '1px solid #7f1d1d', color: '#fca5a5' }}>
              {error}
            </p>
          )}

          {/* Action buttons */}
          <div className="flex gap-2 pt-1">
            <button
              type="button"
              onClick={printKot}
              disabled={!hasOrder}
              className="rounded-lg px-4 py-2.5 text-xs font-semibold transition-colors disabled:opacity-30"
              style={{ border: '1px solid #4b5563', color: '#d1d5db', background: 'transparent' }}
            >
              Print KOT
            </button>
            <button
              type="button"
              onClick={handleSave}
              disabled={!hasOrder || submitting}
              className="flex-1 rounded-lg py-2.5 text-sm font-bold text-white transition-colors disabled:opacity-30"
              style={{ background: '#059669', boxShadow: '0 4px 14px rgba(5,150,105,0.3)' }}
              onMouseEnter={(ev) => { if (!ev.currentTarget.disabled) ev.currentTarget.style.background = '#10b981'; }}
              onMouseLeave={(ev) => { ev.currentTarget.style.background = '#059669'; }}
            >
              {submitting ? 'Saving…' : 'Place Order'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
