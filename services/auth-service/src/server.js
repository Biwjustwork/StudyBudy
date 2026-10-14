const app = require('./app');
const { port } = require('./config/env');

app.listen(port, () => {
  console.log(`Auth Service is listening on port ${port}`);
});
