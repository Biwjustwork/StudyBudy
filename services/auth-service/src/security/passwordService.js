const bcrypt = require('bcrypt');

const SALT_ROUNDS = 12;
const MAX_PASSWORD_BYTES = 72;

function assertPassword(password) {
  if (typeof password !== 'string') {
    throw new TypeError('Password must be a string.');
  }

  if (Buffer.byteLength(password, 'utf8') > MAX_PASSWORD_BYTES) {
    throw new RangeError('Password must not exceed 72 UTF-8 bytes.');
  }
}

async function hashPassword(password) {
  assertPassword(password);
  return bcrypt.hash(password, SALT_ROUNDS);
}

async function verifyPassword(password, hash) {
  if (typeof password !== 'string' || typeof hash !== 'string') {
    return false;
  }

  if (Buffer.byteLength(password, 'utf8') > MAX_PASSWORD_BYTES) {
    return false;
  }

  return bcrypt.compare(password, hash);
}

module.exports = {
  hashPassword,
  verifyPassword,
};
