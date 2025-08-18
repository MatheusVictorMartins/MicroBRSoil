const { Pool } = require('pg');

// Prefer DATABASE_URL if provided (e.g., in Docker), otherwise use individual env vars
const pool = process.env.DATABASE_URL
  ? new Pool({ connectionString: process.env.DATABASE_URL })
  : new Pool({
      user: process.env.POSTGRES_USER || 'postgres',
      password: process.env.POSTGRES_PASSWORD || '',
      host: process.env.POSTGRES_HOST || 'localhost',
      port: process.env.POSTGRES_PORT ? parseInt(process.env.POSTGRES_PORT, 10) : 5432,
      database: process.env.POSTGRES_DB || 'postgres',
      max: 20,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 2000,
    });

module.exports = pool;