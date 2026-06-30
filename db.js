const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
  max: 10,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 10000
});

// Test connection
pool.query('SELECT NOW()')
  .then(r => console.log('PostgreSQL connected:', r.rows[0].now))
  .catch(e => console.error('DB connection error:', e.message));

// ====== Table creation ======

async function initTables() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    await client.query(`
      CREATE TABLE IF NOT EXISTS users (
        id TEXT PRIMARY KEY,
        username TEXT UNIQUE NOT NULL,
        password TEXT NOT NULL,
        nickname TEXT NOT NULL DEFAULT '',
        bio TEXT DEFAULT '',
        avatar_color TEXT DEFAULT '#667eea',
        avatar_text TEXT DEFAULT '?',
        avatar_url TEXT DEFAULT NULL,
        role TEXT DEFAULT 'user',
        points INTEGER DEFAULT 0,
        last_checkin_date TEXT DEFAULT NULL,
        bubble_style INTEGER DEFAULT 0,
        bubble_purchases JSONB DEFAULT '{}',
        blocked_users JSONB DEFAULT '[]',
        banned BOOLEAN DEFAULT false,
        created_at BIGINT NOT NULL
      )
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS messages (
        id TEXT PRIMARY KEY,
        type TEXT NOT NULL,
        sender_id TEXT NOT NULL,
        target_id TEXT NOT NULL,
        content TEXT DEFAULT '',
        message_type TEXT DEFAULT 'text',
        created_at BIGINT NOT NULL,
        is_read BOOLEAN DEFAULT false,
        read_by JSONB DEFAULT '[]'
      )
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS groups_t (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        description TEXT DEFAULT '',
        group_type TEXT DEFAULT 'public',
        password TEXT DEFAULT '',
        avatar_color TEXT DEFAULT '#667eea',
        avatar_text TEXT DEFAULT '?',
        members JSONB DEFAULT '[]',
        created_at BIGINT NOT NULL
      )
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS moments (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        content TEXT DEFAULT '',
        images JSONB DEFAULT '[]',
        likes JSONB DEFAULT '[]',
        comments JSONB DEFAULT '[]',
        is_public BOOLEAN DEFAULT true,
        created_at BIGINT NOT NULL
      )
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS friendships (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        friend_id TEXT NOT NULL,
        status TEXT DEFAULT 'pending',
        created_at BIGINT NOT NULL
      )
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS feedbacks (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        nickname TEXT NOT NULL,
        avatar_color TEXT DEFAULT '#667eea',
        avatar_text TEXT DEFAULT '?',
        content TEXT NOT NULL,
        status TEXT DEFAULT 'pending',
        created_at BIGINT NOT NULL
      )
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS donations (
        id TEXT PRIMARY KEY,
        wechat TEXT DEFAULT '',
        alipay TEXT DEFAULT ''
      )
    `);

    // Indexes
    await client.query(`CREATE INDEX IF NOT EXISTS idx_users_username ON users(username)`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_messages_sender_target ON messages(sender_id, target_id)`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_messages_type ON messages(type)`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_groups_t_members ON groups_t USING GIN (members)`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_moments_user ON moments(user_id)`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_moments_created ON moments(created_at DESC)`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_friendships_users ON friendships(user_id, friend_id)`);

    await client.query('COMMIT');
    console.log('All tables initialized');
  } catch (e) {
    await client.query('ROLLBACK');
    console.error('Table init error:', e.message);
    throw e;
  } finally {
    client.release();
  }
}

module.exports = { pool, initTables };
