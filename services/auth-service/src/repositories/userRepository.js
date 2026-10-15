const { randomUUID } = require('node:crypto');
const { mkdir, readFile, rename, unlink, writeFile } = require('node:fs/promises');
const { dirname } = require('node:path');

class DuplicateEmailError extends Error {
  constructor() {
    super('An account with this email already exists.');
    this.name = 'DuplicateEmailError';
  }
}

class JsonUserRepository {
  constructor(filePath, users) {
    this.filePath = filePath;
    this.users = new Map(users.map((user) => [user.email, user]));
    this.writeQueue = Promise.resolve();
  }

  async findByEmail(email) {
    const user = this.users.get(email);
    return user ? { ...user } : null;
  }

  async createPending({ userId, email, passwordHash }) {
    return this.runSerialized(async () => {
      if ([...this.users.values()].some((user) => user.email === email || user.userId === userId)) {
        throw new DuplicateEmailError();
      }

      const now = new Date().toISOString();
      const user = {
        userId,
        email,
        passwordHash,
        status: 'pending_profile',
        createdAt: now,
        updatedAt: now,
      };
      this.users.set(email, user);

      try {
        await this.persist();
      } catch (error) {
        this.users.delete(email);
        throw error;
      }

      return { ...user };
    });
  }

  async markActive(userId) {
    return this.runSerialized(async () => {
      const user = [...this.users.values()].find((item) => item.userId === userId);
      if (!user || user.status !== 'pending_profile') return;

      const previous = { ...user };
      user.status = 'active';
      user.updatedAt = new Date().toISOString();

      try {
        await this.persist();
      } catch (error) {
        this.users.set(previous.email, previous);
        throw error;
      }
    });
  }

  async findActiveById(userId) {
    const user = [...this.users.values()].find(
      (item) => item.userId === userId && item.status === 'active',
    );
    return user ? { userId: user.userId, email: user.email } : null;
  }

  runSerialized(operation) {
    const result = this.writeQueue.then(operation);
    this.writeQueue = result.catch(() => {});
    return result;
  }

  async persist() {
    const temporaryPath = `${this.filePath}.${process.pid}.${randomUUID()}.tmp`;

    try {
      await writeFile(temporaryPath, `${JSON.stringify([...this.users.values()], null, 2)}\n`, 'utf8');
      await rename(temporaryPath, this.filePath);
    } catch (error) {
      await unlink(temporaryPath).catch(() => {});
      throw error;
    }
  }
}

function isStoredUser(value) {
  return Boolean(value)
    && typeof value === 'object'
    && typeof value.userId === 'string'
    && value.userId.length > 0
    && typeof value.email === 'string'
    && value.email.length > 0
    && typeof value.passwordHash === 'string'
    && value.passwordHash.length > 0
    && ['pending_profile', 'active'].includes(value.status);
}

async function openUserRepository(filePath) {
  if (typeof filePath !== 'string' || filePath.trim().length === 0) {
    throw new TypeError('AUTH_DATA_FILE must be a non-empty path.');
  }

  await mkdir(dirname(filePath), { recursive: true });

  let contents;
  try {
    contents = await readFile(filePath, 'utf8');
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
    contents = '[]\n';
    await writeFile(filePath, contents, { encoding: 'utf8', flag: 'wx' }).catch((writeError) => {
      if (writeError.code !== 'EEXIST') throw writeError;
    });
    contents = await readFile(filePath, 'utf8');
  }

  let users;
  try {
    users = JSON.parse(contents);
  } catch {
    throw new Error(`Auth data file at ${filePath} must contain valid JSON.`);
  }

  if (!Array.isArray(users) || !users.every(isStoredUser)) {
    throw new Error(`Auth data file at ${filePath} must contain an array of valid users.`);
  }

  const emails = new Set();
  const userIds = new Set();
  for (const user of users) {
    if (emails.has(user.email) || userIds.has(user.userId)) {
      throw new Error(`Auth data file at ${filePath} contains duplicate emails or user IDs.`);
    }
    emails.add(user.email);
    userIds.add(user.userId);
  }

  return new JsonUserRepository(filePath, users);
}

module.exports = {
  DuplicateEmailError,
  JsonUserRepository,
  openUserRepository,
};
