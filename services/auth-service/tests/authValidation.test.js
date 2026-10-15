const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');

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

test('accepts a password whose UTF-8 length is exactly 72 bytes', () => {
  assert.equal(isValidPassword(`A${'a'.repeat(69)}!1`), true);
});

test('rejects a password longer than 72 UTF-8 bytes', () => {
  assert.equal(isValidPassword(`A${'a'.repeat(70)}!1`), false);
});

test('measures password limit in UTF-8 bytes for multibyte characters', () => {
  assert.equal(isValidPassword(`A${'ก'.repeat(24)}!`), false);
});

test('accepts a name with non-whitespace content', () => {
  assert.equal(isValidName(' Aun '), true);
});

test('rejects a missing or whitespace-only name', () => {
  for (const name of ['', '   ', null]) {
    assert.equal(isValidName(name), false, `expected ${JSON.stringify(name)} to be rejected`);
  }
});

const { hashPassword, verifyPassword } = require('../src/security/passwordService');

test('hashPassword returns a bcrypt hash instead of the original password', async () => {
  const password = 'StudyBuddy!1';
  const hash = await hashPassword(password);

  assert.notEqual(hash, password);
  assert.match(hash, /^\$2[aby]\$12\$/);
});

test('verifyPassword matches the original password and rejects a different one', async () => {
  const hash = await hashPassword('StudyBuddy!1');

  assert.equal(await verifyPassword('StudyBuddy!1', hash), true);
  assert.equal(await verifyPassword('WrongPassword!1', hash), false);
});

test('hashPassword rejects passwords longer than bcrypt accepts', async () => {
  await assert.rejects(hashPassword(`A${'a'.repeat(70)}!1`), {
    name: 'RangeError',
    message: 'Password must not exceed 72 UTF-8 bytes.',
  });
});

process.env.AUTH_TOKEN_SECRET = 'test-only-secret-with-at-least-32-characters';
const jwt = require('jsonwebtoken');
const { createAccessToken, verifyAccessToken } = require('../src/security/tokenService');

test('createAccessToken signs a token with userId and expiration', () => {
  const token = createAccessToken('user-123');
  const payload = jwt.decode(token);

  assert.equal(payload.userId, 'user-123');
  assert.equal(typeof payload.exp, 'number');
});

test('verifyAccessToken returns only userId and exp for a valid token', () => {
  const token = createAccessToken('user-123');

  assert.deepEqual(verifyAccessToken(token), {
    userId: 'user-123',
    exp: jwt.decode(token).exp,
  });
});

test('verifyAccessToken rejects malformed, tampered, and incorrectly signed tokens', () => {
  const token = createAccessToken('user-123');
  const otherSecretToken = jwt.sign({ userId: 'user-123' }, 'different-secret-that-is-long-enough', {
    algorithm: 'HS256',
    expiresIn: '1h',
  });

  assert.equal(verifyAccessToken('not-a-jwt'), null);
  assert.equal(verifyAccessToken(`${token}tampered`), null);
  assert.equal(verifyAccessToken(otherSecretToken), null);
});

test('verifyAccessToken rejects expired tokens and tokens missing required claims', () => {
  const secret = process.env.AUTH_TOKEN_SECRET;
  const expired = jwt.sign({ userId: 'user-123', exp: Math.floor(Date.now() / 1000) - 1 }, secret, {
    algorithm: 'HS256',
  });
  const noUserId = jwt.sign({}, secret, { algorithm: 'HS256', expiresIn: '1h' });
  const noExpiration = jwt.sign({ userId: 'user-123' }, secret, { algorithm: 'HS256' });

  assert.equal(verifyAccessToken(expired), null);
  assert.equal(verifyAccessToken(noUserId), null);
  assert.equal(verifyAccessToken(noExpiration), null);
});

const app = require('../src/app');

function createTestRepository(initialUsers = []) {
  const users = new Map(initialUsers.map((user) => [user.email, { ...user }]));

  return {
    users,
    async findByEmail(email) {
      return users.get(email) ?? null;
    },
    async createPending(user) {
      if (users.has(user.email)) {
        const error = new Error('Duplicate email');
        error.name = 'DuplicateEmailError';
        throw error;
      }

      const pendingUser = { ...user, status: 'pending_profile' };
      users.set(user.email, pendingUser);
      return pendingUser;
    },
    async markActive(userId) {
      const user = [...users.values()].find((candidate) => candidate.userId === userId);
      if (user) user.status = 'active';
    },
    async findActiveById(userId) {
      return [...users.values()].find((user) => user.userId === userId && user.status === 'active') ?? null;
    },
  };
}

async function withServer(testApp, run) {
  const server = testApp.listen(0);
  await new Promise((resolve) => server.once('listening', resolve));

  try {
    const address = server.address();
    return await run(`http://127.0.0.1:${address.port}`);
  } finally {
    await new Promise((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()));
    });
  }
}

function testApp(userRepository, profileClient) {
  return app.createApp({ userRepository, profileClient });
}

function jsonRequest(url, method, body, headers = {}) {
  return fetch(url, {
    method,
    headers: { 'Content-Type': 'application/json', ...headers },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
}

test('POST /api/register rejects invalid input with HTTP 400', async () => {
  const server = app.listen(0);

  try {
    const { port } = server.address();
    const response = await fetch(`http://127.0.0.1:${port}/api/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'bad-email', name: '', password: 'short' }),
    });

    assert.equal(response.status, 400);
  } finally {
    server.close();
  }
});

test('POST /api/register creates a profile and exposes no password hash', async () => {
  const repository = createTestRepository();
  const profileCalls = [];
  const client = { async createProfile(profile) { profileCalls.push(profile); } };

  await withServer(testApp(repository, client), async (url) => {
    const response = await jsonRequest(`${url}/api/register`, 'POST', {
      email: ' Student@Example.com ',
      name: ' Aun ',
      password: 'StudyBuddy!1',
    });
    const body = await response.json();

    assert.equal(response.status, 201);
    assert.equal(body.email, 'student@example.com');
    assert.equal(typeof body.userId, 'string');
    assert.equal('passwordHash' in body, false);
    assert.equal(profileCalls.length, 1);
    assert.deepEqual(profileCalls[0], {
      id: body.userId,
      name: 'Aun',
      email: 'student@example.com',
    });
    assert.match(repository.users.get('student@example.com').passwordHash, /^\$2[aby]\$12\$/);
    assert.equal(repository.users.get('student@example.com').status, 'active');
  });
});

test('POST /api/register rejects an already active email with HTTP 409', async () => {
  const repository = createTestRepository([{
    userId: 'user-existing',
    email: 'student@example.com',
    passwordHash: 'not-used-for-this-test',
    status: 'active',
  }]);
  const client = { async createProfile() { assert.fail('profile must not be called'); } };

  await withServer(testApp(repository, client), async (url) => {
    const response = await jsonRequest(`${url}/api/register`, 'POST', {
      email: 'student@example.com',
      name: 'Aun',
      password: 'StudyBuddy!1',
    });

    assert.equal(response.status, 409);
  });
});

test('POST /api/register retries an incomplete profile using the same userId', async () => {
  const repository = createTestRepository();
  const profileCalls = [];
  const client = {
    async createProfile(profile) {
      profileCalls.push(profile);
      if (profileCalls.length === 1) throw new Error('Profile Service unavailable');
    },
  };

  await withServer(testApp(repository, client), async (url) => {
    const registration = {
      email: 'student@example.com',
      name: 'Aun',
      password: 'StudyBuddy!1',
    };
    const first = await jsonRequest(`${url}/api/register`, 'POST', registration);
    assert.equal(first.status, 503);
    assert.equal(repository.users.get('student@example.com').status, 'pending_profile');

    const retry = await jsonRequest(`${url}/api/register`, 'POST', registration);
    const retryBody = await retry.json();

    assert.equal(retry.status, 201);
    assert.equal(retryBody.userId, repository.users.get('student@example.com').userId);
    assert.equal(profileCalls[0].id, profileCalls[1].id);
    assert.equal(repository.users.get('student@example.com').status, 'active');
  });
});

test('POST /api/login issues a JWT for an active account and rejects incorrect credentials', async () => {
  const passwordHash = await hashPassword('StudyBuddy!1');
  const repository = createTestRepository([{
    userId: 'user-123',
    email: 'student@example.com',
    passwordHash,
    status: 'active',
  }]);
  const client = { async createProfile() {} };

  await withServer(testApp(repository, client), async (url) => {
    const valid = await jsonRequest(`${url}/api/login`, 'POST', {
      email: 'STUDENT@example.com',
      password: 'StudyBuddy!1',
    });
    const validBody = await valid.json();
    assert.equal(valid.status, 200);
    assert.equal(validBody.userId, 'user-123');
    assert.equal(verifyAccessToken(validBody.token).userId, 'user-123');

    const invalid = await jsonRequest(`${url}/api/login`, 'POST', {
      email: 'student@example.com',
      password: 'WrongPassword!1',
    });
    assert.equal(invalid.status, 401);
    assert.deepEqual(await invalid.json(), {
      error: 'invalid_credentials',
      message: 'Email or password is incorrect.',
    });
  });
});

test('POST /api/login does not allow a pending account', async () => {
  const repository = createTestRepository([{
    userId: 'user-pending',
    email: 'student@example.com',
    passwordHash: await hashPassword('StudyBuddy!1'),
    status: 'pending_profile',
  }]);

  await withServer(testApp(repository, { async createProfile() {} }), async (url) => {
    const response = await jsonRequest(`${url}/api/login`, 'POST', {
      email: 'student@example.com',
      password: 'StudyBuddy!1',
    });

    assert.equal(response.status, 401);
  });
});

test('GET /api/me returns the account for a valid token and rejects an invalid token', async () => {
  const repository = createTestRepository([{
    userId: 'user-123',
    email: 'student@example.com',
    passwordHash: 'unused',
    status: 'active',
  }]);

  await withServer(testApp(repository, { async createProfile() {} }), async (url) => {
    const valid = await fetch(`${url}/api/me`, {
      headers: { Authorization: `Bearer ${createAccessToken('user-123')}` },
    });
    assert.equal(valid.status, 200);
    assert.deepEqual(await valid.json(), { userId: 'user-123', email: 'student@example.com' });

    const invalid = await fetch(`${url}/api/me`, {
      headers: { Authorization: 'Bearer invalid-token' },
    });
    assert.equal(invalid.status, 401);

    const missing = await fetch(`${url}/api/me`);
    assert.equal(missing.status, 401);
  });
});

async function withHttpServer(handler, run) {
  const server = http.createServer(handler);
  server.listen(0);
  await new Promise((resolve) => server.once('listening', resolve));

  try {
    const address = server.address();
    return await run(`http://127.0.0.1:${address.port}`);
  } finally {
    await new Promise((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()));
    });
  }
}

test('Profile client sends the internal token and accepts an idempotent profile response', async () => {
  const { createProfileClient } = require('../src/services/profileClient');
  let receivedRequest;

  await withHttpServer(async (request, response) => {
    const chunks = [];
    for await (const chunk of request) chunks.push(chunk);
    receivedRequest = {
      method: request.method,
      url: request.url,
      token: request.headers['x-service-token'],
      body: JSON.parse(Buffer.concat(chunks).toString('utf8')),
    };
    response.writeHead(200, { 'Content-Type': 'application/json' });
    response.end(JSON.stringify({ id: 'user-123' }));
  }, async (url) => {
    const client = createProfileClient({
      serviceUrl: url,
      serviceToken: 'test-only-service-token',
    });

    await client.createProfile({ id: 'user-123', name: 'Aun', email: 'student@example.com' });
  });

  assert.deepEqual(receivedRequest, {
    method: 'POST',
    url: '/internal/users',
    token: 'test-only-service-token',
    body: { id: 'user-123', name: 'Aun', email: 'student@example.com' },
  });
});

test('Profile client treats a failed Profile Service response as unavailable', async () => {
  const { createProfileClient, ProfileServiceError } = require('../src/services/profileClient');

  await withHttpServer((_request, response) => {
    response.writeHead(503);
    response.end();
  }, async (url) => {
    const client = createProfileClient({ serviceUrl: url, serviceToken: 'test-only-service-token' });

    await assert.rejects(
      client.createProfile({ id: 'user-123', name: 'Aun', email: 'student@example.com' }),
      ProfileServiceError,
    );
  });
});

const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { openUserRepository } = require('../src/repositories/userRepository');

test('JSON user repository persists pending and active users across restarts without raw passwords', async () => {
  assert.equal(typeof openUserRepository, 'function');
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'study-buddy-auth-'));
  const filePath = path.join(directory, 'users.json');

  try {
    const repository = await openUserRepository(filePath);
    const pending = await repository.createPending({
      userId: 'user-json-1',
      email: 'student@example.com',
      passwordHash: '$2b$12$test-hash',
    });
    assert.equal(pending.status, 'pending_profile');
    await repository.markActive('user-json-1');

    const fileContent = await fs.readFile(filePath, 'utf8');
    assert.match(fileContent, /"passwordHash"\s*:\s*"\$2b\$12\$test-hash"/);
    assert.doesNotMatch(fileContent, /StudyBuddy!1/);

    const reopened = await openUserRepository(filePath);
    assert.equal((await reopened.findByEmail('student@example.com')).status, 'active');
    assert.deepEqual(await reopened.findActiveById('user-json-1'), {
      userId: 'user-json-1',
      email: 'student@example.com',
    });
  } finally {
    await fs.rm(directory, { recursive: true, force: true });
  }
});

test('JSON user repository enforces unique email when registrations race', async () => {
  assert.equal(typeof openUserRepository, 'function');
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'study-buddy-auth-'));
  const filePath = path.join(directory, 'users.json');

  try {
    const repository = await openUserRepository(filePath);
    const results = await Promise.allSettled([
      repository.createPending({ userId: 'user-json-1', email: 'student@example.com', passwordHash: 'hash-1' }),
      repository.createPending({ userId: 'user-json-2', email: 'student@example.com', passwordHash: 'hash-2' }),
    ]);

    assert.equal(results.filter((result) => result.status === 'fulfilled').length, 1);
    const rejected = results.find((result) => result.status === 'rejected');
    assert.equal(rejected.reason.name, 'DuplicateEmailError');
    assert.equal((await fs.readFile(filePath, 'utf8').then(JSON.parse)).length, 1);
  } finally {
    await fs.rm(directory, { recursive: true, force: true });
  }
});
