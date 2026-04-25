// Country → currency, locale, default tax system
export const COUNTRIES = [
  // South & Southeast Asia
  { code: 'IN', name: 'India',                  currency: 'INR', locale: 'en-IN', taxSystem: 'GST_IN'    },
  { code: 'SG', name: 'Singapore',              currency: 'SGD', locale: 'en-SG', taxSystem: 'GST_SG'    },
  { code: 'AU', name: 'Australia',              currency: 'AUD', locale: 'en-AU', taxSystem: 'GST_AU'    },
  { code: 'NZ', name: 'New Zealand',            currency: 'NZD', locale: 'en-NZ', taxSystem: 'GST_NZ'    },
  { code: 'MY', name: 'Malaysia',               currency: 'MYR', locale: 'ms-MY', taxSystem: 'CUSTOM'    },
  { code: 'PH', name: 'Philippines',            currency: 'PHP', locale: 'en-PH', taxSystem: 'CUSTOM'    },
  { code: 'TH', name: 'Thailand',               currency: 'THB', locale: 'th-TH', taxSystem: 'CUSTOM'    },
  { code: 'ID', name: 'Indonesia',              currency: 'IDR', locale: 'id-ID', taxSystem: 'CUSTOM'    },
  { code: 'VN', name: 'Vietnam',                currency: 'VND', locale: 'vi-VN', taxSystem: 'CUSTOM'    },
  { code: 'LK', name: 'Sri Lanka',              currency: 'LKR', locale: 'si-LK', taxSystem: 'CUSTOM'    },
  { code: 'BD', name: 'Bangladesh',             currency: 'BDT', locale: 'bn-BD', taxSystem: 'CUSTOM'    },
  { code: 'PK', name: 'Pakistan',               currency: 'PKR', locale: 'ur-PK', taxSystem: 'CUSTOM'    },
  { code: 'NP', name: 'Nepal',                  currency: 'NPR', locale: 'ne-NP', taxSystem: 'CUSTOM'    },
  { code: 'JP', name: 'Japan',                  currency: 'JPY', locale: 'ja-JP', taxSystem: 'CUSTOM'    },
  { code: 'CN', name: 'China',                  currency: 'CNY', locale: 'zh-CN', taxSystem: 'CUSTOM'    },
  { code: 'KR', name: 'South Korea',            currency: 'KRW', locale: 'ko-KR', taxSystem: 'CUSTOM'    },
  { code: 'HK', name: 'Hong Kong',              currency: 'HKD', locale: 'zh-HK', taxSystem: 'CUSTOM'    },
  { code: 'TW', name: 'Taiwan',                 currency: 'TWD', locale: 'zh-TW', taxSystem: 'CUSTOM'    },
  // Middle East
  { code: 'AE', name: 'United Arab Emirates',   currency: 'AED', locale: 'en-AE', taxSystem: 'VAT_UAE'   },
  { code: 'SA', name: 'Saudi Arabia',           currency: 'SAR', locale: 'ar-SA', taxSystem: 'CUSTOM'    },
  { code: 'QA', name: 'Qatar',                  currency: 'QAR', locale: 'ar-QA', taxSystem: 'CUSTOM'    },
  { code: 'KW', name: 'Kuwait',                 currency: 'KWD', locale: 'ar-KW', taxSystem: 'CUSTOM'    },
  { code: 'BH', name: 'Bahrain',                currency: 'BHD', locale: 'ar-BH', taxSystem: 'CUSTOM'    },
  { code: 'OM', name: 'Oman',                   currency: 'OMR', locale: 'ar-OM', taxSystem: 'CUSTOM'    },
  // Europe
  { code: 'GB', name: 'United Kingdom',         currency: 'GBP', locale: 'en-GB', taxSystem: 'VAT_UK'    },
  { code: 'DE', name: 'Germany',                currency: 'EUR', locale: 'de-DE', taxSystem: 'VAT_EU'    },
  { code: 'FR', name: 'France',                 currency: 'EUR', locale: 'fr-FR', taxSystem: 'VAT_EU'    },
  { code: 'ES', name: 'Spain',                  currency: 'EUR', locale: 'es-ES', taxSystem: 'VAT_EU'    },
  { code: 'IT', name: 'Italy',                  currency: 'EUR', locale: 'it-IT', taxSystem: 'VAT_EU'    },
  { code: 'NL', name: 'Netherlands',            currency: 'EUR', locale: 'nl-NL', taxSystem: 'VAT_EU'    },
  { code: 'BE', name: 'Belgium',                currency: 'EUR', locale: 'fr-BE', taxSystem: 'VAT_EU'    },
  { code: 'PT', name: 'Portugal',               currency: 'EUR', locale: 'pt-PT', taxSystem: 'VAT_EU'    },
  { code: 'IE', name: 'Ireland',                currency: 'EUR', locale: 'en-IE', taxSystem: 'VAT_EU'    },
  { code: 'SE', name: 'Sweden',                 currency: 'SEK', locale: 'sv-SE', taxSystem: 'CUSTOM'    },
  { code: 'NO', name: 'Norway',                 currency: 'NOK', locale: 'nb-NO', taxSystem: 'CUSTOM'    },
  { code: 'DK', name: 'Denmark',                currency: 'DKK', locale: 'da-DK', taxSystem: 'CUSTOM'    },
  { code: 'CH', name: 'Switzerland',            currency: 'CHF', locale: 'de-CH', taxSystem: 'CUSTOM'    },
  { code: 'PL', name: 'Poland',                 currency: 'PLN', locale: 'pl-PL', taxSystem: 'VAT_EU'    },
  // Americas
  { code: 'US', name: 'United States',          currency: 'USD', locale: 'en-US', taxSystem: 'SALES_TAX' },
  { code: 'CA', name: 'Canada',                 currency: 'CAD', locale: 'en-CA', taxSystem: 'CUSTOM'    },
  { code: 'MX', name: 'Mexico',                 currency: 'MXN', locale: 'es-MX', taxSystem: 'CUSTOM'    },
  { code: 'BR', name: 'Brazil',                 currency: 'BRL', locale: 'pt-BR', taxSystem: 'CUSTOM'    },
  { code: 'AR', name: 'Argentina',              currency: 'ARS', locale: 'es-AR', taxSystem: 'CUSTOM'    },
  // Africa
  { code: 'ZA', name: 'South Africa',           currency: 'ZAR', locale: 'en-ZA', taxSystem: 'CUSTOM'    },
  { code: 'NG', name: 'Nigeria',                currency: 'NGN', locale: 'en-NG', taxSystem: 'CUSTOM'    },
  { code: 'KE', name: 'Kenya',                  currency: 'KES', locale: 'sw-KE', taxSystem: 'CUSTOM'    },
  { code: 'GH', name: 'Ghana',                  currency: 'GHS', locale: 'en-GH', taxSystem: 'CUSTOM'    },
  { code: 'EG', name: 'Egypt',                  currency: 'EGP', locale: 'ar-EG', taxSystem: 'CUSTOM'    },
  // Other
  { code: 'OT', name: 'Other',                  currency: 'USD', locale: 'en-US', taxSystem: 'CUSTOM'    },
];

// Tax system definitions
export const TAX_SYSTEMS = {
  GST_IN: {
    label:        'GST',
    rates:        [0, 5, 12, 18, 28],
    reportTitle:  'GST Report',
    tabA:         'GSTR-1 — Outward Supplies',
    tabB:         'GSTR-3B — Consolidated Return',
    splitMode:    'cgst_sgst',
  },
  GST_SG: {
    label:        'GST',
    rates:        [0, 9],
    reportTitle:  'GST Report',
    tabA:         'Tax Report — Outward Supplies',
    tabB:         'Tax Summary',
    splitMode:    'none',
  },
  GST_AU: {
    label:        'GST',
    rates:        [0, 10],
    reportTitle:  'GST Report',
    tabA:         'Tax Report — Outward Supplies',
    tabB:         'Tax Summary',
    splitMode:    'none',
  },
  GST_NZ: {
    label:        'GST',
    rates:        [0, 15],
    reportTitle:  'GST Report',
    tabA:         'Tax Report — Outward Supplies',
    tabB:         'Tax Summary',
    splitMode:    'none',
  },
  VAT_UK: {
    label:        'VAT',
    rates:        [0, 5, 20],
    reportTitle:  'VAT Report',
    tabA:         'Output VAT — Outward Supplies',
    tabB:         'VAT Summary',
    splitMode:    'none',
  },
  VAT_UAE: {
    label:        'VAT',
    rates:        [0, 5],
    reportTitle:  'VAT Report',
    tabA:         'Output VAT — Outward Supplies',
    tabB:         'VAT Summary',
    splitMode:    'none',
  },
  VAT_EU: {
    label:        'VAT',
    rates:        [0, 5, 10, 20],
    reportTitle:  'VAT Report',
    tabA:         'Output VAT — Outward Supplies',
    tabB:         'VAT Summary',
    splitMode:    'none',
  },
  SALES_TAX: {
    label:        'Sales Tax',
    rates:        [0],
    reportTitle:  'Sales Tax Report',
    tabA:         'Tax Report — Outward Supplies',
    tabB:         'Tax Summary',
    splitMode:    'none',
  },
  CUSTOM: {
    label:        'Tax',
    rates:        [],
    reportTitle:  'Tax Report',
    tabA:         'Tax Report — Outward Supplies',
    tabB:         'Tax Summary',
    splitMode:    'none',
  },
};

export function getCountryConfig(countryCode) {
  if (!countryCode) return COUNTRIES.find((c) => c.code === 'IN');
  return COUNTRIES.find((c) => c.code === countryCode)
    ?? COUNTRIES.find((c) => c.code === 'OT');
}

export function getTaxSystemConfig(taxSystemKey) {
  return TAX_SYSTEMS[taxSystemKey] ?? TAX_SYSTEMS.CUSTOM;
}
