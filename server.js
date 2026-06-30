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
        if (req.user.role !== 'admin') return res.status(403).json({ error: '需要管理员权限' });
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
                role: 'user', createdAt: Date.now() }
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
                avatarUrl: user.avatar_url, role: user.role, createdAt: user.created_at }
    });
}));

// Get current user
app.get('/api/me', authMiddleware, (req, res) => {
    const user = req.user;
    res.json({ id: user.id, username: user.username, nickname: user.nickname, bio: user.bio,
               avatarColor: user.avatarColor, avatarText: user.avatarText,
               avatarUrl: user.avatarUrl, role: user.role, createdAt: user.createdAt });
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

// Upload avatar
app.post('/api/avatar', authMiddleware, upload.single('avatar'), asyncHandler(async (req, res) => {
    if (!req.file) return res.status(400).json({ error: '请上传图片' });
    const url = `/uploads/${req.file.filename}`;
    await pool.query('UPDATE users SET avatar_url = $1 WHERE id = $2', [url, req.user.id]);
    res.json({ success: true, avatarUrl: url });
}));

// Get all users
app.get('/api/users', authMiddleware, asyncHandler(async (req, res) => {
    const result = await pool.query(
        `SELECT u.id, u.username, u.nickname, u.bio, u.avatar_color, u.avatar_text, u.avatar_url, u.banned, u.created_at,
                EXISTS(SELECT 1 FROM friendships f WHERE f.status='accepted' AND
                       ((f.user_id=$1 AND f.friend_id=u.id) OR (f.user_id=u.id AND f.friend_id=$1))) as is_friend
         FROM users u WHERE u.id != $1 AND u.role != 'system'`,
        [req.user.id]
    );
    res.json(result.rows.map(u => ({
        id: u.id, username: u.username, nickname: u.nickname, bio: u.bio,
        avatarColor: u.avatar_color, avatarText: u.avatar_text, avatarUrl: u.avatar_url,
        banned: u.banned, createdAt: u.created_at, isFriend: u.is_friend
    })));
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
        timestamp: m.created_at, read: m.is_read
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
        timestamp: m.created_at
    })));
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

// ========== Admin APIs ==========

app.get('/api/admin/users', adminMiddleware, asyncHandler(async (req, res) => {
    const result = await pool.query("SELECT * FROM users WHERE role != 'system'");
    res.json(result.rows.map(u => ({
        id: u.id, username: u.username, nickname: u.nickname, bio: u.bio,
        avatarColor: u.avatar_color, avatarText: u.avatar_text,
        role: u.role, banned: u.banned, createdAt: u.created_at
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
        const id = 'msg_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6);

        try {
            await pool.query(
                'INSERT INTO messages (id, type, sender_id, target_id, content, message_type, created_at, is_read) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)',
                [id, 'private', socket.userId, to, content, messageType || 'text', Date.now(), false]
            );

            const fromUser = await pool.query('SELECT * FROM users WHERE id = $1', [socket.userId]);
            const u = fromUser.rows[0] || {};

            const msg = { id, type: 'private', from: socket.userId, to, content, messageType: messageType || 'text', timestamp: Date.now(), read: false };

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
        const id = 'msg_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6);

        try {
            await pool.query(
                'INSERT INTO messages (id, type, sender_id, target_id, content, message_type, created_at, is_read, read_by) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)',
                [id, 'group', socket.userId, to, content, messageType || 'text', Date.now(), true, JSON.stringify([socket.userId])]
            );

            const fromUser = await pool.query('SELECT * FROM users WHERE id = $1', [socket.userId]);
            const u = fromUser.rows[0] || {};

            const msg = { id, type: 'group', from: socket.userId, to, content, messageType: messageType || 'text', timestamp: Date.now(), readBy: [socket.userId] };

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
