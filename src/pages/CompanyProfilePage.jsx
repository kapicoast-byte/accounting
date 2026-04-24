import { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useApp } from '../context/AppContext';
import { useRole } from '../hooks/useRole';
import {
  updateCompanyProfile,
  uploadCompanyLogo,
  removeCompanyLogo,
  hardDeleteCompany,
  getCompany,
  listUserCompanies,
  COMPANY_TYPE,
  BUSINESS_TYPES,
} from '../services/companyService';
import Modal from '../components/Modal';
import FormField from '../components/FormField';
import LoadingSpinner from '../components/LoadingSpinner';
import RoleGuard from '../components/RoleGuard';

const MONTHS = [
  ['01','January'],['02','February'],['03','March'],['04','April'],
  ['05','May'],['06','June'],['07','July'],['08','August'],
  ['09','September'],['10','October'],['11','November'],['12','December'],
];

const MAX_LOGO_BYTES = 2 * 1024 * 1024; // 2 MB

function LogoArea({ logoUrl, companyName, isAdmin, onUpload, onRemove, uploading }) {
  const inputRef = useRef(null);
  const [dragging, setDragging] = useState(false);

  function handleFile(file) {
    if (!file) return;
    if (!file.type.startsWith('image/')) { alert('Please select an image file.'); return; }
    if (file.size > MAX_LOGO_BYTES) { alert('Image must be under 2 MB.'); return; }
    onUpload(file);
  }

  return (
    <div className="flex items-center gap-5">
      {/* Avatar / logo */}
      <div
        className={`relative flex h-20 w-20 flex-shrink-0 items-center justify-center overflow-hidden rounded-xl border-2 ${
          isAdmin ? 'cursor-pointer border-dashed border-gray-300 hover:border-blue-400' : 'border-gray-200'
        } bg-gray-50 transition`}
        onClick={() => isAdmin && inputRef.current?.click()}
        onDragOver={(e) => { if (!isAdmin) return; e.preventDefault(); setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          if (!isAdmin) return;
          e.preventDefault(); setDragging(false);
          handleFile(e.dataTransfer.files[0]);
        }}
        style={{ outline: dragging ? '2px solid #3b82f6' : undefined }}
      >
        {uploading ? (
          <LoadingSpinner size="sm" />
        ) : logoUrl ? (
          <img src={logoUrl} alt="Company logo" className="h-full w-full object-cover" />
        ) : (
          <span className="text-2xl font-bold text-gray-300 uppercase">
            {(companyName ?? '?')[0]}
          </span>
        )}
        {isAdmin && !uploading && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/30 opacity-0 hover:opacity-100 transition rounded-xl">
            <svg viewBox="0 0 20 20" fill="white" className="h-6 w-6">
              <path d="M13.586 3.586a2 2 0 112.828 2.828l-.793.793-2.828-2.828.793-.793zM11.379 5.793L3 14.172V17h2.828l8.38-8.379-2.83-2.828z" />
            </svg>
          </div>
        )}
      </div>

      {isAdmin && (
        <div className="flex flex-col gap-1.5">
          <input
            ref={inputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => handleFile(e.target.files[0])}
          />
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            disabled={uploading}
            className="rounded-md border border-gray-300 bg-white px-3 py-1.5 text-xs text-gray-700 hover:bg-gray-50 disabled:opacity-50 transition"
          >
            {logoUrl ? 'Change logo' : 'Upload logo'}
          </button>
          {logoUrl && (
            <button
              type="button"
              onClick={onRemove}
              disabled={uploading}
              className="rounded-md border border-red-200 bg-white px-3 py-1.5 text-xs text-red-600 hover:bg-red-50 disabled:opacity-50 transition"
            >
              Remove logo
            </button>
          )}
          <p className="text-[11px] text-gray-400">PNG, JPG, WebP — max 2 MB</p>
        </div>
      )}
    </div>
  );
}

function DeleteDialog({ open, companyName, onClose, onConfirm, busy }) {
  const [input, setInput] = useState('');
  const matches = input === companyName;

  useEffect(() => { if (!open) setInput(''); }, [open]);

  return (
    <Modal open={open} title="Delete Company" onClose={onClose} size="md"
      footer={
        <>
          <button type="button" onClick={onClose} disabled={busy}
            className="rounded-md border border-gray-300 bg-white px-4 py-2 text-sm text-gray-700 hover:bg-gray-50 disabled:opacity-50 transition">
            Cancel
          </button>
          <button type="button" onClick={onConfirm} disabled={!matches || busy}
            className="rounded-md bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50 transition">
            {busy ? 'Deleting…' : 'Delete permanently'}
          </button>
        </>
      }
    >
      <div className="space-y-4">
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          <p className="font-semibold">This action cannot be undone.</p>
          <p className="mt-1">All data including inventory, sales, purchases, expenses, journal entries, and team members will be permanently deleted.</p>
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Type <span className="font-semibold text-gray-900">{companyName}</span> to confirm
          </label>
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder={companyName}
            className={`w-full rounded-md border px-3 py-2 text-sm outline-none transition focus:ring-2 ${
              input && !matches ? 'border-red-400 focus:ring-red-300' : 'border-gray-300 focus:ring-blue-500'
            }`}
          />
        </div>
      </div>
    </Modal>
  );
}

export default function CompanyProfilePage() {
  const navigate  = useNavigate();
  const { activeCompanyId, activeCompany, user, refreshCompanies } = useApp();
  const { isAdmin } = useRole();

  const [form, setForm]           = useState(null);
  const [parentName, setParentName] = useState('');
  const [saving, setSaving]       = useState(false);
  const [saveError, setSaveError] = useState('');
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [logoUrl, setLogoUrl]     = useState('');
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteError, setDeleteError] = useState('');
  const [deleteBusy, setDeleteBusy]   = useState(false);

  // Populate form from active company
  useEffect(() => {
    if (!activeCompany) return;
    setForm({
      companyName:        activeCompany.companyName ?? '',
      address:            activeCompany.address ?? '',
      GSTIN:              activeCompany.GSTIN ?? '',
      phone:              activeCompany.phone ?? '',
      email:              activeCompany.email ?? '',
      financialYearStart: activeCompany.financialYearStart ?? '04-01',
      businessType:       activeCompany.businessType ?? '',
    });
    setLogoUrl(activeCompany.logoUrl ?? '');
  }, [activeCompany]);

  // Fetch parent company name if subsidiary
  useEffect(() => {
    const pid = activeCompany?.parentCompanyId;
    if (!pid) { setParentName(''); return; }
    getCompany(pid).then((c) => setParentName(c?.companyName ?? pid));
  }, [activeCompany?.parentCompanyId]);

  function handleChange(e) {
    const { name, value } = e.target;
    setForm((prev) => ({ ...prev, [name]: value }));
    setSaveError('');
    setSaveSuccess(false);
  }

  async function handleSave(e) {
    e.preventDefault();
    if (!activeCompanyId || !form) return;
    setSaving(true);
    setSaveError('');
    setSaveSuccess(false);
    try {
      await updateCompanyProfile(activeCompanyId, form);
      await refreshCompanies(activeCompanyId);
      setSaveSuccess(true);
    } catch (err) {
      setSaveError(err.message ?? 'Failed to save.');
    } finally {
      setSaving(false);
    }
  }

  const handleLogoUpload = useCallback(async (file) => {
    if (!activeCompanyId) return;
    setUploading(true);
    try {
      const url = await uploadCompanyLogo(activeCompanyId, file);
      setLogoUrl(url);
      await refreshCompanies(activeCompanyId);
    } catch (err) {
      alert(err.message ?? 'Logo upload failed.');
    } finally {
      setUploading(false);
    }
  }, [activeCompanyId, refreshCompanies]);

  const handleLogoRemove = useCallback(async () => {
    if (!activeCompanyId) return;
    setUploading(true);
    try {
      await removeCompanyLogo(activeCompanyId);
      setLogoUrl('');
      await refreshCompanies(activeCompanyId);
    } catch (err) {
      alert(err.message ?? 'Failed to remove logo.');
    } finally {
      setUploading(false);
    }
  }, [activeCompanyId, refreshCompanies]);

  async function handleDelete() {
    if (!activeCompanyId) return;
    setDeleteBusy(true);
    setDeleteError('');
    try {
      await hardDeleteCompany(activeCompanyId);
      const remaining = await listUserCompanies(user.uid);
      if (remaining.length === 0) {
        await refreshCompanies();
        navigate('/create-company', { replace: true });
      } else {
        await refreshCompanies(remaining[0].companyId);
        navigate('/dashboard', { replace: true });
      }
    } catch (err) {
      setDeleteError(err.message ?? 'Deletion failed.');
      setDeleteBusy(false);
      setDeleteOpen(false);
    }
  }

  if (!form) return <LoadingSpinner fullScreen />;

  const fyMonth = (form.financialYearStart ?? '04-01').split('-')[0];

  return (
    <div className="flex flex-col gap-8 max-w-2xl">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Company Profile</h1>
        <p className="text-sm text-gray-500">
          {isAdmin ? 'Edit company details and manage settings.' : 'View company details.'}
        </p>
      </div>

      {/* Logo + identity */}
      <section className="rounded-xl border border-gray-200 bg-white p-6 flex flex-col gap-5">
        <LogoArea
          logoUrl={logoUrl}
          companyName={form.companyName}
          isAdmin={isAdmin}
          onUpload={handleLogoUpload}
          onRemove={handleLogoRemove}
          uploading={uploading}
        />

        {/* Type + parent (read-only) */}
        <div className="flex flex-wrap gap-4">
          <div className="flex flex-col gap-0.5">
            <span className="text-xs font-medium text-gray-500 uppercase tracking-wide">Type</span>
            <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${
              activeCompany?.type === COMPANY_TYPE.SUBSIDIARY
                ? 'bg-purple-100 text-purple-700'
                : 'bg-blue-100 text-blue-700'
            }`}>
              {activeCompany?.type === COMPANY_TYPE.SUBSIDIARY ? 'Subsidiary' : 'Parent'}
            </span>
          </div>
          {activeCompany?.type === COMPANY_TYPE.SUBSIDIARY && parentName && (
            <div className="flex flex-col gap-0.5">
              <span className="text-xs font-medium text-gray-500 uppercase tracking-wide">Parent company</span>
              <span className="text-sm text-gray-700">{parentName}</span>
            </div>
          )}
          {activeCompany?.createdAt && (
            <div className="flex flex-col gap-0.5">
              <span className="text-xs font-medium text-gray-500 uppercase tracking-wide">Created</span>
              <span className="text-sm text-gray-700">
                {activeCompany.createdAt.toDate?.().toLocaleDateString('en-IN', {
                  day: '2-digit', month: 'short', year: 'numeric',
                })}
              </span>
            </div>
          )}
        </div>
      </section>

      {/* Details form */}
      <form onSubmit={handleSave} noValidate>
        <section className="rounded-xl border border-gray-200 bg-white p-6 flex flex-col gap-4">
          <h2 className="font-semibold text-gray-800">Company Details</h2>

          <FormField
            label="Company name"
            id="companyName"
            name="companyName"
            value={form.companyName}
            onChange={handleChange}
            disabled={!isAdmin || saving}
          />

          <FormField
            label="Address"
            id="address"
            name="address"
            value={form.address}
            onChange={handleChange}
            disabled={!isAdmin || saving}
          />

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <FormField
              label="GSTIN"
              id="GSTIN"
              name="GSTIN"
              placeholder="22AAAAA0000A1Z5"
              value={form.GSTIN}
              onChange={handleChange}
              disabled={!isAdmin || saving}
            />
            <FormField
              label="Phone"
              id="phone"
              name="phone"
              type="tel"
              value={form.phone}
              onChange={handleChange}
              disabled={!isAdmin || saving}
            />
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <FormField
              label="Email"
              id="email"
              name="email"
              type="email"
              value={form.email}
              onChange={handleChange}
              disabled={!isAdmin || saving}
            />

            <div className="flex flex-col gap-1">
              <label className="text-sm font-medium text-gray-700">Financial year starts</label>
              {isAdmin ? (
                <select
                  value={fyMonth}
                  onChange={(e) => {
                    setForm((prev) => ({ ...prev, financialYearStart: `${e.target.value}-01` }));
                    setSaveError('');
                    setSaveSuccess(false);
                  }}
                  disabled={saving}
                  className="rounded-md border border-gray-300 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 disabled:opacity-50"
                >
                  {MONTHS.map(([num, name]) => (
                    <option key={num} value={num}>{name} 1</option>
                  ))}
                </select>
              ) : (
                <p className="text-sm text-gray-700 py-2">
                  {MONTHS.find(([n]) => n === fyMonth)?.[1] ?? fyMonth} 1
                </p>
              )}
            </div>
          </div>

          <div className="flex flex-col gap-1">
            <label htmlFor="businessType" className="text-sm font-medium text-gray-700">Business type</label>
            {isAdmin ? (
              <select
                id="businessType"
                name="businessType"
                value={form.businessType}
                onChange={handleChange}
                disabled={saving}
                className="rounded-md border border-gray-300 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 disabled:opacity-50"
              >
                <option value="">— Select type —</option>
                {BUSINESS_TYPES.map((bt) => (
                  <option key={bt.value} value={bt.value}>{bt.label}</option>
                ))}
              </select>
            ) : (
              <p className="text-sm text-gray-700 py-2">
                {BUSINESS_TYPES.find((bt) => bt.value === form.businessType)?.label ?? '—'}
              </p>
            )}
          </div>

          {/* Save feedback */}
          {saveError   && <p className="text-sm text-red-600">{saveError}</p>}
          {saveSuccess && <p className="text-sm text-green-600">✓ Changes saved.</p>}

          <RoleGuard permission="admin">
            <div className="flex justify-end pt-2">
              <button
                type="submit"
                disabled={saving}
                className="flex items-center gap-2 rounded-md bg-blue-600 px-5 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50 transition"
              >
                {saving && <LoadingSpinner size="sm" />}
                {saving ? 'Saving…' : 'Save changes'}
              </button>
            </div>
          </RoleGuard>
        </section>
      </form>

      {/* Danger zone — admin only */}
      <RoleGuard permission="admin">
        <section className="rounded-xl border-2 border-red-200 bg-red-50 p-6 flex flex-col gap-4">
          <div>
            <h2 className="font-semibold text-red-800">Danger Zone</h2>
            <p className="mt-0.5 text-sm text-red-700">
              Permanently delete this company and all its data. This cannot be undone.
            </p>
          </div>
          {deleteError && (
            <div className="rounded-md border border-red-300 bg-white px-4 py-3 text-sm text-red-700">
              {deleteError}
            </div>
          )}
          <div>
            <button
              type="button"
              onClick={() => { setDeleteError(''); setDeleteOpen(true); }}
              className="rounded-md border border-red-400 bg-white px-4 py-2 text-sm font-medium text-red-600 hover:bg-red-100 transition"
            >
              Delete company
            </button>
          </div>
        </section>
      </RoleGuard>

      <DeleteDialog
        open={deleteOpen}
        companyName={activeCompany?.companyName ?? ''}
        onClose={() => setDeleteOpen(false)}
        onConfirm={handleDelete}
        busy={deleteBusy}
      />
    </div>
  );
}
