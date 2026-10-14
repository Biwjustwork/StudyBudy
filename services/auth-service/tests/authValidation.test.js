const test = require('node:test');
const assert = require('node:assert/strict');

const {
  isValidEmail,
  isValidPassword, 
  isValidName,
} = require('../src/validators/authValidation');

test('accepts an email with a local part and domain', () => {
  assert.equal(isValidEmail('student@example.com'), true);
});

test('rejects malformed email addresses', () => {
  for (const email of ['student.example.com', 'student@', 'student @example.com', '']) {
    assert.equal(isValidEmail(email), false, `expected ${JSON.stringify(email)} to be rejected`);
  }
});

test('accepts a password with at least 8 characters, an uppercase letter, and a symbol', () => {
  assert.equal(isValidPassword('StudyBuddy!1'), true);
});

test('rejects a short password', () => {
  assert.equal(isValidPassword('Ab!1234'), false);
});

test('rejects a password without an uppercase letter', () => {
  assert.equal(isValidPassword('studybuddy!1'), false);
});

test('rejects a password without a symbol', () => {
  assert.equal(isValidPassword('StudyBuddy11'), false);
});

test('does not count whitespace as a password symbol', () => {
  assert.equal(isValidPassword('Study Buddy1'), false);
});

test('accepts a name with non-whitespace content', () => {
  assert.equal(isValidName(' Aun '), true);
});

test('rejects a missing or whitespace-only name', () => {
  for (const name of ['', '   ', null]) {
    assert.equal(isValidName(name), false, `expected ${JSON.stringify(name)} to be rejected`);
  }
});
