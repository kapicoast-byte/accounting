export function validateEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

export function validatePassword(password) {
  if (password.length < 8) return 'Password must be at least 8 characters.';
  if (!/[A-Z]/.test(password)) return 'Password must contain at least one uppercase letter.';
  if (!/[0-9]/.test(password)) return 'Password must contain at least one number.';
  return null;
}

export function validateRegisterForm({ displayName, email, password, confirmPassword, companyName }) {
  const errors = {};

  if (!displayName?.trim()) errors.displayName = 'Full name is required.';
  if (!companyName?.trim()) errors.companyName = 'Company name is required.';
  if (!email?.trim()) {
    errors.email = 'Email is required.';
  } else if (!validateEmail(email)) {
    errors.email = 'Enter a valid email address.';
  }

  const passwordError = validatePassword(password || '');
  if (passwordError) errors.password = passwordError;

  if (password !== confirmPassword) errors.confirmPassword = 'Passwords do not match.';

  return errors;
}

export function validateLoginForm({ email, password }) {
  const errors = {};
  if (!email?.trim()) {
    errors.email = 'Email is required.';
  } else if (!validateEmail(email)) {
    errors.email = 'Enter a valid email address.';
  }
  if (!password) errors.password = 'Password is required.';
  return errors;
}

export function getFirebaseErrorMessage(code) {
  const messages = {
    'auth/user-not-found': 'No account found with this email.',
    'auth/wrong-password': 'Incorrect password.',
    'auth/email-already-in-use': 'An account with this email already exists.',
    'auth/invalid-email': 'Invalid email address.',
    'auth/too-many-requests': 'Too many failed attempts. Please try again later.',
    'auth/network-request-failed': 'Network error. Check your connection.',
    'auth/invalid-credential': 'Invalid email or password.',
  };
  return messages[code] ?? 'An unexpected error occurred. Please try again.';
}
