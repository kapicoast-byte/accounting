const DEFAULT_CURRENCY = 'INR';
const DEFAULT_LOCALE = 'en-IN';

export function formatCurrency(value, currency = DEFAULT_CURRENCY, locale = DEFAULT_LOCALE) {
  const num = Number(value) || 0;
  return new Intl.NumberFormat(locale, {
    style: 'currency',
    currency,
    maximumFractionDigits: 2,
  }).format(num);
}

export function formatNumber(value, locale = DEFAULT_LOCALE) {
  const num = Number(value) || 0;
  return new Intl.NumberFormat(locale).format(num);
}
