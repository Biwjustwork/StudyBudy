const app = require('./app');
const { port, authDataFile } = require('./config/env');
const { openUserRepository } = require('./repositories/userRepository');
const { resolve } = require('node:path');

async function startServer() {
  try {
    const userRepository = await openUserRepository(resolve(authDataFile));
    app.createApp({ userRepository }).listen(port, () => {
      console.log(`Auth Service is listening on port ${port}`);
    });
  } catch {
    console.error('Auth Service could not open its JSON data file. Check AUTH_DATA_FILE.');
    process.exitCode = 1;
  }
}

startServer();
