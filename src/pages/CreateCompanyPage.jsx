import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useApp } from '../context/AppContext';
import {
  createCompany,
  listAdminParentCompaniesForUser,
  COMPANY_TYPE,
} from '../services/companyService';
import { useRole } from '../hooks/useRole';
import AccessDenied from '../components/AccessDenied';
import { validateCompanyForm } from '../utils/validation';
import FormField from '../components/FormField';
import LoadingSpinner from '../components/LoadingSpinner';

const INITIAL_FORM = {
  companyName: '',
  type: COMPANY_TYPE.PARENT,
  parentCompanyId: '',
  address: '',
  GSTIN: '',
  phone: '',
  email: '',
  financialYearStart: '04-01',
};

const MONTHS = [
  ['01', 'January'], ['02', 'February'], ['03', 'March'], ['04', 'April'],
  ['05', 'May'], ['06', 'June'], ['07', 'July'], ['08', 'August'],
  ['09', 'September'], ['10', 'October'], ['11', 'November'], ['12', 'December'],
];

export default function CreateCompanyPage() {
  const navigate = useNavigate();
  const { user, companies, refreshCompanies } = useApp();
  const { isAdmin } = useRole();

  const [form, setForm] = useState(INITIAL_FORM);
  const [parents, setParents] = useState([]);
  const [errors, setErrors] = useState({});
  const [serverError, setServerError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const isFirstCompany = companies.length === 0;

  // Non-admins with existing companies cannot create more companies.
  const canCreate = isFirstCompany || isAdmin;

  useEffect(() => {
    if (!user || isFirstCompany) return;
    listAdminParentCompaniesForUser(user.uid).then(setParents);
  }, [user, isFirstCompany, isAdmin]);

  function handleChange(e) {
    const { name, value } = e.target;
    setForm((prev) => {
      const next = { ...prev, [name]: value };
      if (name === 'type' && value === COMPANY_TYPE.PARENT) {
        next.parentCompanyId = '';
      }
      return next;
    });
    if (errors[name]) setErrors((prev) => ({ ...prev, [name]: '' }));
    if (serverError) setServerError('');
  }

  function handleMonthChange(e) {
    setForm((prev) => ({ ...prev, financialYearStart: `${e.target.value}-01` }));
    if (errors.financialYearStart) {
      setErrors((prev) => ({ ...prev, financialYearStart: '' }));
    }
  }

  async function handleSubmit(e) {
    e.preventDefault();
    if (!canCreate) return;
    const validationErrors = validateCompanyForm(form);
    if (Object.keys(validationErrors).length) {
      setErrors(validationErrors);
      return;
    }

    setSubmitting(true);
    try {
      const { companyId } = await createCompany({
        companyName: form.companyName,
        type: form.type,
        parentCompanyId: form.type === COMPANY_TYPE.SUBSIDIARY ? form.parentCompanyId : null,
        ownerUid: user.uid,
        ownerEmail: user.email ?? '',
        ownerDisplayName: user.displayName ?? '',
        address: form.address,
        GSTIN: form.GSTIN,
        phone: form.phone,
        email: form.email,
        financialYearStart: form.financialYearStart,
      });
      await refreshCompanies(companyId);
      navigate('/dashboard', { replace: true });
    } catch (err) {
      setServerError(err.message ?? 'Failed to create company.');
    } finally {
      setSubmitting(false);
    }
  }

  const fyMonth = form.financialYearStart.split('-')[0] ?? '04';

  if (!isFirstCompany && !isAdmin) {
    return <AccessDenied message="Only company admins can create additional companies." />;
  }

  return (
    <div className="min-h-screen bg-gray-50 px-4 py-8">
      <div className="mx-auto w-full max-w-2xl rounded-xl border border-gray-200 bg-white p-8 shadow-sm">
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-gray-900">
            {isFirstCompany ? 'Create your first company' : 'Add a new company'}
          </h1>
          <p className="mt-1 text-sm text-gray-500">
            {isFirstCompany
              ? 'Set up the parent company to start tracking your books.'
              : 'Add a parent company or link a subsidiary to an existing parent.'}
          </p>
        </div>

        {serverError && (
          <div className="mb-4 rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {serverError}
          </div>
        )}

        <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-4">
          {!isFirstCompany && (
            <fieldset className="flex flex-col gap-2">
              <legend className="text-sm font-medium text-gray-700">Company type</legend>
              <div className="flex gap-4">
                <label className="flex items-center gap-2 text-sm text-gray-700">
                  <input
                    type="radio"
                    name="type"
                    value={COMPANY_TYPE.PARENT}
                    checked={form.type === COMPANY_TYPE.PARENT}
                    onChange={handleChange}
                    disabled={submitting}
                  />
                  Parent
                </label>
                <label className="flex items-center gap-2 text-sm text-gray-700">
                  <input
                    type="radio"
                    name="type"
                    value={COMPANY_TYPE.SUBSIDIARY}
                    checked={form.type === COMPANY_TYPE.SUBSIDIARY}
                    onChange={handleChange}
                    disabled={submitting || parents.length === 0}
                  />
                  Subsidiary
                  {parents.length === 0 && (
                    <span className="text-xs text-gray-400">(no parent yet)</span>
                  )}
                </label>
              </div>
            </fieldset>
          )}

          {form.type === COMPANY_TYPE.SUBSIDIARY && (
            <div className="flex flex-col gap-1">
              <label htmlFor="parentCompanyId" className="text-sm font-medium text-gray-700">
                Parent company
              </label>
              <select
                id="parentCompanyId"
                name="parentCompanyId"
                value={form.parentCompanyId}
                onChange={handleChange}
                disabled={submitting}
                className={`rounded-md border px-3 py-2 text-sm outline-none transition focus:ring-2 focus:ring-blue-500 focus:border-blue-500 ${
                  errors.parentCompanyId ? 'border-red-500 bg-red-50' : 'border-gray-300 bg-white'
                }`}
              >
                <option value="">Select a parent…</option>
                {parents.map((p) => (
                  <option key={p.companyId} value={p.companyId}>
                    {p.companyName}
                  </option>
                ))}
              </select>
              {errors.parentCompanyId && (
                <p className="text-xs text-red-600">{errors.parentCompanyId}</p>
              )}
            </div>
          )}

          <FormField
            label="Company name"
            id="companyName"
            name="companyName"
            type="text"
            value={form.companyName}
            onChange={handleChange}
            error={errors.companyName}
            disabled={submitting}
          />

          <FormField
            label="Address"
            id="address"
            name="address"
            type="text"
            value={form.address}
            onChange={handleChange}
            disabled={submitting}
          />

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <FormField
              label="GSTIN"
              id="GSTIN"
              name="GSTIN"
              type="text"
              placeholder="22AAAAA0000A1Z5"
              value={form.GSTIN}
              onChange={handleChange}
              error={errors.GSTIN}
              disabled={submitting}
            />
            <FormField
              label="Phone"
              id="phone"
              name="phone"
              type="tel"
              value={form.phone}
              onChange={handleChange}
              error={errors.phone}
              disabled={submitting}
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
              error={errors.email}
              disabled={submitting}
            />
            <div className="flex flex-col gap-1">
              <label htmlFor="fyMonth" className="text-sm font-medium text-gray-700">
                Financial year starts
              </label>
              <select
                id="fyMonth"
                value={fyMonth}
                onChange={handleMonthChange}
                disabled={submitting}
                className={`rounded-md border px-3 py-2 text-sm outline-none transition focus:ring-2 focus:ring-blue-500 focus:border-blue-500 ${
                  errors.financialYearStart ? 'border-red-500 bg-red-50' : 'border-gray-300 bg-white'
                }`}
              >
                {MONTHS.map(([num, name]) => (
                  <option key={num} value={num}>
                    {name} 1
                  </option>
                ))}
              </select>
              {errors.financialYearStart && (
                <p className="text-xs text-red-600">{errors.financialYearStart}</p>
              )}
            </div>
          </div>

          <div className="mt-2 flex items-center justify-end gap-3">
            {!isFirstCompany && (
              <button
                type="button"
                onClick={() => navigate(-1)}
                disabled={submitting}
                className="rounded-md border border-gray-300 bg-white px-4 py-2 text-sm text-gray-700 hover:bg-gray-50 transition"
              >
                Cancel
              </button>
            )}
            <button
              type="submit"
              disabled={submitting}
              className="flex items-center justify-center gap-2 rounded-md bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed transition"
            >
              {submitting && <LoadingSpinner size="sm" />}
              {submitting ? 'Creating…' : 'Create company'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
