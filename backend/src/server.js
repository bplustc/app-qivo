const app = require('./app');
const { port } = require('./config');

app.listen(port, () => {
  console.log(`Qivo wallet backend listening on port ${port}`);
});
