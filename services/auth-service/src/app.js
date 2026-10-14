const express = require('express');

const app = express();

app.use(express.json());

app.get('/health', (_request, response) => {
  response.status(200).json({ status: 'ok', service: 'auth-service' });
});

module.exports = app;
