export const ACCOUNT_TYPE = {
  ASSET: 'asset',
  LIABILITY: 'liability',
  INCOME: 'income',
  EXPENSE: 'expense',
};

export const ACCOUNT_TYPE_LABEL = {
  asset: 'Assets',
  liability: 'Liabilities',
  income: 'Income',
  expense: 'Expenses',
};

export const ACCOUNT_TYPE_ORDER = { asset: 1, liability: 2, income: 3, expense: 4 };

// Predefined chart of accounts.
// normalBalance determines on which side an account's balance naturally lives
// and is used to compute running balance on the ledger.
export const CHART_OF_ACCOUNTS = [
  // Assets
  { accountId: 'cash',                name: 'Cash',                type: 'asset',     normalBalance: 'debit'  },
  { accountId: 'bank',                name: 'Bank',                type: 'asset',     normalBalance: 'debit'  },
  { accountId: 'accounts_receivable', name: 'Accounts Receivable', type: 'asset',     normalBalance: 'debit'  },
  { accountId: 'inventory',           name: 'Inventory',           type: 'asset',     normalBalance: 'debit'  },
  { accountId: 'gst_input',           name: 'GST Input Credit',    type: 'asset',     normalBalance: 'debit'  },

  // Liabilities
  { accountId: 'accounts_payable',    name: 'Accounts Payable',    type: 'liability', normalBalance: 'credit' },
  { accountId: 'loans',               name: 'Loans',               type: 'liability', normalBalance: 'credit' },
  { accountId: 'gst_output',          name: 'GST Output Payable',  type: 'liability', normalBalance: 'credit' },

  // Income
  { accountId: 'sales_revenue',       name: 'Sales Revenue',       type: 'income',    normalBalance: 'credit' },

  // Expenses
  { accountId: 'purchases',           name: 'Purchases',           type: 'expense',   normalBalance: 'debit'  },
  { accountId: 'expense_rent',        name: 'Rent',                type: 'expense',   normalBalance: 'debit'  },
  { accountId: 'expense_salary',      name: 'Salary',              type: 'expense',   normalBalance: 'debit'  },
  { accountId: 'expense_electricity', name: 'Electricity',         type: 'expense',   normalBalance: 'debit'  },
  { accountId: 'expense_maintenance', name: 'Maintenance',         type: 'expense',   normalBalance: 'debit'  },
  { accountId: 'expense_marketing',   name: 'Marketing',           type: 'expense',   normalBalance: 'debit'  },
  { accountId: 'expense_other',       name: 'Other Expenses',      type: 'expense',   normalBalance: 'debit'  },
];

export const ACCOUNTS_BY_ID = Object.fromEntries(
  CHART_OF_ACCOUNTS.map((a) => [a.accountId, a]),
);

export function getAccount(accountId) {
  return ACCOUNTS_BY_ID[accountId] ?? null;
}

// Cash/Card/UPI/Bank → Cash or Bank ledger account
export function paymentModeToAccountId(mode) {
  if (!mode) return 'cash';
  return String(mode).toLowerCase() === 'cash' ? 'cash' : 'bank';
}

const EXPENSE_CATEGORY_TO_ACCOUNT = {
  Rent: 'expense_rent',
  Salary: 'expense_salary',
  Electricity: 'expense_electricity',
  Maintenance: 'expense_maintenance',
  Marketing: 'expense_marketing',
  Other: 'expense_other',
};

export function expenseCategoryToAccountId(category) {
  return EXPENSE_CATEGORY_TO_ACCOUNT[category] ?? 'expense_other';
}
