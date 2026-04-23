import { Link } from 'react-router-dom';
import { CHART_OF_ACCOUNTS, ACCOUNT_TYPE_LABEL, ACCOUNT_TYPE_ORDER } from '../utils/accountConstants';

const TYPE_COLORS = {
  asset:     'bg-blue-50  text-blue-700  border-blue-200',
  liability: 'bg-red-50   text-red-700   border-red-200',
  income:    'bg-green-50 text-green-700 border-green-200',
  expense:   'bg-amber-50 text-amber-700 border-amber-200',
};
const TYPE_BADGE = {
  asset:     'bg-blue-100  text-blue-700',
  liability: 'bg-red-100   text-red-700',
  income:    'bg-green-100 text-green-700',
  expense:   'bg-amber-100 text-amber-700',
};

const grouped = Object.entries(ACCOUNT_TYPE_LABEL)
  .sort(([a], [b]) => (ACCOUNT_TYPE_ORDER[a] ?? 9) - (ACCOUNT_TYPE_ORDER[b] ?? 9))
  .map(([type, label]) => ({
    type,
    label,
    accounts: CHART_OF_ACCOUNTS.filter((a) => a.type === type),
  }));

export default function AccountsPage() {
  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Chart of Accounts</h1>
          <p className="text-sm text-gray-500">All ledger accounts. Click any account to view its transaction history.</p>
        </div>
        <div className="flex gap-2">
          <Link to="/journal"
            className="rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50">
            Journal entries
          </Link>
          <Link to="/trial-balance"
            className="rounded-md bg-blue-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-blue-700">
            Trial balance
          </Link>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
        {grouped.map(({ type, label, accounts }) => (
          <div key={type} className={`rounded-xl border ${TYPE_COLORS[type] ?? 'bg-gray-50 text-gray-700 border-gray-200'} p-5`}>
            <h2 className="mb-3 text-xs font-bold uppercase tracking-widest opacity-70">{label}</h2>
            <ul className="flex flex-col gap-1">
              {accounts.map((acc) => (
                <li key={acc.accountId}>
                  <Link
                    to={`/ledger/${acc.accountId}`}
                    className="flex items-center justify-between rounded-lg px-3 py-2 hover:bg-white/60 transition group"
                  >
                    <span className="text-sm font-medium">{acc.name}</span>
                    <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition">
                      <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${TYPE_BADGE[type] ?? ''}`}>
                        {acc.normalBalance === 'debit' ? 'Dr' : 'Cr'} normal
                      </span>
                      <span className="text-xs">View ledger →</span>
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>

      <div className="rounded-xl border border-gray-200 bg-white p-5">
        <h2 className="mb-3 text-sm font-semibold text-gray-700">Double-Entry Rules</h2>
        <div className="grid grid-cols-1 gap-3 text-xs text-gray-600 sm:grid-cols-2 lg:grid-cols-3">
          {[
            { label: 'Cash sale',       dr: 'Cash / Bank',          cr: 'Sales Revenue + GST Output'    },
            { label: 'Credit sale',     dr: 'Accounts Receivable',  cr: 'Sales Revenue + GST Output'    },
            { label: 'Payment in',      dr: 'Cash / Bank',          cr: 'Accounts Receivable'           },
            { label: 'Cash purchase',   dr: 'Purchases + GST Input', cr: 'Cash / Bank'                  },
            { label: 'Credit purchase', dr: 'Purchases + GST Input', cr: 'Accounts Payable'             },
            { label: 'Payment out',     dr: 'Accounts Payable',     cr: 'Cash / Bank'                   },
            { label: 'Expense',         dr: 'Expense account',      cr: 'Cash / Bank'                   },
          ].map((rule) => (
            <div key={rule.label} className="rounded-lg border border-gray-100 bg-gray-50 px-3 py-2">
              <p className="font-semibold text-gray-800 mb-1">{rule.label}</p>
              <p><span className="text-blue-600 font-medium">Dr</span> {rule.dr}</p>
              <p><span className="text-red-600  font-medium">Cr</span> {rule.cr}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
