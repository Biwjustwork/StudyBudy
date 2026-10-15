const express = require('express');
const { createAuthRouter } = require('./routes/authRoutes');

function createApp(dependencies = {}) {
  const app = express();

  app.use(express.json({ limit: '10kb' }));

  app.get('/health', (_request, response) => {
    response.status(200).json({ status: 'ok', service: 'auth-service' });
  });

  app.use('/api', createAuthRouter(dependencies));

  app.use((error, _request, response, _next) => {
    if (error instanceof SyntaxError && error.status === 400 && 'body' in error) {
      return response.status(400).json({
        error: 'invalid_json',
        message: 'Request body must contain valid JSON.',
      });
    }

    if (error?.type === 'entity.too.large') {
      return response.status(413).json({
        error: 'request_too_large',
        message: 'Request body is too large.',
      });
    }

    return response.status(500).json({
      error: 'internal_error',
      message: 'An unexpected error occurred.',
    });
  });

  return app;
}

const app = createApp();
app.createApp = createApp;

module.exports = app;
