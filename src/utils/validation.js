export function validateEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

export function validatePassword(password) {
  if (password.length < 8) return 'Password must be at least 8 characters.';
  if (!/[A-Z]/.test(password)) return 'Password must contain at least one uppercase letter.';
  if (!/[0-9]/.test(password)) return 'Password must contain at least one number.';
  return null;
}

export function validateRegisterForm({ displayName, email, password, confirmPassword }) {
  const errors = {};

  if (!displayName?.trim()) errors.displayName = 'Full name is required.';
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

const GSTIN_REGEX = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/;
const PHONE_REGEX = /^[0-9+\-\s()]{7,20}$/;
const FY_START_REGEX = /^(0[1-9]|1[0-2])-(0[1-9]|[12][0-9]|3[01])$/;

export function validateCompanyForm({
  companyName,
  type,
  parentCompanyId,
  email,
  phone,
  GSTIN,
  financialYearStart,
}) {
  const errors = {};

  if (!companyName?.trim()) errors.companyName = 'Company name is required.';

  if (!type) {
    errors.type = 'Company type is required.';
  } else if (type === 'subsidiary' && !parentCompanyId) {
    errors.parentCompanyId = 'Select a parent company.';
  }

  if (email?.trim() && !validateEmail(email)) {
    errors.email = 'Enter a valid email address.';
  }

  if (phone?.trim() && !PHONE_REGEX.test(phone.trim())) {
    errors.phone = 'Enter a valid phone number.';
  }

  if (GSTIN?.trim() && !GSTIN_REGEX.test(GSTIN.trim().toUpperCase())) {
    errors.GSTIN = 'Enter a valid 15-character GSTIN.';
  }

  if (!financialYearStart) {
    errors.financialYearStart = 'Financial year start is required.';
  } else if (!FY_START_REGEX.test(financialYearStart)) {
    errors.financialYearStart = 'Use MM-DD format (e.g. 04-01).';
  }

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
