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
app.set('trust proxy', 1);

const storage = multer.diskStorage({
    destination: UPLOADS_DIR,
    filename: (req, file, cb) => {
        const ext = path.extname(file.originalname);
        cb(null, `${Date.now()}-${Math.random().toString(36).slice(2)}${ext}`);
    }
});
const upload = multer({
    storage,
    limits: { fileSize: 5 * 1024 * 1024 },
    fileFilter: (req, file, cb) => {
        if (/image\/.*/.test(file.mimetype)) cb(null, true);
        else cb(new Error('Only images allowed'), false);
    }
});

// ========== Helpers ==========

function genId(prefix) {
    return (prefix || 'x') + '_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8);
}

// 简单频率限制器（内存）
const rateLimiter = {};
function checkRateLimit(key, cooldownMs = 2000) {
    const now = Date.now();
    const last = rateLimiter[key] || 0;
    if (now - last < cooldownMs) return false;
    rateLimiter[key] = now;
    return true;
}

function cleanupExpiredBubble(user) {
    if (user.bubble_style && user.bubble_style !== 0 && user.bubble_purchases) {
        const purchase = user.bubble_purchases[String(user.bubble_style)];
        if (purchase && purchase !== 'permanent' && typeof purchase === 'number' && purchase <= Date.now()) {
            delete user.bubble_purchases[String(user.bubble_style)];
            user.bubble_style = 0;
            return true;
        }
    }
    return false;
}

function userToJSON(u) {
    if (!u) return null;
    return {
        id: u.id, username: u.username, nickname: u.nickname, bio: u.bio,
        avatarColor: u.avatar_color, avatarText: u.avatar_text,
        avatarUrl: u.avatar_url || null, role: u.role,
        points: u.points || 0, lastCheckinDate: u.last_checkin_date || null,
        bubbleStyle: u.bubble_style || 0, createdAt: u.created_at,
        banned: u.banned || false
    };
}

const BUBBLE_STYLES = [
    { id: 0, name: '晴空万里', price: 0, class: 'bubble-sky', desc: '广阔蓝天白云飘' },
    { id: 1, name: '云霄巡航', price: 30, class: 'bubble-cloud', desc: '穿行于云层之上' },
    { id: 2, name: '落日飞行', price: 60, class: 'bubble-sunset', desc: '暮色中的金色航线' },
    { id: 3, name: '星辰航线', price: 120, class: 'bubble-stars', desc: '星空下闪耀的航迹' },
    { id: 4, name: '王牌机长', price: 180, class: 'bubble-captain', desc: '金翼勋章·至尊荣耀' }
];

// ========== Auth Middleware ==========

async function authMiddleware(req, res, next) {
    const token = req.headers.authorization;
    if (!token) return res.status(401).json({ error: '未登录' });
    try {
        const r = await pool.query('SELECT * FROM users WHERE id = $1', [token]);
        if (r.rows.length === 0) return res.status(401).json({ error: '无效token' });
        const user = r.rows[0];
        if (user.banned) return res.status(403).json({ error: '账号已被封禁' });
        req.user = user;
        next();
    } catch (e) {
        res.status(500).json({ error: '服务器错误' });
    }
}

function adminMiddleware(req, res, next) {
    authMiddleware(req, res, () => {
        if (req.user.role !== 'admin' && req.user.role !== 'super_admin') return res.status(403).json({ error: '需要管理员权限' });
        next();
    });
}

function superAdminMiddleware(req, res, next) {
    authMiddleware(req, res, () => {
        if (req.user.role !== 'super_admin') return res.status(403).json({ error: '需要超级管理员权限' });
        next();
    });
}

// ========== API Routes ==========

// Register
app.post('/api/register', async (req, res) => {
    try {
        const { username, password, nickname, bio } = req.body;
        const ip = req.ip || req.connection.remoteAddress;
        if (!checkRateLimit('reg_' + ip, 3000)) {
            return res.status(429).json({ error: '注册太频繁，请稍后再试' });
        }
        if (!username || !password) return res.status(400).json({ error: '用户名和密码必填' });
        if (username.length < 2 || username.length > 20) return res.status(400).json({ error: '用户名2-20字符' });
        if (password.length < 4) return res.status(400).json({ error: '密码至少4位' });

        const existing = await pool.query('SELECT id FROM users WHERE username = $1', [username]);
        if (existing.rows.length > 0) return res.status(400).json({ error: '用户名已存在' });

        const colors = ['#667eea', '#764ba2', '#f093fb', '#f5576c', '#4facfe', '#43e97b', '#fa709a', '#fee140', '#a18cd1', '#fbc2eb'];
        const uid = genId('u');
        const nick = nickname || username;
        const hashedPw = bcrypt.hashSync(password, 10);
        const avatarColor = colors[Math.floor(Math.random() * colors.length)];
        const avatarText = nick.slice(0, 1).toUpperCase();
        const now = Date.now();

        await pool.query(
            'INSERT INTO users (id, username, password, nickname, bio, avatar_color, avatar_text, role, points, bubble_style, banned, created_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)',
            [uid, username, hashedPw, nick, bio || '', avatarColor, avatarText, 'user', 0, 0, false, now]
        );

        // Auto-add to public group
        const pubGroup = await pool.query("SELECT * FROM groups_t WHERE id = 'g_public'");
        if (pubGroup.rows.length > 0) {
            await pool.query(
                "UPDATE groups_t SET members = CASE WHEN NOT members @> $1::jsonb THEN members || $1::jsonb ELSE members END WHERE id = 'g_public'",
                [JSON.stringify([uid])]
            );
        }

        res.json({
            success: true,
            token: uid,
            user: { id: uid, username, nickname: nick, bio: bio || '', avatarColor, avatarText, role: 'user', points: 0, lastCheckinDate: null, bubbleStyle: 0, createdAt: now }
        });
    } catch (e) {
        res.status(500).json({ error: '注册失败: ' + e.message });
    }
});

// Login
app.post('/api/login', async (req, res) => {
    try {
        const { username, password } = req.body;
        const ip = req.ip || req.connection.remoteAddress;
        if (!checkRateLimit('login_' + ip, 1000)) {
            return res.status(429).json({ error: '操作太频繁，请稍后再试' });
        }
        const r = await pool.query('SELECT * FROM users WHERE username = $1', [username]);
        if (r.rows.length === 0) return res.status(400).json({ error: '用户名不存在' });
        const user = r.rows[0];
        if (user.banned) return res.status(403).json({ error: '账号已被封禁，请联系管理员' });
        if (!bcrypt.compareSync(password, user.password)) return res.status(400).json({ error: '密码错误' });

        if (cleanupExpiredBubble(user)) {
            await pool.query(
                'UPDATE users SET bubble_style = $1, bubble_purchases = $2 WHERE id = $3',
                [user.bubble_style, JSON.stringify(user.bubble_purchases), user.id]
            );
        }

        res.json({ success: true, token: user.id, user: userToJSON(user) });
    } catch (e) {
        res.status(500).json({ error: '登录失败: ' + e.message });
    }
});

// Get current user info
app.get('/api/me', authMiddleware, async (req, res) => {
    try {
        const r = await pool.query('SELECT * FROM users WHERE id = $1', [req.user.id]);
        const user = r.rows[0];
        if (cleanupExpiredBubble(user)) {
            await pool.query(
                'UPDATE users SET bubble_style = $1, bubble_purchases = $2 WHERE id = $3',
                [user.bubble_style, JSON.stringify(user.bubble_purchases), user.id]
            );
        }
        res.json(userToJSON(user));
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// Update profile
app.put('/api/profile', authMiddleware, async (req, res) => {
    try {
        const { nickname, bio } = req.body;
        if (nickname) {
            await pool.query(
                'UPDATE users SET nickname = $1, avatar_text = $2, bio = COALESCE($3, bio) WHERE id = $4',
                [nickname, nickname.slice(0, 1).toUpperCase(), bio, req.user.id]
            );
        } else {
            await pool.query('UPDATE users SET bio = COALESCE($1, bio) WHERE id = $2', [bio, req.user.id]);
        }
        const r = await pool.query('SELECT * FROM users WHERE id = $1', [req.user.id]);
        const u = r.rows[0];
        res.json({ success: true, user: { id: u.id, nickname: u.nickname, bio: u.bio, avatarColor: u.avatar_color, avatarText: u.avatar_text } });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// Upload avatar
app.post('/api/avatar', authMiddleware, upload.single('avatar'), async (req, res) => {
    try {
        if (!req.file) return res.status(400).json({ error: '请上传图片' });
        const avatarUrl = `/uploads/${req.file.filename}`;
        await pool.query('UPDATE users SET avatar_url = $1 WHERE id = $2', [avatarUrl, req.user.id]);
        res.json({ success: true, avatarUrl });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// Get all users
app.get('/api/users', authMiddleware, async (req, res) => {
    try {
        const usersR = await pool.query("SELECT * FROM users WHERE id != $1 AND role != 'system'", [req.user.id]);
        const friendshipsR = await pool.query(
            "SELECT * FROM friendships WHERE (user_id = $1 OR friend_id = $1) AND status = 'accepted'",
            [req.user.id]
        );
        const friendIds = new Set(friendshipsR.rows.map(f => f.user_id === req.user.id ? f.friend_id : f.user_id));

        res.json(usersR.rows.map(u => ({
            id: u.id, username: u.username, nickname: u.nickname, bio: u.bio,
            avatarColor: u.avatar_color, avatarText: u.avatar_text,
            avatarUrl: u.avatar_url || null, banned: u.banned,
            createdAt: u.created_at, isFriend: friendIds.has(u.id)
        })));
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// Get friends list
app.get('/api/friends', authMiddleware, async (req, res) => {
    try {
        const friendshipsR = await pool.query(
            "SELECT * FROM friendships WHERE (user_id = $1 OR friend_id = $1) AND status = 'accepted'",
            [req.user.id]
        );
        const friendIds = friendshipsR.rows.map(f => f.user_id === req.user.id ? f.friend_id : f.user_id);
        if (friendIds.length === 0) return res.json([]);

        const usersR = await pool.query('SELECT * FROM users WHERE id = ANY($1)', [friendIds]);
        res.json(usersR.rows.map(u => ({
            id: u.id, username: u.username, nickname: u.nickname, bio: u.bio,
            avatarColor: u.avatar_color, avatarText: u.avatar_text,
            avatarUrl: u.avatar_url || null, online: false
        })));
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// Add friend
app.post('/api/friends/add', authMiddleware, async (req, res) => {
    try {
        const { userId } = req.body;
        if (userId === req.user.id) return res.status(400).json({ error: '不能添加自己' });

        const targetR = await pool.query('SELECT id FROM users WHERE id = $1', [userId]);
        if (targetR.rows.length === 0) return res.status(404).json({ error: '用户不存在' });

        const existingR = await pool.query(
            'SELECT * FROM friendships WHERE (user_id = $1 AND friend_id = $2) OR (user_id = $2 AND friend_id = $1)',
            [req.user.id, userId]
        );

        if (existingR.rows.length > 0) {
            const f = existingR.rows[0];
            if (f.status === 'accepted') return res.status(400).json({ error: '已经是好友了' });
            if (f.status === 'pending' && f.friend_id === req.user.id) {
                await pool.query("UPDATE friendships SET status = 'accepted' WHERE id = $1", [f.id]);
                return res.json({ success: true, message: '已接受好友请求' });
            }
            return res.status(400).json({ error: '已发送请求，等待对方确认' });
        }

        await pool.query(
            "INSERT INTO friendships (id, user_id, friend_id, status, created_at) VALUES ($1,$2,$3,'accepted',$4)",
            [genId('f'), req.user.id, userId, Date.now()]
        );

        res.json({ success: true, message: '好友添加成功' });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// Remove friend
app.post('/api/friends/remove', authMiddleware, async (req, res) => {
    try {
        const { userId } = req.body;
        await pool.query(
            'DELETE FROM friendships WHERE (user_id = $1 AND friend_id = $2) OR (user_id = $2 AND friend_id = $1)',
            [req.user.id, userId]
        );
        res.json({ success: true });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// ========== Chat APIs ==========

// Get chat history (private)
app.get('/api/messages/private/:userId', authMiddleware, async (req, res) => {
    try {
        const otherUserId = req.params.userId;
        const msgsR = await pool.query(
            `SELECT * FROM messages WHERE type = 'private'
             AND ((sender_id = $1 AND target_id = $2) OR (sender_id = $2 AND target_id = $1))
             ORDER BY created_at ASC`,
            [req.user.id, otherUserId]
        );

        // Mark as read
        await pool.query(
            "UPDATE messages SET is_read = true WHERE type = 'private' AND target_id = $1 AND sender_id = $2 AND is_read = false",
            [req.user.id, otherUserId]
        );

        const userIds = [...new Set(msgsR.rows.map(m => m.sender_id))];
        let userMap = {};
        if (userIds.length > 0) {
            const usersR = await pool.query('SELECT * FROM users WHERE id = ANY($1)', [userIds]);
            usersR.rows.forEach(u => { userMap[u.id] = u; });
        }

        res.json(msgsR.rows.map(m => {
            const fromUser = userMap[m.sender_id];
            return {
                id: m.id, from: m.sender_id, to: m.target_id, content: m.content,
                messageType: m.message_type || 'text', timestamp: m.created_at, read: m.is_read,
                fromNickname: fromUser?.nickname, fromAvatarColor: fromUser?.avatar_color,
                fromAvatarText: fromUser?.avatar_text, fromAvatarUrl: fromUser?.avatar_url || null,
                fromBubbleStyle: fromUser?.bubble_style || 0
            };
        }));
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// Get chat history (group)
app.get('/api/messages/group/:groupId', authMiddleware, async (req, res) => {
    try {
        const groupId = req.params.groupId;
        const msgsR = await pool.query(
            "SELECT * FROM messages WHERE type = 'group' AND target_id = $1 ORDER BY created_at ASC LIMIT 500",
            [groupId]
        );

        const userIds = [...new Set(msgsR.rows.map(m => m.sender_id))];
        let userMap = {};
        if (userIds.length > 0) {
            const usersR = await pool.query('SELECT * FROM users WHERE id = ANY($1)', [userIds]);
            usersR.rows.forEach(u => { userMap[u.id] = u; });
        }

        res.json(msgsR.rows.map(m => {
            const fromUser = userMap[m.sender_id];
            return {
                id: m.id, from: m.sender_id, to: m.target_id, content: m.content,
                messageType: m.message_type || 'text', timestamp: m.created_at,
                fromNickname: fromUser?.nickname, fromAvatarColor: fromUser?.avatar_color,
                fromAvatarText: fromUser?.avatar_text, fromAvatarUrl: fromUser?.avatar_url || null,
                fromBubbleStyle: fromUser?.bubble_style || 0
            };
        }));
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// Get last messages for chat list (batch)
app.get('/api/chats/last-messages', authMiddleware, async (req, res) => {
    try {
        const result = {};

        // Get friend IDs
        const friendshipsR = await pool.query(
            "SELECT * FROM friendships WHERE (user_id = $1 OR friend_id = $1) AND status = 'accepted'",
            [req.user.id]
        );
        const friendIds = friendshipsR.rows.map(f => f.user_id === req.user.id ? f.friend_id : f.user_id);

        // Get user's groups
        const groupsR = await pool.query(
            "SELECT id FROM groups_t WHERE members @> $1::jsonb",
            [JSON.stringify([req.user.id])]
        );
        const groupIds = groupsR.rows.map(g => g.id);

        // Batch query: last private message for each friend
        if (friendIds.length > 0) {
            const privateMsgs = await pool.query(
                `SELECT DISTINCT ON (
                    CASE WHEN sender_id < target_id THEN sender_id || '_' || target_id
                         ELSE target_id || '_' || sender_id END
                ) sender_id, target_id, content, message_type, created_at
                FROM messages
                WHERE type = 'private'
                  AND ((sender_id = $1 AND target_id = ANY($2::text[]))
                    OR (sender_id = ANY($2::text[]) AND target_id = $1))
                ORDER BY
                    CASE WHEN sender_id < target_id THEN sender_id || '_' || target_id
                         ELSE target_id || '_' || sender_id END,
                    created_at DESC`,
                [req.user.id, friendIds]
            );
            privateMsgs.rows.forEach(m => {
                const otherId = m.sender_id === req.user.id ? m.target_id : m.sender_id;
                result[otherId] = {
                    content: m.message_type === 'image' ? '[图片]' : m.content,
                    messageType: m.message_type,
                    timestamp: m.created_at
                };
            });
        }

        // Batch query: last group message for each group
        if (groupIds.length > 0) {
            const groupMsgs = await pool.query(
                `SELECT DISTINCT ON (target_id) target_id, content, message_type, created_at, sender_id
                FROM messages
                WHERE type = 'group' AND target_id = ANY($1::text[])
                ORDER BY target_id, created_at DESC`,
                [groupIds]
            );
            groupMsgs.rows.forEach(m => {
                result[m.target_id] = {
                    content: m.message_type === 'image' ? '[图片]' : m.content,
                    messageType: m.message_type,
                    timestamp: m.created_at
                };
            });
        }

        res.json(result);
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// Get unread counts
app.get('/api/messages/unread', authMiddleware, async (req, res) => {
    try {
        const friendshipsR = await pool.query(
            "SELECT * FROM friendships WHERE (user_id = $1 OR friend_id = $1) AND status = 'accepted'",
            [req.user.id]
        );
        const friendIds = friendshipsR.rows.map(f => f.user_id === req.user.id ? f.friend_id : f.user_id);

        const privateUnread = {};
        for (const fid of friendIds) {
            const r = await pool.query(
                "SELECT COUNT(*) as cnt FROM messages WHERE type = 'private' AND sender_id = $1 AND target_id = $2 AND is_read = false",
                [fid, req.user.id]
            );
            privateUnread[fid] = parseInt(r.rows[0].cnt);
        }

        const memberGroupsR = await pool.query("SELECT * FROM groups_t WHERE members @> $1::jsonb", [JSON.stringify([req.user.id])]);
        const groupUnread = {};
        for (const g of memberGroupsR.rows) {
            const r = await pool.query(
                "SELECT COUNT(*) as cnt FROM messages WHERE type = 'group' AND target_id = $1 AND sender_id != $2 AND NOT (read_by @> $3::jsonb)",
                [g.id, req.user.id, JSON.stringify([req.user.id])]
            );
            groupUnread[g.id] = parseInt(r.rows[0].cnt);
        }

        res.json({ private: privateUnread, group: groupUnread });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// Upload chat image
app.post('/api/upload', authMiddleware, upload.single('image'), (req, res) => {
    if (!req.file) return res.status(400).json({ error: '请上传图片' });
    res.json({ success: true, url: `/uploads/${req.file.filename}` });
});

// ========== Group APIs ==========

app.get('/api/groups', authMiddleware, async (req, res) => {
    try {
        const groupsR = await pool.query(
            "SELECT * FROM groups_t WHERE members @> $1::jsonb OR group_type = 'public' OR id = 'g_public'",
            [JSON.stringify([req.user.id])]
        );
        res.json(groupsR.rows.map(g => ({
            id: g.id, name: g.name, description: g.description,
            type: g.group_type || 'public', avatarColor: g.avatar_color,
            avatarText: g.avatar_text, memberCount: g.members.length,
            isMember: g.members.includes(req.user.id),
            hasPassword: !!g.password, createdAt: g.created_at
        })));
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

app.get('/api/groups/:groupId/members', authMiddleware, async (req, res) => {
    try {
        const gR = await pool.query('SELECT * FROM groups_t WHERE id = $1', [req.params.groupId]);
        if (gR.rows.length === 0) return res.status(404).json({ error: '群不存在' });
        const members = gR.rows[0].members;
        if (!members || members.length === 0) return res.json([]);

        const usersR = await pool.query('SELECT * FROM users WHERE id = ANY($1)', [members]);
        res.json(usersR.rows.map(u => ({
            id: u.id, nickname: u.nickname, avatarColor: u.avatar_color,
            avatarText: u.avatar_text, avatarUrl: u.avatar_url || null
        })));
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// Create group
app.post('/api/groups/create', authMiddleware, async (req, res) => {
    try {
        const { name, description, type, password } = req.body;
        if (!name) return res.status(400).json({ error: '群名必填' });

        const colors = ['#667eea', '#764ba2', '#f093fb', '#f5576c', '#4facfe', '#43e97b', '#fa709a', '#fee140'];
        const gid = genId('g');
        const now = Date.now();

        await pool.query(
            'INSERT INTO groups_t (id, name, description, group_type, password, avatar_color, avatar_text, members, created_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)',
            [gid, name, description || '', type || 'public', type === 'private' ? (password || '') : '',
             colors[Math.floor(Math.random() * colors.length)], name.slice(0, 1),
             JSON.stringify([req.user.id]), now]
        );

        io.emit('group-created', { id: gid, name, description: description || '', type: type || 'public' });
        res.json({ success: true, group: { id: gid, name, description: description || '', type: type || 'public' } });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// Join group
app.post('/api/groups/join', authMiddleware, async (req, res) => {
    try {
        const { groupId, password } = req.body;
        const gR = await pool.query('SELECT * FROM groups_t WHERE id = $1', [groupId]);
        if (gR.rows.length === 0) return res.status(404).json({ error: '群不存在' });
        const group = gR.rows[0];
        if (group.members.includes(req.user.id)) return res.status(400).json({ error: '已经在群里了' });

        if (group.group_type === 'private' && group.password && group.password !== (password || '')) {
            return res.status(403).json({ error: '密码错误，无法加入私密群组' });
        }

        await pool.query(
            'UPDATE groups_t SET members = members || $1::jsonb WHERE id = $2 AND NOT members @> $1::jsonb',
            [JSON.stringify([req.user.id]), groupId]
        );

        io.to(groupId).emit('group-member-joined', { groupId, userId: req.user.id, nickname: req.user.nickname });
        io.emit('groups-updated');
        res.json({ success: true });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// ========== Moments APIs ==========

app.get('/api/moments', authMiddleware, async (req, res) => {
    try {
        const friendshipsR = await pool.query(
            "SELECT * FROM friendships WHERE (user_id = $1 OR friend_id = $1) AND status = 'accepted'",
            [req.user.id]
        );
        const friendIds = friendshipsR.rows.map(f => f.user_id === req.user.id ? f.friend_id : f.user_id);

        let momentsR;
        if (friendIds.length > 0) {
            momentsR = await pool.query(
                'SELECT * FROM moments WHERE user_id = $1 OR user_id = ANY($2) OR is_public = true ORDER BY created_at DESC LIMIT 100',
                [req.user.id, friendIds]
            );
        } else {
            momentsR = await pool.query(
                'SELECT * FROM moments WHERE user_id = $1 OR is_public = true ORDER BY created_at DESC LIMIT 100',
                [req.user.id]
            );
        }

        const userIds = [...new Set(momentsR.rows.map(m => m.user_id))];
        let userMap = {};
        if (userIds.length > 0) {
            const usersR = await pool.query('SELECT * FROM users WHERE id = ANY($1)', [userIds]);
            usersR.rows.forEach(u => { userMap[u.id] = u; });
        }

        res.json(momentsR.rows.map(m => {
            const u = userMap[m.user_id];
            return {
                id: m.id, userId: m.user_id,
                nickname: u ? u.nickname : '未知用户',
                avatarColor: u ? u.avatar_color : '#999',
                avatarText: u ? u.avatar_text : '?',
                avatarUrl: u ? (u.avatar_url || null) : null,
                content: m.content, images: m.images || [],
                likes: m.likes || [], comments: m.comments || [],
                createdAt: m.created_at, isOwn: m.user_id === req.user.id
            };
        }));
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// Post moment
app.post('/api/moments/post', authMiddleware, upload.array('images', 9), async (req, res) => {
    try {
        const { content } = req.body;
        if (!content && (!req.files || req.files.length === 0)) {
            return res.status(400).json({ error: '说点什么吧' });
        }
        const imageUrls = req.files ? req.files.map(f => `/uploads/${f.filename}`) : [];
        const mid = genId('m');
        const now = Date.now();

        await pool.query(
            'INSERT INTO moments (id, user_id, content, images, likes, comments, is_public, created_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)',
            [mid, req.user.id, content || '', JSON.stringify(imageUrls), JSON.stringify([]), JSON.stringify([]), true, now]
        );

        const newMomentObj = { id: mid, userId: req.user.id, content: content || '', images: imageUrls, likes: [], comments: [], createdAt: now };
        io.emit('new-moment', newMomentObj);
        res.json({ success: true, moment: newMomentObj });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// Like moment
app.post('/api/moments/like/:momentId', authMiddleware, async (req, res) => {
    try {
        const mR = await pool.query('SELECT * FROM moments WHERE id = $1', [req.params.momentId]);
        if (mR.rows.length === 0) return res.status(404).json({ error: '动态不存在' });
        const moment = mR.rows[0];
        let likes = moment.likes || [];

        if (likes.includes(req.user.id)) {
            likes = likes.filter(id => id !== req.user.id);
        } else {
            likes.push(req.user.id);
        }

        await pool.query('UPDATE moments SET likes = $1 WHERE id = $2', [JSON.stringify(likes), req.params.momentId]);

        moment.likes = likes;
        io.emit('moment-updated', moment);
        res.json({ success: true, likes });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// Comment moment
app.post('/api/moments/comment/:momentId', authMiddleware, async (req, res) => {
    try {
        const { content } = req.body;
        if (!content) return res.status(400).json({ error: '评论内容不能为空' });

        const mR = await pool.query('SELECT * FROM moments WHERE id = $1', [req.params.momentId]);
        if (mR.rows.length === 0) return res.status(404).json({ error: '动态不存在' });
        const moment = mR.rows[0];

        const comment = {
            id: genId('c'),
            userId: req.user.id,
            nickname: req.user.nickname,
            content,
            createdAt: Date.now()
        };
        const comments = [...(moment.comments || []), comment];

        await pool.query('UPDATE moments SET comments = $1 WHERE id = $2', [JSON.stringify(comments), req.params.momentId]);

        moment.comments = comments;
        io.emit('moment-updated', moment);
        res.json({ success: true, comment });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// Delete moment
app.delete('/api/moments/:momentId', authMiddleware, async (req, res) => {
    try {
        const mR = await pool.query('SELECT * FROM moments WHERE id = $1', [req.params.momentId]);
        if (mR.rows.length === 0) return res.status(404).json({ error: '动态不存在' });
        if (mR.rows[0].user_id !== req.user.id && req.user.role !== 'admin' && req.user.role !== 'super_admin') {
            return res.status(403).json({ error: '无权删除' });
        }
        await pool.query('DELETE FROM moments WHERE id = $1', [req.params.momentId]);
        io.emit('moment-deleted', req.params.momentId);
        res.json({ success: true });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// ========== Admin APIs ==========

app.get('/api/admin/users', adminMiddleware, async (req, res) => {
    try {
        const r = await pool.query("SELECT * FROM users WHERE role != 'system'");
        res.json(r.rows.map(u => ({
            id: u.id, username: u.username, nickname: u.nickname, bio: u.bio,
            avatarColor: u.avatar_color, avatarText: u.avatar_text,
            avatarUrl: u.avatar_url || null, role: u.role, banned: u.banned,
            createdAt: u.created_at, points: u.points || 0
        })));
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

app.post('/api/admin/ban/:userId', adminMiddleware, async (req, res) => {
    try {
        const r = await pool.query('SELECT * FROM users WHERE id = $1', [req.params.userId]);
        if (r.rows.length === 0) return res.status(404).json({ error: '用户不存在' });
        const user = r.rows[0];
        if (user.role === 'super_admin') return res.status(400).json({ error: '不能封禁超级管理员' });
        if (user.role === 'admin' && req.user.role !== 'super_admin') return res.status(400).json({ error: '只有超级管理员可以封禁管理员' });

        const newBanned = !user.banned;
        await pool.query('UPDATE users SET banned = $1 WHERE id = $2', [newBanned, req.params.userId]);

        if (newBanned) {
            const sockets = io.sockets.sockets;
            for (const [sid, socket] of sockets) {
                if (socket.userId === user.id) {
                    socket.emit('banned', { message: '你的账号已被管理员封禁' });
                    socket.disconnect(true);
                }
            }
        }

        res.json({ success: true, banned: newBanned });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

app.delete('/api/admin/user/:userId', adminMiddleware, async (req, res) => {
    try {
        const userId = req.params.userId;
        const r = await pool.query('SELECT * FROM users WHERE id = $1', [userId]);
        if (r.rows.length === 0) return res.status(404).json({ error: '用户不存在' });
        const user = r.rows[0];
        if (user.role === 'super_admin') return res.status(400).json({ error: '不能删除超级管理员' });
        if (user.role === 'admin' && req.user.role !== 'super_admin') return res.status(400).json({ error: '只有超级管理员可以删除管理员' });

        await pool.query('UPDATE groups_t SET members = members - $1 WHERE members @> $2::jsonb', [userId, JSON.stringify([userId])]);
        await pool.query('DELETE FROM friendships WHERE user_id = $1 OR friend_id = $1', [userId]);
        await pool.query('DELETE FROM moments WHERE user_id = $1', [userId]);
        await pool.query('DELETE FROM messages WHERE sender_id = $1 OR target_id = $1', [userId]);
        await pool.query('DELETE FROM users WHERE id = $1', [userId]);

        const sockets = io.sockets.sockets;
        for (const [sid, socket] of sockets) {
            if (socket.userId === userId) socket.disconnect(true);
        }

        io.emit('user-deleted', userId);
        res.json({ success: true });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

app.get('/api/admin/messages/:userId', adminMiddleware, async (req, res) => {
    try {
        const userId = req.params.userId;
        const targetR = await pool.query('SELECT * FROM users WHERE id = $1', [userId]);

        if (req.user.role !== 'super_admin' && targetR.rows.length > 0 && targetR.rows[0].role === 'super_admin') {
            return res.status(403).json({ error: '无权查看超级管理员的聊天记录' });
        }

        let msgsR = await pool.query(
            'SELECT * FROM messages WHERE sender_id = $1 OR target_id = $1 ORDER BY created_at DESC LIMIT 200',
            [userId]
        );

        // Filter super-admin messages for non-super-admin
        if (req.user.role !== 'super_admin') {
            const superAdminR = await pool.query("SELECT id FROM users WHERE role = 'super_admin'");
            if (superAdminR.rows.length > 0) {
                const saId = superAdminR.rows[0].id;
                msgsR.rows = msgsR.rows.filter(m => !(m.sender_id === saId || m.target_id === saId));
            }
        }

        const userIds = [...new Set([...msgsR.rows.map(m => m.sender_id), ...msgsR.rows.map(m => m.target_id)])];
        let userMap = {};
        if (userIds.length > 0) {
            const usersR = await pool.query('SELECT * FROM users WHERE id = ANY($1)', [userIds]);
            usersR.rows.forEach(u => { userMap[u.id] = u; });
        }

        const groupsR = await pool.query('SELECT * FROM groups_t');
        const groupMap = {};
        groupsR.rows.forEach(g => { groupMap[g.id] = g; });

        res.json(msgsR.rows.map(m => ({
            id: m.id, from: m.sender_id,
            fromNickname: userMap[m.sender_id]?.nickname || '未知',
            to: m.target_id,
            toNickname: m.type === 'group' ? (groupMap[m.target_id]?.name || '群聊') : (userMap[m.target_id]?.nickname || '未知'),
            type: m.type, content: m.content,
            messageType: m.message_type || 'text', timestamp: m.created_at
        })));
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

app.delete('/api/admin/moment/:momentId', adminMiddleware, async (req, res) => {
    try {
        await pool.query('DELETE FROM moments WHERE id = $1', [req.params.momentId]);
        io.emit('moment-deleted', req.params.momentId);
        res.json({ success: true });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

app.get('/api/admin/stats', adminMiddleware, async (req, res) => {
    try {
        const now = Date.now();
        const today = now - 86400000;
        const onlineCount = Object.values(io.sockets.sockets).filter(s => s.userId).length;

        const [totalUsers, bannedUsers, totalMessages, todayMessages, totalGroups, totalMoments, todayMoments, totalFriendships] = await Promise.all([
            pool.query("SELECT COUNT(*) as cnt FROM users WHERE role != 'system'"),
            pool.query("SELECT COUNT(*) as cnt FROM users WHERE banned = true"),
            pool.query("SELECT COUNT(*) as cnt FROM messages"),
            pool.query("SELECT COUNT(*) as cnt FROM messages WHERE created_at > $1", [today]),
            pool.query("SELECT COUNT(*) as cnt FROM groups_t"),
            pool.query("SELECT COUNT(*) as cnt FROM moments"),
            pool.query("SELECT COUNT(*) as cnt FROM moments WHERE created_at > $1", [today]),
            pool.query("SELECT COUNT(*) as cnt FROM friendships WHERE status = 'accepted'")
        ]);

        res.json({
            totalUsers: parseInt(totalUsers.rows[0].cnt), bannedUsers: parseInt(bannedUsers.rows[0].cnt),
            totalMessages: parseInt(totalMessages.rows[0].cnt), todayMessages: parseInt(todayMessages.rows[0].cnt),
            totalGroups: parseInt(totalGroups.rows[0].cnt), totalMoments: parseInt(totalMoments.rows[0].cnt),
            todayMoments: parseInt(todayMoments.rows[0].cnt),
            totalFriendships: parseInt(totalFriendships.rows[0].cnt), onlineUsers: onlineCount
        });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// Promote user
app.post('/api/admin/promote/:userId', superAdminMiddleware, async (req, res) => {
    try {
        const r = await pool.query('SELECT * FROM users WHERE id = $1', [req.params.userId]);
        if (r.rows.length === 0) return res.status(404).json({ error: '用户不存在' });
        if (r.rows[0].role === 'admin') return res.json({ success: true, message: '该用户已是管理员' });

        await pool.query("UPDATE users SET role = 'admin' WHERE id = $1", [req.params.userId]);

        const sockets = io.sockets.sockets;
        for (const [sid, socket] of sockets) {
            if (socket.userId === req.params.userId) {
                socket.emit('promoted', { message: '你已被提升为管理员！' });
                socket.role = 'admin';
            }
        }

        res.json({ success: true, message: `${r.rows[0].nickname} 已提升为管理员` });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// ========== Check-in ==========

app.post('/api/checkin', authMiddleware, async (req, res) => {
    try {
        const today = new Date().toDateString();
        if (req.user.last_checkin_date === today) {
            return res.status(400).json({ error: '今天已经签到过了！' });
        }

        const newPoints = (req.user.points || 0) + 10;
        await pool.query('UPDATE users SET points = $1, last_checkin_date = $2 WHERE id = $3', [newPoints, today, req.user.id]);

        res.json({ success: true, points: newPoints, earned: 10, message: '签到成功！+10积分' });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// ========== Bubble APIs ==========

app.get('/api/bubbles', authMiddleware, async (req, res) => {
    try {
        const r = await pool.query('SELECT * FROM users WHERE id = $1', [req.user.id]);
        const user = r.rows[0];
        const isAdmin = user.role === 'super_admin' || user.role === 'admin';
        const bubblePurchases = user.bubble_purchases || {};

        let modified = false;
        const bubbles = BUBBLE_STYLES.map(b => {
            let owned = isAdmin || b.id === 0;
            let expiresAt = null;
            let isDay = false;

            const key = String(b.id);
            if (!owned && bubblePurchases[key]) {
                const purchase = bubblePurchases[key];
                if (purchase === 'permanent') { owned = true; isDay = false; }
                else if (typeof purchase === 'number') {
                    if (purchase > Date.now()) { owned = true; expiresAt = purchase; isDay = true; }
                    else { delete bubblePurchases[key]; modified = true; }
                }
            }

            return { ...b, owned, equipped: b.id === user.bubble_style, canAfford: isAdmin || (user.points || 0) >= b.price, expiresAt, isDay };
        });

        if (modified) {
            await pool.query('UPDATE users SET bubble_purchases = $1 WHERE id = $2', [JSON.stringify(bubblePurchases), user.id]);
        }

        res.json(bubbles);
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

app.post('/api/bubbles/purchase', authMiddleware, async (req, res) => {
    try {
        const { bubbleId, duration } = req.body;
        const bubble = BUBBLE_STYLES.find(b => b.id === bubbleId);
        if (!bubble) return res.status(404).json({ error: '气泡不存在' });

        const r = await pool.query('SELECT * FROM users WHERE id = $1', [req.user.id]);
        const user = r.rows[0];
        const isDay = duration === 'day';
        const actualPrice = isDay ? Math.max(1, Math.floor(bubble.price * 0.3)) : bubble.price;

        if (user.role !== 'super_admin' && user.role !== 'admin') {
            if ((user.points || 0) < actualPrice) return res.status(400).json({ error: '积分不足' });
            await pool.query('UPDATE users SET points = points - $1 WHERE id = $2', [actualPrice, user.id]);
        }

        const purchases = user.bubble_purchases || {};
        const key = String(bubbleId);
        if (isDay) {
            purchases[key] = Date.now() + 24 * 60 * 60 * 1000;
        } else {
            purchases[key] = 'permanent';
        }

        await pool.query(
            'UPDATE users SET bubble_purchases = $1, bubble_style = $2 WHERE id = $3',
            [JSON.stringify(purchases), bubbleId, user.id]
        );

        const durationText = isDay ? '（1天）' : '（永久）';
        res.json({ success: true, points: user.points - actualPrice, bubbleStyle: bubbleId, message: `已装备「${bubble.name}」气泡${durationText}！` });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

app.put('/api/bubbles/equip', authMiddleware, async (req, res) => {
    try {
        const { bubbleId } = req.body;
        const bubble = BUBBLE_STYLES.find(b => b.id === bubbleId);
        if (!bubble) return res.status(404).json({ error: '气泡不存在' });

        const r = await pool.query('SELECT * FROM users WHERE id = $1', [req.user.id]);
        const user = r.rows[0];
        const isAdmin = user.role === 'super_admin' || user.role === 'admin';

        let owns = isAdmin || bubbleId === 0;
        const purchases = user.bubble_purchases || {};
        const key = String(bubbleId);
        const purchase = purchases[key];

        if (!owns && purchase) {
            if (purchase === 'permanent') owns = true;
            else if (typeof purchase === 'number') {
                if (purchase > Date.now()) owns = true;
                else {
                    delete purchases[key];
                    await pool.query('UPDATE users SET bubble_purchases = $1 WHERE id = $2', [JSON.stringify(purchases), user.id]);
                    return res.status(400).json({ error: '该气泡已过期，请重新兑换' });
                }
            }
        }

        if (!owns) return res.status(400).json({ error: '你还没有购买这个气泡！请先兑换' });

        await pool.query('UPDATE users SET bubble_style = $1 WHERE id = $2', [bubbleId, user.id]);
        res.json({ success: true, bubbleStyle: bubbleId });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// ========== User Profile ==========

app.get('/api/user/:userId', authMiddleware, async (req, res) => {
    try {
        const r = await pool.query('SELECT * FROM users WHERE id = $1', [req.params.userId]);
        if (r.rows.length === 0) return res.status(404).json({ error: '用户不存在' });
        const user = r.rows[0];

        const momentsR = await pool.query(
            'SELECT * FROM moments WHERE user_id = $1 ORDER BY created_at DESC LIMIT 20',
            [user.id]
        );

        res.json({
            id: user.id, username: user.username, nickname: user.nickname,
            bio: user.bio, avatarColor: user.avatar_color, avatarText: user.avatar_text,
            avatarUrl: user.avatar_url || null, role: user.role, createdAt: user.created_at,
            moments: momentsR.rows.map(m => ({
                id: m.id, content: m.content, images: m.images || [],
                likes: m.likes || [], comments: m.comments || [], createdAt: m.created_at
            }))
        });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// ========== Donation ==========

app.get('/api/donation', authMiddleware, async (req, res) => {
    try {
        const r = await pool.query("SELECT * FROM donations WHERE id = 'donation_config'");
        res.json(r.rows[0] || { wechat: '', alipay: '' });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

app.post('/api/admin/donation', adminMiddleware, upload.fields([{ name: 'wechat', maxCount: 1 }, { name: 'alipay', maxCount: 1 }]), async (req, res) => {
    try {
        const existR = await pool.query("SELECT id FROM donations WHERE id = 'donation_config'");
        const wechatUrl = req.files?.wechat?.[0] ? `/uploads/${req.files.wechat[0].filename}` : null;
        const alipayUrl = req.files?.alipay?.[0] ? `/uploads/${req.files.alipay[0].filename}` : null;

        if (existR.rows.length > 0) {
            let updates = [];
            let vals = [];
            let idx = 1;
            if (wechatUrl) { updates.push(`wechat = $${idx++}`); vals.push(wechatUrl); }
            if (alipayUrl) { updates.push(`alipay = $${idx++}`); vals.push(alipayUrl); }
            if (updates.length > 0) {
                vals.push('donation_config');
                await pool.query(`UPDATE donations SET ${updates.join(', ')} WHERE id = $${idx}`, vals);
            }
        } else {
            await pool.query(
                "INSERT INTO donations (id, wechat, alipay) VALUES ('donation_config', $1, $2)",
                [wechatUrl || '', alipayUrl || '']
            );
        }

        const r = await pool.query("SELECT * FROM donations WHERE id = 'donation_config'");
        res.json({ success: true, donation: r.rows[0] });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// ========== Feedback ==========

app.post('/api/feedback', authMiddleware, async (req, res) => {
    try {
        const { content } = req.body;
        if (!content || content.trim().length < 2) return res.status(400).json({ error: '反馈内容至少2个字符' });

        const fid = genId('fb');
        const now = Date.now();

        await pool.query(
            "INSERT INTO feedbacks (id, user_id, nickname, avatar_color, avatar_text, content, status, created_at) VALUES ($1,$2,$3,$4,$5,$6,'pending',$7)",
            [fid, req.user.id, req.user.nickname, req.user.avatar_color, req.user.avatar_text, content.trim(), now]
        );

        const sockets = io.sockets.sockets;
        for (const [sid, socket] of sockets) {
            if (socket.role === 'super_admin' || socket.role === 'admin') {
                socket.emit('new-feedback', { id: fid, userId: req.user.id, nickname: req.user.nickname, avatarColor: req.user.avatar_color, avatarText: req.user.avatar_text, content: content.trim(), status: 'pending', createdAt: now });
            }
        }

        res.json({ success: true, id: fid });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

app.get('/api/admin/feedbacks', adminMiddleware, async (req, res) => {
    try {
        const r = await pool.query('SELECT * FROM feedbacks ORDER BY created_at DESC');
        res.json(r.rows.map(f => ({
            id: f.id, userId: f.user_id, nickname: f.nickname,
            avatarColor: f.avatar_color, avatarText: f.avatar_text,
            content: f.content, status: f.status, createdAt: f.created_at
        })));
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

app.post('/api/admin/feedback/:feedbackId/resolve', adminMiddleware, async (req, res) => {
    try {
        const r = await pool.query('SELECT * FROM feedbacks WHERE id = $1', [req.params.feedbackId]);
        if (r.rows.length === 0) return res.status(404).json({ error: '反馈不存在' });
        const newStatus = r.rows[0].status === 'resolved' ? 'pending' : 'resolved';
        await pool.query('UPDATE feedbacks SET status = $1 WHERE id = $2', [newStatus, req.params.feedbackId]);
        res.json({ success: true, status: newStatus });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// ========== Block / Unblock ==========

app.post('/api/block/:userId', authMiddleware, async (req, res) => {
    try {
        const targetR = await pool.query('SELECT * FROM users WHERE id = $1', [req.params.userId]);
        if (targetR.rows.length === 0) return res.status(404).json({ error: '用户不存在' });
        if (req.params.userId === req.user.id) return res.status(400).json({ error: '不能拉黑自己' });

        const blocked = req.user.blocked_users || [];
        if (blocked.includes(req.params.userId)) return res.json({ success: true, message: '已拉黑该用户' });

        await pool.query(
            'UPDATE users SET blocked_users = blocked_users || $1::jsonb WHERE id = $2',
            [JSON.stringify([req.params.userId]), req.user.id]
        );
        res.json({ success: true, message: `已拉黑 ${targetR.rows[0].nickname}` });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

app.post('/api/unblock/:userId', authMiddleware, async (req, res) => {
    try {
        await pool.query(
            'UPDATE users SET blocked_users = blocked_users - $1 WHERE id = $2',
            [req.params.userId, req.user.id]
        );
        res.json({ success: true, message: '已取消拉黑' });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

app.get('/api/blocked', authMiddleware, async (req, res) => {
    res.json({ blockedUsers: req.user.blocked_users || [] });
});

// ========== Socket.IO ==========

const onlineUsers = {};

io.on('connection', (socket) => {
    console.log('Socket connected:', socket.id);

    socket.on('auth', async (token) => {
        try {
            const r = await pool.query('SELECT * FROM users WHERE id = $1', [token]);
            if (r.rows.length === 0) { socket.emit('auth-error', '无效token'); return; }
            const user = r.rows[0];
            if (user.banned) {
                socket.emit('banned', { message: '账号已被封禁' });
                socket.disconnect(true);
                return;
            }

            socket.userId = user.id;
            socket.userNickname = user.nickname;
            socket.userAvatarColor = user.avatar_color;
            socket.userAvatarText = user.avatar_text;
            socket.userAvatarUrl = user.avatar_url || null;
            socket.role = user.role || 'user';
            socket.bubbleStyle = user.bubble_style || 0;
            onlineUsers[user.id] = socket.id;

            const groupsR = await pool.query("SELECT * FROM groups_t WHERE members @> $1::jsonb", [JSON.stringify([user.id])]);
            groupsR.rows.forEach(g => socket.join(g.id));

            socket.broadcast.emit('user-online', { userId: user.id, nickname: user.nickname });
            io.emit('online-list', Object.keys(onlineUsers));

            console.log(`User ${user.nickname} (${user.id}) authenticated`);
        } catch (e) {
            socket.emit('auth-error', '认证失败');
        }
    });

    socket.on('private-message', async (data) => {
        if (!socket.userId) return;
        const { to, content, messageType } = data;

        // 消息长度限制
        if (!content || (typeof content === 'string' && content.length > 5000)) return;

        // 频率限制：每秒最多3条
        const rateKey = 'msg_' + socket.userId;
        if (!checkRateLimit(rateKey, 333)) return;

        const [fromR, toR] = await Promise.all([
            pool.query('SELECT * FROM users WHERE id = $1', [socket.userId]),
            pool.query('SELECT * FROM users WHERE id = $1', [to])
        ]);
        const fromUser = fromR.rows[0];
        const toUser = toR.rows[0];

        if (fromUser?.blocked_users?.includes(to)) {
            socket.emit('blocked-error', { message: '你已拉黑该用户，无法发送消息' });
            return;
        }
        if (toUser?.blocked_users?.includes(socket.userId)) {
            socket.emit('blocked-error', { message: '对方已将你拉黑，无法发送消息' });
            return;
        }

        const msgId = genId('msg');
        const now = Date.now();
        await pool.query(
            "INSERT INTO messages (id, type, sender_id, target_id, content, message_type, created_at, is_read) VALUES ($1,'private',$2,$3,$4,$5,$6,false)",
            [msgId, socket.userId, to, content, messageType || 'text', now]
        );

        const msgObj = {
            id: msgId, type: 'private', from: socket.userId, to, content,
            messageType: messageType || 'text', timestamp: now, read: false,
            fromNickname: fromUser?.nickname, fromAvatarColor: fromUser?.avatar_color,
            fromAvatarText: fromUser?.avatar_text, fromAvatarUrl: fromUser?.avatar_url || null,
            fromBubbleStyle: fromUser?.bubble_style || 0
        };

        const recipientSocketId = onlineUsers[to];
        if (recipientSocketId) {
            io.to(recipientSocketId).emit('private-message', msgObj);
        }

        socket.emit('private-message-sent', msgObj);
    });

    socket.on('group-message', async (data) => {
        if (!socket.userId) return;
        const { to, content, messageType } = data;

        // 消息长度限制
        if (!content || (typeof content === 'string' && content.length > 5000)) return;

        // 频率限制：每秒最多3条
        const rateKey = 'msg_' + socket.userId;
        if (!checkRateLimit(rateKey, 333)) return;

        const msgId = genId('msg');
        const now = Date.now();
        await pool.query(
            "INSERT INTO messages (id, type, sender_id, target_id, content, message_type, created_at, read_by) VALUES ($1,'group',$2,$3,$4,$5,$6,$7)",
            [msgId, socket.userId, to, content, messageType || 'text', now, JSON.stringify([socket.userId])]
        );

        const fromR = await pool.query('SELECT * FROM users WHERE id = $1', [socket.userId]);
        const fromUser = fromR.rows[0];

        io.to(to).emit('group-message', {
            id: msgId, type: 'group', from: socket.userId, to, content,
            messageType: messageType || 'text', timestamp: now, readBy: [socket.userId],
            fromNickname: fromUser?.nickname, fromAvatarColor: fromUser?.avatar_color,
            fromAvatarText: fromUser?.avatar_text, fromAvatarUrl: fromUser?.avatar_url || null,
            fromBubbleStyle: fromUser?.bubble_style || 0
        });
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
            if (recipientSocketId) io.to(recipientSocketId).emit('stop-typing', { from: socket.userId });
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

// ========== Seed Data ==========

async function seedData() {
    const client = await pool.connect();
    try {
        // System user
        const sysR = await client.query("SELECT id FROM users WHERE id = 'u_system'");
        if (sysR.rows.length === 0) {
            await client.query(
                "INSERT INTO users (id, username, password, nickname, bio, avatar_color, avatar_text, role, banned, created_at) VALUES ($1,$2,$3,$4,$5,$6,$7,'system',false,$8)",
                ['u_system', 'system', bcrypt.hashSync('system', 10), '系统通知', '飞友之家官方系统通知', '#667eea', '飞', Date.now() - 86400000 * 365]
            );
        }

        // Super admin
        const adminR = await client.query("SELECT id FROM users WHERE role = 'super_admin'");
        if (adminR.rows.length === 0) {
            await client.query(
                "INSERT INTO users (id, username, password, nickname, bio, avatar_color, avatar_text, role, points, bubble_style, banned, created_at) VALUES ($1,$2,$3,$4,$5,$6,$7,'super_admin',$8,$9,false,$10)",
                ['u_admin', 'admin', bcrypt.hashSync('admin123', 10), '管理员', '飞友之家平台管理员', '#f5576c', '管', 99999, 4, Date.now()]
            );
            console.log('Admin account created: admin / admin123');
        }

        // Public group
        const pubR = await client.query("SELECT id FROM groups_t WHERE id = 'g_public'");
        if (pubR.rows.length === 0) {
            const members = ['u_system', 'u_admin'];
            await client.query(
                "INSERT INTO groups_t (id, name, description, avatar_color, avatar_text, members, created_at) VALUES ('g_public','飞友之家大厅','所有人都在这里聊天！','#667eea','厅',$1,$2)",
                [JSON.stringify(members), Date.now()]
            );
        }

        // Donation config
        const donR = await client.query("SELECT id FROM donations WHERE id = 'donation_config'");
        if (donR.rows.length === 0) {
            await client.query("INSERT INTO donations (id, wechat, alipay) VALUES ('donation_config','','')");
        }

        console.log('Seed data initialized');
    } catch (e) {
        console.error('Seed error:', e.message);
    } finally {
        client.release();
    }
}

// ========== Start Server ==========

async function start() {
    try {
        await initTables();
        await seedData();
        console.log('Database: PostgreSQL (Supabase) - connected');
    } catch (e) {
        console.error('Database init failed:', e.message);
        console.error('App will start without database connection.');
    }

    server.listen(PORT, '0.0.0.0', () => {
        console.log(`飞友之家 server running on port ${PORT}`);
    });
}

start().catch(e => {
    console.error('Start failed:', e.message);
    // Still try to start the server anyway
    server.listen(PORT, '0.0.0.0', () => {
        console.log(`飞友之家 server running on port ${PORT} (fallback mode)`);
    });
});
