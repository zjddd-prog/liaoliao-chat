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
        avatar_frame INTEGER DEFAULT 0,
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
        read_by JSONB DEFAULT '[]',
        from_bubble_style INTEGER DEFAULT 0
      )
    `);

    await client.query(`
      ALTER TABLE messages ADD COLUMN IF NOT EXISTS from_bubble_style INTEGER DEFAULT 0;
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

    await client.query(`
      CREATE TABLE IF NOT EXISTS reports (
        id TEXT PRIMARY KEY,
        reporter_id TEXT NOT NULL,
        target_user_id TEXT NOT NULL,
        content TEXT DEFAULT '',
        images JSONB DEFAULT '[]',
        status TEXT DEFAULT 'pending',
        created_at BIGINT NOT NULL
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
    await client.query(`CREATE INDEX IF NOT EXISTS idx_reports_reporter ON reports(reporter_id)`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_reports_target ON reports(target_user_id)`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_reports_created ON reports(created_at DESC)`);

    // 迁移：添加 birthday 和 gender 字段（如果不存在）
    try {
      await client.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS birthday TEXT DEFAULT ''`);
      await client.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS gender TEXT DEFAULT ''`);
      console.log('Migration: birthday/gender columns ensured');
    } catch (e) {
      console.log('Migration note:', e.message);
    }

    // 迁移：添加 muted_until 字段（如果不存在）
    try {
      await client.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS muted_until BIGINT DEFAULT NULL`);
      console.log('Migration: muted_until column ensured');
    } catch (e) {
      console.log('Migration note:', e.message);
    }

    // 迁移：添加 avatar_frame 字段（如果不存在）
    try {
      await client.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS avatar_frame INTEGER DEFAULT 0`);
      console.log('Migration: avatar_frame column ensured');
    } catch (e) {
      console.log('Migration note:', e.message);
    }

    // 迁移：添加 blocked_users 字段（如果不存在）
    try {
      await client.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS blocked_users JSONB DEFAULT '[]'`);
      console.log('Migration: blocked_users column ensured');
    } catch (e) {
      console.log('Migration note:', e.message);
    }

    // 迁移：添加 owner_id 字段（如果不存在）——群创建者
    try {
      await client.query(`ALTER TABLE groups_t ADD COLUMN IF NOT EXISTS owner_id TEXT DEFAULT ''`);
      console.log('Migration: owner_id column ensured');
    } catch (e) {
      console.log('Migration note:', e.message);
    }

    // 数据修复：为没有 owner_id 的旧群聊回填第一个成员作为群主
    try {
      const groupsToFix = await client.query(`SELECT id, members FROM groups_t WHERE COALESCE(owner_id, '') = ''`);
      for (const g of groupsToFix.rows) {
        const members = g.members || [];
        if (members.length > 0) {
          await client.query(`UPDATE groups_t SET owner_id = $1 WHERE id = $2`, [members[0], g.id]);
          console.log(`Migration: set owner_id for group ${g.id} -> ${members[0]}`);
        }
      }
      console.log('Migration: owner_id backfill completed');
    } catch (e) {
      console.log('Migration note:', e.message);
    }

    // 迁移：添加 banned 字段（如果不存在）
    try {
      await client.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS banned BOOLEAN DEFAULT false`);
      console.log('Migration: banned column ensured');
    } catch (e) {
      console.log('Migration note:', e.message);
    }

    // 迁移：messages 表添加 message_type 字段（如果不存在）
    try {
      await client.query(`ALTER TABLE messages ADD COLUMN IF NOT EXISTS message_type TEXT DEFAULT 'text'`);
      console.log('Migration: message_type column ensured');
    } catch (e) {
      console.log('Migration note:', e.message);
    }

    // 迁移：messages 表添加 from_bubble_style 字段（如果不存在）
    try {
      await client.query(`ALTER TABLE messages ADD COLUMN IF NOT EXISTS from_bubble_style INTEGER DEFAULT 0`);
      console.log('Migration: from_bubble_style column ensured');
    } catch (e) {
      console.log('Migration note:', e.message);
    }

    await client.query('COMMIT');
    console.log('All tables initialized');
  } catch (e) {
    await client.query('ROLLBACK');
    console.error('Table init error:', e.message);
  } finally {
    client.release();
  }
}

module.exports = { pool, initTables };
