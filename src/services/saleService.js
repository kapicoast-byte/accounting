import {
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  where,
  orderBy,
  runTransaction,
  Timestamp,
  serverTimestamp,
} from 'firebase/firestore';
import { db } from './firebase';
import { buildJournalEntry, newJournalRef } from './journalService';
import { paymentModeToAccountId } from '../utils/accountConstants';

export const PAYMENT_MODES = ['Cash', 'Card', 'UPI', 'Credit'];
export const GST_RATES = [0, 5, 12, 18, 28];
export const SALE_STATUS = { PAID: 'paid', UNPAID: 'unpaid', PARTIAL: 'partial' };

// ─── helpers ────────────────────────────────────────────────────────────────

function salesCol(companyId) {
  return collection(db, 'companies', companyId, 'sales');
}
function adjustmentsCol(companyId) {
  return collection(db, 'companies', companyId, 'stockAdjustments');
}
function inventoryDocRef(companyId, itemId) {
  return doc(db, 'companies', companyId, 'inventory', itemId);
}
function counterDocRef(companyId) {
  return doc(db, 'companies', companyId, 'meta', 'invoiceCounter');
}

// ─── totals calculator (pure, used in both UI and service) ──────────────────

export function computeInvoiceTotals({ lineItems, discountType, discountValue }) {
  const subtotal = lineItems.reduce((s, l) => s + l.quantity * l.unitPrice, 0);
  const totalGST = lineItems.reduce(
    (s, l) => s + (l.quantity * l.unitPrice * l.gstRate) / 100,
    0,
  );
  const rawDiscount =
    discountType === 'percent'
      ? (subtotal * (Number(discountValue) || 0)) / 100
      : Number(discountValue) || 0;
  const discountAmount = Math.min(rawDiscount, subtotal);
  const grandTotal = Math.max(subtotal - discountAmount + totalGST, 0);
  return { subtotal, totalGST, discountAmount, grandTotal };
}

// ─── invoice number ──────────────────────────────────────────────────────────

function resolveNextInvoiceNumber(counterData, currentYear) {
  if (!counterData || counterData.year !== currentYear) {
    return { newCount: 1, year: currentYear };
  }
  return { newCount: (counterData.count ?? 0) + 1, year: currentYear };
}

function formatInvoiceNumber(year, count) {
  return `INV-${year}-${String(count).padStart(3, '0')}`;
}

// ─── create sale (transaction) ───────────────────────────────────────────────

export async function createSale(companyId, { customer, lineItems, discountType, discountValue, paymentMode, date, dueDate, notes, tableNumber, orderType }) {
  // Direct inventory deductions (standard sales — itemId is a real inventory doc)
  const inventoryLines = lineItems.filter((l) => l.itemId && l.itemId !== 'custom' && !l.ingredientDeductions?.length);

  // Recipe-based ingredient deductions (F&B menu items with linked recipe).
  // Each line may carry ingredientDeductions: [{ itemId, itemName, qty, unit }]
  // Merge deductions for the same ingredient across multiple lines.
  const ingDeductMap = {};
  lineItems.forEach((line) => {
    (line.ingredientDeductions ?? []).forEach((d) => {
      if (!d.itemId) return;
      if (ingDeductMap[d.itemId]) {
        ingDeductMap[d.itemId].qty += Number(d.qty) || 0;
      } else {
        ingDeductMap[d.itemId] = { itemId: d.itemId, itemName: d.itemName, qty: Number(d.qty) || 0, unit: d.unit ?? '' };
      }
    });
  });
  const ingDeductions = Object.values(ingDeductMap);

  const totals = computeInvoiceTotals({ lineItems, discountType, discountValue });
  const isPaid = paymentMode !== 'Credit';
  const paidAmount = isPaid ? totals.grandTotal : 0;
  const balanceDue = totals.grandTotal - paidAmount;
  const status = isPaid ? SALE_STATUS.PAID : SALE_STATUS.UNPAID;
  const currentYear = new Date().getFullYear();

  const counterRef = counterDocRef(companyId);
  const saleRef    = doc(salesCol(companyId));

  // Refs for direct inventory line deductions
  const adjRefs = inventoryLines.map(() => doc(adjustmentsCol(companyId)));
  const invRefs = inventoryLines.map((l) => inventoryDocRef(companyId, l.itemId));

  // Refs for ingredient deductions
  const ingAdjRefs = ingDeductions.map(() => doc(adjustmentsCol(companyId)));
  const ingInvRefs = ingDeductions.map((d) => inventoryDocRef(companyId, d.itemId));

  const journalRef = newJournalRef(companyId);

  return await runTransaction(db, async (tx) => {
    // ── reads ──
    const counterSnap  = await tx.get(counterRef);
    const invSnaps     = await Promise.all(invRefs.map((r) => tx.get(r)));
    const ingInvSnaps  = await Promise.all(ingInvRefs.map((r) => tx.get(r)));

    // Validate direct inventory stock
    for (let i = 0; i < inventoryLines.length; i++) {
      const line = inventoryLines[i];
      const snap = invSnaps[i];
      if (!snap.exists()) throw new Error(`Item "${line.itemName}" not found in inventory.`);
      const available = Number(snap.data().currentStock) || 0;
      if (available < line.quantity) {
        throw new Error(
          `Insufficient stock for "${line.itemName}". Available: ${available} ${snap.data().unit}, requested: ${line.quantity}.`,
        );
      }
    }

    // Validate ingredient stock (best-effort — warn but allow if item missing)
    for (let i = 0; i < ingDeductions.length; i++) {
      const d    = ingDeductions[i];
      const snap = ingInvSnaps[i];
      if (!snap.exists()) continue; // ingredient not in inventory → skip deduction silently
      const available = Number(snap.data().currentStock) || 0;
      if (available < d.qty) {
        throw new Error(
          `Insufficient ingredient stock for "${d.itemName}". Available: ${available} ${snap.data().unit ?? ''}, needed: ${d.qty.toFixed(3)}.`,
        );
      }
    }

    // ── invoice number ──
    const { newCount, year } = resolveNextInvoiceNumber(
      counterSnap.exists() ? counterSnap.data() : null,
      currentYear,
    );
    const invoiceNumber = formatInvoiceNumber(year, newCount);

    // ── sale doc ──
    tx.set(counterRef, { count: newCount, year });

    const saleData = {
      invoiceNumber,
      date:     Timestamp.fromDate(new Date(date)),
      dueDate:  dueDate ? Timestamp.fromDate(new Date(dueDate)) : null,
      customerId: customer.customerId ?? null,
      customerSnapshot: {
        name:    customer.name    ?? '',
        phone:   customer.phone   ?? '',
        address: customer.address ?? '',
        GSTIN:   customer.GSTIN   ?? '',
      },
      lineItems: lineItems.map((l) => ({
        itemId:       l.itemId === 'custom' ? null : (l.itemId ?? null),
        itemName:     l.itemName,
        unit:         l.unit,
        quantity:     Number(l.quantity),
        unitPrice:    Number(l.unitPrice),
        gstRate:      Number(l.gstRate),
        lineSubtotal: Number(l.quantity) * Number(l.unitPrice),
        lineGST:      (Number(l.quantity) * Number(l.unitPrice) * Number(l.gstRate)) / 100,
        ...(l.batchNumber       ? { batchNumber:       l.batchNumber }       : {}),
        ...(l.productionLogRef  ? { productionLogRef:  l.productionLogRef }  : {}),
      })),
      subtotal:       totals.subtotal,
      totalGST:       totals.totalGST,
      discountType,
      discountValue:  Number(discountValue) || 0,
      discountAmount: totals.discountAmount,
      grandTotal:     totals.grandTotal,
      paymentMode,
      paidAmount,
      balanceDue,
      status,
      notes:       notes ?? '',
      tableNumber: tableNumber ?? null,
      orderType:   orderType   ?? null,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    };
    tx.set(saleRef, saleData);

    // ── stock adjustments: direct inventory lines ──
    for (let i = 0; i < inventoryLines.length; i++) {
      const line      = inventoryLines[i];
      const snap      = invSnaps[i];
      const prevStock = Number(snap.data().currentStock) || 0;
      const newStock  = prevStock - line.quantity;
      tx.update(invRefs[i], { currentStock: newStock, updatedAt: serverTimestamp() });
      tx.set(adjRefs[i], {
        itemId: line.itemId, itemName: line.itemName,
        type: 'out', quantity: line.quantity, reason: 'Sale',
        previousStock: prevStock, newStock,
        saleId: saleRef.id, saleInvoiceNumber: invoiceNumber,
        createdBy: null, createdAt: serverTimestamp(),
      });
    }

    // ── stock adjustments: recipe ingredient deductions ──
    for (let i = 0; i < ingDeductions.length; i++) {
      const d    = ingDeductions[i];
      const snap = ingInvSnaps[i];
      if (!snap.exists()) continue; // skip if ingredient not tracked in inventory
      const prevStock = Number(snap.data().currentStock) || 0;
      const newStock  = prevStock - d.qty;
      tx.update(ingInvRefs[i], { currentStock: newStock, updatedAt: serverTimestamp() });
      tx.set(ingAdjRefs[i], {
        itemId: d.itemId, itemName: d.itemName,
        type: 'out', quantity: d.qty, reason: 'Sale (ingredient)',
        previousStock: prevStock, newStock,
        saleId: saleRef.id, saleInvoiceNumber: invoiceNumber,
        createdBy: null, createdAt: serverTimestamp(),
      });
    }

    // ── journal entry ──
    const receivingAccount = isPaid ? paymentModeToAccountId(paymentMode) : 'accounts_receivable';
    const netRevenue = totals.subtotal - totals.discountAmount;
    tx.set(journalRef, buildJournalEntry({
      date,
      description: `Sale — ${invoiceNumber} to ${customer?.name ?? 'Customer'}`,
      sourceType:  'sale',
      sourceId:    saleRef.id,
      sourceRef:   invoiceNumber,
      lines: [
        { accountId: receivingAccount,  debit: totals.grandTotal, credit: 0              },
        { accountId: 'sales_revenue',   debit: 0,                 credit: netRevenue     },
        { accountId: 'gst_output',      debit: 0,                 credit: totals.totalGST },
      ],
    }));

    return { saleId: saleRef.id, invoiceNumber };
  });
}

// ─── create F&B sale (deducts recipe ingredients from inventory) ─────────────

export async function createFnbSale(companyId, { customer, lineItems, discountType, discountValue, paymentMode, date, dueDate, notes, tableNumber, orderType }) {
  const totals = computeInvoiceTotals({ lineItems, discountType, discountValue });
  const isPaid = paymentMode !== 'Credit';
  const paidAmount = isPaid ? totals.grandTotal : 0;
  const balanceDue = totals.grandTotal - paidAmount;
  const status = isPaid ? SALE_STATUS.PAID : SALE_STATUS.UNPAID;
  const currentYear = new Date().getFullYear();

  // Pre-fetch recipes outside transaction — recipes are read-only during a sale
  const recipeIds = [...new Set(lineItems.filter((l) => l.linkedRecipeId).map((l) => l.linkedRecipeId))];
  const recipeMap = {};
  if (recipeIds.length > 0) {
    const snaps = await Promise.all(
      recipeIds.map((id) => getDoc(doc(db, 'companies', companyId, 'recipes', id))),
    );
    snaps.forEach((s) => { if (s.exists()) recipeMap[s.id] = s.data(); });
  }

  // Build deduction map: inventoryItemId → { itemName, totalQty }
  const deductionMap = {};
  lineItems.forEach((line) => {
    if (line.linkedRecipeId && recipeMap[line.linkedRecipeId]) {
      const recipe = recipeMap[line.linkedRecipeId];
      (recipe.ingredients ?? []).forEach((ing) => {
        if (!ing.itemId) return;
        if (!deductionMap[ing.itemId]) deductionMap[ing.itemId] = { itemName: ing.itemName, totalQty: 0 };
        deductionMap[ing.itemId].totalQty += (Number(ing.qty) || 0) * (Number(line.quantity) || 0);
      });
    }
  });

  const inventoryItemIds = Object.keys(deductionMap);
  const counterRef = counterDocRef(companyId);
  const saleRef    = doc(salesCol(companyId));
  const adjRefs    = inventoryItemIds.map(() => doc(adjustmentsCol(companyId)));
  const invRefs    = inventoryItemIds.map((id) => inventoryDocRef(companyId, id));
  const journalRef = newJournalRef(companyId);

  return await runTransaction(db, async (tx) => {
    const counterSnap = await tx.get(counterRef);
    const invSnaps    = await Promise.all(invRefs.map((r) => tx.get(r)));

    for (let i = 0; i < inventoryItemIds.length; i++) {
      const { itemName, totalQty } = deductionMap[inventoryItemIds[i]];
      const snap = invSnaps[i];
      if (!snap.exists()) throw new Error(`Inventory item "${itemName}" not found.`);
      const available = Number(snap.data().currentStock) || 0;
      if (available < totalQty) {
        throw new Error(
          `Insufficient stock for "${itemName}". Available: ${available} ${snap.data().unit}, needed: ${totalQty}.`,
        );
      }
    }

    const { newCount, year } = resolveNextInvoiceNumber(
      counterSnap.exists() ? counterSnap.data() : null,
      currentYear,
    );
    const invoiceNumber = formatInvoiceNumber(year, newCount);
    tx.set(counterRef, { count: newCount, year });

    const saleData = {
      invoiceNumber,
      date:     Timestamp.fromDate(new Date(date)),
      dueDate:  dueDate ? Timestamp.fromDate(new Date(dueDate)) : null,
      customerId: customer.customerId ?? null,
      customerSnapshot: {
        name:    customer.name    ?? '',
        phone:   customer.phone   ?? '',
        address: customer.address ?? '',
        GSTIN:   customer.GSTIN   ?? '',
      },
      lineItems: lineItems.map((l) => ({
        menuItemId:     l.menuItemId ?? null,
        linkedRecipeId: l.linkedRecipeId ?? null,
        itemId:         l.itemId ?? null,
        itemName:       l.itemName,
        unit:           l.unit,
        quantity:       Number(l.quantity),
        unitPrice:      Number(l.unitPrice),
        gstRate:        Number(l.gstRate),
        lineSubtotal:   Number(l.quantity) * Number(l.unitPrice),
        lineGST:        (Number(l.quantity) * Number(l.unitPrice) * Number(l.gstRate)) / 100,
      })),
      subtotal:       totals.subtotal,
      totalGST:       totals.totalGST,
      discountType,
      discountValue:  Number(discountValue) || 0,
      discountAmount: totals.discountAmount,
      grandTotal:     totals.grandTotal,
      paymentMode,
      paidAmount,
      balanceDue,
      status,
      notes:       notes ?? '',
      tableNumber: tableNumber ?? null,
      orderType:   orderType   ?? null,
      createdAt:   serverTimestamp(),
      updatedAt:   serverTimestamp(),
    };
    tx.set(saleRef, saleData);

    for (let i = 0; i < inventoryItemIds.length; i++) {
      const itemId = inventoryItemIds[i];
      const { itemName, totalQty } = deductionMap[itemId];
      const prevStock = Number(invSnaps[i].data().currentStock) || 0;
      const newStock  = prevStock - totalQty;
      tx.update(invRefs[i], { currentStock: newStock, updatedAt: serverTimestamp() });
      tx.set(adjRefs[i], {
        itemId, itemName,
        type: 'out', quantity: totalQty, reason: 'Sale (F&B)',
        previousStock: prevStock, newStock,
        saleId: saleRef.id, saleInvoiceNumber: invoiceNumber,
        createdBy: null, createdAt: serverTimestamp(),
      });
    }

    const receivingAccount = isPaid ? paymentModeToAccountId(paymentMode) : 'accounts_receivable';
    const netRevenue = totals.subtotal - totals.discountAmount;
    tx.set(journalRef, buildJournalEntry({
      date,
      description: `F&B Sale — ${invoiceNumber} to ${customer?.name ?? 'Customer'}`,
      sourceType:  'sale',
      sourceId:    saleRef.id,
      sourceRef:   invoiceNumber,
      lines: [
        { accountId: receivingAccount, debit: totals.grandTotal, credit: 0              },
        { accountId: 'sales_revenue',  debit: 0,                 credit: netRevenue     },
        { accountId: 'gst_output',     debit: 0,                 credit: totals.totalGST },
      ],
    }));

    return { saleId: saleRef.id, invoiceNumber };
  });
}

// ─── read operations ─────────────────────────────────────────────────────────

export async function getSale(companyId, saleId) {
  const snap = await getDoc(doc(db, 'companies', companyId, 'sales', saleId));
  return snap.exists() ? { saleId: snap.id, ...snap.data() } : null;
}

export async function listSales(companyId, { fromDate, toDate } = {}) {
  let q;
  if (fromDate && toDate) {
    q = query(
      salesCol(companyId),
      where('date', '>=', Timestamp.fromDate(fromDate)),
      where('date', '<=', Timestamp.fromDate(toDate)),
      orderBy('date', 'desc'),
    );
  } else {
    q = query(salesCol(companyId), orderBy('date', 'desc'));
  }
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ saleId: d.id, ...d.data() }));
}

// ─── record payment (converts AR → Cash/Bank) ────────────────────────────────

export async function recordPayment(companyId, saleId, { amount, paymentMode }) {
  const saleRef    = doc(db, 'companies', companyId, 'sales', saleId);
  const journalRef = newJournalRef(companyId);

  return await runTransaction(db, async (tx) => {
    const snap = await tx.get(saleRef);
    if (!snap.exists()) throw new Error('Invoice not found.');

    const sale     = snap.data();
    const n        = Number(amount);
    const newPaid  = Math.min((sale.paidAmount ?? 0) + n, sale.grandTotal);
    const newBal   = sale.grandTotal - newPaid;
    const newStatus =
      newBal  <= 0 ? SALE_STATUS.PAID :
      newPaid  > 0 ? SALE_STATUS.PARTIAL :
                     SALE_STATUS.UNPAID;

    tx.update(saleRef, {
      paidAmount: newPaid, balanceDue: newBal,
      status: newStatus, paymentMode,
      updatedAt: serverTimestamp(),
    });

    tx.set(journalRef, buildJournalEntry({
      date:        new Date(),
      description: `Payment received — ${sale.invoiceNumber}`,
      sourceType:  'payment_in',
      sourceId:    saleId,
      sourceRef:   sale.invoiceNumber,
      lines: [
        { accountId: paymentModeToAccountId(paymentMode), debit: n, credit: 0 },
        { accountId: 'accounts_receivable',               debit: 0, credit: n },
      ],
    }));

    return { paidAmount: newPaid, balanceDue: newBal, status: newStatus };
  });
}
