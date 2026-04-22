import { useEffect, useRef, useState } from 'react';
import Modal from '../Modal';
import FormField from '../FormField';
import LoadingSpinner from '../LoadingSpinner';
import { createCustomer } from '../../services/customerService';

export default function CustomerSelector({ companyId, customers, value, onChange }) {
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const wrapRef = useRef(null);

  // close dropdown on outside click
  useEffect(() => {
    function handler(e) {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false);
    }
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const filtered = query.trim()
    ? customers.filter((c) => c.name.toLowerCase().includes(query.trim().toLowerCase()))
    : customers;

  function select(customer) {
    onChange(customer);
    setQuery('');
    setOpen(false);
  }

  function handleInputChange(e) {
    setQuery(e.target.value);
    if (!open) setOpen(true);
    if (value) onChange(null); // clear selection on type
  }

  return (
    <div className="relative" ref={wrapRef}>
      <label className="text-sm font-medium text-gray-700">Customer</label>
      {value ? (
        <div className="mt-1 flex items-center justify-between rounded-md border border-gray-300 bg-white px-3 py-2 text-sm">
          <div>
            <span className="font-medium text-gray-800">{value.name}</span>
            {value.phone && <span className="ml-2 text-gray-500">{value.phone}</span>}
          </div>
          <button type="button" onClick={() => onChange(null)}
            className="ml-2 text-xs text-gray-400 hover:text-red-500">✕</button>
        </div>
      ) : (
        <input
          type="text"
          placeholder="Search customer…"
          value={query}
          onChange={handleInputChange}
          onFocus={() => setOpen(true)}
          className="mt-1 w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
        />
      )}

      {open && !value && (
        <div className="absolute z-20 mt-1 w-full rounded-md border border-gray-200 bg-white shadow-lg">
          <ul className="max-h-48 overflow-auto py-1">
            {filtered.length === 0 && (
              <li className="px-3 py-2 text-sm text-gray-400">No customers found.</li>
            )}
            {filtered.map((c) => (
              <li key={c.customerId}>
                <button type="button" onClick={() => select(c)}
                  className="flex w-full flex-col px-3 py-2 text-left text-sm hover:bg-gray-50">
                  <span className="font-medium text-gray-800">{c.name}</span>
                  {c.phone && <span className="text-xs text-gray-400">{c.phone}</span>}
                </button>
              </li>
            ))}
          </ul>
          <div className="border-t border-gray-100 px-3 py-1.5">
            <button type="button" onClick={() => { setOpen(false); setAddOpen(true); }}
              className="text-sm text-blue-600 hover:text-blue-500">
              + Add new customer
            </button>
          </div>
        </div>
      )}

      <QuickAddCustomerModal
        open={addOpen}
        companyId={companyId}
        initialName={query}
        onClose={() => setAddOpen(false)}
        onCreated={(c) => { onChange(c); setQuery(''); setAddOpen(false); }}
      />
    </div>
  );
}

function QuickAddCustomerModal({ open, companyId, initialName, onClose, onCreated }) {
  const [form, setForm] = useState({ name: '', phone: '', email: '', address: '', GSTIN: '' });
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) setForm({ name: initialName ?? '', phone: '', email: '', address: '', GSTIN: '' });
    setError('');
  }, [open, initialName]);

  function handleChange(e) {
    const { name, value } = e.target;
    setForm((p) => ({ ...p, [name]: value }));
  }

  async function handleSubmit(e) {
    e.preventDefault();
    if (!form.name.trim()) { setError('Name is required.'); return; }
    setSaving(true);
    try {
      const customer = await createCustomer(companyId, form);
      onCreated(customer);
    } catch (err) {
      setError(err.message ?? 'Failed to create customer.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal open={open} onClose={saving ? undefined : onClose} title="Add new customer"
      footer={
        <>
          <button type="button" onClick={onClose} disabled={saving}
            className="rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50 disabled:opacity-50">
            Cancel
          </button>
          <button type="submit" form="quick-customer-form" disabled={saving}
            className="flex items-center gap-2 rounded-md bg-blue-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50">
            {saving && <LoadingSpinner size="sm" />}
            Save customer
          </button>
        </>
      }
    >
      {error && (
        <div className="mb-3 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>
      )}
      <form id="quick-customer-form" onSubmit={handleSubmit} noValidate className="flex flex-col gap-3">
        <FormField label="Name *" id="cust-name" name="name" value={form.name} onChange={handleChange} disabled={saving} />
        <FormField label="Phone" id="cust-phone" name="phone" type="tel" value={form.phone} onChange={handleChange} disabled={saving} />
        <FormField label="Email" id="cust-email" name="email" type="email" value={form.email} onChange={handleChange} disabled={saving} />
        <FormField label="Address" id="cust-address" name="address" value={form.address} onChange={handleChange} disabled={saving} />
        <FormField label="GSTIN" id="cust-gstin" name="GSTIN" value={form.GSTIN} onChange={handleChange} disabled={saving} />
      </form>
    </Modal>
  );
}
