import { listSales } from './saleService';
import { listPurchases } from './purchaseService';
import { toJsDate } from '../utils/dateUtils';

// ─── GSTR-1: outward supplies summary ────────────────────────────────────────
// Reads all sales in the period, groups by GST rate.
// GST is assumed intra-state: totalGST splits evenly into CGST + SGST.
export async function computeGSTR1(companyId, { fromDate, toDate } = {}) {
  const sales = await listSales(companyId, { fromDate, toDate });

  const rateMap = {};   // gstRate → accumulated totals
  const invoiceRows = [];

  for (const sale of sales) {
    const lines = sale.lineItems ?? [];
    let invTaxable = 0;
    let invGST = 0;

    for (const line of lines) {
      const rate = Number(line.gstRate) || 0;
      // Use stored pre-computed values where available, fall back to re-computing.
      const taxable = Number(line.lineSubtotal) || Number(line.quantity) * Number(line.unitPrice);
      const gst     = Number(line.lineGST)     || (taxable * rate) / 100;

      if (!rateMap[rate]) {
        rateMap[rate] = { rate, taxableValue: 0, cgst: 0, sgst: 0, totalGST: 0 };
      }
      rateMap[rate].taxableValue += taxable;
      rateMap[rate].totalGST     += gst;
      rateMap[rate].cgst         += gst / 2;
      rateMap[rate].sgst         += gst / 2;

      invTaxable += taxable;
      invGST     += gst;
    }

    invoiceRows.push({
      invoiceNumber:  sale.invoiceNumber ?? '',
      date:           toJsDate(sale.date),
      customerName:   sale.customerSnapshot?.name  ?? '',
      customerGSTIN:  sale.customerSnapshot?.GSTIN ?? '',
      taxableValue:   invTaxable,
      discount:       sale.discountAmount ?? 0,
      cgst:           invGST / 2,
      sgst:           invGST / 2,
      totalGST:       invGST,
      grandTotal:     sale.grandTotal ?? 0,
      paymentMode:    sale.paymentMode ?? '',
      status:         sale.status ?? '',
    });
  }

  const byRate = Object.values(rateMap).sort((a, b) => a.rate - b.rate);

  const summary = {
    totalTaxable: byRate.reduce((s, r) => s + r.taxableValue, 0),
    totalCGST:    byRate.reduce((s, r) => s + r.cgst, 0),
    totalSGST:    byRate.reduce((s, r) => s + r.sgst, 0),
    totalGST:     byRate.reduce((s, r) => s + r.totalGST, 0),
  };

  return { totalInvoices: sales.length, byRate, summary, invoiceRows };
}

// ─── GSTR-3B: consolidated return summary ────────────────────────────────────
// Section 3.1 — Outward supplies (from sales)
// Section 4   — Eligible Input Tax Credit (from purchases)
export async function computeGSTR3B(companyId, { fromDate, toDate } = {}) {
  const [sales, purchases] = await Promise.all([
    listSales(companyId,     { fromDate, toDate }),
    listPurchases(companyId, { fromDate, toDate }),
  ]);

  // 3.1 Outward taxable + nil-rated/exempt
  let taxableValue  = 0;
  let taxableGST    = 0;
  let nilValue      = 0;

  for (const sale of sales) {
    const gst      = Number(sale.totalGST) || 0;
    const subtotal = Number(sale.subtotal)  || 0;
    if (gst > 0) {
      taxableValue += subtotal;
      taxableGST   += gst;
    } else {
      nilValue += subtotal;
    }
  }

  // Per-rate breakdown for 3.1 detail
  const rateMap3B = {};
  for (const sale of sales) {
    for (const line of (sale.lineItems ?? [])) {
      const rate    = Number(line.gstRate) || 0;
      const taxable = Number(line.lineSubtotal) || 0;
      const gst     = Number(line.lineGST)      || 0;
      if (!rateMap3B[rate]) rateMap3B[rate] = { rate, taxableValue: 0, gst: 0 };
      rateMap3B[rate].taxableValue += taxable;
      rateMap3B[rate].gst          += gst;
    }
  }

  // 4 Input Tax Credit from purchases
  let itcTaxable = 0;
  let itcGST     = 0;
  let itcByRate  = {};

  for (const purchase of purchases) {
    itcTaxable += Number(purchase.subtotal)  || 0;
    itcGST     += Number(purchase.totalGST) || 0;

    for (const line of (purchase.lineItems ?? [])) {
      const rate    = Number(line.gstRate) || 0;
      const taxable = Number(line.lineSubtotal) || 0;
      const gst     = Number(line.lineGST)      || 0;
      if (!itcByRate[rate]) itcByRate[rate] = { rate, taxableValue: 0, gst: 0 };
      itcByRate[rate].taxableValue += taxable;
      itcByRate[rate].gst          += gst;
    }
  }

  const netGST      = taxableGST - itcGST;
  const payable     = Math.max(netGST, 0);
  const creditCarry = netGST < 0 ? -netGST : 0;

  return {
    period: { fromDate, toDate },
    totalSales:     sales.length,
    totalPurchases: purchases.length,

    // 3.1
    outward: {
      taxableValue,
      nilValue,
      cgst:     taxableGST / 2,
      sgst:     taxableGST / 2,
      totalGST: taxableGST,
      byRate:   Object.values(rateMap3B).sort((a, b) => a.rate - b.rate),
    },

    // 4
    itc: {
      taxableValue: itcTaxable,
      cgst:     itcGST / 2,
      sgst:     itcGST / 2,
      totalGST: itcGST,
      byRate:   Object.values(itcByRate).sort((a, b) => a.rate - b.rate),
    },

    // Net
    net: {
      cgst:        Math.max(taxableGST / 2 - itcGST / 2, 0),
      sgst:        Math.max(taxableGST / 2 - itcGST / 2, 0),
      totalGST:    payable,
      creditCarry,
    },
  };
}
