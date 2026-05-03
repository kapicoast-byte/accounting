import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { registerUser } from '../services/authService';
import { validateRegisterForm, getFirebaseErrorMessage } from '../utils/validation';
import FormField from '../components/FormField';
import LoadingSpinner from '../components/LoadingSpinner';

const INITIAL_FORM = {
  displayName: '',
  email: '',
  password: '',
  confirmPassword: '',
};

export default function RegisterPage() {
  const navigate = useNavigate();

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
    const validationErrors = validateRegisterForm(form);
    if (Object.keys(validationErrors).length) {
      setErrors(validationErrors);
      return;
    }

    setLoading(true);
    try {
      await registerUser(form);
      navigate('/dashboard', { replace: true });
    } catch (err) {
      setServerError(getFirebaseErrorMessage(err.code));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-4 py-8"
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
            label="Full name"
            id="displayName" name="displayName" type="text" autoComplete="name"
            value={form.displayName} onChange={handleChange}
            error={errors.displayName} disabled={loading}
          />
          <FormField
            label="Email address"
            id="email" name="email" type="email" autoComplete="email"
            value={form.email} onChange={handleChange}
            error={errors.email} disabled={loading}
          />
          <FormField
            label="Password"
            id="password" name="password" type="password" autoComplete="new-password"
            value={form.password} onChange={handleChange}
            error={errors.password} disabled={loading}
          />
          <FormField
            label="Confirm password"
            id="confirmPassword" name="confirmPassword" type="password" autoComplete="new-password"
            value={form.confirmPassword} onChange={handleChange}
            error={errors.confirmPassword} disabled={loading}
          />

          <p className="text-xs" style={{ color: 'var(--fg-4)' }}>
            Password must be at least 8 characters, include one uppercase letter and one number.
          </p>

          <button
            type="submit" disabled={loading}
            className="mt-1 flex items-center justify-center gap-2 rounded-md px-4 py-2.5 text-sm font-semibold disabled:opacity-50 disabled:cursor-not-allowed transition"
            style={{ background: 'var(--info)', color: '#fff' }}
          >
            {loading && <LoadingSpinner size="sm" />}
            {loading ? 'Creating account…' : 'Create account'}
          </button>
        </form>

        <p className="mt-5 text-center text-sm" style={{ color: 'var(--fg-3)' }}>
          Already have an account?{' '}
          <Link to="/login" className="font-medium" style={{ color: 'var(--info)' }}>
            Sign in
          </Link>
        </p>
      </div>
    </div>
  );
}
