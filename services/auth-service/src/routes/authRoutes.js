const express = require('express');
const { randomUUID } = require('node:crypto');
const { isValidEmail, isValidName, isValidPassword } = require('../validators/authValidation');
const { hashPassword, verifyPassword } = require('../security/passwordService');
const { createAccessToken } = require('../security/tokenService');
const { requireAuth } = require('../middleware/requireAuth');
const defaultUserRepository = {
  async findByEmail() {
    throw new Error('Auth user repository has not been initialized.');
  },
  async createPending() {
    throw new Error('Auth user repository has not been initialized.');
  },
  async markActive() {
    throw new Error('Auth user repository has not been initialized.');
  },
  async findActiveById() {
    throw new Error('Auth user repository has not been initialized.');
  },
};
const { createProfile } = require('../services/profileClient');

const GENERIC_LOGIN_ERROR = {
  error: 'invalid_credentials',
  message: 'Email or password is incorrect.',
};

function createAuthRouter({
  userRepository = defaultUserRepository,
  profileClient = { createProfile },
} = {}) {
  const router = express.Router();

  router.post('/register', async (request, response, next) => {
    const { email, name, password } = request.body ?? {};

    if (!isValidEmail(email) || !isValidName(name) || !isValidPassword(password)) {
      return response.status(400).json({
        error: 'invalid_request',
        message: 'Email, name, or password does not meet the requirements.',
      });
    }

    const normalizedEmail = email.trim().toLowerCase();
    const normalizedName = name.trim();

    try {
      let user = await userRepository.findByEmail(normalizedEmail);

      if (user?.status === 'active') {
        return response.status(409).json({
          error: 'email_already_registered',
          message: 'An account with this email already exists.',
        });
      }

      if (user?.status === 'pending_profile') {
        if (!(await verifyPassword(password, user.passwordHash))) {
          return response.status(409).json({
            error: 'registration_incomplete',
            message: 'This registration is incomplete. Retry with the original details.',
          });
        }
      } else {
        user = await userRepository.createPending({
          userId: randomUUID(),
          email: normalizedEmail,
          passwordHash: await hashPassword(password),
        });
      }

      try {
        await profileClient.createProfile({
          id: user.userId,
          name: normalizedName,
          email: normalizedEmail,
        });
      } catch {
        return response.status(503).json({
          error: 'profile_service_unavailable',
          message: 'Registration is incomplete. Retry with the same email, name, and password.',
        });
      }

      await userRepository.markActive(user.userId);
      return response.status(201).json({ userId: user.userId, email: normalizedEmail });
    } catch (error) {
      if (error?.name === 'DuplicateEmailError' || error?.code === 11000) {
        return response.status(409).json({
          error: 'email_already_registered',
          message: 'An account with this email already exists.',
        });
      }

      return next(error);
    }
  });

  router.post('/login', async (request, response, next) => {
    const { email, password } = request.body ?? {};

    if (typeof email !== 'string' || typeof password !== 'string') {
      return response.status(401).json(GENERIC_LOGIN_ERROR);
    }

    try {
      const user = await userRepository.findByEmail(email.trim().toLowerCase());
      if (
        !user
        || user.status !== 'active'
        || !(await verifyPassword(password, user.passwordHash))
      ) {
        return response.status(401).json(GENERIC_LOGIN_ERROR);
      }

      return response.status(200).json({
        userId: user.userId,
        token: createAccessToken(user.userId),
      });
    } catch (error) {
      return next(error);
    }
  });

  router.get('/me', requireAuth, async (request, response, next) => {
    try {
      const user = await userRepository.findActiveById(request.auth.userId);
      if (!user) {
        return response.status(401).json({
          error: 'unauthorized',
          message: 'The account for this token is unavailable.',
        });
      }

      return response.status(200).json({ userId: user.userId, email: user.email });
    } catch (error) {
      return next(error);
    }
  });

  return router;
}

module.exports = { createAuthRouter };
