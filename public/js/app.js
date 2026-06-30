// ========== 聊聊 ChatSpace - 前端应用 ==========
const App = {
    token: null,
    currentUser: null,
    socket: null,
    onlineUsers: [],
    currentView: 'chats',
    currentChatType: null, // 'private' or 'group'
    currentChatId: null,
    currentChatName: '',
    chatSearchQuery: '',
    emojiOpen: false,
    pendingImages: [],
    typingTimer: null,

    // ========== 初始化 ==========

    init() {
        // 检查登录状态
        this.token = localStorage.getItem('chat_token');
        if (this.token) {
            this.restoreSession();
        } else {
            this.showAuthPage();
        }

        // Auth tab切换
        document.querySelectorAll('.auth-tab').forEach(tab => {
            tab.addEventListener('click', () => {
                document.querySelectorAll('.auth-tab').forEach(t => t.classList.remove('active'));
                tab.classList.add('active');
                const target = tab.dataset.tab;
                document.getElementById('login-form').classList.toggle('hidden', target !== 'login');
                document.getElementById('register-form').classList.toggle('hidden', target !== 'register');
            });
        });

        // 登录表单
        document.getElementById('login-form').addEventListener('submit', e => {
            e.preventDefault();
            this.handleLogin();
        });

        // 注册表单
        document.getElementById('register-form').addEventListener('submit', e => {
            e.preventDefault();
            this.handleRegister();
        });

        // 导航切换
        document.querySelectorAll('.nav-item[data-view]').forEach(item => {
            item.addEventListener('click', () => {
                const view = item.dataset.view;
                if (view === 'admin' && this.currentUser?.role !== 'admin') return;
                this.switchView(view);
            });
        });

        // 聊天搜索
        document.getElementById('chat-search')?.addEventListener('input', e => {
            this.chatSearchQuery = e.target.value.toLowerCase();
            this.renderChatList();
        });

        // 通讯录搜索
        document.getElementById('contact-search')?.addEventListener('input', e => {
            this.renderContacts(e.target.value.toLowerCase());
        });

        // 图片预览
        document.getElementById('image-preview-overlay')?.addEventListener('click', () => {
            document.getElementById('image-preview-overlay').classList.add('hidden');
        });
    },

    // ========== 网络请求 ==========

    async api(url, method = 'GET', body = null) {
        const opts = {
            method,
            headers: { 'Content-Type': 'application/json' }
        };
        if (this.token) opts.headers.Authorization = this.token;
        if (body) opts.body = JSON.stringify(body);

        const res = await fetch(url, opts);
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || '请求失败');
        return data;
    },

    async apiUpload(url, formData) {
        const opts = {
            method: 'POST',
            headers: { Authorization: this.token },
            body: formData
        };
        const res = await fetch(url, opts);
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || '上传失败');
        return data;
    },

    // ========== 认证 ==========

    showAuthPage() {
        document.getElementById('auth-page').classList.remove('hidden');
        document.getElementById('main-app').classList.add('hidden');
    },

    showMainApp() {
        document.getElementById('auth-page').classList.add('hidden');
        document.getElementById('main-app').classList.remove('hidden');
        this.updateNavAvatar();
        this.connectSocket();
        this.renderAll();
        // 显示管理员入口
        if (this.currentUser?.role === 'admin') {
            document.getElementById('nav-admin').classList.remove('hidden');
        }
    },

    async restoreSession() {
        try {
            const user = await this.api('/api/me');
            this.currentUser = user;
            this.showMainApp();
        } catch (e) {
            localStorage.removeItem('chat_token');
            this.token = null;
            this.showAuthPage();
        }
    },

    async handleLogin() {
        const username = document.getElementById('login-username').value.trim();
        const password = document.getElementById('login-password').value;
        if (!username || !password) return this.toast('请填写用户名和密码', 'error');

        try {
            const data = await this.api('/api/login', 'POST', { username, password });
            this.token = data.token;
            this.currentUser = data.user;
            localStorage.setItem('chat_token', this.token);
            this.toast('登录成功！', 'success');
            this.showMainApp();
        } catch (e) {
            this.toast(e.message, 'error');
        }
    },

    async handleRegister() {
        const username = document.getElementById('reg-username').value.trim();
        const password = document.getElementById('reg-password').value;
        const nickname = document.getElementById('reg-nickname').value.trim();
        const bio = document.getElementById('reg-bio').value.trim();

        if (!username || !password) return this.toast('请填写用户名和密码', 'error');

        try {
            const data = await this.api('/api/register', 'POST', { username, password, nickname, bio });
            this.token = data.token;
            this.currentUser = data.user;
            localStorage.setItem('chat_token', this.token);
            this.toast('注册成功，欢迎来到聊聊！', 'success');
            this.showMainApp();
        } catch (e) {
            this.toast(e.message, 'error');
        }
    },

    logout() {
        localStorage.removeItem('chat_token');
        this.token = null;
        this.currentUser = null;
        if (this.socket) this.socket.disconnect();
        this.socket = null;
        this.showAuthPage();
        this.toast('已退出登录', 'info');
    },

    // ========== Socket.IO 连接 ==========

    connectSocket() {
        if (this.socket) this.socket.disconnect();

        this.socket = io({ transports: ['websocket', 'polling'] });

        this.socket.on('connect', () => {
            console.log('Socket connected');
            this.socket.emit('auth', this.token);
        });

        this.socket.on('private-message', (msg) => {
            console.log('Received private message:', msg);
            // 如果当前正在和这个人聊天，直接显示
            if (this.currentChatType === 'private' && this.currentChatId === msg.from) {
                this.appendMessage(msg, 'other');
                this.scrollToBottom();
            }
            // 刷新聊天列表
            this.renderChatList();
            this.updateUnreadBadge();
        });

        this.socket.on('private-message-sent', (msg) => {
            // 自己发的消息确认
            this.renderChatList();
        });

        this.socket.on('group-message', (msg) => {
            console.log('Received group message:', msg);
            if (this.currentChatType === 'group' && this.currentChatId === msg.to) {
                const isSelf = msg.from === this.currentUser.id;
                this.appendMessage(msg, isSelf ? 'self' : 'other');
                this.scrollToBottom();
            }
            this.renderChatList();
        });

        this.socket.on('typing', (data) => {
            if (this.currentChatType === data.type) {
                if (data.type === 'private' && this.currentChatId === data.from) {
                    this.showTyping(data.nickname);
                } else if (data.type === 'group' && this.currentChatId === data.groupId) {
                    this.showTyping(data.nickname);
                }
            }
        });

        this.socket.on('stop-typing', (data) => {
            this.hideTyping();
        });

        this.socket.on('online-list', (list) => {
            this.onlineUsers = list;
            this.renderChatList();
            this.renderContacts();
        });

        this.socket.on('user-online', () => { this.renderChatList(); this.renderContacts(); });
        this.socket.on('user-offline', () => { this.renderChatList(); this.renderContacts(); });

        this.socket.on('new-moment', () => { this.renderMoments(); });
        this.socket.on('moment-updated', () => { this.renderMoments(); });
        this.socket.on('moment-deleted', () => { this.renderMoments(); });
        this.socket.on('user-deleted', () => { this.renderChatList(); this.renderContacts(); this.renderMoments(); });
        this.socket.on('groups-updated', () => { this.renderChatList(); });

        this.socket.on('banned', (data) => {
            this.toast(data.message, 'error');
            this.logout();
        });

        this.socket.on('auth-error', (msg) => {
            this.toast(msg, 'error');
        });

        this.socket.on('disconnect', () => {
            console.log('Socket disconnected');
        });
    },

    // ========== 导航与视图 ==========

    switchView(view) {
        this.currentView = view;
        document.querySelectorAll('.nav-item[data-view]').forEach(item => {
            item.classList.toggle('active', item.dataset.view === view);
        });
        document.querySelectorAll('.view').forEach(v => v.classList.add('hidden'));
        document.getElementById(`view-${view}`)?.classList.remove('hidden');

        if (view === 'chats') this.renderChatList();
        else if (view === 'contacts') this.renderContacts();
        else if (view === 'moments') this.renderMoments();
        else if (view === 'discover') this.renderDiscover();
        else if (view === 'admin') this.renderAdmin();
    },

    updateNavAvatar() {
        const avatar = document.getElementById('nav-avatar');
        if (this.currentUser?.avatarUrl) {
            avatar.innerHTML = `<img src="${this.currentUser.avatarUrl}" alt="">`;
            avatar.style.background = 'transparent';
        } else {
            avatar.textContent = this.currentUser?.avatarText || '?';
            avatar.style.background = this.currentUser?.avatarColor || '#667eea';
        }
    },

    renderAll() {
        this.renderChatList();
        this.updateUnreadBadge();
    },

    // ========== 聊天列表 ==========

    async renderChatList() {
        try {
            // 获取好友列表
            const friends = await this.api('/api/friends');
            // 获取群组列表
            const groups = await this.api('/api/groups');
            // 获取未读数
            const unread = await this.api('/api/messages/unread');

            let items = [];

            // 好友聊天
            friends.forEach(f => {
                const isOnline = this.onlineUsers.includes(f.id);
                const unreadCount = unread.private?.[f.id] || 0;
                items.push({
                    type: 'private',
                    id: f.id,
                    name: f.nickname,
                    avatarColor: f.avatarColor,
                    avatarText: f.avatarText,
                    avatarUrl: f.avatarUrl,
                    lastMsg: '', // 要从消息历史获取
                    time: '',
                    unread: unreadCount,
                    online: isOnline
                });
            });

            // 群聊
            groups.forEach(g => {
                const unreadCount = unread.group?.[g.id] || 0;
                items.push({
                    type: 'group',
                    id: g.id,
                    name: g.name,
                    avatarColor: g.avatarColor,
                    avatarText: g.avatarText,
                    avatarUrl: null,
                    lastMsg: '',
                    time: '',
                    unread: unreadCount,
                    online: true,
                    memberCount: g.memberCount
                });
            });

            // 搜索过滤
            if (this.chatSearchQuery) {
                items = items.filter(item => item.name.toLowerCase().includes(this.chatSearchQuery));
            }

            // 获取最后一条消息（从API）
            // 为了性能，只获取前20个聊天的最后消息
            for (let item of items) {
                try {
                    const url = item.type === 'private'
                        ? `/api/messages/private/${item.id}`
                        : `/api/messages/group/${item.id}`;
                    const msgs = await this.api(url);
                    if (msgs.length > 0) {
                        const last = msgs[msgs.length - 1];
                        item.lastMsg = last.messageType === 'image' ? '[图片]' : last.content;
                        item.time = this.formatTime(last.timestamp);
                    }
                } catch { /* skip */ }
            }

            // 按未读优先排序，然后按时间
            items.sort((a, b) => (b.unread > 0 ? 1 : 0) - (a.unread > 0 ? 1 : 0));

            const listEl = document.getElementById('chat-list');
            listEl.innerHTML = items.length === 0
                ? `<div class="empty-state"><p>暂无聊天，去发现页添加好友吧！</p></div>`
                : items.map(item => {
                    const isActive = this.currentChatType === item.type && this.currentChatId === item.id;
                    const onlineDot = item.type === 'private' && item.online ? '<span style="color:#43e97b;font-size:10px;">●</span>' : '';
                    const memberTag = item.type === 'group' ? `<span style="font-size:12px;color:var(--text-light);">(${item.memberCount}人)</span>` : '';
                    const avatarHTML = item.avatarUrl
                        ? `<img src="${item.avatarUrl}" alt="">`
                        : item.avatarText;
                    return `
                        <div class="chat-item ${isActive ? 'active' : ''}" onclick="App.openChat('${item.type}','${item.id}','${item.name}','${item.avatarColor}','${item.avatarText}','${item.avatarUrl || ''}')">
                            <div class="chat-avatar" style="background:${item.avatarColor}">${avatarHTML}</div>
                            <div class="chat-info">
                                <div class="chat-name">${onlineDot} ${item.name} ${memberTag}</div>
                                <div class="chat-last-msg">${item.lastMsg || '开始聊天吧'}</div>
                            </div>
                            <div class="chat-meta">
                                <span class="chat-time">${item.time || ''}</span>
                                ${item.unread > 0 ? `<span class="chat-unread">${item.unread}</span>` : ''}
                            </div>
                        </div>
                    `;
                }).join('');

        } catch (e) {
            console.error('Failed to render chat list:', e);
        }
    },

    // ========== 打开聊天 ==========

    async openChat(type, id, name, avatarColor, avatarText, avatarUrl) {
        this.currentChatType = type;
        this.currentChatId = id;
        this.currentChatName = name;

        // 构建聊天头部
        const header = `
            <div class="chat-header">
                <button class="chat-back-btn" onclick="App.closeChatMobile()">
                    <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2"><polyline points="15 18 9 12 15 6"/></svg>
                </button>
                <div class="msg-avatar" style="background:${avatarColor}">
                    ${avatarUrl ? `<img src="${avatarUrl}" alt="">` : avatarText}
                </div>
                <div>
                    <div class="chat-header-name">${name}</div>
                    <div class="chat-header-status">${type === 'private' ? (this.onlineUsers.includes(id) ? '在线' : '离线') : '群聊'}</div>
                </div>
                ${type === 'group' ? `<button class="chat-header-members-btn" onclick="App.showGroupMembers('${id}')">成员列表</button>` : ''}
            </div>
        `;

        // 消息区域
        const messagesArea = `<div class="messages-area" id="messages-area"></div>`;

        // 输入区域
        const inputArea = `
            <div class="chat-input-area">
                <div class="chat-tools">
                    <button class="chat-tool-btn" onclick="App.toggleEmoji()" title="表情">
                        <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2">
                            <circle cx="12" cy="12" r="10"/><path d="M8 14s1.5 2 4 2 4-2 4-2"/>
                            <line x1="9" y1="9" x2="9.01" y2="9"/><line x1="15" y1="9" x2="15.01" y2="9"/>
                        </svg>
                    </button>
                    <button class="chat-tool-btn" onclick="App.sendImage()" title="图片">
                        <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2">
                            <rect x="3" y="3" width="18" height="18" rx="2" ry="2"/>
                            <circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/>
                        </svg>
                    </button>
                </div>
                <textarea class="chat-input" id="chat-input" placeholder="输入消息..." rows="1"
                    onkeydown="if(event.key==='Enter'&&!event.shiftKey){event.preventDefault();App.sendMessage()}"
                    oninput="App.onTyping()"></textarea>
                <button class="chat-send-btn" onclick="App.sendMessage()">
                    <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="white" stroke-width="2">
                        <line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/>
                    </svg>
                </button>
            </div>
            <div class="emoji-panel hidden" id="emoji-panel"></div>
        `;

        document.getElementById('chat-detail').innerHTML = header + messagesArea + inputArea;

        // 加载消息历史
        await this.loadMessages();

        // 高亮聊天列表当前项
        this.renderChatList();
        this.hideTyping();

        // 手机端：隐藏聊天列表，显示聊天详情
        if (window.innerWidth <= 768) {
            const listPanel = document.querySelector('.list-panel');
            const detailPanel = document.getElementById('chat-detail');
            if (listPanel) listPanel.classList.add('hidden');
            if (detailPanel) detailPanel.classList.remove('hidden');
        }
    },

    async loadMessages() {
        try {
            const url = this.currentChatType === 'private'
                ? `/api/messages/private/${this.currentChatId}`
                : `/api/messages/group/${this.currentChatId}`;
            const messages = await this.api(url);

            const area = document.getElementById('messages-area');
            area.innerHTML = '';

            messages.forEach(msg => {
                const isSelf = msg.from === this.currentUser.id;
                this.appendMessage(msg, isSelf ? 'self' : 'other');
            });

            this.scrollToBottom();
        } catch (e) {
            console.error('Failed to load messages:', e);
        }
    },

    // 手机端关闭聊天，返回聊天列表
    closeChatMobile() {
        const detail = document.getElementById('chat-detail');
        const listPanel = document.querySelector('.list-panel');
        if (listPanel) listPanel.classList.remove('hidden');
        if (detail) detail.classList.add('hidden');
    },

    // ========== 发送消息 ==========

    sendMessage() {
        const input = document.getElementById('chat-input');
        const content = input.value.trim();
        if (!content) return;

        const msgData = {
            to: this.currentChatId,
            content,
            messageType: 'text',
            type: this.currentChatType
        };

        // 通过Socket.IO发送
        if (this.currentChatType === 'private') {
            this.socket.emit('private-message', msgData);
        } else {
            this.socket.emit('group-message', msgData);
        }

        // 立即在本地显示
        const localMsg = {
            id: 'temp_' + Date.now(),
            from: this.currentUser.id,
            to: this.currentChatId,
            content,
            messageType: 'text',
            timestamp: Date.now(),
            fromNickname: this.currentUser.nickname,
            fromAvatarColor: this.currentUser.avatarColor,
            fromAvatarText: this.currentUser.avatarText
        };
        this.appendMessage(localMsg, 'self');

        input.value = '';
        this.scrollToBottom();
        this.hideTyping();

        // 发送停止输入指示
        this.socket.emit('stop-typing', { to: this.currentChatId, type: this.currentChatType });
    },

    async sendImage() {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = 'image/*';
        input.onchange = async () => {
            const file = input.files[0];
            if (!file) return;
            if (file.size > 3 * 1024 * 1024) {
                this.toast('图片不能超过3MB', 'error');
                return;
            }

            try {
                const formData = new FormData();
                formData.append('image', file);
                const data = await this.apiUpload('/api/upload', formData);

                // 通过Socket发送图片消息
                const msgData = {
                    to: this.currentChatId,
                    content: data.url,
                    messageType: 'image',
                    type: this.currentChatType
                };

                if (this.currentChatType === 'private') {
                    this.socket.emit('private-message', msgData);
                } else {
                    this.socket.emit('group-message', msgData);
                }

                // 本地显示
                const localMsg = {
                    id: 'temp_' + Date.now(),
                    from: this.currentUser.id,
                    to: this.currentChatId,
                    content: data.url,
                    messageType: 'image',
                    timestamp: Date.now()
                };
                this.appendMessage(localMsg, 'self');
                this.scrollToBottom();

            } catch (e) {
                this.toast('图片发送失败: ' + e.message, 'error');
            }
        };
        input.click();
    },

    // ========== 消息渲染 ==========

    appendMessage(msg, side) {
        const area = document.getElementById('messages-area');
        if (!area) return;

        const isSelf = side === 'self';
        const time = this.formatTime(msg.timestamp);

        // 头像
        let avatarHTML;
        if (isSelf) {
            avatarHTML = this.currentUser?.avatarUrl
                ? `<img src="${this.currentUser.avatarUrl}" alt="">`
                : this.currentUser?.avatarText || '?';
            const bgColor = this.currentUser?.avatarUrl ? 'transparent' : this.currentUser?.avatarColor;
            const avatarEl = `<div class="msg-avatar" style="background:${bgColor}">${avatarHTML}</div>`;
        } else {
            const color = msg.fromAvatarColor || '#764ba2';
            const text = msg.fromAvatarText || '?';
            const url = msg.fromAvatarUrl;
            avatarHTML = url ? `<img src="${url}" alt="">` : text;
            const bgColor = url ? 'transparent' : color;
            var avatarEl = `<div class="msg-avatar" style="background:${bgColor}">${avatarHTML}</div>`;
        }

        // 内容
        let contentHTML;
        if (msg.messageType === 'image') {
            contentHTML = `<img class="msg-image" src="${msg.content}" onclick="App.previewImage('${msg.content}')">`;
        } else {
            contentHTML = this.escapeHtml(msg.content);
        }

        // 群聊中显示发送者名字
        const nameTag = (!isSelf && this.currentChatType === 'group')
            ? `<div style="font-size:12px;color:var(--primary);font-weight:600;margin-bottom:2px;">${msg.fromNickname || '未知'}</div>`
            : '';

        const msgHTML = `
            <div class="msg-row ${side}">
                ${!isSelf ? avatarEl : ''}
                <div>
                    ${nameTag}
                    <div class="msg-bubble">${contentHTML}</div>
                    <div class="msg-time">${time}</div>
                </div>
                ${isSelf ? avatarEl : ''}
            </div>
        `;

        area.insertAdjacentHTML('beforeend', msgHTML);
    },

    scrollToBottom() {
        const area = document.getElementById('messages-area');
        if (area) area.scrollTop = area.scrollHeight;
    },

    previewImage(url) {
        document.getElementById('image-preview-img').src = url;
        document.getElementById('image-preview-overlay').classList.remove('hidden');
    },

    // ========== Typing指示 ==========

    onTyping() {
        if (!this.socket) return;
        this.socket.emit('typing', { to: this.currentChatId, type: this.currentChatType });

        clearTimeout(this.typingTimer);
        this.typingTimer = setTimeout(() => {
            this.socket.emit('stop-typing', { to: this.currentChatId, type: this.currentChatType });
        }, 3000);
    },

    showTyping(name) {
        const area = document.getElementById('messages-area');
        if (!area) return;
        // 移除旧的typing指示
        const old = area.querySelector('.typing-indicator');
        if (old) old.remove();

        area.insertAdjacentHTML('beforeend', `
            <div class="typing-indicator">
                ${name} 正在输入
                <span class="typing-dot"></span>
                <span class="typing-dot"></span>
                <span class="typing-dot"></span>
            </div>
        `);
        this.scrollToBottom();
    },

    hideTyping() {
        const area = document.getElementById('messages-area');
        if (!area) return;
        const typing = area.querySelector('.typing-indicator');
        if (typing) typing.remove();
    },

    // ========== Emoji ==========

    toggleEmoji() {
        const panel = document.getElementById('emoji-panel');
        if (panel.classList.contains('hidden')) {
            if (!panel.innerHTML) {
                const emojis = ['😀','😂','🤣','😊','😍','🥰','😘','😎','🤗','🤩','😜','🤑','🤔','🤫','🤭','😱','😢','😭','😤','😡','🥺','🤥','🤮','🤧','😷','🤒','👻','💀','👽','🤖','💩','🐱','🐶','🐭','🐹','🐰','🦊','🐻','🐼','🐨','🦁','🐯','🐮','🐷','🐸','🐵','🐔','🦄','🐝','🐛','🦋','🌺','🌻','🌹','🍀','🍁','🌊','🔥','⭐','🌙','☀️','🌈','❤️','🧡','💛','💚','💙','💜','🖤','🤍','💔','💯','✅','❌','⭕','🎵','🎶','🎸','🎮','⚽','🏀','🎯','🏆','🥇','🎪','🎉','🎊','🎁','🎈','💫','🌟','⚔️','🛡️','🗝️','🔮','🧲','💰','💎','🏷️','📎','✏️','📝','📖','📚','🔔','📣','💬','💭','🗯️','👋','✌️','🤞','👍','👎','👊','✊','🤝','🙏','💪','🦾','👀','🧠','👤','👥','🚀','✈️','🚗','🏠','🌍','🌎','🌏'];
                panel.innerHTML = `<div class="emoji-grid">${emojis.map(e => `<span class="emoji-item" onclick="App.insertEmoji('${e}')">${e}</span>`).join('')}</div>`;
            }
            panel.classList.remove('hidden');
        } else {
            panel.classList.add('hidden');
        }
    },

    insertEmoji(emoji) {
        const input = document.getElementById('chat-input');
        input.value += emoji;
        input.focus();
    },

    // ========== 通讯录 ==========

    async renderContacts(search = '') {
        try {
            const friends = await this.api('/api/friends');

            let filtered = friends;
            if (search) {
                filtered = friends.filter(f => f.nickname.toLowerCase().includes(search));
            }

            const listEl = document.getElementById('contacts-list');
            listEl.innerHTML = filtered.length === 0
                ? `<div class="empty-state"><p>${search ? '未找到好友' : '暂无好友，去发现页添加吧！'}</p></div>`
                : filtered.map(f => {
                    const isOnline = this.onlineUsers.includes(f.id);
                    const avatarHTML = f.avatarUrl ? `<img src="${f.avatarUrl}" alt="">` : f.avatarText;
                    const bgColor = f.avatarUrl ? 'transparent' : f.avatarColor;
                    return `
                        <div class="contact-item" onclick="App.openChat('private','${f.id}','${f.nickname}','${f.avatarColor}','${f.avatarText}','${f.avatarUrl || ''}')">
                            <div class="contact-avatar" style="background:${bgColor}">${avatarHTML}</div>
                            <div class="contact-info">
                                <div class="contact-name">${f.nickname}</div>
                                <div class="contact-bio">${f.bio || ''}</div>
                            </div>
                            ${isOnline ? '<div class="contact-online-dot"></div>' : ''}
                        </div>
                    `;
                }).join('');

        } catch (e) {
            console.error('Failed to render contacts:', e);
        }
    },

    // ========== 动态 ==========

    async renderMoments() {
        try {
            const moments = await this.api('/api/moments');

            const listEl = document.getElementById('moments-list');
            listEl.innerHTML = moments.length === 0
                ? `<div class="empty-state"><p>暂无动态，发布第一条吧！</p></div>`
                : moments.map(m => {
                    const avatarHTML = m.avatarUrl ? `<img src="${m.avatarUrl}" alt="">` : m.avatarText;
                    const bgColor = m.avatarUrl ? 'transparent' : m.avatarColor;
                    const liked = m.likes.includes(this.currentUser.id);
                    const likeCount = m.likes.length;

                    let imagesHTML = '';
                    if (m.images && m.images.length > 0) {
                        const cls = m.images.length === 1 ? 'moment-images single' : 'moment-images';
                        imagesHTML = `<div class="${cls}">${m.images.map(img =>
                            `<img src="${img}" onclick="App.previewImage('${img}')" alt="">`
                        ).join('')}</div>`;
                    }

                    let commentsHTML = '';
                    if (m.comments && m.comments.length > 0) {
                        commentsHTML = `<div class="moment-comments">${m.comments.map(c => `
                            <div class="moment-comment">
                                <span class="moment-comment-name">${c.nickname}：</span>
                                <span class="moment-comment-text">${this.escapeHtml(c.content)}</span>
                            </div>
                        `).join('')}</div>`;
                    }

                    const likesText = likeCount > 0 ? `<span class="moment-likes-text">${likeCount}人点赞</span>` : '';
                    const deleteBtn = m.isOwn || this.currentUser?.role === 'admin'
                        ? `<button class="moment-delete-btn" onclick="App.deleteMoment('${m.id}')">删除</button>`
                        : '';

                    return `
                        <div class="moment-card">
                            <div class="moment-header">
                                <div class="moment-avatar" style="background:${bgColor}">${avatarHTML}</div>
                                <div>
                                    <div class="moment-name">${m.nickname}</div>
                                    <div class="moment-time">${this.formatTime(m.createdAt)}</div>
                                </div>
                                ${deleteBtn}
                            </div>
                            <div class="moment-content">${this.escapeHtml(m.content)}</div>
                            ${imagesHTML}
                            <div class="moment-actions">
                                <button class="moment-action-btn ${liked ? 'liked' : ''}" onclick="App.likeMoment('${m.id}')">
                                    ${liked ? '❤️' : '🤍'} 点赞
                                </button>
                                ${likesText}
                                <button class="moment-action-btn" onclick="App.commentMoment('${m.id}')">💬 评论</button>
                            </div>
                            ${commentsHTML}
                        </div>
                    `;
                }).join('');

        } catch (e) {
            console.error('Failed to render moments:', e);
        }
    },

    async showPostMomentModal() {
        let imageUrls = [];

        const body = `
            <textarea class="post-textarea" id="post-text" placeholder="分享你的想法..." maxlength="500"></textarea>
            <div class="post-image-preview" id="post-images"></div>
            <div class="post-tools">
                <label class="post-tool-btn">
                    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2">
                        <rect x="3" y="3" width="18" height="18" rx="2" ry="2"/>
                        <circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/>
                    </svg>
                    添加图片
                    <input type="file" accept="image/*" multiple style="display:none" id="post-image-input">
                </label>
                <span style="font-size:13px;color:var(--text-light);margin-left:auto;" id="char-count">0/500</span>
            </div>
        `;

        const footer = `
            <button class="btn-secondary" onclick="App.closeModal()">取消</button>
            <button class="btn-primary" id="confirm-post-btn" style="padding:10px 24px;">发布</button>
        `;

        this.showModal('发布动态', body, footer);

        // 字数统计
        const textarea = document.getElementById('post-text');
        textarea.addEventListener('input', () => {
            document.getElementById('char-count').textContent = `${textarea.value.length}/500`;
        });

        // 图片选择 - 直接上传到服务器
        document.getElementById('post-image-input').addEventListener('change', async (e) => {
            const files = Array.from(e.target.files);
            for (const file of files) {
                if (file.size > 3 * 1024 * 1024) {
                    this.toast(`${file.name} 超过3MB`, 'error');
                    continue;
                }
                if (imageUrls.length >= 9) {
                    this.toast('最多9张图片', 'error');
                    break;
                }
                try {
                    const formData = new FormData();
                    formData.append('image', file);
                    const data = await this.apiUpload('/api/upload', formData);
                    imageUrls.push(data.url);
                    this.renderPostImages(imageUrls);
                } catch (err) {
                    this.toast('图片上传失败', 'error');
                }
            }
            e.target.value = '';
        });

        // 发布
        document.getElementById('confirm-post-btn').addEventListener('click', async () => {
            const content = textarea.value.trim();
            if (!content && imageUrls.length === 0) {
                this.toast('说点什么吧！', 'error');
                return;
            }

            try {
                // 用FormData发送，因为需要传图片URL和文字
                const formData = new FormData();
                formData.append('content', content);
                // 图片已经上传到服务器了，直接传URL数组
                await this.api('/api/moments/post', 'POST', { content, images: imageUrls });
                this.closeModal();
                this.renderMoments();
                this.toast('动态发布成功！', 'success');
            } catch (e) {
                this.toast('发布失败: ' + e.message, 'error');
            }
        });
    },

    renderPostImages(urls) {
        const container = document.getElementById('post-images');
        container.innerHTML = urls.map((url, i) => `
            <div class="post-image-item">
                <img src="${url}" alt="预览">
                <button class="post-image-remove" onclick="App.removePostImage(${i})">×</button>
            </div>
        `).join('');
    },

    removePostImage(index) {
        // 需要从容器中读取当前的图片列表
        const items = document.querySelectorAll('#post-images .post-image-item img');
        const urls = Array.from(items).map(img => img.src);
        urls.splice(index, 1);
        this.renderPostImages(urls);
        // 注意：这里还需要同步到发布按钮的事件中
        // 通过dataset传递
        document.getElementById('post-images').dataset.urls = JSON.stringify(urls);
    },

    async likeMoment(momentId) {
        try {
            await this.api(`/api/moments/like/${momentId}`, 'POST');
            this.renderMoments();
        } catch (e) {
            this.toast(e.message, 'error');
        }
    },

    commentMoment(momentId) {
        const body = `
            <textarea class="post-textarea" id="comment-text" placeholder="写评论..." maxlength="200" style="min-height:60px;"></textarea>
        `;
        const footer = `
            <button class="btn-secondary" onclick="App.closeModal()">取消</button>
            <button class="btn-primary" id="confirm-comment-btn" style="padding:10px 24px;">评论</button>
        `;
        this.showModal('写评论', body, footer);

        document.getElementById('confirm-comment-btn').addEventListener('click', async () => {
            const content = document.getElementById('comment-text').value.trim();
            if (!content) { this.toast('评论不能为空', 'error'); return; }
            try {
                await this.api(`/api/moments/comment/${momentId}`, 'POST', { content });
                this.closeModal();
                this.renderMoments();
                this.toast('评论成功！', 'success');
            } catch (e) {
                this.toast(e.message, 'error');
            }
        });
    },

    async deleteMoment(momentId) {
        if (!confirm('确定删除这条动态吗？')) return;
        try {
            await this.api(`/api/moments/${momentId}`, 'DELETE');
            this.renderMoments();
            this.toast('动态已删除', 'success');
        } catch (e) {
            this.toast(e.message, 'error');
        }
    },

    // ========== 发现页 ==========

    async renderDiscover() {
        try {
            const allUsers = await this.api('/api/users');

            const friends = allUsers.filter(u => u.isFriend);
            const nonFriends = allUsers.filter(u => !u.isFriend);

            const contentEl = document.getElementById('discover-content');

            let html = '';

            // 群聊推荐
            html += `<div class="discover-section-title">🔥 热门群聊</div>`;
            try {
                const groups = await this.api('/api/groups');
                groups.forEach(g => {
                    const isMember = false; // 已在聊天列表里显示
                    html += `
                        <div class="discover-user-card" onclick="App.joinGroup('${g.id}')">
                            <div class="discover-user-avatar" style="background:${g.avatarColor}">${g.avatarText}</div>
                            <div class="discover-user-info">
                                <div class="discover-user-name">${g.name}</div>
                                <div class="discover-user-bio">${g.description || ''} · ${g.memberCount}人</div>
                            </div>
                            <button class="btn-primary btn-sm">加入</button>
                        </div>
                    `;
                });
            } catch {}

            // 好友
            if (friends.length > 0) {
                html += `<div class="discover-section-title" style="margin-top:20px;">👥 我的好友 (${friends.length})</div>`;
                friends.forEach(u => {
                    const avatarHTML = u.avatarUrl ? `<img src="${u.avatarUrl}" alt="">` : u.avatarText;
                    const bgColor = u.avatarUrl ? 'transparent' : u.avatarColor;
                    html += `
                        <div class="discover-user-card" onclick="App.openChat('private','${u.id}','${u.nickname}','${u.avatarColor}','${u.avatarText}','${u.avatarUrl || ''}')">
                            <div class="discover-user-avatar" style="background:${bgColor}">${avatarHTML}</div>
                            <div class="discover-user-info">
                                <div class="discover-user-name">${u.nickname}</div>
                                <div class="discover-user-bio">${u.bio || ''}</div>
                            </div>
                            <button class="btn-secondary btn-sm">聊天</button>
                        </div>
                    `;
                });
            }

            // 推荐用户
            if (nonFriends.length > 0) {
                html += `<div class="discover-section-title" style="margin-top:20px;">✨ 推荐用户</div>`;
                nonFriends.forEach(u => {
                    const avatarHTML = u.avatarUrl ? `<img src="${u.avatarUrl}" alt="">` : u.avatarText;
                    const bgColor = u.avatarUrl ? 'transparent' : u.avatarColor;
                    html += `
                        <div class="discover-user-card">
                            <div class="discover-user-avatar" style="background:${bgColor}">${avatarHTML}</div>
                            <div class="discover-user-info">
                                <div class="discover-user-name">${u.nickname}</div>
                                <div class="discover-user-bio">${u.bio || ''}</div>
                            </div>
                            <button class="btn-primary btn-sm" onclick="App.addFriend('${u.id}')">+ 好友</button>
                        </div>
                    `;
                });
            }

            contentEl.innerHTML = html;

        } catch (e) {
            console.error('Failed to render discover:', e);
        }
    },

    async addFriend(userId) {
        try {
            await this.api('/api/friends/add', 'POST', { userId });
            this.toast('好友添加成功！', 'success');
            this.renderDiscover();
            this.renderChatList();
            this.renderContacts();
        } catch (e) {
            this.toast(e.message, 'error');
        }
    },

    async joinGroup(groupId) {
        try {
            await this.api('/api/groups/join', 'POST', { groupId });
            this.toast('已加入群聊！', 'success');
            this.renderDiscover();
            this.renderChatList();
        } catch (e) {
            this.toast(e.message, 'error');
        }
    },

    // ========== 创建群聊 ==========

    async showCreateGroupModal() {
        try {
            const friends = await this.api('/api/friends');

            const body = `
                <div class="group-form">
                    <input type="text" id="group-name" placeholder="群名称">
                    <input type="text" id="group-desc" placeholder="群描述 (选填)">
                    <p style="font-size:13px;color:var(--text-light);margin-top:8px;">选择群成员：</p>
                    <div class="group-member-list" id="group-members">
                        ${friends.map(f => `
                            <div class="group-member-item" data-userid="${f.id}" onclick="this.classList.toggle('selected')">
                                <div style="background:${f.avatarColor};width:24px;height:24px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:12px;color:white;">${f.avatarText}</div>
                                ${f.nickname}
                            </div>
                        `).join('')}
                    </div>
                </div>
            `;
            const footer = `
                <button class="btn-secondary" onclick="App.closeModal()">取消</button>
                <button class="btn-primary" id="confirm-group-btn" style="padding:10px 24px;">创建</button>
            `;
            this.showModal('创建群聊', body, footer);

            document.getElementById('confirm-group-btn').addEventListener('click', async () => {
                const name = document.getElementById('group-name').value.trim();
                const desc = document.getElementById('group-desc').value.trim();
                if (!name) { this.toast('群名称不能为空', 'error'); return; }

                try {
                    await this.api('/api/groups/create', 'POST', { name, description: desc });
                    this.closeModal();
                    this.renderChatList();
                    this.renderDiscover();
                    this.toast('群聊创建成功！', 'success');
                } catch (e) {
                    this.toast(e.message, 'error');
                }
            });
        } catch (e) {
            this.toast(e.message, 'error');
        }
    },

    async showGroupMembers(groupId) {
        try {
            const members = await this.api(`/api/groups/${groupId}/members`);
            const body = members.map(m => {
                const avatarHTML = m.avatarUrl ? `<img src="${m.avatarUrl}" alt="">` : m.avatarText;
                const bgColor = m.avatarUrl ? 'transparent' : m.avatarColor;
                return `
                    <div class="contact-item">
                        <div class="contact-avatar" style="background:${bgColor}">${avatarHTML}</div>
                        <div class="contact-info">
                            <div class="contact-name">${m.nickname}</div>
                        </div>
                    </div>
                `;
            }).join('');
            this.showModal('群成员', body, '');
        } catch (e) {
            this.toast(e.message, 'error');
        }
    },

    // ========== 管理员后台 ==========

    renderAdmin() {
        document.querySelectorAll('.admin-tab').forEach(tab => {
            tab.addEventListener('click', () => {
                document.querySelectorAll('.admin-tab').forEach(t => t.classList.remove('active'));
                tab.classList.add('active');
                this.renderAdminTab(tab.dataset.tab);
            });
        });
        this.renderAdminTab('admin-users');
    },

    async renderAdminTab(tab) {
        const contentEl = document.getElementById('admin-content');

        if (tab === 'admin-users') {
            try {
                const users = await this.api('/api/admin/users');
                contentEl.innerHTML = users.map(u => `
                    <div class="admin-user-card">
                        <div class="admin-user-avatar" style="background:${u.avatarColor}">${u.avatarText}</div>
                        <div class="admin-user-info">
                            <div class="admin-user-name">${u.nickname} (${u.username})</div>
                            <div class="admin-user-meta">${u.bio || ''}</div>
                            <span class="admin-user-role ${u.role}">${u.role === 'admin' ? '管理员' : '普通用户'}</span>
                            ${u.banned ? '<span class="admin-user-banned">已封禁</span>' : ''}
                        </div>
                        <div class="admin-actions">
                            ${u.role !== 'admin' ? `
                                <button class="btn-secondary btn-sm" onclick="App.adminBanUser('${u.id}')">${u.banned ? '解封' : '封禁'}</button>
                                <button class="btn-danger btn-sm" onclick="App.adminDeleteUser('${u.id}')">注销</button>
                                <button class="btn-secondary btn-sm" onclick="App.adminViewChat('${u.id}')">查看聊天</button>
                            ` : ''}
                        </div>
                    </div>
                `).join('');
            } catch (e) {
                contentEl.innerHTML = `<p style="color:red;">${e.message}</p>`;
            }
        }

        else if (tab === 'admin-chats') {
            contentEl.innerHTML = `
                <p style="color:var(--text-light);font-size:14px;">选择一个用户查看其聊天记录：</p>
                <p style="color:var(--text-light);font-size:14px;">请先在"用户管理"中点击"查看聊天"按钮</p>
            `;
        }

        else if (tab === 'admin-moments') {
            try {
                const moments = await this.api('/api/moments');
                contentEl.innerHTML = moments.map(m => `
                    <div class="moment-card">
                        <div class="moment-header">
                            <div class="moment-avatar" style="background:${m.avatarColor}">${m.avatarText}</div>
                            <div>
                                <div class="moment-name">${m.nickname}</div>
                                <div class="moment-time">${this.formatTime(m.createdAt)}</div>
                            </div>
                            <button class="btn-danger btn-sm" style="margin-left:auto;" onclick="App.adminDeleteMoment('${m.id}')">删除</button>
                        </div>
                        <div class="moment-content">${this.escapeHtml(m.content)}</div>
                        ${m.likes.length}赞 · ${m.comments.length}评论
                    </div>
                `).join('');
            } catch (e) {
                contentEl.innerHTML = `<p style="color:red;">${e.message}</p>`;
            }
        }

        else if (tab === 'admin-stats') {
            try {
                const stats = await this.api('/api/admin/stats');
                contentEl.innerHTML = `
                    <div class="admin-stats-grid">
                        <div class="admin-stat-card"><div class="admin-stat-value">${stats.totalUsers}</div><div class="admin-stat-label">总用户</div></div>
                        <div class="admin-stat-card"><div class="admin-stat-value">${stats.onlineUsers}</div><div class="admin-stat-label">在线用户</div></div>
                        <div class="admin-stat-card"><div class="admin-stat-value">${stats.bannedUsers}</div><div class="admin-stat-label">封禁用户</div></div>
                        <div class="admin-stat-card"><div class="admin-stat-value">${stats.totalMessages}</div><div class="admin-stat-label">总消息</div></div>
                        <div class="admin-stat-card"><div class="admin-stat-value">${stats.todayMessages}</div><div class="admin-stat-label">今日消息</div></div>
                        <div class="admin-stat-card"><div class="admin-stat-value">${stats.totalGroups}</div><div class="admin-stat-label">群聊数</div></div>
                        <div class="admin-stat-card"><div class="admin-stat-value">${stats.totalMoments}</div><div class="admin-stat-label">动态数</div></div>
                        <div class="admin-stat-card"><div class="admin-stat-value">${stats.todayMoments}</div><div class="admin-stat-label">今日动态</div></div>
                        <div class="admin-stat-card"><div class="admin-stat-value">${stats.totalFriendships}</div><div class="admin-stat-label">好友关系</div></div>
                    </div>
                `;
            } catch (e) {
                contentEl.innerHTML = `<p style="color:red;">${e.message}</p>`;
            }
        }
    },

    async adminBanUser(userId) {
        const action = confirm('确定要封禁/解封该用户吗？');
        if (!action) return;
        try {
            const data = await this.api(`/api/admin/ban/${userId}`, 'POST');
            this.toast(data.banned ? '用户已封禁' : '用户已解封', 'success');
            this.renderAdminTab('admin-users');
        } catch (e) {
            this.toast(e.message, 'error');
        }
    },

    async adminDeleteUser(userId) {
        if (!confirm('⚠️ 确定要注销该用户吗？这将删除该用户的所有数据，不可恢复！')) return;
        if (!confirm('再次确认：注销操作不可撤销，确定继续？')) return;
        try {
            await this.api(`/api/admin/user/${userId}`, 'DELETE');
            this.toast('用户已注销', 'success');
            this.renderAdminTab('admin-users');
        } catch (e) {
            this.toast(e.message, 'error');
        }
    },

    async adminViewChat(userId) {
        try {
            const msgs = await this.api(`/api/admin/messages/${userId}`);
            const contentEl = document.getElementById('admin-content');
            contentEl.innerHTML = `
                <button class="btn-secondary btn-sm" onclick="App.renderAdminTab('admin-users')" style="margin-bottom:12px;">← 返回用户列表</button>
                <p style="font-weight:600;margin-bottom:8px;">共 ${msgs.length} 条消息记录</p>
                ${msgs.map(m => `
                    <div class="admin-msg-item">
                        <span class="admin-msg-from">${m.fromNickname}</span>
                        → <span class="admin-msg-to">${m.toNickname}</span>
                        <span style="color:var(--text-light);font-size:11px;">[${m.type === 'private' ? '私聊' : '群聊'}]</span>
                        <br>${m.messageType === 'image' ? '<em>[图片]</em>' : this.escapeHtml(m.content)}
                        <span style="color:var(--text-light);font-size:11px;float:right;">${this.formatTime(m.timestamp)}</span>
                    </div>
                `).join('')}
            `;
        } catch (e) {
            this.toast(e.message, 'error');
        }
    },

    async adminDeleteMoment(momentId) {
        if (!confirm('确定删除该动态？')) return;
        try {
            await this.api(`/api/admin/moment/${momentId}`, 'DELETE');
            this.toast('动态已删除', 'success');
            this.renderAdminTab('admin-moments');
        } catch (e) {
            this.toast(e.message, 'error');
        }
    },

    // ========== 未读消息badge ==========

    async updateUnreadBadge() {
        try {
            const unread = await this.api('/api/messages/unread');
            let total = 0;
            Object.values(unread.private || {}).forEach(v => total += v);
            Object.values(unread.group || {}).forEach(v => total += v);

            const badge = document.getElementById('msg-badge');
            if (total > 0) {
                badge.textContent = total;
                badge.classList.remove('hidden');
            } else {
                badge.classList.add('hidden');
            }
        } catch {}
    },

    // ========== Modal ==========

    showModal(title, body, footer) {
        document.getElementById('modal-title').textContent = title;
        document.getElementById('modal-body').innerHTML = body;
        document.getElementById('modal-footer').innerHTML = footer || '';
        document.getElementById('modal-overlay').classList.remove('hidden');
    },

    closeModal() {
        document.getElementById('modal-overlay').classList.add('hidden');
    },

    // ========== Toast ==========

    toast(message, type = 'info') {
        const container = document.getElementById('toast-container');
        const el = document.createElement('div');
        el.className = `toast ${type}`;
        el.textContent = message;
        container.appendChild(el);
        setTimeout(() => el.remove(), 3000);
    },

    // ========== 工具方法 ==========

    formatTime(timestamp) {
        const date = new Date(timestamp);
        const now = new Date();
        const diff = now - date;

        if (diff < 60000) return '刚刚';
        if (diff < 3600000) return `${Math.floor(diff / 60000)}分钟前`;
        if (diff < 86400000) return `${Math.floor(diff / 3600000)}小时前`;

        const isThisYear = date.getFullYear() === now.getFullYear();
        const monthDay = `${date.getMonth() + 1}/${date.getDate()}`;
        const time = `${date.getHours().toString().padStart(2, '0')}:${date.getMinutes().toString().padStart(2, '0')}`;

        if (isThisYear) return `${monthDay} ${time}`;
        return `${date.getFullYear()}/${monthDay} ${time}`;
    },

    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }
};

// 启动
document.addEventListener('DOMContentLoaded', () => App.init());
