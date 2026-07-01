const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const multer = require('multer');
const bcrypt = require('bcryptjs');
const fs = require('fs');
const path = require('path');
const { pool, initTables } = require('./db');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
    cors: { origin: "*" },
    maxHttpBufferSize: 5e6
});

const PORT = process.env.PORT || 3000;
const UPLOADS_DIR = path.join(__dirname, 'public', 'uploads');

if (!fs.existsSync(UPLOADS_DIR)) fs.mkdirSync(UPLOADS_DIR, { recursive: true });

// ========== Middleware ==========

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

const storage = multer.diskStorage({
    destination: UPLOADS_DIR,
    filename: (req, file, cb) => {
        const ext = path.extname(file.originalname);
        cb(null, `${Date.now()}-${Math.random().toString(36).slice(2)}${ext}`);
    }
});
const upload = multer({
    storage,
    limits: { fileSize: 3 * 1024 * 1024 },
    fileFilter: (req, file, cb) => {
        if (/image\/.*/.test(file.mimetype)) cb(null, true);
        else cb(new Error('Only images allowed'), false);
    }
});

// ========== Auth Middleware (async) ==========

async function authMiddleware(req, res, next) {
    const token = req.headers.authorization;
    if (!token) return res.status(401).json({ error: '未登录' });
    try {
        const result = await pool.query('SELECT * FROM users WHERE id = $1', [token]);
        if (result.rows.length === 0) return res.status(401).json({ error: '无效token' });
        const user = result.rows[0];
        if (user.banned) return res.status(403).json({ error: '账号已被封禁' });
        req.user = {
            id: user.id,
            username: user.username,
            nickname: user.nickname,
            bio: user.bio,
            avatarColor: user.avatar_color,
            avatarText: user.avatar_text,
            avatarUrl: user.avatar_url,
            role: user.role,
            points: user.points,
            lastCheckinDate: user.last_checkin_date,
            bubbleStyle: user.bubble_style,
            bubblePurchases: user.bubble_purchases || {},
            blockedUsers: user.blocked_users || [],
            banned: user.banned,
            mutedUntil: user.muted_until,
            birthday: user.birthday,
            gender: user.gender,
            createdAt: user.created_at
        };
        next();
    } catch (e) {
        console.error('Auth error:', e.message);
        res.status(500).json({ error: '服务器错误' });
    }
}

async function adminMiddleware(req, res, next) {
    await authMiddleware(req, res, async () => {
        if (req.user.role !== 'admin' && req.user.role !== 'super_admin') {
            return res.status(403).json({ error: '需要管理员权限' });
        }
        next();
    });
}

// Helper: wrap async route handlers
function asyncHandler(fn) {
    return (req, res, next) => fn(req, res, next).catch(next);
}

// ========== API Routes ==========

// Register
app.post('/api/register', asyncHandler(async (req, res) => {
    const { username, password, nickname, bio } = req.body;
    if (!username || !password) return res.status(400).json({ error: '用户名和密码必填' });
    if (username.length < 2 || username.length > 20) return res.status(400).json({ error: '用户名2-20字符' });
    if (password.length < 4) return res.status(400).json({ error: '密码至少4位' });

    const existing = await pool.query('SELECT id FROM users WHERE username = $1', [username]);
    if (existing.rows.length > 0) return res.status(400).json({ error: '用户名已存在' });

    const colors = ['#667eea', '#764ba2', '#f093fb', '#f5576c', '#4facfe', '#43e97b', '#fa709a', '#fee140', '#a18cd1', '#fbc2eb'];
    const id = 'u_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8);
    const hashedPw = bcrypt.hashSync(password, 10);

    await pool.query(
        `INSERT INTO users (id, username, password, nickname, bio, avatar_color, avatar_text, role, created_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
        [id, username, hashedPw, nickname || username, bio || '',
         colors[Math.floor(Math.random() * colors.length)], (nickname || username).slice(0, 1).toUpperCase(),
         'user', Date.now()]
    );

    // Auto-add to public group
    const pubGroup = await pool.query("SELECT id, members FROM groups_t WHERE id = 'g_public'");
    if (pubGroup.rows.length > 0) {
        const members = pubGroup.rows[0].members || [];
        if (!members.includes(id)) {
            members.push(id);
            await pool.query('UPDATE groups_t SET members = $1 WHERE id = $2', [JSON.stringify(members), 'g_public']);
        }
    }

    res.json({
        success: true,
        token: id,
        user: { id, username, nickname: nickname || username, bio: bio || '',
                avatarColor: colors[Math.floor(Math.random() * colors.length)],
                avatarText: (nickname || username).slice(0, 1).toUpperCase(),
                role: 'user', createdAt: Date.now(),
                points: 0, bubbleStyle: 0, bubblePurchases: {}, lastCheckinDate: null }
    });
}));

// Login
app.post('/api/login', asyncHandler(async (req, res) => {
    const { username, password } = req.body;
    const result = await pool.query('SELECT * FROM users WHERE username = $1', [username]);
    if (result.rows.length === 0) return res.status(400).json({ error: '用户名不存在' });
    const user = result.rows[0];
    if (user.banned) return res.status(403).json({ error: '账号已被封禁，请联系管理员' });
    if (!bcrypt.compareSync(password, user.password)) return res.status(400).json({ error: '密码错误' });

    res.json({
        success: true,
        token: user.id,
        user: { id: user.id, username: user.username, nickname: user.nickname, bio: user.bio,
                avatarColor: user.avatar_color, avatarText: user.avatar_text,
                avatarUrl: user.avatar_url, role: user.role, createdAt: user.created_at,
                points: user.points || 0, bubbleStyle: user.bubble_style || 0,
                bubblePurchases: user.bubble_purchases || {}, lastCheckinDate: user.last_checkin_date }
    });
}));

// Get current user
app.get('/api/me', authMiddleware, (req, res) => {
    const user = req.user;
    res.json({ id: user.id, username: user.username, nickname: user.nickname, bio: user.bio,
               avatarColor: user.avatarColor, avatarText: user.avatarText,
               avatarUrl: user.avatarUrl, role: user.role, createdAt: user.createdAt,
               points: user.points || 0, bubbleStyle: user.bubbleStyle || 0,
               bubblePurchases: user.bubblePurchases || {}, lastCheckinDate: user.lastCheckinDate });
});

// Update profile
app.put('/api/profile', authMiddleware, asyncHandler(async (req, res) => {
    const { nickname, bio } = req.body;
    const updates = [];
    const values = [];
    let idx = 1;

    if (nickname) {
        updates.push(`nickname = $${idx}`, `avatar_text = $${idx + 1}`);
        values.push(nickname, nickname.slice(0, 1).toUpperCase());
        idx += 2;
    }
    if (bio) {
        updates.push(`bio = $${idx}`);
        values.push(bio);
        idx++;
    }

    if (updates.length === 0) return res.status(400).json({ error: '没有要更新的内容' });

    values.push(req.user.id);
    await pool.query(`UPDATE users SET ${updates.join(', ')} WHERE id = $${idx}`, values);

    const updated = await pool.query('SELECT * FROM users WHERE id = $1', [req.user.id]);
    const u = updated.rows[0];
    res.json({ success: true, user: { id: u.id, nickname: u.nickname, bio: u.bio, avatarColor: u.avatar_color, avatarText: u.avatar_text } });
}));

// Update avatar color
app.put('/api/avatar-color', authMiddleware, asyncHandler(async (req, res) => {
    const { avatarColor } = req.body;
    if (!avatarColor) return res.status(400).json({ error: '请选择颜色' });
    await pool.query('UPDATE users SET avatar_color = $1 WHERE id = $2', [avatarColor, req.user.id]);
    res.json({ success: true, avatarColor });
}));

// Upload avatar
app.post('/api/avatar', authMiddleware, upload.single('avatar'), asyncHandler(async (req, res) => {
    if (!req.file) return res.status(400).json({ error: '请上传图片' });
    const url = `/uploads/${req.file.filename}`;
    await pool.query('UPDATE users SET avatar_url = $1 WHERE id = $2', [url, req.user.id]);
    res.json({ success: true, avatarUrl: url });
}));

// Clear avatar
app.delete('/api/avatar', authMiddleware, asyncHandler(async (req, res) => {
    await pool.query('UPDATE users SET avatar_url = NULL WHERE id = $1', [req.user.id]);
    res.json({ success: true });
}));

// Get all users
app.get('/api/users', authMiddleware, asyncHandler(async (req, res) => {
    const result = await pool.query(
        `SELECT u.id, u.username, u.nickname, u.bio, u.avatar_color, u.avatar_text, u.avatar_url, u.banned, u.muted_until, u.points, u.created_at,
                EXISTS(SELECT 1 FROM friendships f WHERE f.status='accepted' AND
                       ((f.user_id=$1 AND f.friend_id=u.id) OR (f.user_id=u.id AND f.friend_id=$1))) as is_friend
         FROM users u WHERE u.id != $1 AND u.role != 'system'`,
        [req.user.id]
    );
    res.json(result.rows.map(u => ({
        id: u.id, username: u.username, nickname: u.nickname, bio: u.bio,
        avatarColor: u.avatar_color, avatarText: u.avatar_text, avatarUrl: u.avatar_url,
        banned: u.banned, mutedUntil: u.muted_until, points: u.points || 0, createdAt: u.created_at, isFriend: u.is_friend
    })));
}));

app.get('/api/user/:userId', authMiddleware, asyncHandler(async (req, res) => {
    const userId = req.params.userId;
    const result = await pool.query('SELECT * FROM users WHERE id = $1', [userId]);
    if (result.rows.length === 0) return res.status(404).json({ error: '用户不存在' });
    const u = result.rows[0];

    const momentsResult = await pool.query(
        'SELECT * FROM moments WHERE user_id = $1 ORDER BY created_at DESC LIMIT 20',
        [userId]
    );

    res.json({
        id: u.id, username: u.username, nickname: u.nickname, bio: u.bio,
        avatarColor: u.avatar_color, avatarText: u.avatar_text, avatarUrl: u.avatar_url,
        role: u.role, gender: u.gender, birthday: u.birthday, createdAt: u.created_at,
        points: u.points || 0, bubbleStyle: u.bubble_style || 0,
        moments: momentsResult.rows.map(m => ({
            id: m.id, content: m.content, images: m.images || [],
            likes: m.likes || [], comments: m.comments || [], createdAt: m.created_at
        }))
    });
}));

// Get friends
app.get('/api/friends', authMiddleware, asyncHandler(async (req, res) => {
    const result = await pool.query(
        `SELECT u.id, u.username, u.nickname, u.bio, u.avatar_color, u.avatar_text, u.avatar_url
         FROM users u
         INNER JOIN friendships f ON (f.user_id = u.id OR f.friend_id = u.id)
         WHERE (f.user_id = $1 OR f.friend_id = $1) AND f.status = 'accepted' AND u.id != $1`,
        [req.user.id]
    );
    res.json(result.rows.map(u => ({
        id: u.id, username: u.username, nickname: u.nickname, bio: u.bio,
        avatarColor: u.avatar_color, avatarText: u.avatar_text, avatarUrl: u.avatar_url, online: false
    })));
}));

// Add friend
app.post('/api/friends/add', authMiddleware, asyncHandler(async (req, res) => {
    const { userId } = req.body;
    if (userId === req.user.id) return res.status(400).json({ error: '不能添加自己' });

    const userCheck = await pool.query('SELECT id FROM users WHERE id = $1', [userId]);
    if (userCheck.rows.length === 0) return res.status(404).json({ error: '用户不存在' });

    const existing = await pool.query(
        'SELECT * FROM friendships WHERE ((user_id=$1 AND friend_id=$2) OR (user_id=$2 AND friend_id=$1))',
        [req.user.id, userId]
    );

    if (existing.rows.length > 0) {
        const f = existing.rows[0];
        if (f.status === 'accepted') return res.status(400).json({ error: '已经是好友了' });
        if (f.status === 'pending') {
            await pool.query('UPDATE friendships SET status = $1 WHERE id = $2', ['accepted', f.id]);
            return res.json({ success: true, message: '已接受好友请求' });
        }
    }

    await pool.query(
        'INSERT INTO friendships (id, user_id, friend_id, status, created_at) VALUES ($1,$2,$3,$4,$5)',
        ['f_' + Date.now(), req.user.id, userId, 'accepted', Date.now()]
    );
    res.json({ success: true, message: '好友添加成功' });
}));

// Remove friend
app.post('/api/friends/remove', authMiddleware, asyncHandler(async (req, res) => {
    const { userId } = req.body;
    await pool.query(
        'DELETE FROM friendships WHERE (user_id=$1 AND friend_id=$2) OR (user_id=$2 AND friend_id=$1)',
        [req.user.id, userId]
    );
    res.json({ success: true });
}));

// ========== Chat APIs ==========

app.get('/api/messages/private/:userId', authMiddleware, asyncHandler(async (req, res) => {
    const otherUserId = req.params.userId;

    const result = await pool.query(
        `SELECT * FROM messages WHERE type='private' AND
         ((sender_id=$1 AND target_id=$2) OR (sender_id=$2 AND target_id=$1))
         ORDER BY created_at ASC`,
        [req.user.id, otherUserId]
    );

    // Mark as read
    await pool.query(
        `UPDATE messages SET is_read=true WHERE type='private' AND target_id=$1 AND sender_id=$2 AND is_read=false`,
        [req.user.id, otherUserId]
    );

    res.json(result.rows.map(m => ({
        id: m.id, from: m.sender_id, to: m.target_id,
        content: m.content, messageType: m.message_type || 'text',
        timestamp: m.created_at, read: m.is_read,
        fromBubbleStyle: m.from_bubble_style || 0
    })));
}));

app.get('/api/messages/group/:groupId', authMiddleware, asyncHandler(async (req, res) => {
    const result = await pool.query(
        "SELECT * FROM messages WHERE type='group' AND target_id=$1 ORDER BY created_at ASC",
        [req.params.groupId]
    );
    res.json(result.rows.map(m => ({
        id: m.id, from: m.sender_id, to: m.target_id,
        content: m.content, messageType: m.message_type || 'text',
        timestamp: m.created_at, readBy: m.read_by || [],
        fromBubbleStyle: m.from_bubble_style || 0
    })));
}));

// Get combined chat list (friends + groups)
app.get('/api/chat-list', authMiddleware, asyncHandler(async (req, res) => {
    const userId = req.user.id;

    // Get accepted friends
    const friendsResult = await pool.query(
        'SELECT user_id, friend_id FROM friendships WHERE (user_id=$1 OR friend_id=$1) AND status=$2',
        [userId, 'accepted']
    );
    const friendIds = friendsResult.rows.map(f => f.user_id === userId ? f.friend_id : f.user_id);

    const friends = [];
    for (const fid of friendIds) {
        const userRes = await pool.query('SELECT id, nickname, avatar_color, avatar_text, avatar_url FROM users WHERE id=$1', [fid]);
        if (userRes.rows.length === 0) continue;
        const u = userRes.rows[0];

        // Last private message
        const lastMsgRes = await pool.query(
            `SELECT content, created_at FROM messages WHERE type='private' AND
             ((sender_id=$1 AND target_id=$2) OR (sender_id=$2 AND target_id=$1))
             ORDER BY created_at DESC LIMIT 1`,
            [userId, fid]
        );

        // Unread count
        const unreadRes = await pool.query(
            "SELECT COUNT(*) FROM messages WHERE type='private' AND sender_id=$1 AND target_id=$2 AND is_read=false",
            [fid, userId]
        );

        friends.push({
            id: u.id,
            nickname: u.nickname,
            avatarColor: u.avatar_color,
            avatarText: u.avatar_text,
            avatarUrl: u.avatar_url,
            lastMsg: lastMsgRes.rows.length > 0 ? {
                content: lastMsgRes.rows[0].content,
                timestamp: lastMsgRes.rows[0].created_at
            } : null,
            unread: parseInt(unreadRes.rows[0].count)
        });
    }

    // Get groups where current user is a member
    const groupsResult = await pool.query(
        'SELECT id, name, description, avatar_color, avatar_text, members FROM groups_t WHERE members @> $1::jsonb',
        [JSON.stringify([userId])]
    );

    const groups = [];
    for (const g of groupsResult.rows) {
        // Last group message
        const lastMsgRes = await pool.query(
            "SELECT content, created_at FROM messages WHERE type='group' AND target_id=$1 ORDER BY created_at DESC LIMIT 1",
            [g.id]
        );

        // Unread count
        const unreadRes = await pool.query(
            "SELECT COUNT(*) FROM messages WHERE type='group' AND target_id=$1 AND sender_id!=$2 AND (read_by IS NULL OR NOT read_by @> $3::jsonb)",
            [g.id, userId, JSON.stringify([userId])]
        );

        groups.push({
            id: g.id,
            name: g.name,
            description: g.description,
            avatarColor: g.avatar_color,
            avatarText: g.avatar_text,
            memberCount: Array.isArray(g.members) ? g.members.length : JSON.parse(g.members || '[]').length,
            lastMsg: lastMsgRes.rows.length > 0 ? {
                content: lastMsgRes.rows[0].content,
                timestamp: lastMsgRes.rows[0].created_at
            } : null,
            unread: parseInt(unreadRes.rows[0].count)
        });
    }

    res.json({ friends, groups });
}));

app.get('/api/messages/unread', authMiddleware, asyncHandler(async (req, res) => {
    // Get friend IDs
    const friendsResult = await pool.query(
        'SELECT user_id, friend_id FROM friendships WHERE (user_id=$1 OR friend_id=$1) AND status=$2',
        [req.user.id, 'accepted']
    );
    const friendIds = friendsResult.rows.map(f => f.user_id === req.user.id ? f.friend_id : f.user_id);

    // Private unread
    const privateUnread = {};
    for (const fid of friendIds) {
        const count = await pool.query(
            "SELECT COUNT(*) FROM messages WHERE type='private' AND sender_id=$1 AND target_id=$2 AND is_read=false",
            [fid, req.user.id]
        );
        privateUnread[fid] = parseInt(count.rows[0].count);
    }

    // Group unread
    const groupsResult = await pool.query('SELECT id FROM groups_t WHERE members @> $1::jsonb', [JSON.stringify([req.user.id])]);
    const groupUnread = {};
    for (const g of groupsResult.rows) {
        const count = await pool.query(
            "SELECT COUNT(*) FROM messages WHERE type='group' AND target_id=$1 AND sender_id!=$2 AND (read_by IS NULL OR NOT read_by @> $3::jsonb)",
            [g.id, req.user.id, JSON.stringify([req.user.id])]
        );
        groupUnread[g.id] = parseInt(count.rows[0].count);
    }

    res.json({ private: privateUnread, group: groupUnread });
}));

// ========== Group APIs ==========

app.get('/api/groups', authMiddleware, asyncHandler(async (req, res) => {
    const result = await pool.query(
        'SELECT * FROM groups_t WHERE members @> $1::jsonb',
        [JSON.stringify([req.user.id])]
    );
    res.json(result.rows.map(g => ({
        id: g.id, name: g.name, description: g.description,
        avatarColor: g.avatar_color, avatarText: g.avatar_text,
        memberCount: (g.members || []).length, createdAt: g.created_at
    })));
}));

app.post('/api/groups/create', authMiddleware, asyncHandler(async (req, res) => {
    const { name, description } = req.body;
    if (!name) return res.status(400).json({ error: '群名必填' });

    const colors = ['#667eea', '#764ba2', '#f093fb', '#f5576c', '#4facfe', '#43e97b', '#fa709a', '#fee140'];
    const id = 'g_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6);
    const newGroup = {
        id, name, description: description || '',
        avatar_color: colors[Math.floor(Math.random() * colors.length)],
        avatar_text: name.slice(0, 1),
        members: [req.user.id],
        created_at: Date.now()
    };

    await pool.query(
        'INSERT INTO groups_t (id, name, description, avatar_color, avatar_text, members, created_at) VALUES ($1,$2,$3,$4,$5,$6,$7)',
        [id, name, description || '', newGroup.avatar_color, newGroup.avatar_text, JSON.stringify([req.user.id]), Date.now()]
    );

    io.emit('group-created', { id, name, description: description || '', avatarColor: newGroup.avatar_color, avatarText: newGroup.avatar_text, members: [req.user.id], createdAt: Date.now() });
    res.json({ success: true, group: { id, name, description: description || '', avatarColor: newGroup.avatar_color, avatarText: newGroup.avatar_text, members: [req.user.id], createdAt: Date.now() } });
}));

app.post('/api/groups/join', authMiddleware, asyncHandler(async (req, res) => {
    const { groupId } = req.body;
    const result = await pool.query('SELECT * FROM groups_t WHERE id = $1', [groupId]);
    if (result.rows.length === 0) return res.status(404).json({ error: '群不存在' });
    const group = result.rows[0];
    const members = group.members || [];
    if (members.includes(req.user.id)) return res.status(400).json({ error: '已经在群里了' });

    members.push(req.user.id);
    await pool.query('UPDATE groups_t SET members = $1 WHERE id = $2', [JSON.stringify(members), groupId]);

    io.to(groupId).emit('group-member-joined', { groupId, userId: req.user.id, nickname: req.user.nickname });
    io.emit('groups-updated');
    res.json({ success: true });
}));

app.get('/api/groups/:groupId/members', authMiddleware, asyncHandler(async (req, res) => {
    const result = await pool.query('SELECT * FROM groups_t WHERE id = $1', [req.params.groupId]);
    if (result.rows.length === 0) return res.status(404).json({ error: '群不存在' });
    const group = result.rows[0];
    const members = group.members || [];

    if (members.length === 0) return res.json([]);

    const usersResult = await pool.query(
        `SELECT id, nickname, avatar_color, avatar_text, avatar_url FROM users WHERE id = ANY($1)`,
        [members]
    );
    res.json(usersResult.rows.map(u => ({
        id: u.id, nickname: u.nickname, avatarColor: u.avatar_color, avatarText: u.avatar_text, avatarUrl: u.avatar_url
    })));
}));

// Upload chat image
app.post('/api/upload', authMiddleware, upload.single('image'), (req, res) => {
    if (!req.file) return res.status(400).json({ error: '请上传图片' });
    res.json({ success: true, url: `/uploads/${req.file.filename}` });
});

// ========== Moments APIs ==========

app.get('/api/moments', authMiddleware, asyncHandler(async (req, res) => {
    const friendsResult = await pool.query(
        'SELECT user_id, friend_id FROM friendships WHERE (user_id=$1 OR friend_id=$1) AND status=$2',
        [req.user.id, 'accepted']
    );
    const friendIds = friendsResult.rows.map(f => f.user_id === req.user.id ? f.friend_id : f.user_id);

    // Build visible moments query
    const conditions = ['m.user_id = $1'];
    const params = [req.user.id];
    let idx = 2;
    if (friendIds.length > 0) {
        conditions.push(`m.user_id = ANY($${idx})`);
        params.push(friendIds);
        idx++;
    }
    conditions.push('m.is_public = true');

    const momentsResult = await pool.query(
        `SELECT m.*, u.nickname, u.avatar_color, u.avatar_text, u.avatar_url
         FROM moments m LEFT JOIN users u ON m.user_id = u.id
         WHERE ${conditions.join(' OR ')} ORDER BY m.created_at DESC`,
        params
    );

    res.json(momentsResult.rows.map(m => ({
        id: m.id, userId: m.user_id, nickname: m.nickname || '未知用户',
        avatarColor: m.avatar_color || '#999', avatarText: m.avatar_text || '?',
        avatarUrl: m.avatar_url || null, content: m.content,
        images: m.images || [], likes: m.likes || [], comments: m.comments || [],
        createdAt: m.created_at, isOwn: m.user_id === req.user.id
    })));
}));

app.post('/api/moments/post', authMiddleware, upload.array('images', 9), asyncHandler(async (req, res) => {
    const { content } = req.body;
    if (!content && (!req.files || req.files.length === 0)) {
        return res.status(400).json({ error: '说点什么吧' });
    }
    const imageUrls = req.files ? req.files.map(f => `/uploads/${f.filename}`) : [];
    const id = 'm_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6);

    await pool.query(
        'INSERT INTO moments (id, user_id, content, images, likes, comments, is_public, created_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)',
        [id, req.user.id, content || '', JSON.stringify(imageUrls), JSON.stringify([]), JSON.stringify([]), true, Date.now()]
    );

    const newMoment = { id, userId: req.user.id, content: content || '', images: imageUrls, likes: [], comments: [], isPublic: true, createdAt: Date.now() };
    io.emit('new-moment', newMoment);
    res.json({ success: true, moment: newMoment });
}));

app.post('/api/moments/like/:momentId', authMiddleware, asyncHandler(async (req, res) => {
    const result = await pool.query('SELECT * FROM moments WHERE id = $1', [req.params.momentId]);
    if (result.rows.length === 0) return res.status(404).json({ error: '动态不存在' });
    const moment = result.rows[0];
    let likes = moment.likes || [];

    if (likes.includes(req.user.id)) {
        likes = likes.filter(id => id !== req.user.id);
    } else {
        likes.push(req.user.id);
    }
    await pool.query('UPDATE moments SET likes = $1 WHERE id = $2', [JSON.stringify(likes), req.params.momentId]);

    const updated = { ...moment, likes, user_id: moment.user_id, avatar_color: moment.avatar_color, avatar_text: moment.avatar_text, created_at: moment.created_at };
    io.emit('moment-updated', updated);
    res.json({ success: true, likes });
}));

app.post('/api/moments/comment/:momentId', authMiddleware, asyncHandler(async (req, res) => {
    const { content } = req.body;
    if (!content) return res.status(400).json({ error: '评论内容不能为空' });

    const result = await pool.query('SELECT * FROM moments WHERE id = $1', [req.params.momentId]);
    if (result.rows.length === 0) return res.status(404).json({ error: '动态不存在' });
    const moment = result.rows[0];
    const comments = moment.comments || [];

    const comment = { id: 'c_' + Date.now(), userId: req.user.id, nickname: req.user.nickname, content, createdAt: Date.now() };
    comments.push(comment);
    await pool.query('UPDATE moments SET comments = $1 WHERE id = $2', [JSON.stringify(comments), req.params.momentId]);

    const updated = { ...moment, comments, user_id: moment.user_id, avatar_color: moment.avatar_color, avatar_text: moment.avatar_text, created_at: moment.created_at };
    io.emit('moment-updated', updated);
    res.json({ success: true, comment });
}));

app.delete('/api/moments/:momentId', authMiddleware, asyncHandler(async (req, res) => {
    const result = await pool.query('SELECT * FROM moments WHERE id = $1', [req.params.momentId]);
    if (result.rows.length === 0) return res.status(404).json({ error: '动态不存在' });
    if (result.rows[0].user_id !== req.user.id && req.user.role !== 'admin') {
        return res.status(403).json({ error: '无权删除' });
    }
    await pool.query('DELETE FROM moments WHERE id = $1', [req.params.momentId]);
    io.emit('moment-deleted', req.params.momentId);
    res.json({ success: true });
}));

// ========== Check-in & Bubble APIs ==========

const BUBBLE_DEFS = [
    { id: 0, name: '晴空万里', desc: '清新天蓝，默认风格', price: 0, class: 'bubble-sky' },
    { id: 1, name: '云霄巡航', desc: '云朵与飞机点缀', price: 30, class: 'bubble-cloud' },
    { id: 2, name: '落日飞行', desc: '温暖的落日余晖', price: 60, class: 'bubble-sunset' },
    { id: 3, name: '星辰航线', desc: '深邃星空与星光', price: 120, class: 'bubble-stars' },
    { id: 4, name: '王牌机长', desc: '金色机翼，荣耀之巅', price: 180, class: 'bubble-captain' }
];

function getTodayString() {
    return new Date().toDateString();
}

function isBubbleOwned(purchases, bubbleId, now) {
    if (bubbleId === 0) return { owned: true, isDay: false };
    const p = purchases[bubbleId];
    if (!p) return { owned: false, isDay: false };
    if (p.permanent) return { owned: true, isDay: false };
    if (p.day && p.expires && p.expires > now) return { owned: true, isDay: true };
    return { owned: false, isDay: false };
}

app.post('/api/checkin', authMiddleware, asyncHandler(async (req, res) => {
    const userRes = await pool.query('SELECT points, last_checkin_date FROM users WHERE id = $1', [req.user.id]);
    const user = userRes.rows[0];
    const today = getTodayString();
    if (user.last_checkin_date === today) {
        return res.status(400).json({ error: '今天已经签到过了' });
    }
    const newPoints = (user.points || 0) + 10;
    await pool.query('UPDATE users SET points = $1, last_checkin_date = $2 WHERE id = $3', [newPoints, today, req.user.id]);
    res.json({ points: newPoints, message: '签到成功！获得 10 积分' });
}));

app.get('/api/bubbles', authMiddleware, asyncHandler(async (req, res) => {
    const userRes = await pool.query('SELECT points, bubble_style, bubble_purchases FROM users WHERE id = $1', [req.user.id]);
    const user = userRes.rows[0];
    const purchases = user.bubble_purchases || {};
    const points = user.points || 0;
    const equipped = user.bubble_style || 0;
    const now = Date.now();

    const bubbles = BUBBLE_DEFS.map(b => {
        const own = isBubbleOwned(purchases, b.id, now);
        return {
            ...b,
            equipped: equipped === b.id,
            owned: own.owned,
            isDay: own.isDay,
            canAfford: b.price === 0 || points >= b.price
        };
    });

    res.json(bubbles);
}));

app.post('/api/bubbles/purchase', authMiddleware, asyncHandler(async (req, res) => {
    const { bubbleId, duration } = req.body;
    const id = parseInt(bubbleId, 10);
    const bubble = BUBBLE_DEFS.find(b => b.id === id);
    if (!bubble) return res.status(404).json({ error: '气泡不存在' });
    if (bubble.price === 0 && id !== 0) return res.status(400).json({ error: '该气泡无需购买' });

    const userRes = await pool.query('SELECT points, bubble_purchases, bubble_style FROM users WHERE id = $1', [req.user.id]);
    const user = userRes.rows[0];
    const purchases = user.bubble_purchases || {};
    const now = Date.now();
    const own = isBubbleOwned(purchases, id, now);
    if (own.owned && !own.isDay) {
        return res.status(400).json({ error: '已永久拥有该气泡' });
    }

    const isDay = duration === 'day';
    const price = isDay ? Math.max(1, Math.floor(bubble.price * 0.3)) : bubble.price;
    if ((user.points || 0) < price) return res.status(400).json({ error: '积分不足' });

    const newPurchases = { ...purchases };
    if (isDay) {
        const expires = now + 24 * 60 * 60 * 1000;
        newPurchases[id] = { day: true, expires };
    } else {
        newPurchases[id] = { permanent: true };
    }

    const newPoints = (user.points || 0) - price;
    const newBubbleStyle = id;
    await pool.query(
        'UPDATE users SET points = $1, bubble_purchases = $2, bubble_style = $3 WHERE id = $4',
        [newPoints, JSON.stringify(newPurchases), newBubbleStyle, req.user.id]
    );

    res.json({ points: newPoints, bubbleStyle: newBubbleStyle, message: `购买成功！已装备「${bubble.name}」` });
}));

app.put('/api/bubbles/equip', authMiddleware, asyncHandler(async (req, res) => {
    const { bubbleId } = req.body;
    const id = parseInt(bubbleId, 10);
    const bubble = BUBBLE_DEFS.find(b => b.id === id);
    if (!bubble) return res.status(404).json({ error: '气泡不存在' });

    const userRes = await pool.query('SELECT bubble_purchases FROM users WHERE id = $1', [req.user.id]);
    const user = userRes.rows[0];
    const now = Date.now();
    const own = isBubbleOwned(user.bubble_purchases || {}, id, now);
    if (!own.owned) return res.status(400).json({ error: '尚未拥有该气泡' });

    await pool.query('UPDATE users SET bubble_style = $1 WHERE id = $2', [id, req.user.id]);
    res.json({ bubbleStyle: id });
}));

// ========== User Common APIs (blocked, feedback, reports, donation) ==========

app.get('/api/blocked', authMiddleware, asyncHandler(async (req, res) => {
    const userRes = await pool.query('SELECT blocked_users FROM users WHERE id = $1', [req.user.id]);
    const blocked = userRes.rows[0].blocked_users || [];
    res.json({ blockedUsers: blocked });
}));

app.post('/api/block/:userId', authMiddleware, asyncHandler(async (req, res) => {
    const targetId = req.params.userId;
    if (targetId === req.user.id) return res.status(400).json({ error: '不能拉黑自己' });
    const userCheck = await pool.query('SELECT id FROM users WHERE id = $1', [targetId]);
    if (userCheck.rows.length === 0) return res.status(404).json({ error: '用户不存在' });

    const userRes = await pool.query('SELECT blocked_users FROM users WHERE id = $1', [req.user.id]);
    const blocked = userRes.rows[0].blocked_users || [];
    if (blocked.includes(targetId)) return res.status(400).json({ error: '已经拉黑该用户' });
    blocked.push(targetId);

    await pool.query('UPDATE users SET blocked_users = $1 WHERE id = $2', [JSON.stringify(blocked), req.user.id]);
    res.json({ success: true, message: '已拉黑该用户' });
}));

app.post('/api/unblock/:userId', authMiddleware, asyncHandler(async (req, res) => {
    const targetId = req.params.userId;
    const userRes = await pool.query('SELECT blocked_users FROM users WHERE id = $1', [req.user.id]);
    const blocked = userRes.rows[0].blocked_users || [];
    if (!blocked.includes(targetId)) return res.status(400).json({ error: '未拉黑该用户' });

    const newBlocked = blocked.filter(id => id !== targetId);
    await pool.query('UPDATE users SET blocked_users = $1 WHERE id = $2', [JSON.stringify(newBlocked), req.user.id]);
    res.json({ success: true, message: '已取消拉黑' });
}));

app.post('/api/feedback', authMiddleware, asyncHandler(async (req, res) => {
    const { content } = req.body;
    if (!content || content.length < 2) return res.status(400).json({ error: '反馈内容太短' });
    const id = 'fb_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6);
    await pool.query(
        'INSERT INTO feedbacks (id, user_id, nickname, avatar_color, avatar_text, content, status, created_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)',
        [id, req.user.id, req.user.nickname, req.user.avatarColor, req.user.avatarText, content, 'pending', Date.now()]
    );
    res.json({ success: true, message: '反馈已提交' });
}));

app.post('/api/report', authMiddleware, upload.array('images', 3), asyncHandler(async (req, res) => {
    const { targetUserId, content } = req.body;
    if (!targetUserId) return res.status(400).json({ error: '请选择举报对象' });
    const userCheck = await pool.query('SELECT id FROM users WHERE id = $1', [targetUserId]);
    if (userCheck.rows.length === 0) return res.status(404).json({ error: '用户不存在' });

    const imageUrls = req.files ? req.files.map(f => `/uploads/${f.filename}`) : [];
    const id = 'rp_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6);
    await pool.query(
        'INSERT INTO reports (id, reporter_id, target_user_id, content, images, status, created_at) VALUES ($1,$2,$3,$4,$5,$6,$7)',
        [id, req.user.id, targetUserId, content || '', JSON.stringify(imageUrls), 'pending', Date.now()]
    );
    res.json({ success: true, message: '举报已提交' });
}));

app.get('/api/donation', asyncHandler(async (req, res) => {
    const result = await pool.query('SELECT * FROM donations LIMIT 1');
    if (result.rows.length === 0) {
        return res.json({ wechat: '', alipay: '' });
    }
    const d = result.rows[0];
    res.json({ wechat: d.wechat || '', alipay: d.alipay || '' });
}));

// ========== Admin APIs ==========

app.get('/api/admin/users', adminMiddleware, asyncHandler(async (req, res) => {
    const result = await pool.query("SELECT * FROM users WHERE role != 'system'");
    res.json(result.rows.map(u => ({
        id: u.id, username: u.username, nickname: u.nickname, bio: u.bio,
        avatarColor: u.avatar_color, avatarText: u.avatar_text,
        role: u.role, banned: u.banned, mutedUntil: u.muted_until,
        points: u.points || 0, createdAt: u.created_at
    })));
}));

app.post('/api/admin/ban/:userId', adminMiddleware, asyncHandler(async (req, res) => {
    const result = await pool.query('SELECT * FROM users WHERE id = $1', [req.params.userId]);
    if (result.rows.length === 0) return res.status(404).json({ error: '用户不存在' });
    const user = result.rows[0];
    if (user.role === 'admin') return res.status(400).json({ error: '不能封禁管理员' });

    const newBan = !user.banned;
    await pool.query('UPDATE users SET banned = $1 WHERE id = $2', [newBan, req.params.userId]);

    if (newBan) {
        const sockets = io.sockets.sockets;
        for (const [sid, socket] of sockets) {
            if (socket.userId === user.id) {
                socket.emit('banned', { message: '你的账号已被管理员封禁' });
                socket.disconnect(true);
            }
        }
    }
    res.json({ success: true, banned: newBan });
}));

app.delete('/api/admin/user/:userId', adminMiddleware, asyncHandler(async (req, res) => {
    const userId = req.params.userId;
    const result = await pool.query('SELECT * FROM users WHERE id = $1', [userId]);
    if (result.rows.length === 0) return res.status(404).json({ error: '用户不存在' });
    if (result.rows[0].role === 'admin') return res.status(400).json({ error: '不能删除管理员' });

    // Remove from all groups
    await pool.query("UPDATE groups_t SET members = members - $1", [userId]);

    // Remove friendships, moments, messages, user
    await pool.query('DELETE FROM friendships WHERE user_id = $1 OR friend_id = $1', [userId]);
    await pool.query('DELETE FROM moments WHERE user_id = $1', [userId]);
    await pool.query('DELETE FROM messages WHERE sender_id = $1 OR target_id = $1', [userId]);
    await pool.query('DELETE FROM users WHERE id = $1', [userId]);

    // Disconnect
    const sockets = io.sockets.sockets;
    for (const [sid, socket] of sockets) {
        if (socket.userId === userId) socket.disconnect(true);
    }
    io.emit('user-deleted', userId);
    res.json({ success: true });
}));

app.get('/api/admin/messages/:userId', adminMiddleware, asyncHandler(async (req, res) => {
    const userId = req.params.userId;
    const result = await pool.query(
        `SELECT m.*, fu.nickname as from_nickname, tu.nickname as to_nickname
         FROM messages m
         LEFT JOIN users fu ON m.sender_id = fu.id
         LEFT JOIN users tu ON m.target_id = tu.id
         WHERE m.sender_id = $1 OR m.target_id = $1
         ORDER BY m.created_at DESC LIMIT 200`,
        [userId]
    );

    const groupsResult = await pool.query('SELECT id, name FROM groups_t');

    res.json(result.rows.map(m => {
        let toNickname = m.to_nickname || '未知';
        if (m.type === 'group') {
            const g = groupsResult.rows.find(g => g.id === m.target_id);
            toNickname = g ? g.name : '群聊';
        }
        return {
            id: m.id, from: m.sender_id, fromNickname: m.from_nickname || '未知',
            to: m.target_id, toNickname, type: m.type,
            content: m.content, messageType: m.message_type || 'text', timestamp: m.created_at
        };
    }));
}));

app.delete('/api/admin/moment/:momentId', adminMiddleware, asyncHandler(async (req, res) => {
    await pool.query('DELETE FROM moments WHERE id = $1', [req.params.momentId]);
    io.emit('moment-deleted', req.params.momentId);
    res.json({ success: true });
}));

app.get('/api/admin/stats', adminMiddleware, asyncHandler(async (req, res) => {
    const now = Date.now();
    const today = now - 86400000;

    const [totalUsers, bannedUsers, totalMessages, todayMessages, totalGroups, totalMoments, todayMoments, totalFriendships] = await Promise.all([
        pool.query("SELECT COUNT(*) FROM users WHERE role != 'system'"),
        pool.query('SELECT COUNT(*) FROM users WHERE banned = true'),
        pool.query('SELECT COUNT(*) FROM messages'),
        pool.query('SELECT COUNT(*) FROM messages WHERE created_at > $1', [today]),
        pool.query('SELECT COUNT(*) FROM groups_t'),
        pool.query('SELECT COUNT(*) FROM moments'),
        pool.query('SELECT COUNT(*) FROM moments WHERE created_at > $1', [today]),
        pool.query("SELECT COUNT(*) FROM friendships WHERE status = 'accepted'")
    ]);

    const onlineCount = Object.values(io.sockets.sockets).filter(s => s.userId).length;

    res.json({
        totalUsers: parseInt(totalUsers.rows[0].count), bannedUsers: parseInt(bannedUsers.rows[0].count),
        totalMessages: parseInt(totalMessages.rows[0].count), todayMessages: parseInt(todayMessages.rows[0].count),
        totalGroups: parseInt(totalGroups.rows[0].count), totalMoments: parseInt(totalMoments.rows[0].count),
        todayMoments: parseInt(todayMoments.rows[0].count), totalFriendships: parseInt(totalFriendships.rows[0].count),
        onlineUsers: onlineCount
    });
}));

app.post('/api/admin/promote/:userId', adminMiddleware, asyncHandler(async (req, res) => {
    const result = await pool.query('SELECT * FROM users WHERE id = $1', [req.params.userId]);
    if (result.rows.length === 0) return res.status(404).json({ error: '用户不存在' });
    if (result.rows[0].role === 'admin' || result.rows[0].role === 'super_admin') {
        return res.status(400).json({ error: '该用户已经是管理员' });
    }
    await pool.query("UPDATE users SET role = 'admin' WHERE id = $1", [req.params.userId]);
    res.json({ success: true, message: '已提升为管理员', role: 'admin' });
}));

app.post('/api/admin/mute/:userId', adminMiddleware, asyncHandler(async (req, res) => {
    const { duration } = req.body;
    const userRes = await pool.query('SELECT * FROM users WHERE id = $1', [req.params.userId]);
    if (userRes.rows.length === 0) return res.status(404).json({ error: '用户不存在' });
    if (userRes.rows[0].role === 'admin') return res.status(400).json({ error: '不能禁言管理员' });

    let mutedUntil = null;
    if (duration === '1day') mutedUntil = Date.now() + 24 * 60 * 60 * 1000;
    else if (duration === '7days') mutedUntil = Date.now() + 7 * 24 * 60 * 60 * 1000;
    else mutedUntil = -1; // permanent

    await pool.query('UPDATE users SET muted_until = $1 WHERE id = $2', [mutedUntil, req.params.userId]);
    res.json({ success: true, mutedUntil });
}));

app.post('/api/admin/unmute/:userId', adminMiddleware, asyncHandler(async (req, res) => {
    await pool.query('UPDATE users SET muted_until = NULL WHERE id = $1', [req.params.userId]);
    res.json({ success: true });
}));

app.get('/api/admin/feedbacks', adminMiddleware, asyncHandler(async (req, res) => {
    const result = await pool.query('SELECT * FROM feedbacks ORDER BY created_at DESC');
    res.json(result.rows.map(f => ({
        id: f.id, userId: f.user_id, nickname: f.nickname,
        avatarColor: f.avatar_color, avatarText: f.avatar_text,
        content: f.content, status: f.status, createdAt: f.created_at
    })));
}));

app.post('/api/admin/feedback/:id/resolve', adminMiddleware, asyncHandler(async (req, res) => {
    const result = await pool.query('SELECT * FROM feedbacks WHERE id = $1', [req.params.id]);
    if (result.rows.length === 0) return res.status(404).json({ error: '反馈不存在' });
    const newStatus = result.rows[0].status === 'resolved' ? 'pending' : 'resolved';
    await pool.query('UPDATE feedbacks SET status = $1 WHERE id = $2', [newStatus, req.params.id]);
    res.json({ success: true, status: newStatus });
}));

app.get('/api/admin/reports', adminMiddleware, asyncHandler(async (req, res) => {
    const result = await pool.query(
        `SELECT r.*, u.nickname as target_nickname
         FROM reports r
         LEFT JOIN users u ON r.target_user_id = u.id
         ORDER BY r.created_at DESC`
    );
    res.json(result.rows.map(r => ({
        id: r.id, reporterId: r.reporter_id, targetUserId: r.target_user_id,
        targetNickname: r.target_nickname || '未知', content: r.content,
        images: r.images || [], status: r.status, createdAt: r.created_at
    })));
}));

app.post('/api/admin/report/:id/resolve', adminMiddleware, asyncHandler(async (req, res) => {
    const result = await pool.query('SELECT * FROM reports WHERE id = $1', [req.params.id]);
    if (result.rows.length === 0) return res.status(404).json({ error: '举报不存在' });
    const newStatus = result.rows[0].status === 'resolved' ? 'pending' : 'resolved';
    await pool.query('UPDATE reports SET status = $1 WHERE id = $2', [newStatus, req.params.id]);
    res.json({ success: true, status: newStatus });
}));

app.post('/api/admin/donation', adminMiddleware, upload.fields([{ name: 'wechat', maxCount: 1 }, { name: 'alipay', maxCount: 1 }]), asyncHandler(async (req, res) => {
    const existing = await pool.query('SELECT * FROM donations LIMIT 1');
    const updates = {};
    if (req.files.wechat && req.files.wechat[0]) updates.wechat = '/uploads/' + req.files.wechat[0].filename;
    if (req.files.alipay && req.files.alipay[0]) updates.alipay = '/uploads/' + req.files.alipay[0].filename;

    if (existing.rows.length === 0) {
        await pool.query(
            'INSERT INTO donations (id, wechat, alipay) VALUES ($1,$2,$3)',
            ['donation_default', updates.wechat || '', updates.alipay || '']
        );
    } else {
        const current = existing.rows[0];
        const wechat = updates.wechat || current.wechat;
        const alipay = updates.alipay || current.alipay;
        await pool.query('UPDATE donations SET wechat = $1, alipay = $2 WHERE id = $3', [wechat, alipay, current.id]);
    }
    res.json({ success: true });
}));

// ========== Socket.IO ==========

const onlineUsers = {};

io.on('connection', (socket) => {
    console.log('Socket connected:', socket.id);

    socket.on('auth', async (token) => {
        try {
            const result = await pool.query('SELECT * FROM users WHERE id = $1', [token]);
            if (result.rows.length === 0) {
                socket.emit('auth-error', '无效token');
                return;
            }
            const user = result.rows[0];
            if (user.banned) {
                socket.emit('banned', { message: '账号已被封禁' });
                socket.disconnect(true);
                return;
            }

            socket.userId = user.id;
            socket.userNickname = user.nickname;
            onlineUsers[user.id] = socket.id;

            const groupsResult = await pool.query('SELECT id FROM groups_t WHERE members @> $1::jsonb', [JSON.stringify([user.id])]);
            groupsResult.rows.forEach(g => socket.join(g.id));

            socket.broadcast.emit('user-online', { userId: user.id, nickname: user.nickname });
            io.emit('online-list', Object.keys(onlineUsers));
            console.log(`User ${user.nickname} (${user.id}) authenticated`);
        } catch (e) {
            console.error('Socket auth error:', e.message);
            socket.emit('auth-error', '认证失败');
        }
    });

    socket.on('private-message', async (data) => {
        if (!socket.userId) return;
        const { to, content, messageType } = data;

        // Check muted
        const senderRes = await pool.query('SELECT muted_until FROM users WHERE id = $1', [socket.userId]);
        const mutedUntil = senderRes.rows[0]?.muted_until;
        if (mutedUntil && (mutedUntil === -1 || mutedUntil > Date.now())) {
            socket.emit('message-error', { error: '您已被禁言' });
            return;
        }

        const id = 'msg_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6);

        try {
            const fromUser = await pool.query('SELECT * FROM users WHERE id = $1', [socket.userId]);
            const u = fromUser.rows[0] || {};
            const bubbleStyle = u.bubble_style || 0;

            await pool.query(
                'INSERT INTO messages (id, type, sender_id, target_id, content, message_type, created_at, is_read, from_bubble_style) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)',
                [id, 'private', socket.userId, to, content, messageType || 'text', Date.now(), false, bubbleStyle]
            );

            const msg = { id, type: 'private', from: socket.userId, to, content, messageType: messageType || 'text', timestamp: Date.now(), read: false, fromBubbleStyle: bubbleStyle };

            const recipientSocketId = onlineUsers[to];
            if (recipientSocketId) {
                io.to(recipientSocketId).emit('private-message', {
                    ...msg, fromNickname: u.nickname, fromAvatarColor: u.avatar_color, fromAvatarText: u.avatar_text
                });
            }
            socket.emit('private-message-sent', msg);
        } catch (e) {
            console.error('Save message error:', e.message);
        }
    });

    socket.on('group-message', async (data) => {
        if (!socket.userId) return;
        const { to, content, messageType } = data;

        // Check muted
        const senderRes = await pool.query('SELECT muted_until FROM users WHERE id = $1', [socket.userId]);
        const mutedUntil = senderRes.rows[0]?.muted_until;
        if (mutedUntil && (mutedUntil === -1 || mutedUntil > Date.now())) {
            socket.emit('message-error', { error: '您已被禁言' });
            return;
        }

        const id = 'msg_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6);

        try {
            const fromUser = await pool.query('SELECT * FROM users WHERE id = $1', [socket.userId]);
            const u = fromUser.rows[0] || {};
            const bubbleStyle = u.bubble_style || 0;

            await pool.query(
                'INSERT INTO messages (id, type, sender_id, target_id, content, message_type, created_at, is_read, read_by, from_bubble_style) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)',
                [id, 'group', socket.userId, to, content, messageType || 'text', Date.now(), true, JSON.stringify([socket.userId]), bubbleStyle]
            );

            const msg = { id, type: 'group', from: socket.userId, to, content, messageType: messageType || 'text', timestamp: Date.now(), readBy: [socket.userId], fromBubbleStyle: bubbleStyle };

            io.to(to).emit('group-message', {
                ...msg, fromNickname: u.nickname, fromAvatarColor: u.avatar_color, fromAvatarText: u.avatar_text
            });
        } catch (e) {
            console.error('Save group message error:', e.message);
        }
    });

    socket.on('typing', (data) => {
        const { to, type } = data;
        if (type === 'private') {
            const recipientSocketId = onlineUsers[to];
            if (recipientSocketId) {
                io.to(recipientSocketId).emit('typing', { from: socket.userId, nickname: socket.userNickname, type: 'private' });
            }
        } else if (type === 'group') {
            socket.to(to).emit('typing', { from: socket.userId, nickname: socket.userNickname, type: 'group', groupId: to });
        }
    });

    socket.on('stop-typing', (data) => {
        const { to, type } = data;
        if (type === 'private') {
            const recipientSocketId = onlineUsers[to];
            if (recipientSocketId) {
                io.to(recipientSocketId).emit('stop-typing', { from: socket.userId });
            }
        } else if (type === 'group') {
            socket.to(to).emit('stop-typing', { from: socket.userId });
        }
    });

    socket.on('disconnect', () => {
        if (socket.userId) {
            delete onlineUsers[socket.userId];
            io.emit('user-offline', { userId: socket.userId });
            io.emit('online-list', Object.keys(onlineUsers));
            console.log(`User ${socket.userNickname} disconnected`);
        }
    });
});

// ========== Start Server ==========

async function start() {
    await initTables();

    // Create admin if not exists
    const adminCheck = await pool.query("SELECT id FROM users WHERE role = 'admin'");
    if (adminCheck.rows.length === 0) {
        const adminId = 'u_admin';
        await pool.query(
            `INSERT INTO users (id, username, password, nickname, bio, avatar_color, avatar_text, role, created_at)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
            [adminId, 'admin', bcrypt.hashSync('admin123', 10), '管理员', '聊聊平台管理员', '#f5576c', '管', 'admin', Date.now()]
        );
        // Add admin to public group
        const pubGroup = await pool.query("SELECT id, members FROM groups_t WHERE id = 'g_public'");
        if (pubGroup.rows.length > 0) {
            const members = pubGroup.rows[0].members || [];
            if (!members.includes(adminId)) {
                members.push(adminId);
                await pool.query('UPDATE groups_t SET members = $1 WHERE id = $2', [JSON.stringify(members), 'g_public']);
            }
        }
        console.log('Admin account created: admin / admin123');
    }

    // Ensure public group exists
    const pubCheck = await pool.query("SELECT id FROM groups_t WHERE id = 'g_public'");
    if (pubCheck.rows.length === 0) {
        await pool.query(
            'INSERT INTO groups_t (id, name, description, avatar_color, avatar_text, members, created_at) VALUES ($1,$2,$3,$4,$5,$6,$7)',
            ['g_public', '聊聊大厅', '所有人都在这里聊天！', '#667eea', '厅', JSON.stringify([]), Date.now()]
        );
        console.log('Public group created');
    }

    server.listen(PORT, '0.0.0.0', () => {
        const os = require('os');
        const nets = os.networkInterfaces();
        let localIP = 'localhost';
        for (const name of Object.keys(nets)) {
            for (const net of nets[name]) {
                if (net.family === 'IPv4' && !net.internal) {
                    localIP = net.address;
                    break;
                }
            }
        }
        console.log(`飞友之家 server running!`);
        console.log(`  本机访问: http://localhost:${PORT}`);
        console.log(`  局域网访问: http://${localIP}:${PORT}`);
        console.log(`  管理员账号: admin / admin123`);
        console.log(`  PostgreSQL: Supabase (数据永久保存)`);
    });
}

start().catch(e => {
    console.error('Startup failed:', e.message);
    process.exit(1);
});
