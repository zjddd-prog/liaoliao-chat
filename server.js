const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const multer = require('multer');
const bcrypt = require('bcryptjs');
const fs = require('fs');
const path = require('path');
const { connectDB } = require('./models/db');
const User = require('./models/User');
const Message = require('./models/Message');
const Group = require('./models/Group');
const Moment = require('./models/Moment');
const Friendship = require('./models/Friendship');
const Feedback = require('./models/Feedback');
const Donation = require('./models/Donation');

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

function cleanupExpiredBubble(user) {
    if (user.bubbleStyle && user.bubbleStyle !== 0 && user.bubblePurchases) {
        const purchase = user.bubblePurchases[user.bubbleStyle];
        if (purchase && purchase !== 'permanent' && typeof purchase === 'number' && purchase <= Date.now()) {
            delete user.bubblePurchases[user.bubbleStyle];
            user.bubbleStyle = 0;
            return true; // modified
        }
    }
    return false;
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
        const user = await User.findById(token);
        if (!user) return res.status(401).json({ error: '无效token' });
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
        if (!username || !password) return res.status(400).json({ error: '用户名和密码必填' });
        if (username.length < 2 || username.length > 20) return res.status(400).json({ error: '用户名2-20字符' });
        if (password.length < 4) return res.status(400).json({ error: '密码至少4位' });

        const existing = await User.findOne({ username });
        if (existing) return res.status(400).json({ error: '用户名已存在' });

        const colors = ['#667eea', '#764ba2', '#f093fb', '#f5576c', '#4facfe', '#43e97b', '#fa709a', '#fee140', '#a18cd1', '#fbc2eb'];
        const uid = genId('u');
        const newUser = new User({
            _id: uid,
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
        });
        await newUser.save();

        // Auto-add to public group
        const pubGroup = await Group.findById('g_public');
        if (pubGroup && !pubGroup.members.includes(uid)) {
            pubGroup.members.push(uid);
            await pubGroup.save();
        }

        res.json({
            success: true,
            token: uid,
            user: {
                id: uid, username, nickname: newUser.nickname, bio: newUser.bio,
                avatarColor: newUser.avatarColor, avatarText: newUser.avatarText,
                role: newUser.role, points: 0, lastCheckinDate: null,
                bubbleStyle: 0, createdAt: newUser.createdAt
            }
        });
    } catch (e) {
        res.status(500).json({ error: '注册失败: ' + e.message });
    }
});

// Login
app.post('/api/login', async (req, res) => {
    try {
        const { username, password } = req.body;
        const user = await User.findOne({ username });
        if (!user) return res.status(400).json({ error: '用户名不存在' });
        if (user.banned) return res.status(403).json({ error: '账号已被封禁，请联系管理员' });
        if (!bcrypt.compareSync(password, user.password)) return res.status(400).json({ error: '密码错误' });

        if (cleanupExpiredBubble(user)) await user.save();

        res.json({
            success: true,
            token: user._id,
            user: {
                id: user._id, username: user.username, nickname: user.nickname,
                bio: user.bio, avatarColor: user.avatarColor, avatarText: user.avatarText,
                role: user.role, points: user.points || 0,
                lastCheckinDate: user.lastCheckinDate || null,
                bubbleStyle: user.bubbleStyle || 0, createdAt: user.createdAt
            }
        });
    } catch (e) {
        res.status(500).json({ error: '登录失败: ' + e.message });
    }
});

// Get current user info
app.get('/api/me', authMiddleware, async (req, res) => {
    try {
        const user = await User.findById(req.user._id);
        if (user && cleanupExpiredBubble(user)) await user.save();
        res.json({
            id: user._id, username: user.username, nickname: user.nickname,
            bio: user.bio, avatarColor: user.avatarColor, avatarText: user.avatarText,
            avatarUrl: user.avatarUrl || null, role: user.role,
            points: user.points || 0, lastCheckinDate: user.lastCheckinDate || null,
            bubbleStyle: user.bubbleStyle || 0, createdAt: user.createdAt
        });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// Update profile
app.put('/api/profile', authMiddleware, async (req, res) => {
    try {
        const { nickname, bio } = req.body;
        const user = await User.findById(req.user._id);
        if (!user) return res.status(404).json({ error: '用户不存在' });
        if (nickname) { user.nickname = nickname; user.avatarText = nickname.slice(0, 1).toUpperCase(); }
        if (bio !== undefined) user.bio = bio;
        await user.save();
        res.json({ success: true, user: { id: user._id, nickname: user.nickname, bio: user.bio, avatarColor: user.avatarColor, avatarText: user.avatarText } });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// Upload avatar
app.post('/api/avatar', authMiddleware, upload.single('avatar'), async (req, res) => {
    try {
        if (!req.file) return res.status(400).json({ error: '请上传图片' });
        const user = await User.findById(req.user._id);
        user.avatarUrl = `/uploads/${req.file.filename}`;
        await user.save();
        res.json({ success: true, avatarUrl: user.avatarUrl });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// Get all users
app.get('/api/users', authMiddleware, async (req, res) => {
    try {
        const users = await User.find({ _id: { $ne: req.user._id }, role: { $ne: 'system' } });
        const friendships = await Friendship.find({
            $or: [{ userId: req.user._id }, { friendId: req.user._id }],
            status: 'accepted'
        });
        const friendIds = new Set(friendships.map(f => f.userId === req.user._id ? f.friendId : f.userId));

        res.json(users.map(u => ({
            id: u._id, username: u.username, nickname: u.nickname, bio: u.bio,
            avatarColor: u.avatarColor, avatarText: u.avatarText,
            avatarUrl: u.avatarUrl || null, banned: u.banned,
            createdAt: u.createdAt, isFriend: friendIds.has(u._id)
        })));
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// Get friends list
app.get('/api/friends', authMiddleware, async (req, res) => {
    try {
        const friendships = await Friendship.find({
            $or: [{ userId: req.user._id }, { friendId: req.user._id }],
            status: 'accepted'
        });
        const friendIds = friendships.map(f => f.userId === req.user._id ? f.friendId : f.userId);
        const users = await User.find({ _id: { $in: friendIds } });
        res.json(users.map(u => ({
            id: u._id, username: u.username, nickname: u.nickname, bio: u.bio,
            avatarColor: u.avatarColor, avatarText: u.avatarText,
            avatarUrl: u.avatarUrl || null, online: false
        })));
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// Add friend
app.post('/api/friends/add', authMiddleware, async (req, res) => {
    try {
        const { userId } = req.body;
        if (userId === req.user._id) return res.status(400).json({ error: '不能添加自己' });

        const target = await User.findById(userId);
        if (!target) return res.status(404).json({ error: '用户不存在' });

        const existing = await Friendship.findOne({
            $or: [
                { userId: req.user._id, friendId: userId },
                { userId, friendId: req.user._id }
            ]
        });

        if (existing) {
            if (existing.status === 'accepted') return res.status(400).json({ error: '已经是好友了' });
            if (existing.status === 'pending' && existing.friendId === req.user._id) {
                existing.status = 'accepted';
                await existing.save();
                return res.json({ success: true, message: '已接受好友请求' });
            }
            return res.status(400).json({ error: '已发送请求，等待对方确认' });
        }

        await new Friendship({
            _id: genId('f'),
            userId: req.user._id,
            friendId: userId,
            status: 'accepted',
            createdAt: Date.now()
        }).save();

        res.json({ success: true, message: '好友添加成功' });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// Remove friend
app.post('/api/friends/remove', authMiddleware, async (req, res) => {
    try {
        const { userId } = req.body;
        await Friendship.deleteMany({
            $or: [
                { userId: req.user._id, friendId: userId },
                { userId, friendId: req.user._id }
            ]
        });
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
        const msgs = await Message.find({
            type: 'private',
            $or: [
                { from: req.user._id, to: otherUserId },
                { from: otherUserId, to: req.user._id }
            ]
        }).sort({ timestamp: 1 });

        // Mark as read
        await Message.updateMany(
            { type: 'private', to: req.user._id, from: otherUserId, read: false },
            { $set: { read: true } }
        );

        // Resolve sender info
        const userIds = [...new Set(msgs.map(m => m.from))];
        const users = await User.find({ _id: { $in: userIds } });
        const userMap = {};
        users.forEach(u => { userMap[u._id] = u; });

        res.json(msgs.map(m => {
            const fromUser = userMap[m.from];
            return {
                id: m._id, from: m.from, to: m.to, content: m.content,
                messageType: m.messageType || 'text', timestamp: m.timestamp, read: m.read,
                fromNickname: fromUser?.nickname, fromAvatarColor: fromUser?.avatarColor,
                fromAvatarText: fromUser?.avatarText, fromAvatarUrl: fromUser?.avatarUrl || null,
                fromBubbleStyle: fromUser?.bubbleStyle || 0
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
        const msgs = await Message.find({ type: 'group', to: groupId })
            .sort({ timestamp: 1 })
            .limit(500);

        const userIds = [...new Set(msgs.map(m => m.from))];
        const users = await User.find({ _id: { $in: userIds } });
        const userMap = {};
        users.forEach(u => { userMap[u._id] = u; });

        res.json(msgs.map(m => {
            const fromUser = userMap[m.from];
            return {
                id: m._id, from: m.from, to: m.to, content: m.content,
                messageType: m.messageType || 'text', timestamp: m.timestamp,
                fromNickname: fromUser?.nickname, fromAvatarColor: fromUser?.avatarColor,
                fromAvatarText: fromUser?.avatarText, fromAvatarUrl: fromUser?.avatarUrl || null,
                fromBubbleStyle: fromUser?.bubbleStyle || 0
            };
        }));
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// Get unread counts
app.get('/api/messages/unread', authMiddleware, async (req, res) => {
    try {
        const friendships = await Friendship.find({
            $or: [{ userId: req.user._id }, { friendId: req.user._id }],
            status: 'accepted'
        });
        const friendIds = friendships.map(f => f.userId === req.user._id ? f.friendId : f.userId);

        // Private unread
        const privateUnread = {};
        for (const fid of friendIds) {
            const count = await Message.countDocuments({
                type: 'private', from: fid, to: req.user._id, read: false
            });
            privateUnread[fid] = count;
        }

        // Group unread
        const memberGroups = await Group.find({ members: req.user._id });
        const groupUnread = {};
        for (const g of memberGroups) {
            const count = await Message.countDocuments({
                type: 'group', to: g._id, from: { $ne: req.user._id },
                readBy: { $ne: req.user._id }
            });
            groupUnread[g._id] = count;
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
        const groups = await Group.find({
            $or: [
                { members: req.user._id },
                { type: 'public' },
                { _id: 'g_public' }
            ]
        });
        res.json(groups.map(g => ({
            id: g._id, name: g.name, description: g.description,
            type: g.type || 'public', avatarColor: g.avatarColor,
            avatarText: g.avatarText, memberCount: g.members.length,
            isMember: g.members.includes(req.user._id),
            hasPassword: !!g.password, createdAt: g.createdAt
        })));
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

app.get('/api/groups/:groupId/members', authMiddleware, async (req, res) => {
    try {
        const group = await Group.findById(req.params.groupId);
        if (!group) return res.status(404).json({ error: '群不存在' });
        const users = await User.find({ _id: { $in: group.members } });
        res.json(users.map(u => ({
            id: u._id, nickname: u.nickname, avatarColor: u.avatarColor,
            avatarText: u.avatarText, avatarUrl: u.avatarUrl || null
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
        const newGroup = new Group({
            _id: gid,
            name,
            description: description || '',
            type: type || 'public',
            password: type === 'private' ? (password || '') : '',
            avatarColor: colors[Math.floor(Math.random() * colors.length)],
            avatarText: name.slice(0, 1),
            members: [req.user._id],
            createdAt: Date.now()
        });
        await newGroup.save();

        io.emit('group-created', { id: gid, name, description: description || '', type: type || 'public' });
        res.json({ success: true, group: newGroup });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// Join group
app.post('/api/groups/join', authMiddleware, async (req, res) => {
    try {
        const { groupId, password } = req.body;
        const group = await Group.findById(groupId);
        if (!group) return res.status(404).json({ error: '群不存在' });
        if (group.members.includes(req.user._id)) return res.status(400).json({ error: '已经在群里了' });

        if (group.type === 'private' && group.password && group.password !== (password || '')) {
            return res.status(403).json({ error: '密码错误，无法加入私密群组' });
        }

        group.members.push(req.user._id);
        await group.save();

        io.to(groupId).emit('group-member-joined', { groupId, userId: req.user._id, nickname: req.user.nickname });
        io.emit('groups-updated');

        res.json({ success: true });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// ========== Moments APIs ==========

app.get('/api/moments', authMiddleware, async (req, res) => {
    try {
        const friendships = await Friendship.find({
            $or: [{ userId: req.user._id }, { friendId: req.user._id }],
            status: 'accepted'
        });
        const friendIds = new Set(friendships.map(f => f.userId === req.user._id ? f.friendId : f.userId));

        const moments = await Moment.find({
            $or: [
                { userId: req.user._id },
                { userId: { $in: [...friendIds] } },
                { isPublic: true }
            ]
        }).sort({ createdAt: -1 }).limit(100);

        const userIds = [...new Set(moments.map(m => m.userId))];
        const users = await User.find({ _id: { $in: userIds } });
        const userMap = {};
        users.forEach(u => { userMap[u._id] = u; });

        res.json(moments.map(m => {
            const u = userMap[m.userId];
            return {
                id: m._id, userId: m.userId,
                nickname: u ? u.nickname : '未知用户',
                avatarColor: u ? u.avatarColor : '#999',
                avatarText: u ? u.avatarText : '?',
                avatarUrl: u ? (u.avatarUrl || null) : null,
                content: m.content, images: m.images || [],
                likes: m.likes || [], comments: m.comments || [],
                createdAt: m.createdAt, isOwn: m.userId === req.user._id
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
        const newMoment = new Moment({
            _id: mid,
            userId: req.user._id,
            content: content || '',
            images: imageUrls,
            likes: [],
            comments: [],
            isPublic: true,
            createdAt: Date.now()
        });
        await newMoment.save();

        const newMomentObj = { id: mid, userId: req.user._id, content: content || '', images: imageUrls, likes: [], comments: [], createdAt: Date.now() };
        io.emit('new-moment', newMomentObj);
        res.json({ success: true, moment: newMomentObj });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// Like moment
app.post('/api/moments/like/:momentId', authMiddleware, async (req, res) => {
    try {
        const moment = await Moment.findById(req.params.momentId);
        if (!moment) return res.status(404).json({ error: '动态不存在' });

        if (moment.likes.includes(req.user._id)) {
            moment.likes = moment.likes.filter(id => id !== req.user._id);
        } else {
            moment.likes.push(req.user._id);
        }
        await moment.save();

        io.emit('moment-updated', moment.toObject());
        res.json({ success: true, likes: moment.likes });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// Comment moment
app.post('/api/moments/comment/:momentId', authMiddleware, async (req, res) => {
    try {
        const { content } = req.body;
        if (!content) return res.status(400).json({ error: '评论内容不能为空' });

        const moment = await Moment.findById(req.params.momentId);
        if (!moment) return res.status(404).json({ error: '动态不存在' });

        const comment = {
            id: genId('c'),
            userId: req.user._id,
            nickname: req.user.nickname,
            content,
            createdAt: Date.now()
        };
        moment.comments.push(comment);
        await moment.save();

        io.emit('moment-updated', moment.toObject());
        res.json({ success: true, comment });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// Delete moment
app.delete('/api/moments/:momentId', authMiddleware, async (req, res) => {
    try {
        const moment = await Moment.findById(req.params.momentId);
        if (!moment) return res.status(404).json({ error: '动态不存在' });
        if (moment.userId !== req.user._id && req.user.role !== 'admin' && req.user.role !== 'super_admin') {
            return res.status(403).json({ error: '无权删除' });
        }
        await Moment.deleteOne({ _id: req.params.momentId });

        io.emit('moment-deleted', req.params.momentId);
        res.json({ success: true });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// ========== Admin APIs ==========

app.get('/api/admin/users', adminMiddleware, async (req, res) => {
    try {
        const users = await User.find({ role: { $ne: 'system' } });
        res.json(users.map(u => ({
            id: u._id, username: u.username, nickname: u.nickname, bio: u.bio,
            avatarColor: u.avatarColor, avatarText: u.avatarText,
            avatarUrl: u.avatarUrl || null, role: u.role, banned: u.banned,
            createdAt: u.createdAt, points: u.points || 0
        })));
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

app.post('/api/admin/ban/:userId', adminMiddleware, async (req, res) => {
    try {
        const user = await User.findById(req.params.userId);
        if (!user) return res.status(404).json({ error: '用户不存在' });
        if (user.role === 'super_admin') return res.status(400).json({ error: '不能封禁超级管理员' });
        if (user.role === 'admin' && req.user.role !== 'super_admin') return res.status(400).json({ error: '只有超级管理员可以封禁管理员' });

        user.banned = !user.banned;
        await user.save();

        if (user.banned) {
            const sockets = io.sockets.sockets;
            for (const [sid, socket] of sockets) {
                if (socket.userId === user._id) {
                    socket.emit('banned', { message: '你的账号已被管理员封禁' });
                    socket.disconnect(true);
                }
            }
        }

        res.json({ success: true, banned: user.banned });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

app.delete('/api/admin/user/:userId', adminMiddleware, async (req, res) => {
    try {
        const userId = req.params.userId;
        const user = await User.findById(userId);
        if (!user) return res.status(404).json({ error: '用户不存在' });
        if (user.role === 'super_admin') return res.status(400).json({ error: '不能删除超级管理员' });
        if (user.role === 'admin' && req.user.role !== 'super_admin') return res.status(400).json({ error: '只有超级管理员可以删除管理员' });

        await Promise.all([
            Group.updateMany({ members: userId }, { $pull: { members: userId } }),
            Friendship.deleteMany({ $or: [{ userId }, { friendId: userId }] }),
            Moment.deleteMany({ userId }),
            Message.deleteMany({ $or: [{ from: userId }, { to: userId }] }),
            User.deleteOne({ _id: userId })
        ]);

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
        const targetUser = await User.findById(userId);

        if (req.user.role !== 'super_admin' && targetUser && targetUser.role === 'super_admin') {
            return res.status(403).json({ error: '无权查看超级管理员的聊天记录' });
        }

        let msgs = await Message.find({
            $or: [{ from: userId }, { to: userId }]
        }).sort({ timestamp: -1 }).limit(200);

        const superAdmin = await User.findOne({ role: 'super_admin' });
        if (req.user.role !== 'super_admin' && superAdmin) {
            msgs = msgs.filter(m => !(m.from === superAdmin._id || m.to === superAdmin._id));
        }

        const userIds = [...new Set([...msgs.map(m => m.from), ...msgs.map(m => m.to)])];
        const users = await User.find({ _id: { $in: userIds } });
        const userMap = {};
        users.forEach(u => { userMap[u._id] = u; });

        const groups = await Group.find({});
        const groupMap = {};
        groups.forEach(g => { groupMap[g._id] = g; });

        res.json(msgs.map(m => ({
            id: m._id, from: m.from,
            fromNickname: userMap[m.from]?.nickname || '未知',
            to: m.to,
            toNickname: m.type === 'group' ? (groupMap[m.to]?.name || '群聊') : (userMap[m.to]?.nickname || '未知'),
            type: m.type, content: m.content,
            messageType: m.messageType || 'text', timestamp: m.timestamp
        })));
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

app.delete('/api/admin/moment/:momentId', adminMiddleware, async (req, res) => {
    try {
        await Moment.deleteOne({ _id: req.params.momentId });
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
            User.countDocuments({ role: { $ne: 'system' } }),
            User.countDocuments({ banned: true }),
            Message.countDocuments(),
            Message.countDocuments({ timestamp: { $gt: today } }),
            Group.countDocuments(),
            Moment.countDocuments(),
            Moment.countDocuments({ createdAt: { $gt: today } }),
            Friendship.countDocuments({ status: 'accepted' })
        ]);

        res.json({
            totalUsers, bannedUsers, totalMessages, todayMessages,
            totalGroups, totalMoments, todayMoments,
            totalFriendships, onlineUsers: onlineCount
        });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// Promote user
app.post('/api/admin/promote/:userId', superAdminMiddleware, async (req, res) => {
    try {
        const user = await User.findById(req.params.userId);
        if (!user) return res.status(404).json({ error: '用户不存在' });
        if (user.role === 'admin') return res.json({ success: true, message: '该用户已是管理员' });

        user.role = 'admin';
        await user.save();

        const sockets = io.sockets.sockets;
        for (const [sid, socket] of sockets) {
            if (socket.userId === user._id) {
                socket.emit('promoted', { message: '你已被提升为管理员！' });
                socket.role = 'admin';
            }
        }

        res.json({ success: true, message: `${user.nickname} 已提升为管理员` });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// ========== Check-in ==========

app.post('/api/checkin', authMiddleware, async (req, res) => {
    try {
        const today = new Date().toDateString();
        const user = await User.findById(req.user._id);

        if (user.lastCheckinDate === today) {
            return res.status(400).json({ error: '今天已经签到过了！' });
        }

        user.points = (user.points || 0) + 10;
        user.lastCheckinDate = today;
        await user.save();

        res.json({ success: true, points: user.points, earned: 10, message: '签到成功！+10积分' });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// ========== Bubble APIs ==========

app.get('/api/bubbles', authMiddleware, async (req, res) => {
    try {
        const user = await User.findById(req.user._id);
        const userBubbleStyle = user.bubbleStyle || 0;
        const isAdmin = user.role === 'super_admin' || user.role === 'admin';

        const bubbles = BUBBLE_STYLES.map(b => {
            let owned = isAdmin || b.id === 0;
            let expiresAt = null;
            let isDay = false;

            if (!owned && user.bubblePurchases && user.bubblePurchases[b.id]) {
                const purchase = user.bubblePurchases[b.id];
                if (purchase === 'permanent') { owned = true; isDay = false; }
                else if (typeof purchase === 'number') {
                    if (purchase > Date.now()) { owned = true; expiresAt = purchase; isDay = true; }
                    else { delete user.bubblePurchases[b.id]; }
                }
            }

            return { ...b, owned, equipped: b.id === userBubbleStyle, canAfford: isAdmin || (user.points || 0) >= b.price, expiresAt, isDay };
        });

        user.markModified('bubblePurchases');
        await user.save();

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

        const user = await User.findById(req.user._id);
        const isDay = duration === 'day';
        const actualPrice = isDay ? Math.max(1, Math.floor(bubble.price * 0.3)) : bubble.price;

        if (user.role !== 'super_admin' && user.role !== 'admin') {
            if ((user.points || 0) < actualPrice) return res.status(400).json({ error: '积分不足' });
            user.points -= actualPrice;
        }

        if (!user.bubblePurchases) user.bubblePurchases = {};

        if (isDay) {
            user.bubblePurchases[bubbleId] = Date.now() + 24 * 60 * 60 * 1000;
        } else {
            user.bubblePurchases[bubbleId] = 'permanent';
        }

        user.bubbleStyle = bubbleId;
        user.markModified('bubblePurchases');
        await user.save();

        const durationText = isDay ? '（1天）' : '（永久）';
        res.json({ success: true, points: user.points, bubbleStyle: bubbleId, message: `已装备「${bubble.name}」气泡${durationText}！` });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

app.put('/api/bubbles/equip', authMiddleware, async (req, res) => {
    try {
        const { bubbleId } = req.body;
        const bubble = BUBBLE_STYLES.find(b => b.id === bubbleId);
        if (!bubble) return res.status(404).json({ error: '气泡不存在' });

        const user = await User.findById(req.user._id);
        const isAdmin = user.role === 'super_admin' || user.role === 'admin';

        let owns = isAdmin || bubbleId === 0;
        if (!owns && user.bubblePurchases && user.bubblePurchases[bubbleId]) {
            const purchase = user.bubblePurchases[bubbleId];
            if (purchase === 'permanent') owns = true;
            else if (typeof purchase === 'number') {
                if (purchase > Date.now()) owns = true;
                else {
                    delete user.bubblePurchases[bubbleId];
                    user.markModified('bubblePurchases');
                    await user.save();
                    return res.status(400).json({ error: '该气泡已过期，请重新兑换' });
                }
            }
        }

        if (!owns) return res.status(400).json({ error: '你还没有购买这个气泡！请先兑换' });

        user.bubbleStyle = bubbleId;
        await user.save();
        res.json({ success: true, bubbleStyle: bubbleId });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// ========== User Profile ==========

app.get('/api/user/:userId', authMiddleware, async (req, res) => {
    try {
        const user = await User.findById(req.params.userId);
        if (!user) return res.status(404).json({ error: '用户不存在' });

        const userMoments = await Moment.find({ userId: user._id })
            .sort({ createdAt: -1 }).limit(20);

        res.json({
            id: user._id, username: user.username, nickname: user.nickname,
            bio: user.bio, avatarColor: user.avatarColor, avatarText: user.avatarText,
            avatarUrl: user.avatarUrl || null, role: user.role, createdAt: user.createdAt,
            moments: userMoments.map(m => ({
                id: m._id, content: m.content, images: m.images || [],
                likes: m.likes || [], comments: m.comments || [], createdAt: m.createdAt
            }))
        });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// ========== Donation ==========

app.get('/api/donation', authMiddleware, async (req, res) => {
    try {
        const donation = await Donation.findById('donation_config');
        res.json(donation || { wechat: '', alipay: '' });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

app.post('/api/admin/donation', adminMiddleware, upload.fields([{ name: 'wechat', maxCount: 1 }, { name: 'alipay', maxCount: 1 }]), async (req, res) => {
    try {
        let donation = await Donation.findById('donation_config');
        if (!donation) donation = new Donation({ _id: 'donation_config' });

        if (req.files?.wechat?.[0]) donation.wechat = `/uploads/${req.files.wechat[0].filename}`;
        if (req.files?.alipay?.[0]) donation.alipay = `/uploads/${req.files.alipay[0].filename}`;
        await donation.save();

        res.json({ success: true, donation });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// ========== Feedback ==========

app.post('/api/feedback', authMiddleware, async (req, res) => {
    try {
        const { content } = req.body;
        if (!content || content.trim().length < 2) return res.status(400).json({ error: '反馈内容至少2个字符' });

        const feedback = new Feedback({
            _id: genId('fb'),
            userId: req.user._id,
            nickname: req.user.nickname,
            avatarColor: req.user.avatarColor,
            avatarText: req.user.avatarText,
            content: content.trim(),
            status: 'pending',
            createdAt: Date.now()
        });
        await feedback.save();

        const sockets = io.sockets.sockets;
        for (const [sid, socket] of sockets) {
            if (socket.role === 'super_admin' || socket.role === 'admin') {
                socket.emit('new-feedback', feedback.toObject());
            }
        }

        res.json({ success: true, id: feedback._id });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

app.get('/api/admin/feedbacks', adminMiddleware, async (req, res) => {
    try {
        const feedbacks = await Feedback.find().sort({ createdAt: -1 });
        res.json(feedbacks);
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

app.post('/api/admin/feedback/:feedbackId/resolve', adminMiddleware, async (req, res) => {
    try {
        const fb = await Feedback.findById(req.params.feedbackId);
        if (!fb) return res.status(404).json({ error: '反馈不存在' });
        fb.status = fb.status === 'resolved' ? 'pending' : 'resolved';
        await fb.save();
        res.json({ success: true, status: fb.status });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// ========== Block / Unblock ==========

app.post('/api/block/:userId', authMiddleware, async (req, res) => {
    try {
        const target = await User.findById(req.params.userId);
        if (!target) return res.status(404).json({ error: '用户不存在' });
        if (target._id === req.user._id) return res.status(400).json({ error: '不能拉黑自己' });

        const user = await User.findById(req.user._id);
        if (!user.blockedUsers) user.blockedUsers = [];
        if (user.blockedUsers.includes(target._id)) return res.json({ success: true, message: '已拉黑该用户' });

        user.blockedUsers.push(target._id);
        await user.save();
        res.json({ success: true, message: `已拉黑 ${target.nickname}` });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

app.post('/api/unblock/:userId', authMiddleware, async (req, res) => {
    try {
        const user = await User.findById(req.user._id);
        if (!user.blockedUsers) user.blockedUsers = [];
        user.blockedUsers = user.blockedUsers.filter(id => id !== req.params.userId);
        await user.save();
        res.json({ success: true, message: '已取消拉黑' });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

app.get('/api/blocked', authMiddleware, async (req, res) => {
    res.json({ blockedUsers: req.user.blockedUsers || [] });
});

// ========== Socket.IO ==========

const onlineUsers = {};

io.on('connection', (socket) => {
    console.log('Socket connected:', socket.id);

    socket.on('auth', async (token) => {
        try {
            const user = await User.findById(token);
            if (!user) { socket.emit('auth-error', '无效token'); return; }
            if (user.banned) {
                socket.emit('banned', { message: '账号已被封禁' });
                socket.disconnect(true);
                return;
            }

            socket.userId = user._id;
            socket.userNickname = user.nickname;
            socket.userAvatarColor = user.avatarColor;
            socket.userAvatarText = user.avatarText;
            socket.userAvatarUrl = user.avatarUrl || null;
            socket.role = user.role || 'user';
            socket.bubbleStyle = user.bubbleStyle || 0;
            onlineUsers[user._id] = socket.id;

            const groups = await Group.find({ members: user._id });
            groups.forEach(g => socket.join(g._id));

            socket.broadcast.emit('user-online', { userId: user._id, nickname: user.nickname });
            io.emit('online-list', Object.keys(onlineUsers));

            console.log(`User ${user.nickname} (${user._id}) authenticated`);
        } catch (e) {
            socket.emit('auth-error', '认证失败');
        }
    });

    socket.on('private-message', async (data) => {
        if (!socket.userId) return;
        const { to, content, messageType } = data;

        const [fromUser, toUser] = await Promise.all([
            User.findById(socket.userId),
            User.findById(to)
        ]);

        if (fromUser?.blockedUsers?.includes(to)) {
            socket.emit('blocked-error', { message: '你已拉黑该用户，无法发送消息' });
            return;
        }
        if (toUser?.blockedUsers?.includes(socket.userId)) {
            socket.emit('blocked-error', { message: '对方已将你拉黑，无法发送消息' });
            return;
        }

        const msg = new Message({
            _id: genId('msg'),
            type: 'private',
            from: socket.userId,
            to,
            content,
            messageType: messageType || 'text',
            timestamp: Date.now(),
            read: false
        });
        await msg.save();

        const recipientSocketId = onlineUsers[to];
        if (recipientSocketId) {
            io.to(recipientSocketId).emit('private-message', {
                id: msg._id, type: 'private', from: msg.from, to: msg.to,
                content: msg.content, messageType: msg.messageType,
                timestamp: msg.timestamp, read: false,
                fromNickname: fromUser?.nickname, fromAvatarColor: fromUser?.avatarColor,
                fromAvatarText: fromUser?.avatarText, fromAvatarUrl: fromUser?.avatarUrl || null,
                fromBubbleStyle: fromUser?.bubbleStyle || 0
            });
        }

        socket.emit('private-message-sent', msg.toObject());
    });

    socket.on('group-message', async (data) => {
        if (!socket.userId) return;
        const { to, content, messageType } = data;

        const msg = new Message({
            _id: genId('msg'),
            type: 'group',
            from: socket.userId,
            to,
            content,
            messageType: messageType || 'text',
            timestamp: Date.now(),
            readBy: [socket.userId]
        });
        await msg.save();

        const fromUser = await User.findById(socket.userId);

        io.to(to).emit('group-message', {
            id: msg._id, type: 'group', from: msg.from, to: msg.to,
            content: msg.content, messageType: msg.messageType,
            timestamp: msg.timestamp, readBy: msg.readBy,
            fromNickname: fromUser?.nickname, fromAvatarColor: fromUser?.avatarColor,
            fromAvatarText: fromUser?.avatarText, fromAvatarUrl: fromUser?.avatarUrl || null,
            fromBubbleStyle: fromUser?.bubbleStyle || 0
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
    try {
        // System user
        const sysExists = await User.findById('u_system');
        if (!sysExists) {
            await new User({
                _id: 'u_system', username: 'system', password: bcrypt.hashSync('system', 10),
                nickname: '系统通知', bio: '飞友之家官方系统通知', avatarColor: '#667eea',
                avatarText: '飞', role: 'system', banned: false, createdAt: Date.now() - 86400000 * 365
            }).save();
        }

        // Super admin
        const adminExists = await User.findOne({ role: 'super_admin' });
        if (!adminExists) {
            await new User({
                _id: 'u_admin', username: 'admin', password: bcrypt.hashSync('admin123', 10),
                nickname: '管理员', bio: '飞友之家平台管理员', avatarColor: '#f5576c',
                avatarText: '管', role: 'super_admin', points: 99999, lastCheckinDate: null,
                bubbleStyle: 4, banned: false, createdAt: Date.now()
            }).save();
            console.log('Admin account created: admin / admin123');
        }

        // Public group
        const pubGroup = await Group.findById('g_public');
        if (!pubGroup) {
            const group = new Group({
                _id: 'g_public', name: '飞友之家大厅',
                description: '所有人都在这里聊天！', avatarColor: '#667eea',
                avatarText: '厅', members: [], createdAt: Date.now()
            });
            // Add admin to public group
            const admin = await User.findById('u_admin');
            if (admin) group.members.push('u_admin');
            const sys = await User.findById('u_system');
            if (sys) group.members.push('u_system');
            await group.save();
        }

        // Ensure Donation config exists
        const donation = await Donation.findById('donation_config');
        if (!donation) {
            await new Donation({ _id: 'donation_config', wechat: '', alipay: '' }).save();
        }

        console.log('Seed data initialized');
    } catch (e) {
        console.error('Seed error:', e.message);
    }
}

// ========== Start Server ==========

async function start() {
    await connectDB();
    await seedData();

    server.listen(PORT, '0.0.0.0', () => {
        console.log(`飞友之家 server running on port ${PORT}`);
        console.log(`Database: MongoDB Atlas`);
    });
}

start();
