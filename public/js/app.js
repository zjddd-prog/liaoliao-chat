// ========== 飞友之家 ChatSpace - 前端应用 ==========
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
    userPoints: 0,
    userBubbleStyle: 0,
    profileUserId: null,
    _chatListDebounce: null,
    _unreadBelow: 0,

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
                if (view === 'admin' && this.currentUser?.role !== 'admin' && this.currentUser?.role !== 'super_admin') return;
                this.switchView(view);
            });
        });

        // 聊天搜索
        document.getElementById('chat-search')?.addEventListener('input', e => {
            this.chatSearchQuery = e.target.value.toLowerCase();
            this.renderChatList();
        });

        // 聊天列表事件委托——提升移动端触控可靠性
        document.getElementById('chat-list')?.addEventListener('click', (e) => {
            const chatItem = e.target.closest('.chat-item');
            if (!chatItem) return;
            // 如果点击的是头像，由 viewProfile 处理
            if (e.target.closest('.chat-avatar')) return;
            const type = chatItem.dataset.chatType;
            const id = chatItem.dataset.chatId;
            const name = chatItem.dataset.chatName;
            const avatarColor = chatItem.dataset.avatarColor;
            const avatarText = chatItem.dataset.avatarText;
            const avatarUrl = chatItem.dataset.avatarUrl || '';
            if (type && id && name) {
                this.openChat(type, id, name, avatarColor, avatarText, avatarUrl);
            }
        });

        // 通讯录搜索
        document.getElementById('contact-search')?.addEventListener('input', e => {
            this.renderContacts(e.target.value.toLowerCase());
        });

        // 通讯录列表事件委托——点击联系人打开聊天
        document.getElementById('contacts-list')?.addEventListener('click', (e) => {
            const contactItem = e.target.closest('.contact-item');
            if (!contactItem) return;
            // 如果点击的是头像或举报按钮，不打开聊天
            if (e.target.closest('.contact-avatar') || e.target.closest('.contact-report-btn')) return;
            const type = contactItem.dataset.chatType;
            const id = contactItem.dataset.chatId;
            const name = contactItem.dataset.chatName;
            const avatarColor = contactItem.dataset.avatarColor;
            const avatarText = contactItem.dataset.avatarText;
            const avatarUrl = contactItem.dataset.avatarUrl || '';
            if (type && id && name) {
                this.openChat(type, id, name, avatarColor, avatarText, avatarUrl);
            }
        });

        // 图片预览
        document.getElementById('image-preview-overlay')?.addEventListener('click', () => {
            document.getElementById('image-preview-overlay').classList.add('hidden');
        });

        // Esc + 模态遮罩关闭
        this._initModals();

        // 标签页可见性变化时更新标题
        document.addEventListener('visibilitychange', () => {
            if (!document.hidden) this._updateTitleBadge(0);
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
        this.userPoints = this.currentUser?.points || 0;
        this.userBubbleStyle = this.currentUser?.bubbleStyle || 0;
        this.updateNavAvatar();
        this.updatePointsDisplay();

        // 移动端/平板：确保初始显示聊天列表（detail-panel 默认隐藏）
        if (window.innerWidth <= 1024) {
            const detailPanel = document.getElementById('chat-detail');
            const listPanel = document.querySelector('.list-panel');
            if (detailPanel) detailPanel.classList.add('hidden');
            if (listPanel) listPanel.classList.remove('hidden');
        }

        this.connectSocket();
        this.renderAll();
        // 移动端/平板键盘适配（<=1024px 都需要虚拟键盘适配）
        if (window.innerWidth <= 1024) {
            this.setupMobileKeyboardHandler();
        }
        // 监听窗口大小变化（iPad旋转/分屏时重新评估键盘处理）
        if (!this._onResizeBound) {
            this._onResizeBound = () => this._onResize();
        }
        window.addEventListener('resize', this._onResizeBound);
        // 显示管理员入口 (both super_admin and admin)
        if (this.currentUser?.role === 'super_admin' || this.currentUser?.role === 'admin') {
            document.getElementById('nav-admin').classList.remove('hidden');
        }
    },

    _onResize() {
        // 超过1024px的设备清除键盘处理
        if (window.innerWidth > 1024) {
            if (this._keyboardHandler && window.visualViewport) {
                window.visualViewport.removeEventListener('resize', this._keyboardHandler);
                window.visualViewport.removeEventListener('scroll', this._keyboardHandler);
                this._keyboardHandler = null;
            }
            // 清除输入区域transform
            const inputArea = document.querySelector('.chat-input-area');
            if (inputArea) {
                inputArea.style.transform = '';
                inputArea.style.transition = '';
            }
        } else if (!this._keyboardHandler) {
            this.setupMobileKeyboardHandler();
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
        if (!username || !password) return this.toast(t('toast.fillFields'), 'error');

        try {
            const data = await this.api('/api/login', 'POST', { username, password });
            this.token = data.token;
            this.currentUser = data.user;
            localStorage.setItem('chat_token', this.token);
            this.toast(t('toast.loginSuccess'), 'success');
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

        if (!username || !password) return this.toast(t('toast.fillFields'), 'error');

        try {
            const data = await this.api('/api/register', 'POST', { username, password, nickname, bio });
            this.token = data.token;
            this.currentUser = data.user;
            localStorage.setItem('chat_token', this.token);
            this.toast(t('toast.registerSuccess'), 'success');
            this.showMainApp();
        } catch (e) {
            this.toast(e.message, 'error');
        }
    },

    logout() {
        // 清理resize监听器
        if (this._onResizeBound) {
            window.removeEventListener('resize', this._onResizeBound);
            this._onResizeBound = null;
        }
        // 清理聊天相关资源
        this.cleanupChatResources();
        // 清理键盘适配器
        if (this._keyboardHandler && window.visualViewport) {
            window.visualViewport.removeEventListener('resize', this._keyboardHandler);
            window.visualViewport.removeEventListener('scroll', this._keyboardHandler);
            this._keyboardHandler = null;
        }
        // 清理聊天列表缓存
        this._chatListCache = null;
        this._chatListCacheTime = 0;
        this._chatListLoaded = false;
        // 清理滚动处理器
        this._scrollHandler = null;

        localStorage.removeItem('chat_token');
        this.token = null;
        this.currentUser = null;
        if (this.socket) this.socket.disconnect();
        this.socket = null;
        this.showAuthPage();
        this.toast(t('toast.loggedOut'), 'info');
    },

    // ========== Socket.IO 连接 ==========

    connectSocket() {
        if (this.socket) this.socket.disconnect();

        this.socket = io({ transports: ['websocket', 'polling'] });

        this.socket.on('connect', () => {
            console.log('Socket connected');
            this.socket.emit('auth', this.token);
            this.hideConnectionBanner();
            // 恢复发送锁和按钮状态
            this._sendLock = false;
            if (this._sendLockTimeout) { clearTimeout(this._sendLockTimeout); this._sendLockTimeout = null; }
            const sendBtn = document.querySelector('.chat-send-btn');
            if (sendBtn) sendBtn.disabled = false;
            // 恢复输入框（如果之前被禁言过）
            const input = document.getElementById('chat-input');
            if (input) {
                input.disabled = false;
                input.placeholder = t('chat.input') || '输入消息...';
            }
        });

        this.socket.on('disconnect', () => {
            console.log('Socket disconnected');
            this.showConnectionBanner('disconnected', t('chat.disconnected'));
            // 断开时禁用发送按钮
            const sendBtn = document.querySelector('.chat-send-btn');
            if (sendBtn) sendBtn.disabled = true;
        });

        this.socket.on('reconnect_attempt', () => {
            this.showConnectionBanner('reconnecting', t('chat.reconnecting'));
        });

        this.socket.on('reconnect', () => {
            this.socket.emit('auth', this.token);
            this.hideConnectionBanner();
            // 恢复发送锁和按钮状态
            this._sendLock = false;
            if (this._sendLockTimeout) { clearTimeout(this._sendLockTimeout); this._sendLockTimeout = null; }
            const sendBtn = document.querySelector('.chat-send-btn');
            if (sendBtn) sendBtn.disabled = false;
        });

        this.socket.on('connect_error', () => {
            this.showConnectionBanner('disconnected', t('chat.connectionFailed'));
        });

        this.socket.on('private-message', (msg) => {
            console.log('Received private message:', msg);
            // 如果当前正在和这个人聊天，直接显示
            if (this.currentChatType === 'private' && this.currentChatId === msg.from) {
                this.appendMessage(msg, 'other');
                this.scrollToBottom();
            }
            // 刷新聊天列表
            this.refreshChatListDebounced();
        });

        this.socket.on('private-message-sent', (msg) => {
            // 自己发的消息确认，释放发送锁并恢复按钮
            this._sendLock = false;
            if (this._sendLockTimeout) { clearTimeout(this._sendLockTimeout); this._sendLockTimeout = null; }
            const sendBtn = document.querySelector('.chat-send-btn');
            if (sendBtn) sendBtn.disabled = false;
            this.refreshChatListDebounced();
        });

        this.socket.on('group-message', (msg) => {
            console.log('Received group message:', msg);
            // 如果是自己发的消息，释放发送锁并恢复按钮
            if (msg.from === this.currentUser?.id) {
                this._sendLock = false;
                if (this._sendLockTimeout) { clearTimeout(this._sendLockTimeout); this._sendLockTimeout = null; }
                const sendBtn = document.querySelector('.chat-send-btn');
                if (sendBtn) sendBtn.disabled = false;
            }
            if (this.currentChatType === 'group' && this.currentChatId === msg.to) {
                const isSelf = msg.from === this.currentUser.id;
                this.appendMessage(msg, isSelf ? 'self' : 'other');
                this.scrollToBottom();
            }
            this.refreshChatListDebounced();
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
            this.refreshChatListDebounced();
            this.renderContacts();
        });

        this.socket.on('user-online', () => { this.refreshChatListDebounced(); this.renderContacts(); });
        this.socket.on('user-offline', () => { this.refreshChatListDebounced(); this.renderContacts(); });

        this.socket.on('new-moment', () => { this.renderMoments(); });
        this.socket.on('moment-updated', () => { this.renderMoments(); });
        this.socket.on('moment-deleted', () => { this.renderMoments(); });
        this.socket.on('user-deleted', () => { this.refreshChatListDebounced(); this.renderContacts(); this.renderMoments(); });
        this.socket.on('groups-updated', () => { this.refreshChatListDebounced(); });

        this.socket.on('banned', (data) => {
            this.toast(data.message, 'error');
            this.logout();
        });

        this.socket.on('blocked-error', (data) => {
            this.toast(data.message, 'error');
        });

        // 禁言相关事件
        this.socket.on('muted-error', (data) => {
            this.toast(data.message, 'error');
        });

        this.socket.on('muted', (data) => {
            const until = data.mutedUntil;
            const now = Date.now();
            let msg = t('error.muted') || '你已被禁言';
            if (until && until > now) {
                const diff = until - now;
                const days = Math.ceil(diff / 86400000);
                if (days >= 36500) msg += '（永久）';
                else msg += `（${days}天）`;
            }
            this.toast(msg, 'error');
            // 禁用输入框
            const input = document.getElementById('chat-input');
            if (input) {
                input.disabled = true;
                input.placeholder = t('error.muted') || '你已被禁言';
            }
        });

        this.socket.on('unmuted', () => {
            this.toast(t('admin.unmuteSuccess') || '已解除禁言', 'success');
            // 启用输入框
            const input = document.getElementById('chat-input');
            if (input) {
                input.disabled = false;
                input.placeholder = t('chat.placeholder') || '输入消息...';
            }
        });

        this.socket.on('auth-error', (msg) => {
            this.toast(msg, 'error');
        });

        this.socket.on('promoted', (data) => {
            this.toast(data.message, 'success');
            this.currentUser.role = 'admin';
            const adminNav = document.getElementById('nav-admin');
            if (adminNav) adminNav.classList.remove('hidden');
        });

        this.socket.on('new-feedback', (data) => {
            this.showFeedbackDot();
        });

        this.socket.on('new-report', (data) => {
            if (this.currentUser?.role === 'super_admin' || this.currentUser?.role === 'admin') {
                this.toast(t('report.newReportToast') || '收到新举报：' + data.reporterNickname + ' 举报了 ' + data.targetUserId, 'info');
            }
        });
    },

    // ========== 连接状态横幅 ==========

    showConnectionBanner(status, msg) {
        let banner = document.getElementById('connection-banner');
        if (!banner) {
            banner = document.createElement('div');
            banner.id = 'connection-banner';
            banner.className = 'connection-banner';
            const mainApp = document.getElementById('main-app');
            mainApp.insertBefore(banner, mainApp.firstChild);
        }
        banner.className = `connection-banner ${status}`;
        banner.textContent = msg;
        banner.style.display = 'block';
    },

    hideConnectionBanner() {
        const banner = document.getElementById('connection-banner');
        if (banner) banner.style.display = 'none';
    },

    // ========== 时间格式化 ==========

    formatTime(ts) {
        if (!ts) return '';
        const now = Date.now();
        const diff = now - ts;
        if (diff < 60000) return t('time.justNow');
        if (diff < 3600000) return Math.floor(diff / 60000) + t('time.minAgo');
        if (diff < 86400000) return Math.floor(diff / 3600000) + t('time.hourAgo');
        const d = new Date(ts);
        const month = d.getMonth() + 1;
        const date = d.getDate();
        return `${month}/${date} ${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`;
    },

    // ========== 智能滚动 ==========

    scrollToBottom(force = false) {
        const area = document.getElementById('messages-area');
        if (!area) return;
        const threshold = 100;
        const isNearBottom = area.scrollHeight - area.scrollTop - area.clientHeight < threshold;
        if (force || isNearBottom) {
            area.scrollTop = area.scrollHeight;
            this._unreadBelow = 0;
        }
        this.updateScrollButton();
    },

    updateScrollButton() {
        const area = document.getElementById('messages-area');
        if (!area) return;
        const threshold = 150;
        const btn = document.getElementById('scroll-bottom-btn');
        const isNearBottom = area.scrollHeight - area.scrollTop - area.clientHeight < threshold;
        if (btn) {
            const show = !isNearBottom || this._unreadBelow > 0;
            btn.style.display = show ? 'flex' : 'none';
            if (this._unreadBelow > 0) {
                btn.innerHTML = `<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2"><polyline points="6 9 12 15 18 9"/></svg><span class="badge">${this._unreadBelow}</span>`;
            } else {
                btn.innerHTML = '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2"><polyline points="6 9 12 15 18 9"/></svg>';
            }
        }
    },

    // ========== 初始化 Esc 键盘 + 模态遮罩关闭 ==========
    _initModals() {
        const overlay = document.getElementById('modal-overlay');
        overlay.addEventListener('click', (e) => {
            if (e.target === overlay) this.closeModal();
        });
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && !overlay.classList.contains('hidden')) {
                this.closeModal();
            }
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

        if (view === 'chats') {
            // 移动端/平板：确保返回时显示聊天列表而非旧的聊天详情
            if (window.innerWidth <= 1024) {
                const detailPanel = document.getElementById('chat-detail');
                const listPanel = document.querySelector('.list-panel');
                if (detailPanel) detailPanel.classList.add('hidden');
                if (listPanel) listPanel.classList.remove('hidden');
                // 如果当前没在聊天中，重置状态
                if (!this.currentChatId) {
                    this.currentChatType = null;
                }
            }
            this.renderChatList();
        }
        else if (view === 'contacts') this.renderContacts();
        else if (view === 'moments') this.renderMoments();
        else if (view === 'discover') this.renderDiscover();
        else if (view === 'admin') this.renderAdmin();
    },

    updateNavAvatar() {
        const avatar = document.getElementById('nav-avatar');
        if (this.currentUser?.avatarUrl) {
            avatar.innerHTML = `<img src="${this.currentUser.avatarUrl}" alt="" style="width:100%;height:100%;border-radius:50%;object-fit:cover;">`;
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

    async renderChatList(forceRefresh = false) {
        const listEl = document.getElementById('chat-list');

        // 缓存机制：移动端避免频繁请求，30秒内使用缓存
        if (!forceRefresh && this._chatListCache && (Date.now() - this._chatListCacheTime) < 30000) {
            // 如果有搜索筛选，需要重新过滤
            if (this.chatSearchQuery) {
                const filtered = this._chatListCache.filter(item =>
                    item.name.toLowerCase().includes(this.chatSearchQuery)
                );
                this._renderChatListHTML(listEl, filtered);
                return;
            }
            this._renderChatListHTML(listEl, this._chatListCache);
            return;
        }

        // 首次渲染时显示骨架屏
        if (!this._chatListLoaded && listEl.children.length === 0) {
            listEl.innerHTML = `
                <div class="loading-skeleton" style="padding:12px;">
                    ${[1,2,3,4,5].map(() => `
                        <div style="display:flex;align-items:center;gap:12px;padding:14px;margin-bottom:4px;border-radius:8px;background:var(--card-bg);">
                            <div class="skeleton-avatar" style="width:46px;height:46px;border-radius:50%;background:var(--bg);"></div>
                            <div style="flex:1;"><div style="height:14px;background:var(--bg);border-radius:4px;width:60%;margin-bottom:8px;"></div><div style="height:12px;background:var(--bg);border-radius:4px;width:80%;"></div></div>
                        </div>
                    `).join('')}
                </div>
            `;
        }

        try {
            // 单次请求获取全部数据（替代原来的4次请求）
            const data = await this.api('/api/chat-list');
            this._chatListLoaded = true;

            let items = [];

            // 好友聊天
            (data.friends || []).forEach(f => {
                items.push({
                    type: 'private',
                    id: f.id,
                    name: f.nickname,
                    avatarColor: f.avatarColor,
                    avatarText: f.avatarText,
                    avatarUrl: f.avatarUrl,
                    lastMsg: f.lastMsg ? f.lastMsg.content : '',
                    time: f.lastMsg ? this.formatTime(f.lastMsg.timestamp) : '',
                    unread: f.unread || 0,
                    online: this.onlineUsers.includes(f.id),
                    ts: f.lastMsg ? f.lastMsg.timestamp : 0
                });
            });

            // 群聊
            (data.groups || []).forEach(g => {
                items.push({
                    type: 'group',
                    id: g.id,
                    name: g.name,
                    avatarColor: g.avatarColor,
                    avatarText: g.avatarText,
                    avatarUrl: null,
                    lastMsg: g.lastMsg ? g.lastMsg.content : '',
                    time: g.lastMsg ? this.formatTime(g.lastMsg.timestamp) : '',
                    unread: g.unread || 0,
                    online: true,
                    memberCount: g.memberCount,
                    ts: g.lastMsg ? g.lastMsg.timestamp : 0
                });
            });

            // 搜索过滤
            if (this.chatSearchQuery) {
                items = items.filter(item => item.name.toLowerCase().includes(this.chatSearchQuery));
            }

            // 排序：有未读的优先，然后按时间降序
            items.sort((a, b) => {
                if (a.unread > 0 && b.unread === 0) return -1;
                if (a.unread === 0 && b.unread > 0) return 1;
                return (b.ts || 0) - (a.ts || 0);
            });

            // 保存到缓存（不含搜索过滤的原始数据）
            this._chatListCache = [...items];
            this._chatListCacheTime = Date.now();

            this._renderChatListHTML(listEl, items);

        } catch (e) {
            console.error('Failed to render chat list:', e);
            if (listEl.children.length === 0 || !this._chatListLoaded) {
                listEl.innerHTML = `<div class="empty-state" style="padding:40px 20px;text-align:center;">
                    <p style="margin-bottom:16px;color:var(--text-light);">${t('chat.loadFailed') || '加载失败，请检查网络'}</p>
                    <button class="btn-primary btn-sm" onclick="App.renderChatList(true)">重试</button>
                </div>`;
            }
        }
    },

    // 渲染聊天列表HTML（从缓存或新数据调用）
    _renderChatListHTML(listEl, items) {
        listEl.innerHTML = items.length === 0
            ? `<div class="empty-state" style="padding:40px 20px;text-align:center;">
                <svg viewBox="0 0 24 24" width="48" height="48" fill="none" stroke="var(--text-light)" stroke-width="1.5" style="margin-bottom:16px;"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><line x1="19" y1="8" x2="19" y2="14"/><line x1="22" y1="11" x2="16" y2="11"/></svg>
                <p style="margin-bottom:16px;">${t('chat.noChats')}</p>
                <button class="btn-create-group btn-create-group-prompt" onclick="App.showCreateGroupModal()">
                    <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><line x1="19" y1="8" x2="19" y2="14"/><line x1="22" y1="11" x2="16" y2="11"/></svg>
                    <span>${t('group.create')}</span>
                </button>
            </div>`
            : items.map(item => {
                const isActive = this.currentChatType === item.type && this.currentChatId === item.id;
                const onlineDot = item.type === 'private' && item.online ? '<span style="color:#43e97b;font-size:10px;">●</span>' : '';
                const memberTag = item.type === 'group' ? `<span style="font-size:12px;color:var(--text-light);">(${item.memberCount}人)</span>` : '';
                const avatarHTML = item.avatarUrl
                    ? `<img src="${this.escapeAttr(item.avatarUrl)}" alt="" loading="lazy">`
                    : this.escapeHtml(item.avatarText);
                const nameClickHandler = item.type === 'private'
                    ? `onclick="event.stopPropagation();App.viewProfile('${this.escapeAttr(item.id)}')"`
                    : '';
                const openChatAttr = this._ao('openChat', item.type, item.id, item.name, item.avatarColor, item.avatarText, item.avatarUrl || '');
                return `
                    <div class="chat-item ${isActive ? 'active' : ''}" data-chat-type="${this.escapeAttr(item.type)}" data-chat-id="${this.escapeAttr(item.id)}" data-chat-name="${this.escapeAttr(item.name)}" data-avatar-color="${this.escapeAttr(item.avatarColor)}" data-avatar-text="${this.escapeAttr(item.avatarText)}" data-avatar-url="${this.escapeAttr(item.avatarUrl || '')}">
                        <div class="chat-avatar" style="background:${item.avatarColor};cursor:pointer;" onclick="event.stopPropagation();App.viewProfile('${this.escapeAttr(item.id)}')" title="查看主页">${avatarHTML}</div>
                        <div class="chat-info" ${openChatAttr}>
                            <div class="chat-name"><span ${nameClickHandler} style="cursor:pointer;">${onlineDot} ${this.escapeHtml(item.name)}</span> ${memberTag}</div>
                            <div class="chat-last-msg">${item.lastMsg ? this.escapeHtml(item.lastMsg) : t('chat.startChat')}</div>
                        </div>
                        <div class="chat-meta" ${openChatAttr}>
                            <span class="chat-time">${item.time || ''}</span>
                            ${item.unread > 0 ? `<span class="chat-unread">${item.unread}</span>` : ''}
                        </div>
                    </div>
                `;
            }).join('');
    },

    // 防抖刷新聊天列表（socket事件触发时使用)
    refreshChatListDebounced() {
        clearTimeout(this._chatListDebounce);
        this._chatListDebounce = setTimeout(() => {
            this.renderChatList(true);  // 新消息来了强制刷新
            this.updateUnreadBadge();
        }, 300);
    },

    // ========== 打开聊天 ==========

    async openChat(type, id, name, avatarColor, avatarText, avatarUrl) {
        this.currentChatType = type;
        this.currentChatId = id;
        this.currentChatName = name;
        this._unreadBelow = 0;

        const isMobile = window.innerWidth <= 1024;

        // 构建聊天头部（已转义防XSS）
        const escId = this.escapeAttr(id);
        const escName = this.escapeHtml(name);
        const escAvatarUrl = this.escapeAttr(avatarUrl || '');
        const header = `
            <div class="chat-header">
                <button class="chat-back-btn" onclick="App.closeChatMobile()">
                    <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2"><polyline points="15 18 9 12 15 6"/></svg>
                </button>
                <div class="msg-avatar" style="background:${avatarColor};cursor:pointer;" onclick="App.viewProfile('${escId}')">
                    ${avatarUrl ? `<img src="${escAvatarUrl}" alt="">` : this.escapeHtml(avatarText)}
                </div>
                <div style="cursor:pointer;" onclick="App.viewProfile('${escId}')">
                    <div class="chat-header-name">${escName}</div>
                    <div class="chat-header-status">${type === 'private' ? (this.onlineUsers.includes(id) ? t('chat.online') : t('chat.offline')) : t('chat.group')}</div>
                </div>
                ${type === 'group' ? `<button class="chat-header-members-btn" onclick="App.showGroupMembers('${escId}')">${t('chat.members')}</button>` : ''}
                ${type === 'private' ? `<button class="chat-header-report-btn" onclick="App.showReportModal('${escId}','${this.escapeAttr(name)}')" title="${t('report.title') || '举报'}">
                    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z"/><line x1="4" y1="22" x2="4" y2="15"/></svg>
                </button>` : ''}
            </div>
        `;

        // 消息区域 + 骨架屏（立即显示，不等数据）
        const messagesArea = `<div class="messages-area" id="messages-area">
            <div class="loading-skeleton">
                <div class="skeleton-msg skeleton-other"></div>
                <div class="skeleton-msg skeleton-other short"></div>
                <div class="skeleton-msg skeleton-self"></div>
                <div class="skeleton-msg skeleton-other"></div>
                <div class="skeleton-msg skeleton-self short"></div>
                <div class="skeleton-msg skeleton-other"></div>
                <div class="skeleton-msg skeleton-self"></div>
            </div>
        </div>`;

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
                <textarea class="chat-input" id="chat-input" data-i18n-placeholder="chat.input" placeholder="${t('chat.input')}" rows="1" maxlength="5000"
                    onkeydown="if(event.key==='Enter'&&!event.shiftKey&&!event.isComposing){event.preventDefault();App.sendMessage()}"
                    oninput="App.onTyping()"
                    oncompositionend="App.onCompositionEnd()"></textarea>
                <button class="chat-send-btn" onclick="App.sendMessage()">
                    <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="white" stroke-width="2">
                        <line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/>
                    </svg>
                </button>
            </div>
            <div class="emoji-panel hidden" id="emoji-panel"></div>
        `;

        // 立即设置HTML（骨架屏可见，不等消息加载）
        document.getElementById('chat-detail').innerHTML = header + messagesArea + inputArea;

        // 预创建滚动到底按钮
        const detailPanel = document.getElementById('chat-detail');
        let scrollBtn = document.getElementById('scroll-bottom-btn');
        if (!scrollBtn) {
            scrollBtn = document.createElement('div');
            scrollBtn.id = 'scroll-bottom-btn';
            scrollBtn.className = 'scroll-bottom-btn';
            scrollBtn.style.display = 'none';
            scrollBtn.innerHTML = '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2"><polyline points="6 9 12 15 18 9"/></svg>';
            scrollBtn.onclick = () => this.scrollToBottom(true);
            detailPanel.appendChild(scrollBtn);
        }

        // 移动端：立即显示聊天面板（不等消息加载完）
        if (isMobile) {
            const listPanel = document.querySelector('.list-panel');
            if (listPanel) listPanel.classList.add('hidden');
            detailPanel.classList.remove('hidden');
        }

        // 高亮聊天列表当前项（桌面端需要更新；移动端列表已隐藏，仅标记active状态）
        if (!isMobile) {
            this.renderChatList();
        } else {
            // 移动端只更新active类，不重新请求数据
            document.querySelectorAll('.chat-item').forEach(el => el.classList.remove('active'));
            // 使用 data-* 属性匹配当前项
            const items = document.querySelectorAll('.chat-item');
            items.forEach(item => {
                if (item.dataset.chatType === type && item.dataset.chatId === id) {
                    item.classList.add('active');
                }
            });
        }

        this.hideTyping();

        // 后台加载消息（不阻塞UI）
        await this.loadMessages();

        // 绑定滚动监听（先移除旧的，避免累积）
        const msgArea = document.getElementById('messages-area');
        if (msgArea) {
            if (this._scrollHandler) msgArea.removeEventListener('scroll', this._scrollHandler);
            this._scrollHandler = () => this.updateScrollButton();
            msgArea.addEventListener('scroll', this._scrollHandler, { passive: true });
        }

        // 自动聚焦输入框（移动端不自动聚焦，避免键盘遮挡聊天内容）
        setTimeout(() => {
            const chatInput = document.getElementById('chat-input');
            if (chatInput && !isMobile) chatInput.focus();
        }, 100);
    },

    // iOS键盘适配：监听visualViewport变化，调整消息区域滚动和输入区位置
    setupMobileKeyboardHandler() {
        if (!window.visualViewport) return;
        // 先清理旧的监听器
        if (this._keyboardHandler) {
            window.visualViewport.removeEventListener('resize', this._keyboardHandler);
        }
        const initialHeight = window.innerHeight;
        this._keyboardHandler = () => {
            const msgArea = document.getElementById('messages-area');
            const inputArea = document.querySelector('.chat-input-area');
            if (!this.currentChatId) return;

            const heightDiff = initialHeight - window.visualViewport.height;

            // 键盘弹起时（viewport变矮）
            if (heightDiff > 150) {
                // 滚动消息到底部
                if (msgArea) {
                    requestAnimationFrame(() => this.scrollToBottom(true));
                }
                // iOS: 将输入区域上移，防止被键盘遮挡
                if (inputArea) {
                    inputArea.style.transform = `translateY(-${heightDiff}px)`;
                    inputArea.style.transition = 'transform 0.2s ease';
                }
            } else {
                // 键盘收起时恢复
                if (inputArea) {
                    inputArea.style.transform = 'translateY(0)';
                    inputArea.style.transition = 'transform 0.25s ease';
                }
            }
        };
        window.visualViewport.addEventListener('resize', this._keyboardHandler);

        // 也监听scroll（iOS滚动时viewport会变化）
        window.visualViewport.addEventListener('scroll', this._keyboardHandler);
    },

    // 清理资源（切换视图时调用）
    cleanupChatResources() {
        this.hideTyping();
        this._sendLock = false;
        // 清理typing timer
        if (this.typingTimer) {
            clearTimeout(this.typingTimer);
            this.typingTimer = null;
        }
        // 清理发送锁超时
        if (this._sendLockTimeout) {
            clearTimeout(this._sendLockTimeout);
            this._sendLockTimeout = null;
        }
    },

    async loadMessages() {
        const area = document.getElementById('messages-area');
        if (!area) return;

        // 如果不是骨架屏状态（已有消息内容），不覆盖
        const hasSkeleton = area.querySelector('.loading-skeleton');
        if (!hasSkeleton && area.children.length > 0) {
            // 已有消息，不重新加载
            return;
        }
        if (!hasSkeleton) {
            area.innerHTML = `
                <div class="loading-skeleton">
                    <div class="skeleton-msg skeleton-other"></div>
                    <div class="skeleton-msg skeleton-other short"></div>
                    <div class="skeleton-msg skeleton-self"></div>
                    <div class="skeleton-msg skeleton-other"></div>
                    <div class="skeleton-msg skeleton-self short"></div>
                </div>
            `;
        }

        let retryCount = 0;
        const maxRetries = 3;
        let lastError = null;

        while (retryCount <= maxRetries) {
            try {
                const url = this.currentChatType === 'private'
                    ? `/api/messages/private/${this.currentChatId}`
                    : `/api/messages/group/${this.currentChatId}`;

                // 添加超时控制（Render 免费服务器冷启动可能很慢）
                const controller = new AbortController();
                const timeoutId = setTimeout(() => controller.abort(), 25000);
                const res = await fetch(url, {
                    headers: { Authorization: this.token },
                    signal: controller.signal
                });
                clearTimeout(timeoutId);

                const messages = await res.json();
                if (!res.ok) throw new Error(messages.error || t('chat.loadFailed') || '加载消息失败');

                area.innerHTML = '';

                if (messages.length === 0) {
                    area.innerHTML = `<div class="empty-state"><svg viewBox="0 0 24 24" width="40" height="40" fill="none" stroke="var(--text-light)" stroke-width="1.5"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg><p>${t('chat.startChat') || '开始聊天吧'}</p><p style="font-size:12px;color:var(--text-light);">${t('chat.noMessagesHint') || '发送第一条消息'}</p></div>`;
                } else {
                    messages.forEach(msg => {
                        const isSelf = msg.from === this.currentUser.id;
                        this.appendMessage(msg, isSelf ? 'self' : 'other');
                    });
                }

                this.scrollToBottom(true);
                return; // 成功，退出
            } catch (e) {
                lastError = e;
                retryCount++;
                const isTimeout = e.name === 'AbortError';
                console.warn(`loadMessages attempt ${retryCount} failed:`, e.message || e);
                if (retryCount > maxRetries) {
                    console.error('Failed to load messages after retries:', e);
                    let errorMsg = isTimeout
                        ? (t('chat.loadTimeout') || '服务器响应较慢，请稍后重试')
                        : (t('chat.loadFailed') || '加载消息失败');
                    if (lastError && lastError.message && !isTimeout) {
                        errorMsg += ` (${this.escapeHtml(lastError.message)})`;
                    }
                    area.innerHTML = `<div class="empty-state">
                        <svg viewBox="0 0 24 24" width="40" height="40" fill="none" stroke="var(--text-light)" stroke-width="1.5"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
                        <p style="color:var(--text-light);margin-bottom:4px;">${errorMsg}</p>
                        <p style="font-size:12px;color:var(--text-light);opacity:0.7;margin-bottom:12px;">${isTimeout ? '服务器可能正在启动，请等待 10-20 秒后重试' : '请检查网络连接'}</p>
                        <button class="btn-primary btn-sm" onclick="App.loadMessages()" style="margin-top:8px;">重试</button>
                        <button class="btn-secondary btn-sm" onclick="App.closeChatMobile()" style="margin-top:8px;display:${window.innerWidth<=1024?'inline-block':'none'};">返回</button>
                    </div>`;
                } else {
                    // 短暂延迟后重试，指数退避
                    await new Promise(r => setTimeout(r, 1500 * retryCount));
                }
            }
        }
    },

    // 手机端关闭聊天，返回聊天列表
    closeChatMobile() {
        const detail = document.getElementById('chat-detail');
        const listPanel = document.querySelector('.list-panel');
        if (listPanel) listPanel.classList.remove('hidden');
        if (detail) detail.classList.add('hidden');
        // 重置聊天状态
        this.currentChatId = null;
        this.currentChatType = null;
        this.currentChatName = '';
        this.cleanupChatResources();
    },

    // ========== 发送消息 ==========

    sendMessage() {
        // 检查是否有打开的聊天
        if (!this.currentChatId || !this.currentChatType) {
            this.toast(t('error.noChatSelected') || '请先选择一个聊天', 'error');
            return;
        }
        // 检查发送锁（防止重复发送）
        if (this._sendLock) return;
        // 检查Socket连接状态
        if (!this.socket || !this.socket.connected) {
            this.toast(t('error.disconnected') || '连接已断开，正在重连...', 'error');
            // 尝试重连
            if (this.socket) this.socket.connect();
            return;
        }

        const input = document.getElementById('chat-input');
        const sendBtn = document.querySelector('.chat-send-btn');
        if (!input) return;
        const content = input.value.trim();
        if (!content) return;

        this._sendLock = true;
        if (sendBtn) sendBtn.disabled = true;
        // 锁在消息确认回调中释放（3s兜底超时，给移动端慢网络更多时间）
        this._sendLockTimeout = setTimeout(() => {
            this._sendLock = false;
            if (sendBtn) sendBtn.disabled = false;
        }, 3000);

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

        // 更新发送按钮禁用状态
        setTimeout(() => {
            if (sendBtn) sendBtn.disabled = !input.value.trim();
        }, 50);

        // 发送停止输入指示
        if (this.socket && this.socket.connected) {
            this.socket.emit('stop-typing', { to: this.currentChatId, type: this.currentChatType });
        }
    },

    async sendImage() {
        // 检查是否有打开的聊天
        if (!this.currentChatId || !this.currentChatType) {
            this.toast(t('error.noChatSelected') || '请先选择一个聊天', 'error');
            return;
        }
        // 检查Socket连接状态
        if (!this.socket || !this.socket.connected) {
            this.toast(t('error.disconnected') || '连接已断开，正在重连...', 'error');
            if (this.socket) this.socket.connect();
            return;
        }

        const input = document.createElement('input');
        input.type = 'file';
        input.accept = 'image/*';
        input.onchange = async () => {
            const file = input.files[0];
            if (!file) return;
            if (file.size > 3 * 1024 * 1024) {
                this.toast(t('toast.imageTooBig'), 'error');
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
                this.toast(t('toast.imageSendFail') + e.message, 'error');
            }
        };
        input.click();
    },

    // ========== 消息渲染 ==========

    appendMessage(msg, side) {
        const area = document.getElementById('messages-area');
        if (!area) return;

        const isSelf = side === 'self';

        // 如果用户没有在底部(在看历史消息)，新消息计入未读数
        const threshold = 100;
        const isNearBottom = area.scrollHeight - area.scrollTop - area.clientHeight < threshold;
        if (!isSelf && !isNearBottom) {
            this._unreadBelow++;
            this.updateScrollButton();
        }
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
            avatarHTML = url ? `<img src="${this.escapeAttr(url)}" alt="">` : this.escapeHtml(text);
            const bgColor = url ? 'transparent' : color;
            const avatarEl = `<div class="msg-avatar" style="background:${bgColor}">${avatarHTML}</div>`;
        }

        // 内容
        let contentHTML;
        if (msg.messageType === 'image') {
            contentHTML = `<img class="msg-image" src="${this.escapeAttr(msg.content)}" ${this._ao('previewImage', msg.content)}>`;
        } else {
            contentHTML = this.escapeHtml(msg.content);
        }

        // 群聊中显示发送者名字
        const nameTag = (!isSelf && this.currentChatType === 'group')
            ? `<div style="font-size:12px;color:var(--primary);font-weight:600;margin-bottom:2px;">${msg.fromNickname || '?'}</div>`
            : '';

        const bubbleClass = isSelf
            ? this.getBubbleClass(this.userBubbleStyle)
            : this.getBubbleClass(msg.fromBubbleStyle || 0);

        const msgHTML = `
            <div class="msg-row ${side}">
                ${!isSelf ? avatarEl : ''}
                <div>
                    ${nameTag}
                    <div class="msg-bubble ${bubbleClass}">${contentHTML}</div>
                    <div class="msg-time">${time}</div>
                </div>
                ${isSelf ? avatarEl : ''}
            </div>
        `;

        area.insertAdjacentHTML('beforeend', msgHTML);
    },

    previewImage(url) {
        document.getElementById('image-preview-img').src = url;
        document.getElementById('image-preview-overlay').classList.remove('hidden');
    },

    // ========== Typing指示 ==========

    onTyping() {
        if (!this.socket || !this.socket.connected) return;
        if (!this.currentChatId) return;
        this.socket.emit('typing', { to: this.currentChatId, type: this.currentChatType });

        // 更新发送按钮禁用状态
        const input = document.getElementById('chat-input');
        const sendBtn = document.querySelector('.chat-send-btn');
        if (sendBtn && input) {
            sendBtn.disabled = !input.value.trim();
        }

        clearTimeout(this.typingTimer);
        this.typingTimer = setTimeout(() => {
            if (this.socket && this.socket.connected) {
                this.socket.emit('stop-typing', { to: this.currentChatId, type: this.currentChatType });
            }
        }, 3000);
    },

    // IME组合输入结束（中文/日文/韩文输入法），更新按钮状态
    onCompositionEnd() {
        const input = document.getElementById('chat-input');
        const sendBtn = document.querySelector('.chat-send-btn');
        if (sendBtn && input) {
            sendBtn.disabled = !input.value.trim();
        }
    },

    showTyping(name) {
        const area = document.getElementById('messages-area');
        if (!area) return;
        // 移除旧的typing指示
        const old = area.querySelector('.typing-indicator');
        if (old) old.remove();

        area.insertAdjacentHTML('beforeend', `
            <div class="typing-indicator">
                ${name} ${t('chat.typing')}
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
            if (search && search.trim()) {
                filtered = friends.filter(f => f.nickname.toLowerCase().includes(search.toLowerCase()));
            }

            const listEl = document.getElementById('contacts-list');
            listEl.innerHTML = filtered.length === 0
                ? `<div class="empty-state">
                    <div class="empty-icon">👥</div>
                    <h3>${search ? t('contacts.notFound') : t('contacts.empty')}</h3>
                    <p>${t('contacts.emptyHint') || '添加好友后，这里会显示你的通讯录'}</p>
                </div>`
                : filtered.map(f => {
                    const isOnline = this.onlineUsers.includes(f.id);
                    const avatarHTML = f.avatarUrl ? `<img src="${this.escapeAttr(f.avatarUrl)}" alt="">` : this.escapeHtml(f.avatarText);
                    const bgColor = f.avatarUrl ? 'transparent' : f.avatarColor;
                    const escId = this.escapeAttr(f.id);
                    const openChatAttr = this._ao('openChat', 'private', f.id, f.nickname, f.avatarColor, f.avatarText, f.avatarUrl || '');
                    return `
                        <div class="contact-item" data-chat-type="private" data-chat-id="${escId}" data-chat-name="${this.escapeAttr(f.nickname)}" data-avatar-color="${this.escapeAttr(f.avatarColor)}" data-avatar-text="${this.escapeAttr(f.avatarText)}" data-avatar-url="${this.escapeAttr(f.avatarUrl || '')}">
                            <div class="contact-avatar" style="background:${bgColor}" onclick="event.stopPropagation();App.viewProfile('${escId}')" title="查看主页">${avatarHTML}</div>
                            <div class="contact-info" ${openChatAttr}>
                                <div class="contact-name"><span onclick="event.stopPropagation();App.viewProfile('${escId}')" style="cursor:pointer;text-decoration:underline;text-decoration-color:var(--primary-light);text-underline-offset:2px;">${this.escapeHtml(f.nickname)}</span></div>
                                <div class="contact-bio">${this.escapeHtml(f.bio || '')}</div>
                            </div>
                            <button class="contact-report-btn" onclick="event.stopPropagation();App.showReportModal('${escId}','${this.escapeAttr(f.nickname)}')" title="${t('report.title') || '举报'}">
                                <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z"/><line x1="4" y1="22" x2="4" y2="15"/></svg>
                            </button>
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
                ? `<div class="empty-state">
                    <div class="empty-icon">📝</div>
                    <h3>${t('moments.empty')}</h3>
                    <p>${t('moments.emptyHint') || '发布你的第一条动态吧'}</p>
                </div>`
                : moments.map(m => {
                    const avatarHTML = m.avatarUrl ? `<img src="${this.escapeAttr(m.avatarUrl)}" alt="">` : this.escapeHtml(m.avatarText);
                    const bgColor = m.avatarUrl ? 'transparent' : m.avatarColor;
                    const liked = m.likes.includes(this.currentUser.id);
                    const likeCount = m.likes.length;
                    const escUserId = this.escapeAttr(m.userId);

                    let imagesHTML = '';
                    if (m.images && m.images.length > 0) {
                        const cls = m.images.length === 1 ? 'moment-images single' : 'moment-images';
                        imagesHTML = `<div class="${cls}">${m.images.map(img =>
                            `<img src="${this.escapeAttr(img)}" ${this._ao('previewImage', img)} alt="">`
                        ).join('')}</div>`;
                    }

                    let commentsHTML = '';
                    if (m.comments && m.comments.length > 0) {
                        commentsHTML = `<div class="moment-comments">${m.comments.map(c => `
                            <div class="moment-comment">
                                <span class="moment-comment-name" style="cursor:pointer;" onclick="App.viewProfile('${this.escapeAttr(c.userId)}')">${this.escapeHtml(c.nickname)}：</span>
                                <span class="moment-comment-text">${this.escapeHtml(c.content)}</span>
                            </div>
                        `).join('')}</div>`;
                    }

                    const likesText = likeCount > 0 ? `<span class="moment-likes-text">${likeCount}${t('moments.likesCount')}</span>` : '';
                    const deleteBtn = m.isOwn || this.currentUser?.role === 'admin'
                        ? `<button class="moment-delete-btn" onclick="App.deleteMoment('${this.escapeAttr(m.id)}')">${t('moments.delete')}</button>`
                        : '';

                    return `
                        <div class="moment-card">
                            <div class="moment-header">
                                <div class="moment-avatar" style="background:${bgColor};cursor:pointer;" onclick="App.viewProfile('${escUserId}')">${avatarHTML}</div>
                                <div>
                                    <div class="moment-name" style="cursor:pointer;" onclick="App.viewProfile('${escUserId}')">${this.escapeHtml(m.nickname)}</div>
                                    <div class="moment-time">${this.formatTime(m.createdAt)}</div>
                                </div>
                                ${deleteBtn}
                            </div>
                            <div class="moment-content">${this.escapeHtml(m.content)}</div>
                            ${imagesHTML}
                            <div class="moment-actions">
                                <button class="moment-action-btn ${liked ? 'liked' : ''}" onclick="App.likeMoment('${this.escapeAttr(m.id)}')">
                                    ${liked ? '❤️' : '🤍'} ${t('moments.like')}
                                </button>
                                ${likesText}
                                <button class="moment-action-btn" onclick="App.commentMoment('${this.escapeAttr(m.id)}')">💬 ${t('moments.comment')}</button>
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
            <textarea class="post-textarea" id="post-text" placeholder="${t('moments.placeholder')}" maxlength="500"></textarea>
            <div class="post-image-preview" id="post-images"></div>
            <div class="post-tools">
                <label class="post-tool-btn">
                    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2">
                        <rect x="3" y="3" width="18" height="18" rx="2" ry="2"/>
                        <circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/>
                    </svg>
                    ${t('moments.addImage')}
                    <input type="file" accept="image/*" multiple style="display:none" id="post-image-input">
                </label>
                <span style="font-size:13px;color:var(--text-light);margin-left:auto;" id="char-count">0/500</span>
            </div>
        `;

        const footer = `
            <button class="btn-secondary" onclick="App.closeModal()">${t('moments.cancel')}</button>
            <button class="btn-primary" id="confirm-post-btn" style="padding:10px 24px;">${t('moments.submit')}</button>
        `;

        this.showModal(t('moments.publish'), body, footer);

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
                    this.toast(t('toast.max9Images'), 'error');
                    break;
                }
                try {
                    const formData = new FormData();
                    formData.append('image', file);
                    const data = await this.apiUpload('/api/upload', formData);
                    imageUrls.push(data.url);
                    this.renderPostImages(imageUrls);
                } catch (err) {
                    this.toast(t('toast.imageUploadFail'), 'error');
                }
            }
            e.target.value = '';
        });

        // 发布
        document.getElementById('confirm-post-btn').addEventListener('click', async () => {
            const content = textarea.value.trim();
            if (!content && imageUrls.length === 0) {
                this.toast(t('moments.empty2') || '说点什么吧！', 'error');
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
                this.toast(t('toast.momentPostSuccess') || '动态发布成功！', 'success');
            } catch (e) {
                this.toast(t('toast.momentPostFail') + e.message, 'error');
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
            <textarea class="post-textarea" id="comment-text" placeholder="${t('moments.commentPlaceholder')}" maxlength="200" style="min-height:60px;"></textarea>
        `;
        const footer = `
            <button class="btn-secondary" onclick="App.closeModal()">${t('moments.cancel')}</button>
            <button class="btn-primary" id="confirm-comment-btn" style="padding:10px 24px;">${t('moments.comment')}</button>
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
        if (!confirm(t('admin.confirmDeleteMoment') || '确定删除这条动态吗？')) return;
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
            html += `<div class="discover-section-title">🔥 ${t('discover.hotGroups') || '热门群聊'}</div>`;
            try {
                const groups = await this.api('/api/groups');
                groups.forEach(g => {
                    const typeLabel = g.type === 'private' ? '🔒 ' + (t('discover.privateGroup') || '私密') : '🌐 ' + (t('discover.publicGroup') || '公开');
                    html += `
                        <div class="discover-user-card" onclick="App.joinGroup('${g.id}')">
                            <div class="discover-user-avatar" style="background:${g.avatarColor}">${g.avatarText}</div>
                            <div class="discover-user-info">
                                <div class="discover-user-name">${g.name} <span class="group-type-tag group-type-${g.type || 'public'}">${typeLabel}</span></div>
                                <div class="discover-user-bio">${g.description || '暂无简介'} · ${g.memberCount}人</div>
                            </div>
                            <button class="btn-primary btn-sm">${t('group.join') || '加入'}</button>
                        </div>
                    `;
                });
            } catch {}

            // 好友
            if (friends.length > 0) {
                html += `<div class="discover-section-title" style="margin-top:20px;">👥 ${t('discover.myFriends') || '我的好友'} (${friends.length})</div>`;
                friends.forEach(u => {
                    const avatarHTML = u.avatarUrl ? `<img src="${this.escapeAttr(u.avatarUrl)}" alt="">` : this.escapeHtml(u.avatarText);
                    const bgColor = u.avatarUrl ? 'transparent' : u.avatarColor;
                    const escId = this.escapeAttr(u.id);
                    const openChatAttr = this._ao('openChat', 'private', u.id, u.nickname, u.avatarColor, u.avatarText, u.avatarUrl || '');
                    html += `
                        <div class="discover-user-card">
                            <div class="discover-user-avatar" style="background:${bgColor};cursor:pointer;" onclick="event.stopPropagation();App.viewProfile('${escId}')">${avatarHTML}</div>
                            <div class="discover-user-info" ${openChatAttr}>
                                <div class="discover-user-name" style="cursor:pointer;" onclick="event.stopPropagation();App.viewProfile('${escId}')">${this.escapeHtml(u.nickname)}</div>
                                <div class="discover-user-bio">${this.escapeHtml(u.bio || '')}</div>
                            </div>
                            <button class="btn-secondary btn-sm" ${openChatAttr}>${t('discover.chat')}</button>
                        </div>
                    `;
                });
            }

            // 推荐用户
            if (nonFriends.length > 0) {
                html += `<div class="discover-section-title" style="margin-top:20px;">✨ ${t('discover.recommendUsers') || '推荐用户'}</div>`;
                nonFriends.forEach(u => {
                    const avatarHTML = u.avatarUrl ? `<img src="${this.escapeAttr(u.avatarUrl)}" alt="">` : this.escapeHtml(u.avatarText);
                    const bgColor = u.avatarUrl ? 'transparent' : u.avatarColor;
                    const escId = this.escapeAttr(u.id);
                    html += `
                        <div class="discover-user-card">
                            <div class="discover-user-avatar" style="background:${bgColor};cursor:pointer;" onclick="event.stopPropagation();App.viewProfile('${escId}')">${avatarHTML}</div>
                            <div class="discover-user-info">
                                <div class="discover-user-name" style="cursor:pointer;" onclick="event.stopPropagation();App.viewProfile('${escId}')">${this.escapeHtml(u.nickname)}</div>
                                <div class="discover-user-bio">${this.escapeHtml(u.bio || '')}</div>
                            </div>
                            <button class="btn-primary btn-sm" onclick="App.addFriend('${escId}')">${t('discover.addFriend')}</button>
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
            this.toast(t('toast.friendAdded'), 'success');
            this.renderDiscover();
            this.renderChatList();
            this.renderContacts();
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
        // 普通管理员看不到"聊天监控"tab
        const chatTab = document.querySelector('.admin-tab[data-tab="admin-chats"]');
        if (chatTab) {
            chatTab.style.display = this.currentUser?.role === 'super_admin' ? '' : 'none';
        }
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
                contentEl.innerHTML = users.map(u => {
                    const isMuted = u.mutedUntil !== null && u.mutedUntil > Date.now();
                    const isPermanentMute = u.mutedUntil === 253402300799000;
                    let muteLabel = '';
                    if (isMuted) {
                        muteLabel = isPermanentMute ? '已永久禁言' : '已禁言至 ' + new Date(u.mutedUntil).toLocaleString();
                    }
                    return `
                    <div class="admin-user-card">
                        <div class="admin-user-avatar" style="background:${u.avatarColor}">${u.avatarText}</div>
                        <div class="admin-user-info">
                            <div class="admin-user-name">${u.nickname} (${u.username})</div>
                            <div class="admin-user-meta">${u.bio || ''}</div>
                            <span class="admin-user-role ${u.role}">${u.role === 'super_admin' ? '👑 ' + (t('admin.superAdmin') || '超级管理员') : u.role === 'admin' ? '⭐ ' + (t('admin.admin') || '管理员') : t('admin.user') || '普通用户'}</span>
                            ${u.banned ? '<span class="admin-user-banned">' + (t('admin.banned') || '已封禁') + '</span>' : ''}
                            ${isMuted ? '<span class="admin-user-muted">' + muteLabel + '</span>' : ''}
                            <span style="font-size:12px;color:var(--text-light);">${t('sidebar.points')}: ${u.points || 0}</span>
                        </div>
                        <div class="admin-actions">
                            ${u.role !== 'super_admin' && u.id !== this.currentUser?.id ? `
                                ${this.currentUser?.role === 'super_admin' && u.role !== 'admin' ? `<button class="admin-promote-btn" onclick="App.adminPromoteUser('${u.id}')" title="${t('admin.promote') || '提升为管理员'}">⭐ ${t('admin.setAdmin') || '设为管理员'}</button>` : ''}
                                <button class="btn-secondary btn-sm" onclick="App.adminBanUser('${u.id}')">${u.banned ? (t('admin.unban') || '解封') : (t('admin.ban') || '封禁')}</button>
                                <button class="btn-danger btn-sm" onclick="App.adminDeleteUser('${u.id}')">${t('admin.delete') || '注销'}</button>
                                ${isMuted ?
                                    `<button class="btn-secondary btn-sm" onclick="App.adminUnmuteUser('${u.id}')">解除禁言</button>` :
                                    `<button class="btn-warning btn-sm" onclick="App.adminMuteUser('${u.id}')">禁言</button>`
                                }
                            ` : ''}
                        </div>
                    </div>
                `}).join('');
            } catch (e) {
                contentEl.innerHTML = `<p style="color:red;">${e.message}</p>`;
            }
        }

        else if (tab === 'admin-chats') {
            try {
                const users = await this.api('/api/admin/users');
                contentEl.innerHTML = `
                    <p style="color:var(--text-light);font-size:13px;margin-bottom:12px;">${t('admin.selectUser')}</p>
                    <div class="admin-users-mini">
                        ${users.map(u => `
                            <div class="admin-user-mini-card" onclick="App.adminViewChat('${u.id}')">
                                <div class="admin-user-avatar" style="background:${u.avatarColor}">${u.avatarText}</div>
                                <span>${u.nickname}</span>
                                <button class="btn-secondary btn-sm" style="margin-left:auto;">查看聊天</button>
                            </div>
                        `).join('')}
                    </div>
                `;
            } catch (e) {
                contentEl.innerHTML = `<p style="color:red;">${e.message}</p>`;
            }
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
                        <div class="admin-stat-card"><div class="admin-stat-value">${stats.totalUsers}</div><div class="admin-stat-label">${t('admin.totalUsers')}</div></div>
                        <div class="admin-stat-card"><div class="admin-stat-value">${stats.onlineUsers}</div><div class="admin-stat-label">${t('admin.onlineUsers')}</div></div>
                        <div class="admin-stat-card"><div class="admin-stat-value">${stats.bannedUsers}</div><div class="admin-stat-label">${t('admin.bannedUsers')}</div></div>
                        <div class="admin-stat-card"><div class="admin-stat-value">${stats.totalMessages}</div><div class="admin-stat-label">${t('admin.totalMessages')}</div></div>
                        <div class="admin-stat-card"><div class="admin-stat-value">${stats.todayMessages}</div><div class="admin-stat-label">${t('admin.todayMessages')}</div></div>
                        <div class="admin-stat-card"><div class="admin-stat-value">${stats.totalGroups}</div><div class="admin-stat-label">${t('admin.totalGroups')}</div></div>
                        <div class="admin-stat-card"><div class="admin-stat-value">${stats.totalMoments}</div><div class="admin-stat-label">${t('admin.totalMoments')}</div></div>
                        <div class="admin-stat-card"><div class="admin-stat-value">${stats.todayMoments}</div><div class="admin-stat-label">${t('admin.todayMoments')}</div></div>
                        <div class="admin-stat-card"><div class="admin-stat-value">${stats.totalFriendships}</div><div class="admin-stat-label">${t('admin.totalFriendships')}</div></div>
                    </div>
                `;
            } catch (e) {
                contentEl.innerHTML = `<p style="color:red;">${e.message}</p>`;
            }
        }

        else if (tab === 'admin-feedbacks') {
            try {
                const feedbacks = await this.api('/api/admin/feedbacks');
                if (feedbacks.length === 0) {
                    contentEl.innerHTML = '<p style="color:var(--text-light);text-align:center;padding:40px;">' + t('admin.noFeedbacks') + '</p>';
                    return;
                }
                contentEl.innerHTML = '<div class="feedbacks-list">' + feedbacks.map(fb => `
                    <div class="feedback-card">
                        <div class="feedback-header">
                            <div class="feedback-avatar" style="background:${fb.avatarColor}">${fb.avatarText}</div>
                            <span class="feedback-user">${fb.nickname}</span>
                            <span class="feedback-time">${this.formatTime(fb.createdAt)}</span>
                        </div>
                        <div class="feedback-text">${this.escapeHtml(fb.content)}</div>
                        <span class="feedback-status ${fb.status}">${fb.status === 'pending' ? t('admin.pending') : t('admin.resolved')}</span>
                        <button class="btn-secondary btn-sm" style="margin-left:8px;" onclick="App.adminResolveFeedback('${fb.id}')">
                            ${fb.status === 'pending' ? t('admin.markResolved') : t('admin.reopen')}
                        </button>
                    </div>
                `).join('') + '</div>';
            } catch (e) {
                contentEl.innerHTML = `<p style="color:red;">${e.message}</p>`;
            }
        }

        else if (tab === 'admin-reports') {
            try {
                const reports = await this.api('/api/admin/reports');
                if (reports.length === 0) {
                    contentEl.innerHTML = '<p style="color:var(--text-light);text-align:center;padding:40px;">' + (t('admin.noReports') || '暂无举报') + '</p>';
                    return;
                }
                contentEl.innerHTML = '<div class="reports-list">' + reports.map(rp => {
                    let imagesHTML = '';
                    if (rp.images && rp.images.length > 0) {
                        imagesHTML = `<div class="report-admin-images">` + rp.images.map(img => 
                            `<img src="${this.escapeAttr(img)}" ${this._ao('previewImage', img)} style="max-width:120px;max-height:120px;border-radius:6px;cursor:pointer;object-fit:cover;" alt="">`
                        ).join('') + `</div>`;
                    }
                    return `
                    <div class="report-card">
                        <div class="report-card-header">
                            <div style="display:flex;align-items:center;gap:8px;">
                                <div class="report-avatar" style="background:${rp.reporterAvatarColor}">${rp.reporterAvatarText}</div>
                                <div>
                                    <div style="font-weight:600;font-size:14px;">${rp.reporterNickname}</div>
                                    <div style="font-size:11px;color:var(--text-light);">${this.formatTime(rp.createdAt)}</div>
                                </div>
                            </div>
                            <span style="font-size:20px;color:var(--text-light);">→</span>
                            <div style="display:flex;align-items:center;gap:8px;">
                                <div class="report-avatar" style="background:${rp.targetAvatarColor}">${rp.targetAvatarText}</div>
                                <div style="font-weight:600;font-size:14px;color:#ff4757;">${rp.targetNickname}</div>
                            </div>
                        </div>
                        <div class="report-card-content">${this.escapeHtml(rp.content)}</div>
                        ${imagesHTML}
                        <div style="display:flex;align-items:center;gap:8px;margin-top:10px;">
                            <span class="feedback-status ${rp.status}">${rp.status === 'pending' ? (t('admin.pending') || '待处理') : (t('admin.resolved') || '已处理')}</span>
                            <button class="btn-secondary btn-sm" onclick="App.adminResolveReport('${rp.id}')">
                                ${rp.status === 'pending' ? (t('admin.markResolved') || '标记已处理') : (t('admin.reopen') || '重新打开')}
                            </button>
                        </div>
                    </div>
                `}).join('') + '</div>';
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
                <button class="btn-secondary btn-sm" onclick="App.renderAdminTab('admin-users')" style="margin-bottom:12px;">${t('admin.backToList')}</button>
                <p style="font-weight:600;margin-bottom:8px;">${(t('admin.msgCount') || '共 {count} 条消息记录').replace('{count}', msgs.length)}</p>
                ${msgs.map(m => `
                    <div class="admin-msg-item">
                        <span class="admin-msg-from">${m.fromNickname}</span>
                        → <span class="admin-msg-to">${m.toNickname}</span>
                        <span style="color:var(--text-light);font-size:11px;">[${m.type === 'private' ? t('chat.private') : t('chat.groupType')}]</span>
                        <br>${m.messageType === 'image' ? '<em>' + t('chat.imageText') + '</em>' : this.escapeHtml(m.content)}
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

    async adminPromoteUser(userId) {
        if (!confirm('确定要将该用户提升为管理员吗？')) return;
        try {
            const data = await this.api(`/api/admin/promote/${userId}`, 'POST');
            this.toast(data.message, 'success');
            this.renderAdminTab('admin-users');
        } catch (e) {
            this.toast(e.message, 'error');
        }
    },

    // 禁言用户 - 显示时长选择弹窗
    adminMuteUser(userId) {
        const body = `
            <div style="display:flex;flex-direction:column;gap:12px;padding:8px 0;">
                <p style="font-size:14px;color:var(--text);margin-bottom:4px;">${t('admin.muteSelect') || '请选择禁言时长：'}</p>
                <button class="mute-option-btn" onclick="App.submitMute('${userId}','1day')" style="padding:14px 16px;border:2px solid var(--border);border-radius:12px;background:#fff;cursor:pointer;font-size:15px;width:100%;text-align:center;transition:all 0.2s;">
                    🕐 ${t('admin.mute1Day') || '1天'}
                </button>
                <button class="mute-option-btn" onclick="App.submitMute('${userId}','7days')" style="padding:14px 16px;border:2px solid var(--border);border-radius:12px;background:#fff;cursor:pointer;font-size:15px;width:100%;text-align:center;transition:all 0.2s;">
                    📅 ${t('admin.mute7Days') || '7天'}
                </button>
                <button class="mute-option-btn" onclick="App.submitMute('${userId}','permanent')" style="padding:14px 16px;border:2px solid var(--danger);border-radius:12px;background:#fff5f5;cursor:pointer;font-size:15px;width:100%;text-align:center;color:var(--danger);font-weight:600;transition:all 0.2s;">
                    🔒 ${t('admin.mutePermanent') || '永久禁言'}
                </button>
            </div>
        `;
        this.showModal('🔇 ' + (t('admin.muteTitle') || '禁言用户'), body, '');
    },

    // 提交禁言
    async submitMute(userId, duration) {
        try {
            const data = await this.api(`/api/admin/mute/${userId}`, 'POST', { duration });
            this.toast(t('admin.muteSuccess') || '禁言成功', 'success');
            this.closeModal();
            this.renderAdminTab('admin-users');
        } catch (e) {
            this.toast(e.message, 'error');
        }
    },

    // 解除禁言
    async adminUnmuteUser(userId) {
        if (!confirm(t('admin.unmuteConfirm') || '确定要解除该用户的禁言吗？')) return;
        try {
            const data = await this.api(`/api/admin/unmute/${userId}`, 'POST');
            this.toast(t('admin.unmuteSuccess') || '已解除禁言', 'success');
            this.renderAdminTab('admin-users');
        } catch (e) {
            this.toast(e.message, 'error');
        }
    },

    async adminResolveFeedback(feedbackId) {
        try {
            const data = await this.api(`/api/admin/feedback/${feedbackId}/resolve`, 'POST');
            this.toast(data.status === 'resolved' ? '已标记为处理完成' : '已重新打开', 'success');
            this.renderAdminTab('admin-feedbacks');
        } catch (e) {
            this.toast(e.message, 'error');
        }
    },

    async adminResolveReport(reportId) {
        try {
            const data = await this.api(`/api/admin/report/${reportId}/resolve`, 'POST');
            this.toast(data.status === 'resolved' ? '已标记为处理完成' : '已重新打开', 'success');
            this.renderAdminTab('admin-reports');
        } catch (e) {
            this.toast(e.message, 'error');
        }
    },

    showLanguageModal() {
        const langs = [
            { code: 'zh-CN', name: '中文', icon: '🇨🇳' },
            { code: 'en', name: 'English', icon: '🇺🇸' },
            { code: 'ja', name: '日本語', icon: '🇯🇵' },
            { code: 'ko', name: '한국어', icon: '🇰🇷' }
        ];
        const current = I18N.lang;
        const body = `
            <div style="display:flex;flex-direction:column;gap:8px;padding:8px 0;">
                ${langs.map(l => `
                    <button class="lang-option ${current === l.code ? 'active' : ''}" onclick="App.changeLanguage('${l.code}')"
                        style="display:flex;align-items:center;gap:12px;padding:12px 16px;border:2px solid ${current === l.code ? 'var(--primary)' : 'var(--border)'};border-radius:10px;background:${current === l.code ? '#f0f4ff' : '#fff'};cursor:pointer;font-size:15px;width:100%;text-align:left;">
                        <span style="font-size:24px;">${l.icon}</span>
                        <span>${l.name}</span>
                        ${current === l.code ? '<span style="margin-left:auto;color:var(--primary);">✓</span>' : ''}
                    </button>
                `).join('')}
            </div>
        `;
        this.showModal('🌐 ' + t('lang.switch'), body, '');
    },

    changeLanguage(lang) {
        I18N.setLang(lang);
        this.closeModal();
        // 刷新所有视图以应用新语言
        this.renderAll();
        if (this.currentView === 'contacts') this.renderContacts();
        else if (this.currentView === 'moments') this.renderMoments();
        else if (this.currentView === 'discover') this.renderDiscover();
        else if (this.currentView === 'admin') this.renderAdmin();
    },

    // ========== 问题反馈 ==========

    showFeedbackModal() {
        const fbPlaceholder = t('feedback.placeholder') || '请详细描述你的问题或建议...';
        const body = `
            <div>
                <p style="font-size:13px;color:var(--text-light);margin-bottom:12px;">
                    ${t('feedback.desc')}
                </p>
                <textarea id="feedback-content" placeholder="${fbPlaceholder}" 
                    style="width:100%;min-height:120px;padding:12px;border:2px solid var(--border);border-radius:var(--radius-sm);font-size:14px;resize:vertical;font-family:inherit;"
                ></textarea>
            </div>
        `;
        const footer = `
            <button class="btn-secondary" onclick="App.closeModal()">${t('feedback.cancel') || '取消'}</button>
            <button class="btn-primary" id="submit-feedback-btn">${t('feedback.submit') || '提交反馈'}</button>
        `;
        this.showModal(t('feedback.title') || '问题反馈', body, footer);

        document.getElementById('submit-feedback-btn').addEventListener('click', async () => {
            const content = document.getElementById('feedback-content').value.trim();
            if (content.length < 2) {
                this.toast(t('toast.feedbackShort'), 'error');
                return;
            }
            try {
                await this.api('/api/feedback', 'POST', { content });
                this.closeModal();
                this.toast(t('toast.feedbackSent'), 'success');
            } catch (e) {
                this.toast(e.message, 'error');
            }
        });
    },

    showFeedbackDot() {
        if (this.user && this.user.role === 'admin') {
            this.toast(t('toast.newFeedback'), 'info');
        }
    },

    // ========== 举报功能 ==========

    showReportModal(targetUserId, targetName) {
        this._reportTargetUserId = targetUserId;
        this._reportImages = [];
        const rptPlaceholder = t('report.placeholder') || '请描述举报原因...';
        const body = `
            <div>
                <p style="font-size:13px;color:var(--text-light);margin-bottom:12px;">
                    ${(t('report.desc') || '举报用户：').replace('{name}', `<strong>${this.escapeHtml(targetName)}</strong>`)}
                </p>
                <textarea id="report-content" placeholder="${rptPlaceholder}" 
                    style="width:100%;min-height:100px;padding:12px;border:2px solid var(--border);border-radius:var(--radius-sm);font-size:14px;resize:vertical;font-family:inherit;"
                ></textarea>
                <div style="margin-top:10px;">
                    <label class="report-image-btn">
                        📷 ${t('report.addImage') || '添加图片'}
                        <input type="file" accept="image/*" id="report-image-input" style="display:none;" onchange="App.handleReportImage()">
                    </label>
                    <span style="font-size:11px;color:var(--text-light);margin-left:8px;">${t('report.maxImages') || '最多3张'}</span>
                </div>
                <div class="report-preview-images" id="report-preview-images"></div>
            </div>
        `;
        const footer = `
            <button class="btn-secondary" onclick="App.closeModal()">${t('report.cancel') || '取消'}</button>
            <button class="btn-primary report-submit-btn" id="submit-report-btn">${t('report.submit') || '提交举报'}</button>
        `;
        this.showModal('⚠️ ' + (t('report.title') || '举报用户'), body, footer);

        document.getElementById('submit-report-btn').addEventListener('click', async () => {
            const content = document.getElementById('report-content').value.trim();
            if (content.length < 2) {
                this.toast(t('report.tooShort') || '举报内容至少2个字符', 'error');
                return;
            }
            try {
                const formData = new FormData();
                formData.append('targetUserId', targetUserId);
                formData.append('content', content);
                this._reportImages.forEach(file => formData.append('images', file));
                await this.apiUpload('/api/report', formData);
                this.closeModal();
                this.toast(t('report.success') || '举报已提交，管理员会尽快处理', 'success');
            } catch (e) {
                this.toast(e.message, 'error');
            }
        });
    },

    handleReportImage() {
        const input = document.getElementById('report-image-input');
        if (!input.files.length) return;
        if (this._reportImages.length >= 3) {
            this.toast(t('report.maxImages') || '最多3张图片', 'error');
            return;
        }
        const file = input.files[0];
        if (file.size > 5 * 1024 * 1024) {
            this.toast(t('toast.imageTooBig') || '图片不能超过5MB', 'error');
            return;
        }
        this._reportImages.push(file);
        this._renderReportPreviews();
        input.value = '';
    },

    _renderReportPreviews() {
        const container = document.getElementById('report-preview-images');
        if (!container) return;
        container.innerHTML = this._reportImages.map((file, i) => `
            <div class="report-preview-item">
                <img src="${URL.createObjectURL(file)}" alt="">
                <button class="report-preview-remove" onclick="App._reportImages.splice(${i},1);App._renderReportPreviews();">✕</button>
            </div>
        `).join('');
    },

    // ========== 未读消息badge ==========

    async updateUnreadBadge() {
        try {
            let total = 0;
            // 优先使用聊天列表缓存的未读数（避免额外N+1查询）
            if (this._chatListCache && Array.isArray(this._chatListCache)) {
                total = this._chatListCache.reduce((sum, item) => sum + (item.unread || 0), 0);
            } else {
                // 缓存不存在时降级使用旧API
                const unread = await this.api('/api/messages/unread');
                Object.values(unread.private || {}).forEach(v => total += v);
                Object.values(unread.group || {}).forEach(v => total += v);
            }

            const badge = document.getElementById('msg-badge');
            if (total > 0) {
                badge.textContent = total > 99 ? '99+' : total;
                badge.classList.remove('hidden');
            } else {
                badge.classList.add('hidden');
            }
            this._updateTitleBadge(total);
        } catch {
            // 静默失败
        }
    },

    _updateTitleBadge(count) {
        if (document.hidden && count > 0) {
            document.title = `(${count}) ${t('app.name') || '飞友之家'}`;
        } else {
            document.title = t('app.name') || '飞友之家';
        }
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
        // 限制最多3个toast，超出移除最早的
        while (container.children.length >= 3) {
            container.firstChild.remove();
        }
        const el = document.createElement('div');
        el.className = `toast ${type}`;
        el.textContent = message;
        container.appendChild(el);
        setTimeout(() => el.remove(), 3000);
    },

    // ========== 签到 ==========

    updatePointsDisplay() {
        const el = document.getElementById('points-value');
        if (el) el.textContent = this.userPoints;
        // Update both checkin buttons
        const btns = ['checkin-btn', 'checkin-mobile-btn'];
        const today = new Date().toDateString();
        btns.forEach(id => {
            const btn = document.getElementById(id);
            if (btn) {
                if (this.currentUser?.lastCheckinDate === today) {
                    btn.textContent = t('checkin.checked');
                    btn.classList.add('checked');
                } else {
                    btn.classList.remove('checked');
                }
            }
        });
    },

    async doCheckin() {
        try {
            const data = await this.api('/api/checkin', 'POST');
            this.userPoints = data.points;
            this.currentUser.points = data.points;
            this.currentUser.lastCheckinDate = new Date().toDateString();
            this.updatePointsDisplay();
            this.toast(data.message, 'success');
        } catch (e) {
            if (e.message.includes('已经签到') || e.message.includes('签过')) {
                this.toast(t('checkin.already'), 'info');
                // Still update button states
                this.currentUser.lastCheckinDate = new Date().toDateString();
                this.updatePointsDisplay();
            } else {
                this.toast(e.message, 'error');
            }
        }
    },

    // ========== 气泡商城 ==========

    async showBubbleShop() {
        try {
            const bubbles = await this.api('/api/bubbles');
            const body = `
                <div class="bubble-shop">
                    <p style="font-size:13px;color:var(--text-light);margin-bottom:12px;">
                        ${t('bubble.shopDesc')}
                    </p>
                    <div class="bubble-grid">
                        ${bubbles.map(b => {
                            const colors = ['#e3f2fd', '#b3e5fc', '#ffccbc', '#1a237e', '#fff8e1'];
                            const iconMap = ['☁️', '✈️', '🌅', '🌟', '🎖️'];
                            const statusHTML = b.equipped ? '<span class="bubble-badge equipped">' + t('bubble.using') + '</span>'
                                : (b.owned && b.isDay) ? '<span class="bubble-badge day">1' + t('bubble.day') + '</span>'
                                : (b.owned && !b.isDay) ? '<span class="bubble-badge owned">' + t('bubble.owned') + '</span>'
                                : '';
                            const dayPrice = Math.max(1, Math.floor(b.price * 0.3));
                            return `
                            <div class="bubble-item ${b.equipped ? 'equipped' : ''} ${b.class}">
                                <div class="bubble-preview" style="background:${colors[b.id]};">
                                    <div class="bubble-preview-icon">${iconMap[b.id]}</div>
                                    <div class="bubble-preview-msg" style="background: linear-gradient(135deg, ${this.getBubbleGradients()[b.id]});">${b.name}</div>
                                    ${b.id === 4 ? '<div class="bubble-crown-badge">🛩️</div>' : ''}
                                </div>
                                <div class="bubble-info">
                                    <div class="bubble-name">${b.name}</div>
                                    <div class="bubble-desc">${b.desc}</div>
                                    <div class="bubble-price-row">
                                        <span class="bubble-price ${b.price === 0 ? 'free' : ''}">${b.price === 0 ? t('bubble.free') : t('bubble.permanent') + ' 🪙' + b.price}</span>
                                        ${b.price > 0 ? `<span class="bubble-price-day">1${t('bubble.day')} 🪙${dayPrice}</span>` : ''}
                                    </div>
                                    ${statusHTML}
                                </div>
                                <div class="bubble-actions">
                                    ${b.equipped ? '<button class="btn-secondary btn-sm" disabled>' + t('bubble.current') + '</button>' :
                                        b.owned ?
                                        '<button class="btn-primary btn-sm" onclick="App.equipBubble(' + b.id + ')">' + t('bubble.equip') + '</button>' :
                                        b.price === 0 ?
                                        '<button class="btn-primary btn-sm" onclick="App.equipBubble(0)">' + t('bubble.use') + '</button>' :
                                        b.canAfford ?
                                        `<div style="display:flex;flex-direction:column;gap:4px;">
                                            <button class="btn-primary btn-sm" onclick="App.purchaseBubble(${b.id},'day')">${t('bubble.dayBtn')}${dayPrice}</button>
                                            <button class="btn-primary btn-sm" onclick="App.purchaseBubble(${b.id},'permanent')">${t('bubble.permBtn')}${b.price}</button>
                                        </div>` :
                                        '<button class="btn-secondary btn-sm" disabled>' + t('bubble.noPoints') + '</button>'
                                    }
                                </div>
                            </div>`;
                        }).join('')}
                    </div>
                </div>
            `;
            this.showModal(t('bubble.shopTitle'), body, '');
        } catch (e) {
            this.toast(e.message, 'error');
        }
    },

    getBubbleGradients() {
        return [
            '#87CEEB, #E0F7FA',            // 0: 晴空万里 - 天蓝到浅蓝
            '#B3E5FC, #81D4FA',            // 1: 云霄巡航 - 淡蓝云层
            '#FF8A65, #FFCC02',            // 2: 落日飞行 - 落日橘到金
            '#1A237E, #4A148C, #0D47A1',   // 3: 星辰航线 - 深邃星空
            '#FFD700, #FF8F00, #FFAB00',   // 4: 王牌机长 - 金翼闪耀
        ];
    },

    async purchaseBubble(bubbleId, duration = 'permanent') {
        try {
            const data = await this.api('/api/bubbles/purchase', 'POST', { bubbleId, duration });
            this.userPoints = data.points;
            this.currentUser.points = data.points;
            this.userBubbleStyle = data.bubbleStyle;
            this.currentUser.bubbleStyle = data.bubbleStyle;
            this.updatePointsDisplay();
            this.closeModal();
            this.toast(data.message, 'success');
        } catch (e) {
            this.toast(e.message, 'error');
        }
    },

    async equipBubble(bubbleId) {
        try {
            const data = await this.api('/api/bubbles/equip', 'PUT', { bubbleId });
            this.userBubbleStyle = data.bubbleStyle;
            this.currentUser.bubbleStyle = data.bubbleStyle;
            this.closeModal();
            this.toast(t('toast.bubbleEquipped'), 'success');
        } catch (e) {
            this.toast(e.message, 'error');
        }
    },

    // ========== 用户主页 ==========

    showMyProfile() {
        this.viewProfile(this.currentUser.id, true);
    },

    async viewProfile(userId, isSelf = false) {
        this.profileUserId = userId;
        try {
            const user = await this.api(`/api/user/${userId}`);

            // Check blocked status
            let blockedData = { blockedUsers: [] };
            try { blockedData = await this.api('/api/blocked'); } catch(e) {}
            const iBlockedThem = blockedData.blockedUsers.includes(userId);

            // Build profile page
            const avatarHTML = user.avatarUrl
                ? `<img src="${user.avatarUrl}" alt="" style="width:100%;height:100%;border-radius:50%;object-fit:cover;">`
                : `<span style="font-size:40px;color:white;">${user.avatarText}</span>`;
            const bgColor = user.avatarUrl ? 'transparent' : user.avatarColor;

            let momentsHTML = '';
            if (user.moments && user.moments.length > 0) {
                momentsHTML = `
                    <div class="profile-section-title">${t('profile.recentMoments')}</div>
                    <div class="profile-moments">
                        ${user.moments.map(m => {
                            let imgsHTML = '';
                            if (m.images && m.images.length > 0) {
                                imgsHTML = `<div class="moment-images">${m.images.map(img => `<img src="${this.escapeAttr(img)}" ${this._ao('previewImage', img)} alt="">`).join('')}</div>`;
                            }
                            return `
                                <div class="moment-card">
                                    <div class="moment-content">${this.escapeHtml(m.content)}</div>
                                    ${imgsHTML}
                                    <div class="moment-time">${this.formatTime(m.createdAt)} · ${m.likes.length}赞 · ${m.comments.length}评论</div>
                                </div>
                            `;
                        }).join('')}
                    </div>
                `;
            } else {
                momentsHTML = `<div class="profile-section-title">${t('profile.recentMoments')}</div><p style="color:var(--text-light);font-size:14px;text-align:center;padding:20px;">${t('profile.noMoments')}</p>`;
            }

            const roleBadge = user.role === 'super_admin' ? 'super_admin' : user.role === 'admin' ? 'admin' : 'user';
            const roleLabels = { super_admin: '👑 ' + (t('admin.superAdmin') || '超级管理员'), admin: '⭐ ' + (t('admin.admin') || '管理员'), user: '' };

            const contentEl = document.getElementById('profile-content');
            const genderLabels = { '': '未设置', 'male': '男', 'female': '女', 'other': '其他' };
            const userGender = genderLabels[user.gender] || '未设置';
            const userBirthday = user.birthday || '';
            const bioHTML = isSelf ? `
                <div class="profile-bio-edit">
                    <div class="profile-bio-text" id="profile-bio-display">${user.bio || t('profile.lazy')}</div>
                    <button class="profile-edit-btn" onclick="App.startEditBio()" title="编辑个性签名">✏️</button>
                </div>
                <div class="profile-edit-form hidden" id="profile-bio-form">
                    <textarea id="profile-bio-input" maxlength="200" placeholder="写一句个性签名...">${user.bio || ''}</textarea>
                    <div style="display:flex;gap:6px;justify-content:center;margin-top:6px;">
                        <button class="btn-primary btn-sm" onclick="App.saveBio()">保存</button>
                        <button class="btn-secondary btn-sm" onclick="App.cancelEditBio()">取消</button>
                    </div>
                </div>
            ` : `<div class="profile-bio">${user.bio || t('profile.lazy')}</div>`;
            const infoHTML = isSelf ? `
                <div class="profile-info-edit">
                    <div class="profile-info-row">
                        <span class="profile-info-label">🎂 生日</span>
                        <span class="profile-info-value" id="profile-birthday-display">${userBirthday || '未设置'}</span>
                        <button class="profile-edit-btn" onclick="App.startEditBirthday()" title="编辑生日">✏️</button>
                    </div>
                    <div class="profile-edit-form hidden" id="profile-birthday-form">
                        <input type="date" id="profile-birthday-input" value="${userBirthday}" max="${new Date().toISOString().split('T')[0]}">
                        <div style="display:flex;gap:6px;justify-content:center;margin-top:6px;">
                            <button class="btn-primary btn-sm" onclick="App.saveBirthday()">保存</button>
                            <button class="btn-secondary btn-sm" onclick="App.cancelEditBirthday()">取消</button>
                        </div>
                    </div>
                    <div class="profile-info-row">
                        <span class="profile-info-label">⚧ 性别</span>
                        <span class="profile-info-value" id="profile-gender-display">${userGender}</span>
                        <button class="profile-edit-btn" onclick="App.startEditGender()" title="编辑性别">✏️</button>
                    </div>
                    <div class="profile-edit-form hidden" id="profile-gender-form">
                        <select id="profile-gender-input">
                            <option value="">未设置</option>
                            <option value="male" ${user.gender === 'male' ? 'selected' : ''}>男</option>
                            <option value="female" ${user.gender === 'female' ? 'selected' : ''}>女</option>
                            <option value="other" ${user.gender === 'other' ? 'selected' : ''}>其他</option>
                        </select>
                        <div style="display:flex;gap:6px;justify-content:center;margin-top:6px;">
                            <button class="btn-primary btn-sm" onclick="App.saveGender()">保存</button>
                            <button class="btn-secondary btn-sm" onclick="App.cancelEditGender()">取消</button>
                        </div>
                    </div>
                </div>
            ` : `
                <div class="profile-info-view">
                    ${userBirthday ? `<div class="profile-info-row"><span class="profile-info-label">🎂 生日</span><span class="profile-info-value">${userBirthday}</span></div>` : ''}
                    ${user.gender ? `<div class="profile-info-row"><span class="profile-info-label">⚧ 性别</span><span class="profile-info-value">${userGender}</span></div>` : ''}
                </div>
            `;
            contentEl.innerHTML = `
                <div class="profile-header-area">
                    <div class="profile-big-avatar" style="background:${bgColor}">${avatarHTML}</div>
                    ${isSelf ? `<div class="avatar-upload-area">
                        <label class="avatar-upload-btn">
                            ${t('profile.changeAvatar')}
                            <input type="file" accept="image/*" id="avatar-file-input" style="display:none;" onchange="App.uploadAvatar()">
                        </label>
                        <span class="avatar-upload-status" id="avatar-upload-status"></span>
                    </div>` : ''}
                    <div class="profile-name">${user.nickname}</div>
                    ${user.role !== 'user' ? `<div class="profile-role-badge ${roleBadge}">${roleLabels[roleBadge]}</div>` : ''}
                    ${bioHTML}
                    ${infoHTML}
                    <div class="profile-stats">
                        <span>@${user.username}</span>
                        <span>${t('profile.joined')} ${new Date(user.createdAt).toLocaleDateString()}</span>
                    </div>
                    <div style="margin-top:12px;display:flex;gap:8px;justify-content:center;flex-wrap:wrap;">
                        ${user.id !== this.currentUser?.id ?
                            iBlockedThem ?
                                `<button class="btn-secondary btn-sm" onclick="App.unblockUser('${this.escapeAttr(user.id)}','${this.escapeAttr(user.nickname)}')" style="background:#43e97b;color:#fff;">✅ 取消拉黑</button>`
                                :
                                `<button class="btn-primary btn-sm" ${this._ao('openChat', 'private', user.id, user.nickname, user.avatarColor, user.avatarText, user.avatarUrl || '')}>💬 私信</button>
                                 <button class="btn-danger btn-sm" onclick="App.blockUser('${this.escapeAttr(user.id)}','${this.escapeAttr(user.nickname)}')" style="background:#ff4757;color:#fff;">🚫 拉黑</button>
                                 <button class="btn-warning btn-sm report-profile-btn" onclick="App.showReportModal('${this.escapeAttr(user.id)}','${this.escapeAttr(user.nickname)}')" style="background:#ff9f43;color:#fff;">⚠️ ${t('report.title') || '举报'}</button>`
                            : ''}
                        ${isSelf && (this.currentUser?.role === 'super_admin' || this.currentUser?.role === 'admin') ?
                            `<button class="btn-primary btn-sm" onclick="App.switchView('admin')" style="background:linear-gradient(135deg,#f5576c,#f093fb);color:#fff;">🛡️ 管理后台</button>`
                            : ''}
                    </div>
                    ${isSelf ? `
                    <div class="profile-quick-actions">
                        <button class="profile-quick-btn" onclick="App.doCheckin()" id="profile-checkin-btn">
                            <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 11l3 3L22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/></svg>
                            <span>${t('nav.checkin')}</span>
                        </button>
                        <button class="profile-quick-btn" onclick="App.showBubbleShop()">
                            <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
                            <span>${t('nav.bubble')}</span>
                        </button>
                        <button class="profile-quick-btn" onclick="App.showDonation()">
                            <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="16"/><line x1="8" y1="12" x2="16" y2="12"/></svg>
                            <span>${t('nav.donate')}</span>
                        </button>
                        <button class="profile-quick-btn" onclick="App.showCreateGroupModal()">
                            <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><line x1="19" y1="8" x2="19" y2="14"/><line x1="22" y1="11" x2="16" y2="11"/></svg>
                            <span>${t('nav.createGroup')}</span>
                        </button>
                        <button class="profile-quick-btn" onclick="App.showLanguageModal()">
                            <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></svg>
                            <span>${t('lang.switch')}</span>
                        </button>
                        <button class="profile-quick-btn" onclick="App.showFeedbackModal()">
                            <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"/></svg>
                            <span>${t('nav.feedback')}</span>
                        </button>
                        <button class="profile-quick-btn" onclick="App.logout()" style="color:#ff4757;">
                            <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>
                            <span>${t('nav.logout')}</span>
                        </button>
                    </div>
                    ` : ''}
                </div>
                ${momentsHTML}
            `;

            // Switch to profile view
            document.querySelectorAll('.view').forEach(v => v.classList.add('hidden'));
            document.getElementById('view-profile').classList.remove('hidden');
            // Update nav active state
            document.querySelectorAll('.nav-item[data-view]').forEach(v => v.classList.remove('active'));
            const profileNav = document.getElementById('nav-profile');
            if (profileNav) profileNav.classList.add('active');

        } catch (e) {
            this.toast('加载用户信息失败: ' + e.message, 'error');
        }
    },

    closeProfile() {
        document.getElementById('view-profile').classList.add('hidden');
        this.switchView('chats');
    },

    // ========== 个人资料编辑 ==========

    startEditBio() {
        document.getElementById('profile-bio-display').parentElement.classList.add('hidden');
        document.getElementById('profile-bio-form').classList.remove('hidden');
        document.getElementById('profile-bio-input').focus();
    },

    cancelEditBio() {
        document.getElementById('profile-bio-form').classList.add('hidden');
        document.getElementById('profile-bio-display').parentElement.classList.remove('hidden');
    },

    async saveBio() {
        const bio = document.getElementById('profile-bio-input').value.trim();
        try {
            const data = await this.api('/api/profile', 'PUT', { bio });
            this.currentUser.bio = bio;
            document.getElementById('profile-bio-display').textContent = bio || t('profile.lazy');
            this.toast('个性签名已更新', 'success');
            this.cancelEditBio();
        } catch (e) {
            this.toast('更新失败: ' + e.message, 'error');
        }
    },

    startEditBirthday() {
        document.getElementById('profile-birthday-display').parentElement.classList.add('hidden');
        document.getElementById('profile-birthday-form').classList.remove('hidden');
    },

    cancelEditBirthday() {
        document.getElementById('profile-birthday-form').classList.add('hidden');
        document.getElementById('profile-birthday-display').parentElement.classList.remove('hidden');
    },

    async saveBirthday() {
        const birthday = document.getElementById('profile-birthday-input').value;
        try {
            const data = await this.api('/api/profile', 'PUT', { birthday });
            this.currentUser.birthday = birthday;
            document.getElementById('profile-birthday-display').textContent = birthday || '未设置';
            this.toast('生日已更新', 'success');
            this.cancelEditBirthday();
        } catch (e) {
            this.toast('更新失败: ' + e.message, 'error');
        }
    },

    startEditGender() {
        document.getElementById('profile-gender-display').parentElement.classList.add('hidden');
        document.getElementById('profile-gender-form').classList.remove('hidden');
    },

    cancelEditGender() {
        document.getElementById('profile-gender-form').classList.add('hidden');
        document.getElementById('profile-gender-display').parentElement.classList.remove('hidden');
    },

    async saveGender() {
        const gender = document.getElementById('profile-gender-input').value;
        const genderLabels = { '': '未设置', 'male': '男', 'female': '女', 'other': '其他' };
        try {
            const data = await this.api('/api/profile', 'PUT', { gender });
            this.currentUser.gender = gender;
            document.getElementById('profile-gender-display').textContent = genderLabels[gender] || '未设置';
            this.toast('性别已更新', 'success');
            this.cancelEditGender();
        } catch (e) {
            this.toast('更新失败: ' + e.message, 'error');
        }
    },

    async blockUser(userId, nickname) {
        if (!confirm(`确定要拉黑 ${nickname} 吗？拉黑后双方将无法互发消息。`)) return;
        try {
            const data = await this.api(`/api/block/${userId}`, 'POST');
            this.toast(data.message, 'success');
            this.viewProfile(userId);
        } catch (e) {
            this.toast(e.message, 'error');
        }
    },

    async unblockUser(userId, nickname) {
        if (!confirm(`确定要取消拉黑 ${nickname} 吗？`)) return;
        try {
            const data = await this.api(`/api/unblock/${userId}`, 'POST');
            this.toast(data.message, 'success');
            this.viewProfile(userId);
        } catch (e) {
            this.toast(e.message, 'error');
        }
    },

    uploadAvatar() {
        const fileInput = document.getElementById('avatar-file-input');
        const file = fileInput.files[0];
        if (!file) return;
        if (file.size > 5 * 1024 * 1024) {
            this.toast(t('toast.avatarTooBig'), 'error');
            return;
        }
        const statusEl = document.getElementById('avatar-upload-status');
        statusEl.textContent = t('toast.avatarUploading');
        const formData = new FormData();
        formData.append('avatar', file);
        this.apiUpload('/api/avatar', formData).then(data => {
            this.currentUser.avatarUrl = data.avatarUrl;
            this.updateNavAvatar();
            this.toast(t('toast.avatarUpdated'), 'success');
            statusEl.textContent = t('toast.avatarSuccess');
            // Reload profile
            this.viewProfile(this.currentUser.id, true);
        }).catch(e => {
            statusEl.textContent = '';
            this.toast('上传失败: ' + e.message, 'error');
        });
    },

    // ========== 打赏 ==========

    async showDonation() {
        document.querySelectorAll('.view').forEach(v => v.classList.add('hidden'));
        document.getElementById('view-donation').classList.remove('hidden');
        document.querySelectorAll('.nav-item[data-view]').forEach(v => v.classList.remove('active'));

        // Show/hide header upload button
        const headerBtn = document.getElementById('donation-upload-btn');
        if (headerBtn) {
            headerBtn.style.display = (this.currentUser?.role === 'super_admin' || this.currentUser?.role === 'admin') ? '' : 'none';
        }

        try {
            const donation = await this.api('/api/donation');
            const contentEl = document.getElementById('donation-content');
            const isAdmin = this.currentUser?.role === 'super_admin' || this.currentUser?.role === 'admin';

            let html = '<div style="text-align:center;padding:20px;">';
            html += '<p style="font-size:14px;color:var(--text-light);margin-bottom:20px;">' + t('donate.intro') + '</p>';

            if (donation.wechat) {
                html += `<div class="donation-qr-section">
                    <div class="donation-qr-label">${t('payment.wechat') || '💚 微信支付'}</div>
                    <img src="${donation.wechat}" class="donation-qr-img" alt="${t('payment.wechatQR') || '微信收款码'}">
                </div>`;
            }
            if (donation.alipay) {
                html += `<div class="donation-qr-section">
                    <div class="donation-qr-label">${t('payment.alipay') || '💙 支付宝'}</div>
                    <img src="${donation.alipay}" class="donation-qr-img" alt="${t('payment.alipayQR') || '支付宝收款码'}">
                </div>`;
            }
            if (!donation.wechat && !donation.alipay) {
                html += '<p style="color:var(--text-light);">' + (t('payment.noQR') || '管理员还没有设置收款码~') + '</p>';
            }

            if (isAdmin) {
                html += `<div style="margin-top:20px;">
                    <button class="btn-primary btn-sm" onclick="App.showDonationAdmin()">📷 ${t('donate.upload')}</button>
                </div>`;
            }

            html += '</div>';
            contentEl.innerHTML = html;
        } catch (e) {
            document.getElementById('donation-content').innerHTML = `<p style="color:red;">${e.message}</p>`;
        }
    },

    showDonationAdmin() {
        const body = `
            <div>
                <p style="font-size:13px;color:var(--text-light);margin-bottom:16px;">
                    ${t('payment.uploadDesc') || '上传微信和支付宝的收款码，其他用户可以在打赏页面看到。'}
                </p>
                <div class="donation-upload-row">
                    <label class="donation-upload-btn">
                        <span>${t('payment.wechatQR') || '💚 微信收款码'}</span>
                        <input type="file" accept="image/*" id="wechat-qr-input" style="display:none;">
                    </label>
                    <span id="wechat-qr-name" style="font-size:12px;color:var(--text-light);"></span>
                </div>
                <div class="donation-upload-row" style="margin-top:12px;">
                    <label class="donation-upload-btn">
                        <span>${t('payment.alipayQR') || '💙 支付宝收款码'}</span>
                        <input type="file" accept="image/*" id="alipay-qr-input" style="display:none;">
                    </label>
                    <span id="alipay-qr-name" style="font-size:12px;color:var(--text-light);"></span>
                </div>
            </div>
        `;
        const footer = `
            <button class="btn-secondary" onclick="App.closeModal()">${t('payment.cancelBtn') || '取消'}</button>
            <button class="btn-primary" id="upload-qr-btn">${t('payment.uploadBtn')}</button>
        `;
        this.showModal(t('payment.uploadTitle') || '上传收款码', body, footer);

        let wechatFile = null, alipayFile = null;

        document.getElementById('wechat-qr-input').addEventListener('change', (e) => {
            wechatFile = e.target.files[0];
            document.getElementById('wechat-qr-name').textContent = wechatFile ? wechatFile.name : '';
        });
        document.getElementById('alipay-qr-input').addEventListener('change', (e) => {
            alipayFile = e.target.files[0];
            document.getElementById('alipay-qr-name').textContent = alipayFile ? alipayFile.name : '';
        });

        document.getElementById('upload-qr-btn').addEventListener('click', async () => {
            if (!wechatFile && !alipayFile) {
                this.toast(t('toast.noQR'), 'error');
                return;
            }
            try {
                const formData = new FormData();
                if (wechatFile) formData.append('wechat', wechatFile);
                if (alipayFile) formData.append('alipay', alipayFile);
                await this.apiUpload('/api/admin/donation', formData);
                this.closeModal();
                this.toast(t('toast.qrUploaded'), 'success');
                this.showDonation();
            } catch (e) {
                this.toast('上传失败: ' + e.message, 'error');
            }
        });
    },

    // ========== 创建群聊 (更新版) ==========

    showCreateGroupModal() {
        const body = `
            <div class="group-form">
                <input type="text" id="group-name" placeholder="${t('group.namePlaceholder') || '群名称'}" style="width:100%;padding:10px;border:2px solid var(--border);border-radius:8px;margin-bottom:10px;">
                <textarea id="group-desc" placeholder="${t('group.descPlaceholder') || '群简介（选填）'}" style="width:100%;padding:10px;border:2px solid var(--border);border-radius:8px;margin-bottom:10px;resize:vertical;min-height:60px;"></textarea>
                <div style="display:flex;gap:10px;margin-bottom:10px;">
                    <label style="display:flex;align-items:center;gap:6px;cursor:pointer;">
                        <input type="radio" name="group-type" value="public" checked onchange="document.getElementById('group-password-section').classList.add('hidden')">
                        <span>${t('group.publicLabel') || '🌐 公开群（所有人可加入）'}</span>
                    </label>
                    <label style="display:flex;align-items:center;gap:6px;cursor:pointer;">
                        <input type="radio" name="group-type" value="private" onchange="document.getElementById('group-password-section').classList.remove('hidden')">
                        <span>${t('group.privateLabel') || '🔒 私密群（需密码加入）'}</span>
                    </label>
                </div>
                <div id="group-password-section" class="hidden" style="margin-bottom:10px;">
                    <input type="text" id="group-password" placeholder="${t('group.passwordPlaceholder') || '入群密码'}" style="width:100%;padding:10px;border:2px solid var(--border);border-radius:8px;">
                    <p style="font-size:11px;color:var(--text-light);margin-top:4px;">${t('group.passwordHint') || '设置密码后，其他用户需要输入密码才能加入'}</p>
                </div>
            </div>
        `;
        const footer = `
            <button class="btn-secondary" onclick="App.closeModal()">${t('group.cancelBtn') || '取消'}</button>
            <button class="btn-primary" id="confirm-group-btn" style="padding:10px 24px;">${t('group.createBtn') || '创建'}</button>
        `;
        this.showModal(t('group.createTitle') || '创建群聊', body, footer);

        document.getElementById('confirm-group-btn').addEventListener('click', async () => {
            const name = document.getElementById('group-name').value.trim();
            const desc = document.getElementById('group-desc').value.trim();
            const type = document.querySelector('input[name="group-type"]:checked').value;
            const password = document.getElementById('group-password').value.trim();

            if (!name) { this.toast('群名称不能为空', 'error'); return; }
            if (type === 'private' && !password) { this.toast('私密群需要设置密码', 'error'); return; }

            try {
                await this.api('/api/groups/create', 'POST', { name, description: desc, type, password });
                this.closeModal();
                this.renderChatList();
                this.renderDiscover();
                this.toast('群聊创建成功！', 'success');
            } catch (e) {
                this.toast(e.message, 'error');
            }
        });
    },

    // 加入群组（更新版，支持密码输入）
    joinGroup(groupId) {
        // First check if group has password
        this.api('/api/groups').then(groups => {
            const group = groups.find(g => g.id === groupId);
            if (group && group.hasPassword && !group.isMember) {
                // Show password modal
                const body = `<div>
                    <p style="font-size:14px;margin-bottom:12px;">「${group.name}」${t('group.privateJoinDesc')}</p>
                    <input type="password" id="join-password" placeholder="${t('group.passwordInput')}" style="width:100%;padding:10px;border:2px solid var(--border);border-radius:8px;">
                </div>`;
                const footer = `
                    <button class="btn-secondary" onclick="App.closeModal()">${t('group.cancelBtn')}</button>
                    <button class="btn-primary" id="join-group-btn">${t('group.joinBtn')}</button>
                `;
                this.showModal(t('group.privateJoinTitle'), body, footer);

                document.getElementById('join-group-btn').addEventListener('click', async () => {
                    const pw = document.getElementById('join-password').value.trim();
                    if (!pw) { this.toast('请输入密码', 'error'); return; }
                    try {
                        await this.api('/api/groups/join', 'POST', { groupId, password: pw });
                        this.closeModal();
                        this.toast(t('group.joined'), 'success');
                        this.renderDiscover();
                        this.renderChatList();
                    } catch (e) {
                        this.toast(e.message, 'error');
                    }
                });
            } else {
                // Public group or already member
                this.api('/api/groups/join', 'POST', { groupId }).then(() => {
                    this.toast('已加入群聊！', 'success');
                    this.renderDiscover();
                    this.renderChatList();
                }).catch(e => this.toast(e.message, 'error'));
            }
        });
    },

    // ========== 工具方法 ==========

    getBubbleClass(styleId) {
        const classes = ['bubble-sky', 'bubble-cloud', 'bubble-sunset', 'bubble-stars', 'bubble-captain'];
        return classes[styleId] || 'bubble-sky';
    },

    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    },

    // 安全转义用于 HTML 属性内的 JS 字符串值（防止 XSS/属性断裂）
    escapeAttr(val) {
        if (val == null) return '';
        return String(val)
            .replace(/\\/g, '\\\\')   // 反斜杠
            .replace(/'/g, "\\'")     // 单引号
            .replace(/"/g, '&quot;');  // 双引号（防止属性值提前闭合）
    },

    // 批量生成安全的 onclick 属性
    _ao(action, ...args) {
        // action = 'openChat' | 'viewProfile' | 'previewImage' | 'showReportModal' | 'showGroupMembers'
        const escaped = args.map(a => `'${this.escapeAttr(a)}'`);
        return `onclick="App.${action}(${escaped.join(',')})"`;
    }
};

// 启动
document.addEventListener('DOMContentLoaded', () => App.init());
