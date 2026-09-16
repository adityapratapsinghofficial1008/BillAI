const fs = require('fs');
const path = require('path');
const { pool } = require('./index');

async function migrate() {
  try {
    const schemaSqlPath = path.join(__dirname, 'schema.sql');
    const v1SqlPath = path.join(__dirname, 'v1_migration.sql');

    console.log('Running base schema.sql...');
    await pool.query(fs.readFileSync(schemaSqlPath, 'utf8'));

    console.log('Running v1_migration.sql...');
    await pool.query(fs.readFileSync(v1SqlPath, 'utf8'));

    console.log('Migration completed successfully!');
  } catch (err) {
    console.error('Migration failed:', err);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

migrate();
