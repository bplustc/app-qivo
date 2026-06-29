const { Pool } = require('pg');
const config = require('./config');

if (!config.databaseUrl) {
  // Keep startup explicit so missing DB config fails fast.
  throw new Error('DATABASE_URL is required');
}

const pool = new Pool({
  connectionString: config.databaseUrl,
});

module.exports = {
  pool,
  query: (text, params) => pool.query(text, params),
};
