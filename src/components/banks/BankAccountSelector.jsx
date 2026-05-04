import { useEffect, useState } from 'react';
import { listBankAccounts } from '../../services/bankAccountService';

export default function BankAccountSelector({ companyId, value, onChange, label = 'Bank account', style }) {
  const [accounts, setAccounts] = useState([]);

  useEffect(() => {
    if (!companyId) return;
    listBankAccounts(companyId).then(setAccounts).catch(() => {});
  }, [companyId]);

  if (accounts.length === 0) return null;

  return (
    <div className="flex flex-col gap-1" style={style}>
      <label className="text-sm font-medium" style={{ color: 'var(--fg-2)' }}>{label}</label>
      <select
        value={value ?? ''}
        onChange={(e) => onChange(e.target.value || null)}
        style={{ width: 'auto' }}
      >
        <option value="">— No specific account —</option>
        {accounts.map((a) => (
          <option key={a.accountId} value={a.accountId}>
            {a.bankName} ···{a.accountLast4} ({a.holderName})
          </option>
        ))}
      </select>
    </div>
  );
}
