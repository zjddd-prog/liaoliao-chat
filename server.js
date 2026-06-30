const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const multer = require('multer');
const bcrypt = require('bcryptjs');
const fs = require('fs');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
    cors: { origin: "*" },
    maxHttpBufferSize: 5e6 // 5MB for image uploads
});

const PORT = process.env.PORT || 3000;
const DATA_DIR = path.join(__dirname, 'data');
const UPLOADS_DIR = path.join(__dirname, 'public', 'uploads');

// Ensure directories exist
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
if (!fs.existsSync(UPLOADS_DIR)) fs.mkdirSync(UPLOADS_DIR, { recursive: true });

// ========== Data Store (JSON files) ==========

function loadJSON(filename) {
    const filepath = path.join(DATA_DIR, filename);
    if (!fs.existsSync(filepath)) return [];
    try { return JSON.parse(fs.readFileSync(filepath, 'utf8')); }
    catch { return []; }
}

function saveJSON(filename, data) {
    fs.writeFileSync(path.join(DATA_DIR, filename), JSON.stringify(data, null, 2));
}

// Initialize data files if empty
if (loadJSON('users.json').length === 0) {
    const defaultUsers = [
        {
            id: 'u_system',
            username: 'system',
            password: bcrypt.hashSync('system', 10),
            nickname: '系统通知',
            bio: '飞友之家官方系统通知',
            avatarColor: '#667eea',
            avatarText: '飞',
            role: 'system',
            banned: false,
            createdAt: Date.now() - 86400000 * 365
        }
    ];
    saveJSON('users.json', defaultUsers);
}
if (loadJSON('messages.json').length === 0) saveJSON('messages.json', []);
if (loadJSON('groups.json').length === 0) {
    saveJSON('groups.json', [{
        id: 'g_public',
        name: '飞友之家大厅',
        description: '所有人都在这里聊天！',
        avatarColor: '#667eea',
        avatarText: '厅',
        members: [],
        createdAt: Date.now()
    }]);
}
if (loadJSON('moments.json').length === 0) saveJSON('moments.json', []);
if (loadJSON('friendships.json').length === 0) saveJSON('friendships.json', []);
if (loadJSON('feedbacks.json').length === 0) saveJSON('feedbacks.json', []);
if (loadJSON('donation.json').length === 0) saveJSON('donation.json', { wechat: '', alipay: '' });

// ========== Middleware ==========

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Multer for image uploads
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

// ========== Auth Helper ==========

function authMiddleware(req, res, next) {
    const token = req.headers.authorization;
    if (!token) return res.status(401).json({ error: '未登录' });
    const users = loadJSON('users.json');
    const user = users.find(u => u.id === token);
    if (!user) return res.status(401).json({ error: '无效token' });
    if (user.banned) return res.status(403).json({ error: '账号已被封禁' });
    req.user = user;
    next();
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
app.post('/api/register', (req, res) => {
    const { username, password, nickname, bio } = req.body;
    if (!username || !password) return res.status(400).json({ error: '用户名和密码必填' });
    if (username.length < 2 || username.length > 20) return res.status(400).json({ error: '用户名2-20字符' });
    if (password.length < 4) return res.status(400).json({ error: '密码至少4位' });

    const users = loadJSON('users.json');
    if (users.find(u => u.username === username)) return res.status(400).json({ error: '用户名已存在' });

    const colors = ['#667eea', '#764ba2', '#f093fb', '#f5576c', '#4facfe', '#43e97b', '#fa709a', '#fee140', '#a18cd1', '#fbc2eb'];
    const newUser = {
        id: 'u_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8),
        username,
        password: bcrypt.hashSync(password, 10),
        nickname: nickname || username,
        bio: bio || '',
        avatarColor: colors[Math.floor(Math.random() * colors.length)],
        avatarText: (nickname || username).slice(0, 1).toUpperCase(),
        role: 'user',
        points: 0,
        lastCheckinDate: null,
        bubbleStyle: 0,
        banned: false,
        createdAt: Date.now()
    };
    users.push(newUser);
    saveJSON('users.json', users);

    // Auto-add to public group
    const groups = loadJSON('groups.json');
    const pubGroup = groups.find(g => g.id === 'g_public');
    if (pubGroup && !pubGroup.members.includes(newUser.id)) {
        pubGroup.members.push(newUser.id);
        saveJSON('groups.json', groups);
    }

    res.json({
        success: true,
        token: newUser.id,
        user: {
            id: newUser.id,
            username: newUser.username,
            nickname: newUser.nickname,
            bio: newUser.bio,
            avatarColor: newUser.avatarColor,
            avatarText: newUser.avatarText,
            role: newUser.role,
            points: newUser.points,
            lastCheckinDate: newUser.lastCheckinDate,
            bubbleStyle: newUser.bubbleStyle,
            createdAt: newUser.createdAt
        }
    });
});

// Login
app.post('/api/login', (req, res) => {
    const { username, password } = req.body;
    const users = loadJSON('users.json');
    const user = users.find(u => u.username === username);
    if (!user) return res.status(400).json({ error: '用户名不存在' });
    if (user.banned) return res.status(403).json({ error: '账号已被封禁，请联系管理员' });
    if (!bcrypt.compareSync(password, user.password)) return res.status(400).json({ error: '密码错误' });

    // Auto-check and revert expired bubble
    cleanupExpiredBubble(user);
    saveJSON('users.json', users);

    res.json({
        success: true,
        token: user.id,
        user: {
            id: user.id,
            username: user.username,
            nickname: user.nickname,
            bio: user.bio,
            avatarColor: user.avatarColor,
            avatarText: user.avatarText,
            role: user.role,
            points: user.points || 0,
            lastCheckinDate: user.lastCheckinDate || null,
            bubbleStyle: user.bubbleStyle || 0,
            createdAt: user.createdAt
        }
    });
});

// Get current user info
app.get('/api/me', authMiddleware, (req, res) => {
    const user = req.user;
    // Auto-check expired bubble
    const users = loadJSON('users.json');
    const liveUser = users.find(u => u.id === user.id);
    if (liveUser) {
        cleanupExpiredBubble(liveUser);
        saveJSON('users.json', users);
        liveUser.bubbleStyle = liveUser.bubbleStyle || 0;
    }
    res.json({
        id: user.id,
        username: user.username,
        nickname: user.nickname,
        bio: user.bio,
        avatarColor: user.avatarColor,
        avatarText: user.avatarText,
        avatarUrl: user.avatarUrl || null,
        role: user.role,
        points: user.points || 0,
        lastCheckinDate: user.lastCheckinDate || null,
        bubbleStyle: liveUser ? liveUser.bubbleStyle : (user.bubbleStyle || 0),
        createdAt: user.createdAt
    });
});

// Update profile
app.put('/api/profile', authMiddleware, (req, res) => {
    const { nickname, bio } = req.body;
    const users = loadJSON('users.json');
    const user = users.find(u => u.id === req.user.id);
    if (!user) return res.status(404).json({ error: '用户不存在' });

    if (nickname) { user.nickname = nickname; user.avatarText = nickname.slice(0, 1).toUpperCase(); }
    if (bio) user.bio = bio;
    saveJSON('users.json', users);

    res.json({ success: true, user: { id: user.id, nickname: user.nickname, bio: user.bio, avatarColor: user.avatarColor, avatarText: user.avatarText } });
});

// Upload avatar
app.post('/api/avatar', authMiddleware, upload.single('avatar'), (req, res) => {
    if (!req.file) return res.status(400).json({ error: '请上传图片' });
    const users = loadJSON('users.json');
    const user = users.find(u => u.id === req.user.id);
    user.avatarUrl = `/uploads/${req.file.filename}`;
    saveJSON('users.json', users);
    res.json({ success: true, avatarUrl: user.avatarUrl });
});

// Get all users (for discover/contacts)
app.get('/api/users', authMiddleware, (req, res) => {
    const users = loadJSON('users.json');
    const friendships = loadJSON('friendships.json');

    const result = users
        .filter(u => u.id !== req.user.id && u.role !== 'system')
        .map(u => ({
            id: u.id,
            username: u.username,
            nickname: u.nickname,
            bio: u.bio,
            avatarColor: u.avatarColor,
            avatarText: u.avatarText,
            avatarUrl: u.avatarUrl || null,
            banned: u.banned,
            createdAt: u.createdAt,
            isFriend: friendships.some(f =>
                ((f.userId === req.user.id && f.friendId === u.id) || (f.userId === u.id && f.friendId === req.user.id)) && f.status === 'accepted'
            )
        }));

    res.json(result);
});

// Get friends list
app.get('/api/friends', authMiddleware, (req, res) => {
    const users = loadJSON('users.json');
    const friendships = loadJSON('friendships.json');

    const friendIds = friendships
        .filter(f => (f.userId === req.user.id || f.friendId === req.user.id) && f.status === 'accepted')
        .map(f => f.userId === req.user.id ? f.friendId : f.userId);

    const friends = friendIds.map(fid => {
        const u = users.find(u => u.id === fid);
        if (!u) return null;
        return {
            id: u.id,
            username: u.username,
            nickname: u.nickname,
            bio: u.bio,
            avatarColor: u.avatarColor,
            avatarText: u.avatarText,
            avatarUrl: u.avatarUrl || null,
            online: false // will be updated via socket
        };
    }).filter(Boolean);

    res.json(friends);
});

// Add friend
app.post('/api/friends/add', authMiddleware, (req, res) => {
    const { userId } = req.body;
    if (userId === req.user.id) return res.status(400).json({ error: '不能添加自己' });

    const users = loadJSON('users.json');
    if (!users.find(u => u.id === userId)) return res.status(404).json({ error: '用户不存在' });

    const friendships = loadJSON('friendships.json');
    const existing = friendships.find(f =>
        ((f.userId === req.user.id && f.friendId === userId) || (f.userId === userId && f.friendId === req.user.id))
    );

    if (existing) {
        if (existing.status === 'accepted') return res.status(400).json({ error: '已经是好友了' });
        if (existing.status === 'pending') {
            // Accept the request
            existing.status = 'accepted';
            saveJSON('friendships.json', friendships);
            return res.json({ success: true, message: '已接受好友请求' });
        }
    }

    friendships.push({
        id: 'f_' + Date.now(),
        userId: req.user.id,
        friendId: userId,
        status: 'accepted',
        createdAt: Date.now()
    });
    saveJSON('friendships.json', friendships);

    res.json({ success: true, message: '好友添加成功' });
});

// Remove friend
app.post('/api/friends/remove', authMiddleware, (req, res) => {
    const { userId } = req.body;
    let friendships = loadJSON('friendships.json');
    friendships = friendships.filter(f =>
        !((f.userId === req.user.id && f.friendId === userId) || (f.userId === userId && f.friendId === req.user.id))
    );
    saveJSON('friendships.json', friendships);
    res.json({ success: true });
});

// ========== Chat APIs ==========

// Get chat history (private)
app.get('/api/messages/private/:userId', authMiddleware, (req, res) => {
    const otherUserId = req.params.userId;
    const users = loadJSON('users.json');
    const privateMsgs = messages.filter(m =>
        m.type === 'private' &&
        ((m.from === req.user.id && m.to === otherUserId) || (m.from === otherUserId && m.to === req.user.id))
    ).sort((a, b) => a.timestamp - b.timestamp);

    // Mark as read
    const updated = messages.map(m => {
        if (m.type === 'private' && m.to === req.user.id && m.from === otherUserId && !m.read) {
            m.read = true;
        }
        return m;
    });
    saveJSON('messages.json', updated);

    res.json(privateMsgs.map(m => {
        const fromUser = users.find(u => u.id === m.from);
        return {
            id: m.id,
            from: m.from,
            to: m.to,
            content: m.content,
            messageType: m.messageType || 'text',
            timestamp: m.timestamp,
            read: m.read,
            fromNickname: fromUser?.nickname,
            fromAvatarColor: fromUser?.avatarColor,
            fromAvatarText: fromUser?.avatarText,
            fromAvatarUrl: fromUser?.avatarUrl || null,
            fromBubbleStyle: fromUser?.bubbleStyle || 0
        };
    }));
});

// Get chat history (group)
app.get('/api/messages/group/:groupId', authMiddleware, (req, res) => {
    const groupId = req.params.groupId;
    const messages = loadJSON('messages.json');
    const users = loadJSON('users.json');
    const groupMsgs = messages.filter(m => m.type === 'group' && m.to === groupId)
        .sort((a, b) => a.timestamp - b.timestamp);

    res.json(groupMsgs.map(m => {
        const fromUser = users.find(u => u.id === m.from);
        return {
            id: m.id,
            from: m.from,
            to: m.to,
            content: m.content,
            messageType: m.messageType || 'text',
            timestamp: m.timestamp,
            fromNickname: fromUser?.nickname,
            fromAvatarColor: fromUser?.avatarColor,
            fromAvatarText: fromUser?.avatarText,
            fromAvatarUrl: fromUser?.avatarUrl || null,
            fromBubbleStyle: fromUser?.bubbleStyle || 0
        };
    }));
});

// Get unread counts
app.get('/api/messages/unread', authMiddleware, (req, res) => {
    const messages = loadJSON('messages.json');
    const friendships = loadJSON('friendships.json');
    const groups = loadJSON('groups.json');

    const friendIds = friendships
        .filter(f => (f.userId === req.user.id || f.friendId === req.user.id) && f.status === 'accepted')
        .map(f => f.userId === req.user.id ? f.friendId : f.userId);

    // Private unread
    const privateUnread = {};
    friendIds.forEach(fid => {
        privateUnread[fid] = messages.filter(m =>
            m.type === 'private' && m.from === fid && m.to === req.user.id && !m.read
        ).length;
    });

    // Group unread (count new messages since last visit - simplified: count all unread)
    const memberGroups = groups.filter(g => g.members.includes(req.user.id));
    const groupUnread = {};
    memberGroups.forEach(g => {
        groupUnread[g.id] = messages.filter(m =>
            m.type === 'group' && m.to === g.id && m.from !== req.user.id && !m.readBy?.includes(req.user.id)
        ).length;
    });

    res.json({ private: privateUnread, group: groupUnread });
});

// ========== Group APIs ==========

// Get groups I'm in
// Get group members
app.get('/api/groups/:groupId/members', authMiddleware, (req, res) => {
    const groups = loadJSON('groups.json');
    const users = loadJSON('users.json');
    const group = groups.find(g => g.id === req.params.groupId);
    if (!group) return res.status(404).json({ error: '群不存在' });

    const members = group.members.map(mid => {
        const u = users.find(u => u.id === mid);
        return u ? { id: u.id, nickname: u.nickname, avatarColor: u.avatarColor, avatarText: u.avatarText, avatarUrl: u.avatarUrl || null } : null;
    }).filter(Boolean);

    res.json(members);
});

// Upload chat image
app.post('/api/upload', authMiddleware, upload.single('image'), (req, res) => {
    if (!req.file) return res.status(400).json({ error: '请上传图片' });
    res.json({ success: true, url: `/uploads/${req.file.filename}` });
});

// ========== Moments APIs ==========

// Get moments
app.get('/api/moments', authMiddleware, (req, res) => {
    const moments = loadJSON('moments.json');
    const users = loadJSON('users.json');
    const friendships = loadJSON('friendships.json');

    const friendIds = friendships
        .filter(f => (f.userId === req.user.id || f.friendId === req.user.id) && f.status === 'accepted')
        .map(f => f.userId === req.user.id ? f.friendId : f.userId);

    // Show own + friends' moments + public moments
    const visibleMoments = moments.filter(m =>
        m.userId === req.user.id || friendIds.includes(m.userId) || m.isPublic
    ).sort((a, b) => b.createdAt - a.createdAt);

    res.json(visibleMoments.map(m => {
        const u = users.find(u => u.id === m.userId);
        return {
            id: m.id,
            userId: m.userId,
            nickname: u ? u.nickname : '未知用户',
            avatarColor: u ? u.avatarColor : '#999',
            avatarText: u ? u.avatarText : '?',
            avatarUrl: u ? (u.avatarUrl || null) : null,
            content: m.content,
            images: m.images || [],
            likes: m.likes || [],
            comments: m.comments || [],
            createdAt: m.createdAt,
            isOwn: m.userId === req.user.id
        };
    }));
});

// Post moment
app.post('/api/moments/post', authMiddleware, upload.array('images', 9), (req, res) => {
    const { content } = req.body;
    if (!content && (!req.files || req.files.length === 0)) {
        return res.status(400).json({ error: '说点什么吧' });
    }

    const moments = loadJSON('moments.json');
    const imageUrls = req.files ? req.files.map(f => `/uploads/${f.filename}`) : [];

    const newMoment = {
        id: 'm_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6),
        userId: req.user.id,
        content: content || '',
        images: imageUrls,
        likes: [],
        comments: [],
        isPublic: true,
        createdAt: Date.now()
    };
    moments.push(newMoment);
    saveJSON('moments.json', moments);

    io.emit('new-moment', newMoment);
    res.json({ success: true, moment: newMoment });
});

// Like moment
app.post('/api/moments/like/:momentId', authMiddleware, (req, res) => {
    const moments = loadJSON('moments.json');
    const moment = moments.find(m => m.id === req.params.momentId);
    if (!moment) return res.status(404).json({ error: '动态不存在' });

    if (moment.likes.includes(req.user.id)) {
        moment.likes = moment.likes.filter(id => id !== req.user.id);
    } else {
        moment.likes.push(req.user.id);
    }
    saveJSON('moments.json', moments);

    io.emit('moment-updated', moment);
    res.json({ success: true, likes: moment.likes });
});

// Comment moment
app.post('/api/moments/comment/:momentId', authMiddleware, (req, res) => {
    const { content } = req.body;
    if (!content) return res.status(400).json({ error: '评论内容不能为空' });

    const moments = loadJSON('moments.json');
    const moment = moments.find(m => m.id === req.params.momentId);
    if (!moment) return res.status(404).json({ error: '动态不存在' });

    const comment = {
        id: 'c_' + Date.now(),
        userId: req.user.id,
        nickname: req.user.nickname,
        content,
        createdAt: Date.now()
    };
    moment.comments.push(comment);
    saveJSON('moments.json', moments);

    io.emit('moment-updated', moment);
    res.json({ success: true, comment });
});

// Delete moment (own or admin)
app.delete('/api/moments/:momentId', authMiddleware, (req, res) => {
    let moments = loadJSON('moments.json');
    const moment = moments.find(m => m.id === req.params.momentId);

    if (!moment) return res.status(404).json({ error: '动态不存在' });
    if (moment.userId !== req.user.id && req.user.role !== 'admin' && req.user.role !== 'super_admin') {
        return res.status(403).json({ error: '无权删除' });
    }

    moments = moments.filter(m => m.id !== req.params.momentId);
    saveJSON('moments.json', moments);

    io.emit('moment-deleted', req.params.momentId);
    res.json({ success: true });
});

// ========== Admin APIs ==========

app.get('/api/admin/users', adminMiddleware, (req, res) => {
    const users = loadJSON('users.json');
    res.json(users.filter(u => u.role !== 'system').map(u => ({
        id: u.id, username: u.username, nickname: u.nickname, bio: u.bio,
        avatarColor: u.avatarColor, avatarText: u.avatarText, avatarUrl: u.avatarUrl || null,
        role: u.role, banned: u.banned, createdAt: u.createdAt, points: u.points || 0
    })));
});

app.post('/api/admin/ban/:userId', adminMiddleware, (req, res) => {
    const users = loadJSON('users.json');
    const user = users.find(u => u.id === req.params.userId);
    if (!user) return res.status(404).json({ error: '用户不存在' });
    if (user.role === 'super_admin') return res.status(400).json({ error: '不能封禁超级管理员' });
    if (user.role === 'admin' && req.user.role !== 'super_admin') return res.status(400).json({ error: '只有超级管理员可以封禁管理员' });

    user.banned = !user.banned;
    saveJSON('users.json', users);

    if (user.banned) {
        // Force disconnect banned user
        const sockets = io.sockets.sockets;
        for (const [sid, socket] of sockets) {
            if (socket.userId === user.id) {
                socket.emit('banned', { message: '你的账号已被管理员封禁' });
                socket.disconnect(true);
            }
        }
    }

    res.json({ success: true, banned: user.banned });
});

app.delete('/api/admin/user/:userId', adminMiddleware, (req, res) => {
    const userId = req.params.userId;
    let users = loadJSON('users.json');
    const user = users.find(u => u.id === userId);
    if (!user) return res.status(404).json({ error: '用户不存在' });
    if (user.role === 'super_admin') return res.status(400).json({ error: '不能删除超级管理员' });
    if (user.role === 'admin' && req.user.role !== 'super_admin') return res.status(400).json({ error: '只有超级管理员可以删除管理员' });

    // Remove from all groups
    let groups = loadJSON('groups.json');
    groups.forEach(g => { g.members = g.members.filter(m => m !== userId); });
    saveJSON('groups.json', groups);

    // Remove friendships
    let friendships = loadJSON('friendships.json');
    friendships = friendships.filter(f => f.userId !== userId && f.friendId !== userId);
    saveJSON('friendships.json', friendships);

    // Remove moments
    let moments = loadJSON('moments.json');
    moments = moments.filter(m => m.userId !== userId);
    saveJSON('moments.json', moments);

    // Remove messages
    let messages = loadJSON('messages.json');
    messages = messages.filter(m => m.from !== userId && m.to !== userId);
    saveJSON('messages.json', messages);

    // Remove user
    users = users.filter(u => u.id !== userId);
    saveJSON('users.json', users);

    // Disconnect
    const sockets = io.sockets.sockets;
    for (const [sid, socket] of sockets) {
        if (socket.userId === userId) socket.disconnect(true);
    }

    io.emit('user-deleted', userId);
    res.json({ success: true });
});

app.get('/api/admin/messages/:userId', adminMiddleware, (req, res) => {
    const userId = req.params.userId;
    const messages = loadJSON('messages.json');
    const users = loadJSON('users.json');

    // If requester is a regular admin (not super_admin) and trying to view super_admin's chats
    const targetUser = users.find(u => u.id === userId);
    if (req.user.role !== 'super_admin' && targetUser && targetUser.role === 'super_admin') {
        return res.status(403).json({ error: '无权查看超级管理员的聊天记录' });
    }

    let userMsgs = messages.filter(m => m.from === userId || m.to === userId)
        .sort((a, b) => b.timestamp - a.timestamp)
        .slice(0, 200);

    // Also filter out super_admin messages from the list if requester is regular admin
    const superAdminId = users.find(u => u.role === 'super_admin')?.id;
    if (req.user.role !== 'super_admin' && superAdminId) {
        userMsgs = userMsgs.filter(m => !(m.from === superAdminId || m.to === superAdminId));
    }

    res.json(userMsgs.map(m => {
        const fromUser = users.find(u => u.id === m.from);
        const toUser = users.find(u => u.id === m.to);
        return {
            id: m.id,
            from: m.from,
            fromNickname: fromUser ? fromUser.nickname : '未知',
            to: m.to,
            toNickname: m.type === 'group' ? (loadJSON('groups.json').find(g => g.id === m.to)?.name || '群聊') : (toUser ? toUser.nickname : '未知'),
            type: m.type,
            content: m.content,
            messageType: m.messageType || 'text',
            timestamp: m.timestamp
        };
    }));
});

app.delete('/api/admin/moment/:momentId', adminMiddleware, (req, res) => {
    let moments = loadJSON('moments.json');
    moments = moments.filter(m => m.id !== req.params.momentId);
    saveJSON('moments.json', moments);
    io.emit('moment-deleted', req.params.momentId);
    res.json({ success: true });
});

app.get('/api/admin/stats', adminMiddleware, (req, res) => {
    const users = loadJSON('users.json');
    const messages = loadJSON('messages.json');
    const groups = loadJSON('groups.json');
    const moments = loadJSON('moments.json');
    const friendships = loadJSON('friendships.json');

    const now = Date.now();
    const today = now - 86400000;

    res.json({
        totalUsers: users.filter(u => u.role !== 'system').length,
        bannedUsers: users.filter(u => u.banned).length,
        totalMessages: messages.length,
        todayMessages: messages.filter(m => m.timestamp > today).length,
        totalGroups: groups.length,
        totalMoments: moments.length,
        todayMoments: moments.filter(m => m.createdAt > today).length,
        totalFriendships: friendships.filter(f => f.status === 'accepted').length,
        onlineUsers: Object.values(io.sockets.sockets).filter(s => s.userId).length
    });
});

// ========== Check-in (每日签到) ==========

app.post('/api/checkin', authMiddleware, (req, res) => {
    const users = loadJSON('users.json');
    const user = users.find(u => u.id === req.user.id);
    const today = new Date().toDateString();

    if (user.lastCheckinDate === today) {
        return res.status(400).json({ error: '今天已经签到过了！' });
    }

    user.points = (user.points || 0) + 10;
    user.lastCheckinDate = today;
    saveJSON('users.json', users);

    res.json({ success: true, points: user.points, earned: 10, message: '签到成功！+10积分' });
});

// ========== Bubble Shop (气泡商城) ==========

// Clean up expired bubble style for a user
function cleanupExpiredBubble(user) {
    if (user.bubbleStyle && user.bubbleStyle !== 0 && user.bubblePurchases) {
        const purchase = user.bubblePurchases[user.bubbleStyle];
        if (purchase && purchase !== 'permanent' && typeof purchase === 'number' && purchase <= Date.now()) {
            // Expired: revert to default
            delete user.bubblePurchases[user.bubbleStyle];
            user.bubbleStyle = 0;
        }
    }
}

const BUBBLE_STYLES = [
    { id: 0, name: '晴空万里', price: 0, class: 'bubble-sky', desc: '广阔蓝天白云飘' },
    { id: 1, name: '云霄巡航', price: 30, class: 'bubble-cloud', desc: '穿行于云层之上' },
    { id: 2, name: '落日飞行', price: 60, class: 'bubble-sunset', desc: '暮色中的金色航线' },
    { id: 3, name: '星辰航线', price: 120, class: 'bubble-stars', desc: '星空下闪耀的航迹' },
    { id: 4, name: '王牌机长', price: 180, class: 'bubble-captain', desc: '金翼勋章·至尊荣耀' }
];

app.get('/api/bubbles', authMiddleware, (req, res) => {
    const users = loadJSON('users.json');
    const user = users.find(u => u.id === req.user.id);
    const userBubbleStyle = user.bubbleStyle || 0;
    const isAdmin = user.role === 'super_admin' || user.role === 'admin';

    const bubbles = BUBBLE_STYLES.map(b => {
        let owned = isAdmin || b.id === 0;
        let expiresAt = null;
        let isDay = false;

        if (!owned && user.bubblePurchases && user.bubblePurchases[b.id]) {
            const purchase = user.bubblePurchases[b.id];
            if (purchase === 'permanent') {
                owned = true;
                isDay = false;
            } else if (typeof purchase === 'number') {
                if (purchase > Date.now()) {
                    owned = true;
                    expiresAt = purchase;
                    isDay = true;
                } else {
                    // Clean up expired
                    delete user.bubblePurchases[b.id];
                }
            }
        }

        return {
            ...b,
            owned,
            equipped: b.id === userBubbleStyle,
            canAfford: isAdmin || (user.points || 0) >= b.price,
            expiresAt,
            isDay
        };
    });

    // Save cleaned up purchases
    saveJSON('users.json', users);

    res.json(bubbles);
});

app.post('/api/bubbles/purchase', authMiddleware, (req, res) => {
    const { bubbleId, duration } = req.body;  // duration: 'day' | 'permanent'
    const bubble = BUBBLE_STYLES.find(b => b.id === bubbleId);
    if (!bubble) return res.status(404).json({ error: '气泡不存在' });

    const users = loadJSON('users.json');
    const user = users.find(u => u.id === req.user.id);

    // Calculate price based on duration
    const isDay = duration === 'day';
    const actualPrice = isDay ? Math.max(1, Math.floor(bubble.price * 0.3)) : bubble.price;

    // Admins get all free
    if (user.role !== 'super_admin' && user.role !== 'admin') {
        if ((user.points || 0) < actualPrice) {
            return res.status(400).json({ error: '积分不足' });
        }
        user.points -= actualPrice;
    }

    // Initialize bubble purchases array
    if (!user.bubblePurchases) user.bubblePurchases = {};

    // Set expiry for 1-day purchase
    if (isDay) {
        const expiresAt = Date.now() + 24 * 60 * 60 * 1000;  // 24 hours
        user.bubblePurchases[bubbleId] = expiresAt;
    } else {
        // Permanent purchase
        user.bubblePurchases[bubbleId] = 'permanent';
    }

    // Update bubble style
    user.bubbleStyle = bubbleId;
    saveJSON('users.json', users);

    const durationText = isDay ? '（1天）' : '（永久）';
    res.json({ success: true, points: user.points, bubbleStyle: bubbleId, message: `已装备「${bubble.name}」气泡${durationText}！` });
});

app.put('/api/bubbles/equip', authMiddleware, (req, res) => {
    const { bubbleId } = req.body;
    const bubble = BUBBLE_STYLES.find(b => b.id === bubbleId);
    if (!bubble) return res.status(404).json({ error: '气泡不存在' });

    const users = loadJSON('users.json');
    const user = users.find(u => u.id === req.user.id);
    const isAdmin = user.role === 'super_admin' || user.role === 'admin';

    // Check if user owns this bubble (or admin, or default)
    let owns = isAdmin || bubbleId === 0;
    if (!owns && user.bubblePurchases && user.bubblePurchases[bubbleId]) {
        const purchase = user.bubblePurchases[bubbleId];
        if (purchase === 'permanent') {
            owns = true;
        } else if (typeof purchase === 'number') {
            if (purchase > Date.now()) {
                owns = true;
            } else {
                // Expired, clean up
                delete user.bubblePurchases[bubbleId];
                saveJSON('users.json', users);
                return res.status(400).json({ error: '该气泡已过期，请重新兑换' });
            }
        }
    }

    if (!owns) {
        return res.status(400).json({ error: '你还没有购买这个气泡！请先兑换' });
    }

    user.bubbleStyle = bubbleId;
    saveJSON('users.json', users);

    res.json({ success: true, bubbleStyle: bubbleId });
});

// ========== User Profile (用户主页) ==========

app.get('/api/user/:userId', authMiddleware, (req, res) => {
    const users = loadJSON('users.json');
    const user = users.find(u => u.id === req.params.userId);
    if (!user) return res.status(404).json({ error: '用户不存在' });

    const moments = loadJSON('moments.json');
    const userMoments = moments
        .filter(m => m.userId === user.id)
        .sort((a, b) => b.createdAt - a.createdAt)
        .slice(0, 20);

    res.json({
        id: user.id,
        username: user.username,
        nickname: user.nickname,
        bio: user.bio,
        avatarColor: user.avatarColor,
        avatarText: user.avatarText,
        avatarUrl: user.avatarUrl || null,
        role: user.role,
        createdAt: user.createdAt,
        moments: userMoments.map(m => ({
            id: m.id,
            content: m.content,
            images: m.images || [],
            likes: m.likes || [],
            comments: m.comments || [],
            createdAt: m.createdAt
        }))
    });
});

// ========== Group APIs (updated for public/private) ==========

app.get('/api/groups', authMiddleware, (req, res) => {
    const groups = loadJSON('groups.json');
    // Show: groups I'm in + all public groups
    const myGroups = groups.filter(g =>
        g.members.includes(req.user.id) || g.type === 'public' || g.id === 'g_public'
    );

    res.json(myGroups.map(g => ({
        id: g.id,
        name: g.name,
        description: g.description,
        type: g.type || 'public',
        avatarColor: g.avatarColor,
        avatarText: g.avatarText,
        memberCount: g.members.length,
        isMember: g.members.includes(req.user.id),
        hasPassword: !!g.password,
        createdAt: g.createdAt
    })));
});

// Create group (updated)
app.post('/api/groups/create', authMiddleware, (req, res) => {
    const { name, description, type, password } = req.body;
    if (!name) return res.status(400).json({ error: '群名必填' });

    const groups = loadJSON('groups.json');
    const colors = ['#667eea', '#764ba2', '#f093fb', '#f5576c', '#4facfe', '#43e97b', '#fa709a', '#fee140'];
    const newGroup = {
        id: 'g_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6),
        name,
        description: description || '',
        type: type || 'public',
        password: type === 'private' ? (password || '') : '',
        avatarColor: colors[Math.floor(Math.random() * colors.length)],
        avatarText: name.slice(0, 1),
        members: [req.user.id],
        createdAt: Date.now()
    };
    groups.push(newGroup);
    saveJSON('groups.json', groups);

    io.emit('group-created', newGroup);
    res.json({ success: true, group: newGroup });
});

// Join group (updated for password check)
app.post('/api/groups/join', authMiddleware, (req, res) => {
    const { groupId, password } = req.body;
    const groups = loadJSON('groups.json');
    const group = groups.find(g => g.id === groupId);
    if (!group) return res.status(404).json({ error: '群不存在' });
    if (group.members.includes(req.user.id)) return res.status(400).json({ error: '已经在群里了' });

    // Check password for private groups
    if (group.type === 'private' && group.password && group.password !== (password || '')) {
        return res.status(403).json({ error: '密码错误，无法加入私密群组' });
    }

    group.members.push(req.user.id);
    saveJSON('groups.json', groups);

    io.to(groupId).emit('group-member-joined', { groupId, userId: req.user.id, nickname: req.user.nickname });
    io.emit('groups-updated');

    res.json({ success: true });
});

// ========== Donation (打赏) ==========

app.get('/api/donation', authMiddleware, (req, res) => {
    const donation = loadJSON('donation.json') || { wechat: '', alipay: '' };
    res.json(donation);
});

app.post('/api/admin/donation', adminMiddleware, upload.fields([{ name: 'wechat', maxCount: 1 }, { name: 'alipay', maxCount: 1 }]), (req, res) => {
    const donation = loadJSON('donation.json') || { wechat: '', alipay: '' };

    if (req.files?.wechat?.[0]) {
        donation.wechat = `/uploads/${req.files.wechat[0].filename}`;
    }
    if (req.files?.alipay?.[0]) {
        donation.alipay = `/uploads/${req.files.alipay[0].filename}`;
    }

    saveJSON('donation.json', donation);
    res.json({ success: true, donation });
});

app.post('/api/feedback', authMiddleware, (req, res) => {
    const { content } = req.body;
    if (!content || content.trim().length < 2) {
        return res.status(400).json({ error: '反馈内容至少2个字符' });
    }

    const feedbacks = loadJSON('feedbacks.json');
    const users = loadJSON('users.json');
    const user = users.find(u => u.id === req.user.id);

    const feedback = {
        id: 'fb_' + Date.now(),
        userId: req.userId,
        nickname: user ? user.nickname : '未知用户',
        avatarColor: user ? user.avatarColor : '#999',
        avatarText: user ? user.avatarText : '?',
        content: content.trim(),
        status: 'pending',
        createdAt: Date.now()
    };

    feedbacks.push(feedback);
    saveJSON('feedbacks.json', feedbacks);

    // Notify admin sockets
    const sockets = io.sockets.sockets;
    for (const [sid, socket] of sockets) {
        if (socket.role === 'super_admin' || socket.role === 'admin') {
            socket.emit('new-feedback', feedback);
        }
    }

    res.json({ success: true, id: feedback.id });
});

app.get('/api/admin/feedbacks', adminMiddleware, (req, res) => {
    const feedbacks = loadJSON('feedbacks.json');
    feedbacks.sort((a, b) => b.createdAt - a.createdAt);
    res.json(feedbacks);
});

app.post('/api/admin/feedback/:feedbackId/resolve', adminMiddleware, (req, res) => {
    const feedbacks = loadJSON('feedbacks.json');
    const fb = feedbacks.find(f => f.id === req.params.feedbackId);
    if (!fb) return res.status(404).json({ error: '反馈不存在' });
    fb.status = fb.status === 'resolved' ? 'pending' : 'resolved';
    saveJSON('feedbacks.json', feedbacks);
    res.json({ success: true, status: fb.status });
});

// ========== Admin: Promote user to admin (super_admin only) ==========

app.post('/api/admin/promote/:userId', superAdminMiddleware, (req, res) => {
    const users = loadJSON('users.json');
    const user = users.find(u => u.id === req.params.userId);
    if (!user) return res.status(404).json({ error: '用户不存在' });
    if (user.role === 'admin') return res.json({ success: true, message: '该用户已是管理员' });

    user.role = 'admin';
    saveJSON('users.json', users);

    // Notify the promoted user
    const sockets = io.sockets.sockets;
    for (const [sid, socket] of sockets) {
        if (socket.userId === user.id) {
            socket.emit('promoted', { message: '你已被提升为管理员！' });
            socket.role = 'admin';
        }
    }

    res.json({ success: true, message: `${user.nickname} 已提升为管理员` });
});

// ========== Block / Unblock ==========

app.post('/api/block/:userId', authMiddleware, (req, res) => {
    const users = loadJSON('users.json');
    const target = users.find(u => u.id === req.params.userId);
    if (!target) return res.status(404).json({ error: '用户不存在' });
    if (target.id === req.user.id) return res.status(400).json({ error: '不能拉黑自己' });

    const user = users.find(u => u.id === req.user.id);
    if (!user.blockedUsers) user.blockedUsers = [];
    if (user.blockedUsers.includes(target.id)) return res.json({ success: true, message: '已拉黑该用户' });

    user.blockedUsers.push(target.id);
    saveJSON('users.json', users);
    res.json({ success: true, message: `已拉黑 ${target.nickname}` });
});

app.post('/api/unblock/:userId', authMiddleware, (req, res) => {
    const users = loadJSON('users.json');
    const user = users.find(u => u.id === req.user.id);
    if (!user.blockedUsers) user.blockedUsers = [];

    user.blockedUsers = user.blockedUsers.filter(id => id !== req.params.userId);
    saveJSON('users.json', users);
    res.json({ success: true, message: '已取消拉黑' });
});

app.get('/api/blocked', authMiddleware, (req, res) => {
    const user = req.user;
    res.json({ blockedUsers: user.blockedUsers || [] });
});

const onlineUsers = {}; // userId -> socketId

io.on('connection', (socket) => {
    console.log('Socket connected:', socket.id);

    // Authenticate socket
    socket.on('auth', (token) => {
        const users = loadJSON('users.json');
        const user = users.find(u => u.id === token);
        if (!user) {
            socket.emit('auth-error', '无效token');
            return;
        }
        if (user.banned) {
            socket.emit('banned', { message: '账号已被封禁' });
            socket.disconnect(true);
            return;
        }

        socket.userId = user.id;
        socket.userNickname = user.nickname;
        socket.userAvatarColor = user.avatarColor;
        socket.userAvatarText = user.avatarText;
        socket.userAvatarUrl = user.avatarUrl || null;
        socket.role = user.role || 'user';
        socket.bubbleStyle = user.bubbleStyle || 0;
        onlineUsers[user.id] = socket.id;

        // Join user's groups
        const groups = loadJSON('groups.json');
        groups.forEach(g => {
            if (g.members.includes(user.id)) socket.join(g.id);
        });

        // Notify others of online status
        socket.broadcast.emit('user-online', { userId: user.id, nickname: user.nickname });
        io.emit('online-list', Object.keys(onlineUsers));

        console.log(`User ${user.nickname} (${user.id}) authenticated`);
    });

    // Private message
    socket.on('private-message', (data) => {
        if (!socket.userId) return;
        const { to, content, messageType } = data;

        const users = loadJSON('users.json');
        const fromUser = users.find(u => u.id === socket.userId);
        const toUser = users.find(u => u.id === to);

        // Block check: don't deliver if either user blocked the other
        if (fromUser?.blockedUsers?.includes(to)) {
            socket.emit('blocked-error', { message: '你已拉黑该用户，无法发送消息' });
            return;
        }
        if (toUser?.blockedUsers?.includes(socket.userId)) {
            socket.emit('blocked-error', { message: '对方已将你拉黑，无法发送消息' });
            return;
        }

        const messages = loadJSON('messages.json');
        const msg = {
            id: 'msg_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6),
            type: 'private',
            from: socket.userId,
            to,
            content,
            messageType: messageType || 'text',
            timestamp: Date.now(),
            read: false
        };
        messages.push(msg);
        saveJSON('messages.json', messages);

        // Send to recipient if online
        const recipientSocketId = onlineUsers[to];
        if (recipientSocketId) {
            io.to(recipientSocketId).emit('private-message', {
                ...msg,
                fromNickname: fromUser?.nickname,
                fromAvatarColor: fromUser?.avatarColor,
                fromAvatarText: fromUser?.avatarText,
                fromAvatarUrl: fromUser?.avatarUrl || null,
                fromBubbleStyle: fromUser?.bubbleStyle || 0
            });
        }

        // Send back to sender for confirmation
        socket.emit('private-message-sent', msg);
    });

    // Group message
    socket.on('group-message', (data) => {
        if (!socket.userId) return;
        const { to, content, messageType } = data;

        const messages = loadJSON('messages.json');
        const msg = {
            id: 'msg_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6),
            type: 'group',
            from: socket.userId,
            to,
            content,
            messageType: messageType || 'text',
            timestamp: Date.now(),
            readBy: [socket.userId]
        };
        messages.push(msg);
        saveJSON('messages.json', messages);

        const users = loadJSON('users.json');
        const fromUser = users.find(u => u.id === socket.userId);

        // Broadcast to group
        io.to(to).emit('group-message', {
            ...msg,
            fromNickname: fromUser?.nickname,
            fromAvatarColor: fromUser?.avatarColor,
            fromAvatarText: fromUser?.avatarText,
            fromAvatarUrl: fromUser?.avatarUrl || null,
            fromBubbleStyle: fromUser?.bubbleStyle || 0
        });
    });

    // Typing indicator
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

    // Disconnect
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

// Create admin account if not exists
const users = loadJSON('users.json');
if (!users.find(u => u.role === 'super_admin')) {
    const admin = {
        id: 'u_admin',
        username: 'admin',
        password: bcrypt.hashSync('admin123', 10),
        nickname: '管理员',
        bio: '飞友之家平台管理员',
        avatarColor: '#f5576c',
        avatarText: '管',
        role: 'super_admin',
        points: 99999,
        lastCheckinDate: null,
        bubbleStyle: 4,
        banned: false,
        createdAt: Date.now()
    };
    users.push(admin);
    // Add admin to public group
    const groups = loadJSON('groups.json');
    const pubGroup = groups.find(g => g.id === 'g_public');
    if (pubGroup) pubGroup.members.push(admin.id);
    saveJSON('groups.json', groups);
    saveJSON('users.json', users);
    console.log('Admin account created: admin / admin123');
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
    console.log(`飞友之家 ChatSpace server running!`);
    console.log(`  本机访问: http://localhost:${PORT}`);
    console.log(`  局域网访问: http://${localIP}:${PORT}`);
    console.log(`  管理员账号: admin / admin123`);
    console.log(`  同一WiFi下的手机/其他电脑用局域网地址即可访问`);
});
