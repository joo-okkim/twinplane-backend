const { Pool } = require('pg');

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

// A transient network blip on an idle client would otherwise crash the
// whole process (pg's default behavior for unhandled 'error' events).
pool.on('error', (err) => {
  console.error('Unexpected error on idle pg client', err);
});

module.exports = pool;
