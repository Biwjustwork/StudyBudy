require('dotenv').config();

const port = Number(process.env.PORT ?? 3001);
const authTokenSecret = process.env.AUTH_TOKEN_SECRET;
const jwtExpiresIn = process.env.JWT_EXPIRES_IN ?? '1h';

if (!Number.isInteger(port) || port < 1 || port > 65535) {
  throw new Error('PORT must be an integer between 1 and 65535.');
}

if (!authTokenSecret || authTokenSecret.length < 32) {
  throw new Error('AUTH_TOKEN_SECRET must be set and at least 32 characters long.');
}

module.exports = {
  port,
  authTokenSecret,
  jwtExpiresIn,
};
