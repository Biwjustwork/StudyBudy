const { verifyAccessToken } = require('../security/tokenService');

function requireAuth(request, response, next) {
  const authorization = request.get('Authorization') ?? '';
  const match = /^Bearer\s+(\S+)$/i.exec(authorization);
  const claims = match ? verifyAccessToken(match[1]) : null;

  if (!claims) {
    return response.status(401).json({
      error: 'unauthorized',
      message: 'A valid Bearer token is required.',
    });
  }

  request.auth = claims;
  return next();
}

module.exports = { requireAuth };
