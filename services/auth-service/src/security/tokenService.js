const jwt = require('jsonwebtoken');
const { authTokenSecret, jwtExpiresIn } = require('../config/env');

function createAccessToken(userId) {
  if (typeof userId !== 'string' || userId.trim().length === 0) {
    throw new TypeError('userId must be a non-empty string.');
  }

  return jwt.sign(
    { userId },
    authTokenSecret,
    { algorithm: 'HS256', expiresIn: jwtExpiresIn },
  );
}

function verifyAccessToken(token) {
  if (typeof token !== 'string' || token.length === 0) {
    return null;
  }

  try {
    const payload = jwt.verify(token, authTokenSecret, { algorithms: ['HS256'] });

    if (
      typeof payload !== 'object'
      || typeof payload.userId !== 'string'
      || payload.userId.trim().length === 0
      || !Number.isFinite(payload.exp)
    ) {
      return null;
    }

    return { userId: payload.userId, exp: payload.exp };
  } catch {
    return null;
  }
}

module.exports = {
  createAccessToken,
  verifyAccessToken,
};
