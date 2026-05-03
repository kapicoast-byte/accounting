import { useState } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { loginUser } from '../services/authService';
import { validateLoginForm, getFirebaseErrorMessage } from '../utils/validation';
import FormField from '../components/FormField';
import LoadingSpinner from '../components/LoadingSpinner';

const INITIAL_FORM = { email: '', password: '' };

export default function LoginPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const from = location.state?.from?.pathname ?? '/dashboard';

  const [form, setForm] = useState(INITIAL_FORM);
  const [errors, setErrors] = useState({});
  const [serverError, setServerError] = useState('');
  const [loading, setLoading] = useState(false);

  function handleChange(e) {
    const { name, value } = e.target;
    setForm((prev) => ({ ...prev, [name]: value }));
    if (errors[name]) setErrors((prev) => ({ ...prev, [name]: '' }));
    if (serverError) setServerError('');
  }

  async function handleSubmit(e) {
    e.preventDefault();
    const validationErrors = validateLoginForm(form);
    if (Object.keys(validationErrors).length) {
      setErrors(validationErrors);
      return;
    }

    setLoading(true);
    try {
      await loginUser(form);
      navigate(from, { replace: true });
    } catch (err) {
      setServerError(getFirebaseErrorMessage(err.code));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-4"
      style={{ background: 'var(--bg)' }}>
      <div className="w-full max-w-md rounded-xl p-8"
        style={{ background: 'var(--card)', border: '1px solid var(--border)' }}>

        <div className="mb-8 flex flex-col items-center gap-3 text-center">
          <img src="/balance-logo.png" alt="Balance" style={{ height: 80, width: 'auto' }} />
          <div>
            <h1 className="text-2xl font-bold" style={{ color: 'var(--fg)' }}>Balance</h1>
            <p className="mt-1 text-sm" style={{ color: 'var(--fg-3)' }}>Smart Accounting for Modern Business</p>
          </div>
        </div>

        {serverError && (
          <div className="mb-4 rounded-md px-4 py-3 text-sm"
            style={{ background: 'var(--neg-soft)', border: '1px solid var(--neg)', color: 'var(--neg)' }}>
            {serverError}
          </div>
        )}

        <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-4">
          <FormField
            label="Email address"
            id="email" name="email" type="email" autoComplete="email"
            value={form.email} onChange={handleChange}
            error={errors.email} disabled={loading}
          />
          <FormField
            label="Password"
            id="password" name="password" type="password" autoComplete="current-password"
            value={form.password} onChange={handleChange}
            error={errors.password} disabled={loading}
          />

          <button
            type="submit" disabled={loading}
            className="mt-2 flex items-center justify-center gap-2 rounded-md px-4 py-2.5 text-sm font-semibold disabled:opacity-50 disabled:cursor-not-allowed transition"
            style={{ background: 'var(--info)', color: '#fff' }}
          >
            {loading && <LoadingSpinner size="sm" />}
            {loading ? 'Signing in…' : 'Sign in'}
          </button>
        </form>

        <p className="mt-5 text-center text-sm" style={{ color: 'var(--fg-3)' }}>
          Don&apos;t have an account?{' '}
          <Link to="/register" className="font-medium" style={{ color: 'var(--info)' }}>
            Create one
          </Link>
        </p>
      </div>
    </div>
  );
}
