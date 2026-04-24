import { useState } from 'react';
import { GST_RATES } from '../../services/saleService';
import { formatCurrency } from '../../utils/format';

const CUSTOM_ID = 'custom';

let _seq = 0;
export function newLineItem(overrides = {}) {
  return { _id: ++_seq, itemId: '', itemName: '', unit: 'piece', quantity: 1, unitPrice: 0, gstRate: 5, ...overrides };
}

export function newServiceLineItem() {
  return { _id: ++_seq, itemId: CUSTOM_ID, itemName: '', unit: 'hour', quantity: 1, unitPrice: 0, gstRate: 18, _rateType: 'fixed', _hours: '', _rate: '' };
}

// ── Retail mode: barcode / name search header ───────────────────────────────

function RetailSearchBar({ inventoryItems, onAdd }) {
  const [q, setQ] = useState('');

  function handleSearch(e) {
    const val = e.target.value;
    setQ(val);
    if (!val) return;

    // Try barcode match first
    const byBarcode = inventoryItems.find(
      (it) => it.barcode && it.barcode.toLowerCase() === val.toLowerCase(),
    );
    if (byBarcode) {
      onAdd(byBarcode);
      setQ('');
    }
  }

  const suggestions = q.trim()
    ? inventoryItems.filter((it) =>
        it.itemName.toLowerCase().includes(q.toLowerCase()) ||
        (it.barcode && it.barcode.toLowerCase().includes(q.toLowerCase())),
      ).slice(0, 6)
    : [];

  return (
    <div className="relative mb-3">
      <input
        type="text"
        placeholder="Search item by name or scan barcode…"
        value={q}
        onChange={handleSearch}
        className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-500"
      />
      {suggestions.length > 0 && (
        <div className="absolute top-full left-0 right-0 z-10 mt-1 rounded-md border border-gray-200 bg-white shadow-lg">
          {suggestions.map((it) => (
            <button
              key={it.itemId}
              type="button"
              onClick={() => { onAdd(it); setQ(''); }}
              className="flex w-full items-center justify-between px-3 py-2 text-sm hover:bg-gray-50 text-left"
            >
              <span className="font-medium text-gray-900">{it.itemName}</span>
              <span className="text-xs text-gray-500 ml-2">{formatCurrency(it.sellingPrice)} / {it.unit}{it.barcode ? ` · ${it.barcode}` : ''}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Main component ─────────────────────────────────────────────────────────

export default function LineItemEditor({ items, inventoryItems = [], onChange, mode = 'standard' }) {
  function update(id, patch) {
    onChange(items.map((l) => (l._id === id ? { ...l, ...patch } : l)));
  }

  function remove(id) {
    onChange(items.filter((l) => l._id !== id));
  }

  function selectInventoryItem(line, inventoryId) {
    if (!inventoryId) {
      update(line._id, { itemId: '', itemName: '', unit: 'piece', unitPrice: 0 });
      return;
    }
    if (inventoryId === CUSTOM_ID) {
      update(line._id, { itemId: CUSTOM_ID, itemName: '', unit: 'piece', unitPrice: 0 });
      return;
    }
    const inv = inventoryItems.find((i) => i.itemId === inventoryId);
    if (!inv) return;
    update(line._id, {
      itemId: inv.itemId,
      itemName: inv.itemName,
      unit: inv.unit,
      unitPrice: Number(inv.sellingPrice) || 0,
    });
  }

  function addFromSearch(inv) {
    const existing = items.find((l) => l.itemId === inv.itemId);
    if (existing) {
      update(existing._id, { quantity: Number(existing.quantity) + 1 });
    } else {
      onChange([
        ...items,
        newLineItem({
          itemId:    inv.itemId,
          itemName:  inv.itemName,
          unit:      inv.unit,
          unitPrice: Number(inv.sellingPrice) || 0,
        }),
      ]);
    }
  }

  // Services mode — auto-compute unitPrice from hours×rate
  function handleServiceRateChange(line, field, value) {
    const patch = { [field]: value };
    if (field === '_hours' || field === '_rate') {
      const hours = field === '_hours' ? Number(value) : Number(line._hours);
      const rate  = field === '_rate'  ? Number(value) : Number(line._rate);
      if (line._rateType === 'hourly' && Number.isFinite(hours) && Number.isFinite(rate)) {
        patch.unitPrice = rate;
        patch.quantity  = hours;
        patch.unit      = 'hour';
      }
    }
    if (field === '_rateType') {
      if (value === 'fixed') patch.unit = 'piece';
      if (value === 'hourly') patch.unit = 'hour';
    }
    update(line._id, patch);
  }

  if (mode === 'services') {
    return (
      <div className="space-y-3">
        {items.map((line) => {
          const isHourly = line._rateType === 'hourly';
          const sub      = Number(line.quantity) * Number(line.unitPrice);
          const gst      = (sub * Number(line.gstRate)) / 100;
          return (
            <div key={line._id} className="rounded-lg border border-gray-200 p-3 space-y-2">
              <div className="flex gap-2 items-start">
                <div className="flex-1">
                  <input
                    type="text"
                    placeholder="Service description"
                    value={line.itemName}
                    onChange={(e) => update(line._id, { itemName: e.target.value })}
                    className="w-full rounded border border-gray-300 px-2 py-1.5 text-sm"
                  />
                </div>
                <label className="flex items-center gap-1 text-xs text-gray-600 whitespace-nowrap pt-1.5 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={isHourly}
                    onChange={(e) => handleServiceRateChange(line, '_rateType', e.target.checked ? 'hourly' : 'fixed')}
                  />
                  Hourly
                </label>
                <button type="button" onClick={() => remove(line._id)} disabled={items.length === 1}
                  className="text-gray-400 hover:text-red-500 disabled:opacity-30 pt-1">
                  <svg className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
                    <path fillRule="evenodd" d="M8.75 1A2.75 2.75 0 006 3.75v.443c-.795.077-1.584.176-2.365.298a.75.75 0 10.23 1.482l.149-.022.841 10.518A2.75 2.75 0 007.596 19h4.807a2.75 2.75 0 002.742-2.53l.841-10.52.149.023a.75.75 0 00.23-1.482A41.03 41.03 0 0014 4.193V3.75A2.75 2.75 0 0011.25 1h-2.5zM10 4c.84 0 1.673.025 2.5.075V3.75c0-.69-.56-1.25-1.25-1.25h-2.5c-.69 0-1.25.56-1.25 1.25v.325C8.327 4.025 9.16 4 10 4zM8.58 7.72a.75.75 0 00-1.5.06l.3 7.5a.75.75 0 101.5-.06l-.3-7.5zm4.34.06a.75.75 0 10-1.5-.06l-.3 7.5a.75.75 0 101.5.06l.3-7.5z" clipRule="evenodd" />
                  </svg>
                </button>
              </div>

              <div className="grid grid-cols-4 gap-2">
                {isHourly ? (
                  <>
                    <div>
                      <p className="text-xs text-gray-500 mb-0.5">Hours</p>
                      <input type="number" min="0" step="0.5" value={line._hours}
                        onChange={(e) => handleServiceRateChange(line, '_hours', e.target.value)}
                        className="w-full rounded border border-gray-300 px-2 py-1.5 text-sm" />
                    </div>
                    <div>
                      <p className="text-xs text-gray-500 mb-0.5">Rate / hr</p>
                      <input type="number" min="0" step="0.01" value={line._rate}
                        onChange={(e) => handleServiceRateChange(line, '_rate', e.target.value)}
                        className="w-full rounded border border-gray-300 px-2 py-1.5 text-sm" />
                    </div>
                  </>
                ) : (
                  <>
                    <div>
                      <p className="text-xs text-gray-500 mb-0.5">Qty</p>
                      <input type="number" min="0" step="0.01" value={line.quantity}
                        onChange={(e) => update(line._id, { quantity: e.target.value })}
                        className="w-full rounded border border-gray-300 px-2 py-1.5 text-sm" />
                    </div>
                    <div>
                      <p className="text-xs text-gray-500 mb-0.5">Unit price</p>
                      <input type="number" min="0" step="0.01" value={line.unitPrice}
                        onChange={(e) => update(line._id, { unitPrice: e.target.value })}
                        className="w-full rounded border border-gray-300 px-2 py-1.5 text-sm" />
                    </div>
                  </>
                )}
                <div>
                  <p className="text-xs text-gray-500 mb-0.5">GST %</p>
                  <select value={line.gstRate}
                    onChange={(e) => update(line._id, { gstRate: Number(e.target.value) })}
                    className="w-full rounded border border-gray-300 px-2 py-1.5 text-sm">
                    {GST_RATES.map((r) => <option key={r} value={r}>{r}%</option>)}
                  </select>
                </div>
                <div className="flex flex-col justify-end">
                  <p className="text-xs text-gray-500">Total</p>
                  <p className="text-sm font-semibold text-gray-900">{formatCurrency(sub + gst)}</p>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    );
  }

  // Standard / Retail mode
  return (
    <div>
      {mode === 'retail' && (
        <RetailSearchBar inventoryItems={inventoryItems} onAdd={addFromSearch} />
      )}
      <div className="overflow-x-auto rounded-lg border border-gray-200">
        <table className="w-full text-left text-sm">
          <thead className="bg-gray-50 text-xs uppercase tracking-wide text-gray-500">
            <tr>
              <th className="px-3 py-2 min-w-[200px]">Item</th>
              <th className="px-3 py-2">Unit</th>
              <th className="px-3 py-2 w-20">Qty</th>
              <th className="px-3 py-2 w-28">Unit price</th>
              <th className="px-3 py-2 w-24">GST %</th>
              <th className="px-3 py-2 w-28 text-right">Subtotal</th>
              <th className="px-3 py-2 w-24 text-right">GST</th>
              <th className="px-3 py-2 w-28 text-right">Total</th>
              <th className="px-3 py-2 w-8"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {items.map((line) => {
              const sub = Number(line.quantity) * Number(line.unitPrice);
              const gst = (sub * Number(line.gstRate)) / 100;
              const total = sub + gst;
              const isCustom = line.itemId === CUSTOM_ID;
              return (
                <tr key={line._id}>
                  <td className="px-3 py-2">
                    <select
                      value={line.itemId}
                      onChange={(e) => selectInventoryItem(line, e.target.value)}
                      className="mb-1 w-full rounded border border-gray-300 bg-white px-2 py-1 text-xs outline-none focus:ring-1 focus:ring-blue-500"
                    >
                      <option value="">— Select item —</option>
                      <option value={CUSTOM_ID}>Custom item</option>
                      <optgroup label="Inventory">
                        {inventoryItems.map((inv) => (
                          <option key={inv.itemId} value={inv.itemId}>
                            {inv.itemName} ({inv.unit})
                          </option>
                        ))}
                      </optgroup>
                    </select>
                    {isCustom && (
                      <input
                        type="text"
                        placeholder="Item name"
                        value={line.itemName}
                        onChange={(e) => update(line._id, { itemName: e.target.value })}
                        className="w-full rounded border border-gray-300 bg-white px-2 py-1 text-xs outline-none focus:ring-1 focus:ring-blue-500"
                      />
                    )}
                    {!isCustom && line.itemName && (
                      <span className="text-xs text-gray-500">{line.itemName}</span>
                    )}
                  </td>
                  <td className="px-3 py-2">
                    {isCustom ? (
                      <input
                        type="text"
                        value={line.unit}
                        onChange={(e) => update(line._id, { unit: e.target.value })}
                        className="w-16 rounded border border-gray-300 bg-white px-2 py-1 text-xs outline-none focus:ring-1 focus:ring-blue-500"
                      />
                    ) : (
                      <span className="text-xs text-gray-600">{line.unit}</span>
                    )}
                  </td>
                  <td className="px-3 py-2">
                    <input type="number" min="0.001" step="0.001" value={line.quantity}
                      onChange={(e) => update(line._id, { quantity: e.target.value })}
                      className="w-full rounded border border-gray-300 bg-white px-2 py-1 text-xs outline-none focus:ring-1 focus:ring-blue-500" />
                  </td>
                  <td className="px-3 py-2">
                    <input type="number" min="0" step="0.01" value={line.unitPrice}
                      onChange={(e) => update(line._id, { unitPrice: e.target.value })}
                      className="w-full rounded border border-gray-300 bg-white px-2 py-1 text-xs outline-none focus:ring-1 focus:ring-blue-500" />
                  </td>
                  <td className="px-3 py-2">
                    <select value={line.gstRate}
                      onChange={(e) => update(line._id, { gstRate: Number(e.target.value) })}
                      className="w-full rounded border border-gray-300 bg-white px-2 py-1 text-xs outline-none focus:ring-1 focus:ring-blue-500">
                      {GST_RATES.map((r) => <option key={r} value={r}>{r}%</option>)}
                    </select>
                  </td>
                  <td className="px-3 py-2 text-right text-xs text-gray-700">{formatCurrency(sub)}</td>
                  <td className="px-3 py-2 text-right text-xs text-gray-500">{formatCurrency(gst)}</td>
                  <td className="px-3 py-2 text-right text-xs font-medium text-gray-800">{formatCurrency(total)}</td>
                  <td className="px-3 py-2">
                    <button type="button" onClick={() => remove(line._id)} disabled={items.length === 1}
                      className="rounded p-0.5 text-gray-400 hover:text-red-500 disabled:opacity-30">
                      <svg className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
                        <path fillRule="evenodd" d="M8.75 1A2.75 2.75 0 006 3.75v.443c-.795.077-1.584.176-2.365.298a.75.75 0 10.23 1.482l.149-.022.841 10.518A2.75 2.75 0 007.596 19h4.807a2.75 2.75 0 002.742-2.53l.841-10.52.149.023a.75.75 0 00.23-1.482A41.03 41.03 0 0014 4.193V3.75A2.75 2.75 0 0011.25 1h-2.5zM10 4c.84 0 1.673.025 2.5.075V3.75c0-.69-.56-1.25-1.25-1.25h-2.5c-.69 0-1.25.56-1.25 1.25v.325C8.327 4.025 9.16 4 10 4zM8.58 7.72a.75.75 0 00-1.5.06l.3 7.5a.75.75 0 101.5-.06l-.3-7.5zm4.34.06a.75.75 0 10-1.5-.06l-.3 7.5a.75.75 0 101.5.06l.3-7.5z" clipRule="evenodd" />
                      </svg>
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
