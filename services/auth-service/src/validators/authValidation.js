function isValidEmail(email) {
  if (typeof email !== 'string') {
    return false;
  }

  const normalizedEmail = email.trim();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail);
}

function isValidPassword(password) {
  if (typeof password !== 'string') {
    return false;
  }

  return password.length >= 8
    && Buffer.byteLength(password, 'utf8') <= 72
    && /[A-Z]/.test(password)
    && /[\p{P}\p{S}]/u.test(password);
}

function isValidName(name) {
  return typeof name === 'string' && name.trim().length > 0;
}

module.exports = {
  isValidEmail,
  isValidPassword,
  isValidName,
};
