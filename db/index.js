const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool(
  process.env.DATABASE_URL
    ? { connectionString: process.env.DATABASE_URL }
    : {
        host: process.env.PGHOST || 'localhost',
        user: process.env.PGUSER || 'postgres',
        password: process.env.PGPASSWORD || 'postgres',
        database: process.env.PGDATABASE || 'billai',
        port: parseInt(process.env.PGPORT || '5432', 10),
      }
);

module.exports = {
  query: (text, params) => pool.query(text, params),
  pool,
};
