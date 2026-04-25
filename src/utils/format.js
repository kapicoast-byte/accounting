// Module-level currency config — updated by AppContext when the active company changes.
// All formatCurrency() calls throughout the app automatically pick up the right currency
// without requiring prop drilling or hook calls in every component.
let _currencyCode   = 'INR';
let _currencyLocale = 'en-IN';

export function setCurrencyConfig(currencyCode, locale) {
  _currencyCode   = currencyCode || 'INR';
  _currencyLocale = locale       || 'en-IN';
}

export function formatCurrency(value, currency, locale) {
  const code = currency ?? _currencyCode;
  const loc  = locale   ?? _currencyLocale;
  const num  = Number(value) || 0;
  try {
    return new Intl.NumberFormat(loc, {
      style:                'currency',
      currency:             code,
      maximumFractionDigits: 2,
    }).format(num);
  } catch {
    return `${code} ${num.toFixed(2)}`;
  }
}

export function formatNumber(value, locale) {
  const loc = locale ?? _currencyLocale;
  const num = Number(value) || 0;
  return new Intl.NumberFormat(loc).format(num);
}
