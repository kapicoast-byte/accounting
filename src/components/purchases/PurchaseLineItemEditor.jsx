import { GST_RATES } from '../../services/saleService';
import { formatCurrency } from '../../utils/format';

const CUSTOM_ID = 'custom';

let _seq = 0;
export function newPurchaseLineItem() {
  return { _id: ++_seq, itemId: '', itemName: '', unit: 'piece', quantity: 1, unitPrice: 0, gstRate: 5 };
}

export default function PurchaseLineItemEditor({ items, inventoryItems, onChange }) {
  function update(id, patch) {
    onChange(items.map((l) => (l._id === id ? { ...l, ...patch } : l)));
  }
  function remove(id) {
    onChange(items.filter((l) => l._id !== id));
  }

  function selectItem(line, inventoryId) {
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
      unitPrice: Number(inv.costPrice) || 0, // cost price for purchases
    });
  }

  return (
    <div className="overflow-x-auto rounded-lg border border-gray-200">
      <table className="w-full text-left text-sm">
        <thead className="bg-gray-50 text-xs uppercase tracking-wide text-gray-500">
          <tr>
            <th className="px-3 py-2 min-w-[200px]">Item</th>
            <th className="px-3 py-2">Unit</th>
            <th className="px-3 py-2 w-20">Qty</th>
            <th className="px-3 py-2 w-28">Cost</th>
            <th className="px-3 py-2 w-24">GST %</th>
            <th className="px-3 py-2 w-28 text-right">Subtotal</th>
            <th className="px-3 py-2 w-24 text-right">GST in</th>
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
                  <select value={line.itemId}
                    onChange={(e) => selectItem(line, e.target.value)}
                    className="mb-1 w-full rounded border border-gray-300 bg-white px-2 py-1 text-xs outline-none focus:ring-1 focus:ring-blue-500">
                    <option value="">— Select item —</option>
                    <option value={CUSTOM_ID}>Custom item (no inventory)</option>
                    <optgroup label="Inventory">
                      {inventoryItems.map((inv) => (
                        <option key={inv.itemId} value={inv.itemId}>
                          {inv.itemName} ({inv.unit})
                        </option>
                      ))}
                    </optgroup>
                  </select>
                  {isCustom && (
                    <input type="text" placeholder="Item name" value={line.itemName}
                      onChange={(e) => update(line._id, { itemName: e.target.value })}
                      className="w-full rounded border border-gray-300 bg-white px-2 py-1 text-xs outline-none focus:ring-1 focus:ring-blue-500" />
                  )}
                  {!isCustom && line.itemName && (
                    <span className="text-xs text-gray-500">{line.itemName}</span>
                  )}
                </td>
                <td className="px-3 py-2">
                  {isCustom ? (
                    <input type="text" value={line.unit}
                      onChange={(e) => update(line._id, { unit: e.target.value })}
                      className="w-16 rounded border border-gray-300 bg-white px-2 py-1 text-xs outline-none focus:ring-1 focus:ring-blue-500" />
                  ) : <span className="text-xs text-gray-600">{line.unit}</span>}
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
                <td className="px-3 py-2 text-right text-xs text-green-600">{formatCurrency(gst)}</td>
                <td className="px-3 py-2 text-right text-xs font-medium text-gray-800">{formatCurrency(total)}</td>
                <td className="px-3 py-2">
                  <button type="button" onClick={() => remove(line._id)}
                    disabled={items.length === 1}
                    className="rounded p-0.5 text-gray-400 hover:text-red-500 disabled:opacity-30" aria-label="Remove line">
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
  );
}
