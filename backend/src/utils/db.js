const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

// Helper: run a query and return all rows
async function query(sql, params = []) {
  const result = await pool.query(sql, params);
  return result.rows;
}

// Helper: run a query and return first row only
async function queryOne(sql, params = []) {
  const result = await pool.query(sql, params);
  return result.rows[0] || null;
}

// Helper: run INSERT/UPDATE/DELETE, return full result
async function run(sql, params = []) {
  const result = await pool.query(sql, params);
  return result;
}

module.exports = { query, queryOne, run, pool };
