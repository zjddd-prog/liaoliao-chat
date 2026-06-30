// ========== 飞友之家 i18n 多语言引擎 ==========

const I18N = {
    lang: localStorage.getItem('chat_lang') || 'zh-CN',

    // ========== 翻译表 ==========
    messages: {
        // ---- 通用 ----
        'app.title': { 'zh-CN': '飞友之家 - 在线社交聊天', en: 'FlyHome - Social Chat', ja: 'フライホーム - ソーシャルチャット', ko: '플라이홈 - 소셜 채팅' },
        'app.name': { 'zh-CN': '飞友之家', en: 'FlyHome', ja: 'フライホーム', ko: '플라이홈' },
        'app.subtitle': { 'zh-CN': '真正的在线社交聊天平台', en: 'Real-time social chat platform', ja: 'リアルタイムソーシャルチャットプラットフォーム', ko: '실시간 소셜 채팅 플랫폼' },

        // ---- 认证 ----
        'auth.login': { 'zh-CN': '登录', en: 'Login', ja: 'ログイン', ko: '로그인' },
        'auth.register': { 'zh-CN': '注册', en: 'Register', ja: '登録', ko: '회원가입' },
        'auth.username': { 'zh-CN': '用户名', en: 'Username', ja: 'ユーザー名', ko: '사용자 이름' },
        'auth.password': { 'zh-CN': '密码', en: 'Password', ja: 'パスワード', ko: '비밀번호' },
        'auth.nickname': { 'zh-CN': '昵称 (选填)', en: 'Nickname (optional)', ja: 'ニックネーム (任意)', ko: '닉네임 (선택)' },
        'auth.bio': { 'zh-CN': '个性签名 (选填)', en: 'Bio (optional)', ja: '自己紹介 (任意)', ko: '자기소개 (선택)' },
        'auth.usernameHint': { 'zh-CN': '用户名 (2-20字符)', en: 'Username (2-20 chars)', ja: 'ユーザー名 (2-20文字)', ko: '사용자 이름 (2-20자)' },
        'auth.passwordHint': { 'zh-CN': '密码 (至少4位)', en: 'Password (min 4 chars)', ja: 'パスワード (4文字以上)', ko: '비밀번호 (최소 4자)' },
        'auth.noAccount': { 'zh-CN': '新用户？点击上方"注册"创建账号', en: 'New user? Click "Register" above', ja: '新規ユーザー？上の「登録」をクリック', ko: '새 사용자? 위의 "회원가입" 클릭' },
        'auth.hasAccount': { 'zh-CN': '已有账号？点击上方"登录"', en: 'Already have an account? Click "Login"', ja: 'アカウントをお持ちですか？「ログイン」をクリック', ko: '이미 계정이 있나요? "로그인" 클릭' },

        // ---- 导航 ----
        'nav.chats': { 'zh-CN': '消息', en: 'Chats', ja: 'メッセージ', ko: '메시지' },
        'nav.contacts': { 'zh-CN': '通讯录', en: 'Contacts', ja: '連絡先', ko: '연락처' },
        'nav.moments': { 'zh-CN': '动态', en: 'Moments', ja: 'モーメント', ko: '모먼트' },
        'nav.discover': { 'zh-CN': '发现', en: 'Discover', ja: '発見', ko: '발견' },
        'nav.admin': { 'zh-CN': '管理', en: 'Admin', ja: '管理', ko: '관리' },
        'nav.checkin': { 'zh-CN': '签到', en: 'Check-in', ja: 'チェックイン', ko: '출석' },
        'nav.bubble': { 'zh-CN': '气泡', en: 'Bubble', ja: 'バブル', ko: '버블' },
        'nav.donate': { 'zh-CN': '打赏', en: 'Donate', ja: '投げ銭', ko: '후원' },
        'nav.createGroup': { 'zh-CN': '建群', en: 'Group', ja: 'グループ', ko: '그룹' },
        'nav.feedback': { 'zh-CN': '反馈', en: 'Feedback', ja: 'フィードバック', ko: '피드백' },
        'nav.logout': { 'zh-CN': '退出', en: 'Logout', ja: 'ログアウト', ko: '로그아웃' },
        'nav.myProfile': { 'zh-CN': '我的', en: 'Profile', ja: 'プロフィール', ko: '프로필' },

        // ---- 侧边栏 ----
        'sidebar.points': { 'zh-CN': '积分', en: 'Points', ja: 'ポイント', ko: '포인트' },
        'sidebar.myProfile': { 'zh-CN': '我的主页', en: 'My Profile', ja: 'マイプロフィール', ko: '내 프로필' },

        // ---- 搜索 ----
        'search.chats': { 'zh-CN': '搜索聊天...', en: 'Search chats...', ja: 'チャットを検索...', ko: '채팅 검색...' },
        'search.friends': { 'zh-CN': '搜索好友...', en: 'Search friends...', ja: '友達を検索...', ko: '친구 검색...' },

        // ---- 聊天 ----
        'chat.empty': { 'zh-CN': '选择一个聊天开始对话', en: 'Select a chat to start', ja: 'チャットを選択してください', ko: '채팅을 선택하세요' },
        'chat.input': { 'zh-CN': '输入消息...', en: 'Type a message...', ja: 'メッセージを入力...', ko: '메시지 입력...' },
        'chat.emoji': { 'zh-CN': '表情', en: 'Emoji', ja: '絵文字', ko: '이모지' },
        'chat.image': { 'zh-CN': '图片', en: 'Image', ja: '画像', ko: '이미지' },
        'chat.online': { 'zh-CN': '在线', en: 'Online', ja: 'オンライン', ko: '온라인' },
        'chat.offline': { 'zh-CN': '离线', en: 'Offline', ja: 'オフライン', ko: '오프라인' },
        'chat.group': { 'zh-CN': '群聊', en: 'Group', ja: 'グループ', ko: '그룹' },
        'chat.members': { 'zh-CN': '成员列表', en: 'Members', ja: 'メンバー', ko: '멤버' },
        'chat.typing': { 'zh-CN': '正在输入', en: 'typing', ja: '入力中', ko: '입력 중' },
        'chat.imageText': { 'zh-CN': '[图片]', en: '[Image]', ja: '[画像]', ko: '[이미지]' },
        'chat.startChat': { 'zh-CN': '开始聊天吧', en: 'Start chatting', ja: 'チャットを始めましょう', ko: '채팅을 시작하세요' },
        'chat.noChats': { 'zh-CN': '暂无聊天，去发现页添加好友吧！', en: 'No chats yet. Go discover and add friends!', ja: 'チャットがありません。発見ページで友達を追加しましょう！', ko: '채팅이 없습니다. 발견 페이지에서 친구를 추가하세요!' },
        'chat.memberCount': { 'zh-CN': '人', en: '', ja: '人', ko: '명' },

        // ---- 通讯录 ----
        'contacts.title': { 'zh-CN': '通讯录', en: 'Contacts', ja: '連絡先', ko: '연락처' },
        'contacts.empty': { 'zh-CN': '暂无好友，去发现页添加吧！', en: 'No friends yet. Go discover!', ja: '友達がいません。発見ページで追加しましょう！', ko: '친구가 없습니다. 발견 페이지에서 찾아보세요!' },
        'contacts.notFound': { 'zh-CN': '未找到好友', en: 'No friends found', ja: '友達が見つかりません', ko: '친구를 찾을 수 없습니다' },

        // ---- 动态 ----
        'moments.title': { 'zh-CN': '动态广场', en: 'Moments', ja: 'モーメント広場', ko: '모먼트 광장' },
        'moments.post': { 'zh-CN': '+ 发动态', en: '+ Post', ja: '+ 投稿', ko: '+ 글쓰기' },
        'moments.empty': { 'zh-CN': '暂无动态，发布第一条吧！', en: 'No moments yet. Post the first one!', ja: 'モーメントがありません。最初の投稿をしましょう！', ko: '모먼트가 없습니다. 첫 글을 작성하세요!' },
        'moments.publish': { 'zh-CN': '发布动态', en: 'New Moment', ja: 'モーメント投稿', ko: '새 모먼트' },
        'moments.placeholder': { 'zh-CN': '分享你的想法...', en: 'Share your thoughts...', ja: 'あなたの考えをシェア...', ko: '생각을 공유하세요...' },
        'moments.addImage': { 'zh-CN': '添加图片', en: 'Add Image', ja: '画像を追加', ko: '이미지 추가' },
        'moments.cancel': { 'zh-CN': '取消', en: 'Cancel', ja: 'キャンセル', ko: '취소' },
        'moments.submit': { 'zh-CN': '发布', en: 'Post', ja: '投稿', ko: '게시' },
        'moments.like': { 'zh-CN': '点赞', en: 'Like', ja: 'いいね', ko: '좋아요' },
        'moments.comment': { 'zh-CN': '评论', en: 'Comment', ja: 'コメント', ko: '댓글' },
        'moments.delete': { 'zh-CN': '删除', en: 'Delete', ja: '削除', ko: '삭제' },
        'moments.likesCount': { 'zh-CN': '人点赞', en: ' likes', ja: 'いいね', ko: '명 좋아요' },
        'moments.commentPlaceholder': { 'zh-CN': '写评论...', en: 'Write a comment...', ja: 'コメントを書く...', ko: '댓글 작성...' },

        // ---- 发现 ----
        'discover.title': { 'zh-CN': '发现', en: 'Discover', ja: '発見', ko: '발견' },
        'discover.chat': { 'zh-CN': '聊天', en: 'Chat', ja: 'チャット', ko: '채팅' },
        'discover.addFriend': { 'zh-CN': '+ 好友', en: '+ Friend', ja: '+ 友達', ko: '+ 친구' },

        // ---- 管理后台 ----
        'admin.title': { 'zh-CN': '管理后台', en: 'Admin Panel', ja: '管理画面', ko: '관리자 패널' },
        'admin.users': { 'zh-CN': '用户管理', en: 'Users', ja: 'ユーザー管理', ko: '사용자 관리' },
        'admin.chats': { 'zh-CN': '聊天监控', en: 'Chat Monitor', ja: 'チャット監視', ko: '채팅 모니터' },
        'admin.moments': { 'zh-CN': '动态管理', en: 'Moments', ja: 'モーメント管理', ko: '모먼트 관리' },
        'admin.feedbacks': { 'zh-CN': '反馈管理', en: 'Feedbacks', ja: 'フィードバック管理', ko: '피드백 관리' },
        'admin.stats': { 'zh-CN': '数据统计', en: 'Statistics', ja: '統計', ko: '통계' },
        'admin.superAdmin': { 'zh-CN': '超级管理员', en: 'Super Admin', ja: 'スーパー管理者', ko: '최고 관리자' },
        'admin.admin': { 'zh-CN': '管理员', en: 'Admin', ja: '管理者', ko: '관리자' },
        'admin.user': { 'zh-CN': '普通用户', en: 'User', ja: 'ユーザー', ko: '사용자' },
        'admin.banned': { 'zh-CN': '已封禁', en: 'Banned', ja: '停止', ko: '차단됨' },
        'admin.ban': { 'zh-CN': '封禁', en: 'Ban', ja: '停止', ko: '차단' },
        'admin.unban': { 'zh-CN': '解封', en: 'Unban', ja: '停止解除', ko: '차단 해제' },
        'admin.delete': { 'zh-CN': '注销', en: 'Delete', ja: '削除', ko: '삭제' },
        'admin.promote': { 'zh-CN': '提升', en: 'Promote', ja: '昇格', ko: '승급' },
        'admin.setAdmin': { 'zh-CN': '设为管理员', en: 'Set as Admin', ja: '管理者に設定', ko: '관리자로 설정' },
        'admin.viewChat': { 'zh-CN': '查看聊天', en: 'View Chat', ja: 'チャット表示', ko: '채팅 보기' },
        'admin.muteTitle': { 'zh-CN': '禁言用户', en: 'Mute User', ja: 'ミュート', ko: '음소거' },
        'admin.muteSelect': { 'zh-CN': '请选择禁言时长：', en: 'Select mute duration:', ja: 'ミュート期間を選択:', ko: '음소거 기간 선택:' },
        'admin.mute1Day': { 'zh-CN': '1天', en: '1 Day', ja: '1日', ko: '1일' },
        'admin.mute7Days': { 'zh-CN': '7天', en: '7 Days', ja: '7日', ko: '7일' },
        'admin.mutePermanent': { 'zh-CN': '永久禁言', en: 'Permanent', ja: '永久', ko: '영구' },
        'admin.mute': { 'zh-CN': '禁言', en: 'Mute', ja: 'ミュート', ko: '음소거' },
        'admin.unmute': { 'zh-CN': '解除禁言', en: 'Unmute', ja: 'ミュート解除', ko: '음소거 해제' },
        'admin.muteSuccess': { 'zh-CN': '禁言成功', en: 'Muted successfully', ja: 'ミュート完了', ko: '음소거 완료' },
        'admin.unmuteSuccess': { 'zh-CN': '已解除禁言', en: 'Unmuted', ja: 'ミュート解除', ko: '음소거 해제됨' },
        'admin.unmuteConfirm': { 'zh-CN': '确定要解除该用户的禁言吗？', en: 'Unmute this user?', ja: 'ミュートを解除しますか？', ko: '음소거를 해제하시겠습니까?' },
        'admin.muted': { 'zh-CN': '已禁言', en: 'Muted', ja: 'ミュート中', ko: '음소거됨' },

        // ---- 用户主页 ----
        'profile.title': { 'zh-CN': '用户主页', en: 'Profile', ja: 'プロフィール', ko: '프로필' },
        'profile.message': { 'zh-CN': '💬 私信', en: '💬 Message', ja: '💬 メッセージ', ko: '💬 메시지' },
        'profile.block': { 'zh-CN': '🚫 拉黑', en: '🚫 Block', ja: '🚫 ブロック', ko: '🚫 차단' },
        'profile.unblock': { 'zh-CN': '✅ 取消拉黑', en: '✅ Unblock', ja: '✅ ブロック解除', ko: '✅ 차단 해제' },
        'profile.admin': { 'zh-CN': '🛡️ 管理后台', en: '🛡️ Admin', ja: '🛡️ 管理画面', ko: '🛡️ 관리자' },
        'profile.edit': { 'zh-CN': '编辑资料', en: 'Edit Profile', ja: 'プロフィール編集', ko: '프로필 편집' },
        'profile.noMoments': { 'zh-CN': '暂无动态', en: 'No moments yet', ja: 'モーメントがありません', ko: '모먼트 없음' },

        // ---- 气泡商城 ----
        'bubble.title': { 'zh-CN': '气泡商城 ✈️', en: 'Bubble Shop ✈️', ja: 'バブルショップ ✈️', ko: '버블 상점 ✈️' },
        'bubble.desc': { 'zh-CN': '选择你喜欢的气泡样式，用积分兑换后即可使用。', en: 'Choose a bubble style and redeem with points.', ja: 'お気に入りのバブルスタイルを選択し、ポイントで交換できます。', ko: '좋아하는 버블 스타일을 선택하고 포인트로 교환하세요.' },
        'bubble.day': { 'zh-CN': '天', en: 'd', ja: '日', ko: '일' },
        'bubble.permanent': { 'zh-CN': '永久', en: 'Forever', ja: '永久', ko: '영구' },
        'bubble.free': { 'zh-CN': '免费', en: 'Free', ja: '無料', ko: '무료' },
        'bubble.using': { 'zh-CN': '使用中', en: 'In use', ja: '使用中', ko: '사용 중' },
        'bubble.owned': { 'zh-CN': '已拥有', en: 'Owned', ja: '所有済み', ko: '보유 중' },
        'bubble.equip': { 'zh-CN': '装备', en: 'Equip', ja: '装備', ko: '장착' },
        'bubble.redeem': { 'zh-CN': '兑换', en: 'Redeem', ja: '交換', ko: '교환' },
        'bubble.noPoints': { 'zh-CN': '积分不足', en: 'Not enough points', ja: 'ポイント不足', ko: '포인트 부족' },
        'bubble.crown': { 'zh-CN': '王牌', en: 'Ace', ja: 'エース', ko: '에이스' },
        'bubble.sample': { 'zh-CN': '示例消息', en: 'Sample', ja: 'サンプル', ko: '샘플' },
        'bubble.expires': { 'zh-CN': '到期', en: 'Expires', ja: '期限', ko: '만료' },

        // ---- 打赏 ----
        'donate.title': { 'zh-CN': '打赏支持', en: 'Donate', ja: '投げ銭', ko: '후원' },
        'donate.upload': { 'zh-CN': '上传收款码', en: 'Upload QR', ja: 'QRコードアップロード', ko: 'QR 업로드' },
        'donate.intro': { 'zh-CN': '如果觉得飞友之家不错，欢迎请开发者喝杯咖啡 ☕', en: 'If you like FlyHome, buy the dev a coffee ☕', ja: 'フライホームが気に入ったら、開発者にコーヒーを ☕', ko: '플라이홈이 마음에 드시면 개발자에게 커피 한잔 ☕' },
        'donate.empty': { 'zh-CN': '管理员还未上传收款码', en: 'Admin has not uploaded QR code yet', ja: '管理者がまだQRコードをアップロードしていません', ko: '관리자가 아직 QR 코드를 업로드하지 않았습니다' },

        // ---- 建群 ----
        'group.create': { 'zh-CN': '创建群聊', en: 'Create Group', ja: 'グループ作成', ko: '그룹 만들기' },
        'group.name': { 'zh-CN': '群名称', en: 'Group Name', ja: 'グループ名', ko: '그룹 이름' },
        'group.desc': { 'zh-CN': '群简介 (选填)', en: 'Description (optional)', ja: '説明 (任意)', ko: '설명 (선택)' },
        'group.public': { 'zh-CN': '公开群', en: 'Public', ja: '公開', ko: '공개' },
        'group.private': { 'zh-CN': '私密群', en: 'Private', ja: '非公開', ko: '비공개' },
        'group.password': { 'zh-CN': '入群密码 (私密群必填)', en: 'Join password (required for private)', ja: '参加パスワード (非公開の場合必須)', ko: '참여 비밀번호 (비공개 필수)' },
        'group.createBtn': { 'zh-CN': '创建', en: 'Create', ja: '作成', ko: '만들기' },
        'group.join': { 'zh-CN': '加入群聊', en: 'Join Group', ja: 'グループ参加', ko: '그룹 참여' },

        // ---- 反馈 ----
        'feedback.title': { 'zh-CN': '问题反馈', en: 'Feedback', ja: 'フィードバック', ko: '피드백' },
        'feedback.placeholder': { 'zh-CN': '请描述你的问题或建议...', en: 'Describe your issue or suggestion...', ja: '問題や提案を記述してください...', ko: '문제나 제안을 설명하세요...' },
        'feedback.submit': { 'zh-CN': '提交反馈', en: 'Submit', ja: '送信', ko: '제출' },

        // ---- Toast ----
        'toast.loginSuccess': { 'zh-CN': '登录成功！', en: 'Login successful!', ja: 'ログイン成功！', ko: '로그인 성공!' },
        'toast.registerSuccess': { 'zh-CN': '注册成功，欢迎来到飞友之家！', en: 'Welcome to FlyHome!', ja: 'フライホームへようこそ！', ko: '플라이홈에 오신 것을 환영합니다!' },
        'toast.loggedOut': { 'zh-CN': '已退出登录', en: 'Logged out', ja: 'ログアウトしました', ko: '로그아웃됨' },
        'toast.fillFields': { 'zh-CN': '请填写用户名和密码', en: 'Please enter username and password', ja: 'ユーザー名とパスワードを入力してください', ko: '사용자 이름과 비밀번호를 입력하세요' },
        'toast.imageTooBig': { 'zh-CN': '图片不能超过3MB', en: 'Image cannot exceed 3MB', ja: '画像は3MBを超えることはできません', ko: '이미지는 3MB를 초과할 수 없습니다' },
        'toast.imageSendFail': { 'zh-CN': '图片发送失败: ', en: 'Image send failed: ', ja: '画像送信失敗: ', ko: '이미지 전송 실패: ' },
        'toast.imageUploadFail': { 'zh-CN': '图片上传失败', en: 'Image upload failed', ja: '画像アップロード失敗', ko: '이미지 업로드 실패' },
        'toast.max9Images': { 'zh-CN': '最多9张图片', en: 'Max 9 images', ja: '最大9枚まで', ko: '최대 9개 이미지' },
        'toast.checkinSuccess': { 'zh-CN': '签到成功！+10 积分', en: 'Check-in success! +10 points', ja: 'チェックイン成功！+10ポイント', ko: '출석 성공! +10 포인트' },
        'toast.alreadyCheckedIn': { 'zh-CN': '今天已经签到过了', en: 'Already checked in today', ja: '今日はすでにチェックイン済みです', ko: '오늘 이미 출석했습니다' },
        'toast.blockSuccess': { 'zh-CN': '已拉黑该用户', en: 'User blocked', ja: 'ユーザーをブロックしました', ko: '사용자를 차단했습니다' },
        'toast.unblockSuccess': { 'zh-CN': '已取消拉黑', en: 'User unblocked', ja: 'ブロックを解除しました', ko: '차단이 해제되었습니다' },
        'toast.friendAdded': { 'zh-CN': '已添加好友', en: 'Friend added', ja: '友達を追加しました', ko: '친구 추가됨' },
        'toast.friendRemoved': { 'zh-CN': '已删除好友', en: 'Friend removed', ja: '友達を削除しました', ko: '친구 삭제됨' },

        // ---- 语言切换 ----
        'lang.switch': { 'zh-CN': '语言', en: 'Language', ja: '言語', ko: '언어' },
        'lang.zhCN': { 'zh-CN': '中文', en: '中文', ja: '中文', ko: '中文' },
        'lang.en': { 'zh-CN': 'English', en: 'English', ja: 'English', ko: 'English' },
        'lang.ja': { 'zh-CN': '日本語', en: '日本語', ja: '日本語', ko: '日本語' },
        'lang.ko': { 'zh-CN': '한국어', en: '한국어', ja: '한국어', ko: '한국어' },

        // ---- 设置 ----
        'settings.title': { 'zh-CN': '个人设置', en: 'Settings', ja: '設定', ko: '설정' },
        'settings.changeNickname': { 'zh-CN': '修改昵称', en: 'Change Nickname', ja: 'ニックネーム変更', ko: '닉네임 변경' },
        'settings.changeBio': { 'zh-CN': '修改签名', en: 'Change Bio', ja: '自己紹介変更', ko: '자기소개 변경' },
        'settings.changePassword': { 'zh-CN': '修改密码', en: 'Change Password', ja: 'パスワード変更', ko: '비밀번호 변경' },
        'settings.language': { 'zh-CN': '切换语言', en: 'Language', ja: '言語切替', ko: '언어 전환' },
        'settings.save': { 'zh-CN': '保存', en: 'Save', ja: '保存', ko: '저장' },

        // ---- 私信按钮（发现页） ----
        'discover.profile': { 'zh-CN': '查看主页', en: 'View Profile', ja: 'プロフィール', ko: '프로필 보기' },
        'discover.hotGroups': { 'zh-CN': '热门群聊', en: 'Hot Groups', ja: '人気グループ', ko: '인기 그룹' },
        'discover.myFriends': { 'zh-CN': '我的好友', en: 'My Friends', ja: '友達', ko: '내 친구' },
        'discover.recommendUsers': { 'zh-CN': '推荐用户', en: 'Recommended', ja: 'おすすめ', ko: '추천 사용자' },
        'discover.publicGroup': { 'zh-CN': '公开', en: 'Public', ja: '公開', ko: '공개' },
        'discover.privateGroup': { 'zh-CN': '私密', en: 'Private', ja: '非公開', ko: '비공개' },
        'discover.noBio': { 'zh-CN': '暂无简介', en: 'No bio', ja: '紹介なし', ko: '소개 없음' },

        // ---- Admin ----
        'admin.superAdmin': { 'zh-CN': '超级管理员', en: 'Super Admin', ja: 'スーパー管理者', ko: '최고 관리자' },
        'admin.admin': { 'zh-CN': '管理员', en: 'Admin', ja: '管理者', ko: '관리자' },
        'admin.user': { 'zh-CN': '普通用户', en: 'User', ja: '一般ユーザー', ko: '일반 사용자' },
        'admin.banned': { 'zh-CN': '已封禁', en: 'Banned', ja: '禁止済み', ko: '차단됨' },
        'admin.ban': { 'zh-CN': '封禁', en: 'Ban', ja: '禁止', ko: '차단' },
        'admin.unban': { 'zh-CN': '解封', en: 'Unban', ja: '解除', ko: '차단 해제' },
        'admin.delete': { 'zh-CN': '注销', en: 'Delete', ja: '削除', ko: '삭제' },
        'admin.promote': { 'zh-CN': '提升为管理员', en: 'Promote to Admin', ja: '管理者に昇格', ko: '관리자로 승격' },
        'admin.setAdmin': { 'zh-CN': '设为管理员', en: 'Set as Admin', ja: '管理者に設定', ko: '관리자로 설정' },
        'admin.viewChat': { 'zh-CN': '查看聊天', en: 'View Chat', ja: 'チャットを見る', ko: '채팅 보기' },
        'admin.confirmDeleteMoment': { 'zh-CN': '确定删除这条动态吗？', en: 'Delete this moment?', ja: 'このモーメントを削除しますか？', ko: '이 모먼트를 삭제하시겠습니까?' },
        'admin.selectUser': { 'zh-CN': '选择一个用户查看其聊天记录：', en: 'Select a user to view their chat history:', ja: 'チャット履歴を表示するユーザーを選択：', ko: '채팅 기록을 볼 사용자를 선택하세요:' },
        'admin.backToList': { 'zh-CN': '← 返回用户列表', en: '← Back to list', ja: '← リストに戻る', ko: '← 목록으로 돌아가기' },
        'admin.msgCount': { 'zh-CN': '共 {count} 条消息记录', en: '{count} messages', ja: '{count}件のメッセージ', ko: '총 {count}개의 메시지' },
        'admin.pending': { 'zh-CN': '待处理', en: 'Pending', ja: '未処理', ko: '대기 중' },
        'admin.resolved': { 'zh-CN': '已处理', en: 'Resolved', ja: '処理済み', ko: '처리 완료' },
        'admin.markResolved': { 'zh-CN': '标记已处理', en: 'Mark Resolved', ja: '処理済みにする', ko: '처리 완료로 표시' },
        'admin.reopen': { 'zh-CN': '重新打开', en: 'Reopen', ja: '再開', ko: '다시 열기' },
        'admin.noFeedbacks': { 'zh-CN': '暂无反馈', en: 'No feedbacks', ja: 'フィードバックなし', ko: '피드백 없음' },
        'admin.totalUsers': { 'zh-CN': '总用户', en: 'Total Users', ja: '総ユーザー', ko: '총 사용자' },
        'admin.onlineUsers': { 'zh-CN': '在线用户', en: 'Online Users', ja: 'オンライン', ko: '온라인 사용자' },
        'admin.bannedUsers': { 'zh-CN': '封禁用户', en: 'Banned Users', ja: '禁止ユーザー', ko: '차단된 사용자' },
        'admin.totalMessages': { 'zh-CN': '总消息', en: 'Total Messages', ja: '総メッセージ', ko: '총 메시지' },
        'admin.todayMessages': { 'zh-CN': '今日消息', en: 'Today Messages', ja: '今日のメッセージ', ko: '오늘 메시지' },
        'admin.totalGroups': { 'zh-CN': '群聊数', en: 'Groups', ja: 'グループ数', ko: '그룹 수' },
        'admin.totalMoments': { 'zh-CN': '动态数', en: 'Moments', ja: 'モーメント数', ko: '모먼트 수' },
        'admin.todayMoments': { 'zh-CN': '今日动态', en: 'Today Moments', ja: '今日のモーメント', ko: '오늘 모먼트' },
        'admin.totalFriendships': { 'zh-CN': '好友关系', en: 'Friendships', ja: '友達関係', ko: '친구 관계' },
        'admin.reports': { 'zh-CN': '举报管理', en: 'Reports', ja: '通報管理', ko: '신고 관리' },
        'admin.noReports': { 'zh-CN': '暂无举报', en: 'No reports', ja: '通報なし', ko: '신고 없음' },

        // ---- Toast 附加 ----
        'toast.momentPostSuccess': { 'zh-CN': '动态发布成功！', en: 'Moment posted!', ja: '投稿成功！', ko: '모먼트 게시 성공!' },
        'toast.momentPostFail': { 'zh-CN': '发布失败: ', en: 'Post failed: ', ja: '投稿失敗: ', ko: '게시 실패: ' },
        'toast.commentEmpty': { 'zh-CN': '评论不能为空', en: 'Comment cannot be empty', ja: 'コメントを入力してください', ko: '댓글을 입력하세요' },
        'toast.commentSuccess': { 'zh-CN': '评论成功！', en: 'Commented!', ja: 'コメント成功！', ko: '댓글 성공!' },
        'toast.momentDeleted': { 'zh-CN': '动态已删除', en: 'Moment deleted', ja: 'モーメント削除', ko: '모먼트 삭제됨' },
        'toast.feedbackShort': { 'zh-CN': '反馈内容至少2个字符', en: 'Feedback must be at least 2 chars', ja: '2文字以上入力してください', ko: '2자 이상 입력하세요' },
        'toast.feedbackSent': { 'zh-CN': '反馈已提交，感谢你的意见！', en: 'Feedback submitted, thanks!', ja: 'フィードバック送信、ありがとう！', ko: '피드백 제출됨, 감사합니다!' },
        'toast.newFeedback': { 'zh-CN': '收到新的用户反馈', en: 'New feedback received', ja: '新しいフィードバック', ko: '새 피드백 도착' },
        'toast.bubbleEquipped': { 'zh-CN': '气泡已装备！', en: 'Bubble equipped!', ja: 'バブル装備！', ko: '버블 장착!' },
        'toast.avatarUpdated': { 'zh-CN': '头像已更新！', en: 'Avatar updated!', ja: 'アバター更新！', ko: '아바타 업데이트!' },
        'toast.avatarTooBig': { 'zh-CN': '图片不能超过5MB', en: 'Image cannot exceed 5MB', ja: '画像は5MBを超えることはできません', ko: '이미지는 5MB를 초과할 수 없습니다' },
        'toast.avatarUploading': { 'zh-CN': '上传中...', en: 'Uploading...', ja: 'アップロード中...', ko: '업로드 중...' },
        'toast.avatarSuccess': { 'zh-CN': '上传成功！', en: 'Upload successful!', ja: 'アップロード成功！', ko: '업로드 성공!' },
        'toast.qrUploaded': { 'zh-CN': '收款码上传成功！', en: 'QR code uploaded!', ja: 'QRコードアップロード成功！', ko: 'QR 코드 업로드 성공!' },
        'toast.noQR': { 'zh-CN': '请至少选择一张收款码', en: 'Please select at least one QR code', ja: '少なくとも1つのQRコードを選択', ko: '최소 하나의 QR 코드를 선택하세요' },
        'toast.profileLoadFail': { 'zh-CN': '加载用户信息失败: ', en: 'Failed to load profile: ', ja: 'プロフィール読み込み失敗: ', ko: '프로필 로드 실패: ' },

        // ---- 群组额外 ----
        'group.noDesc': { 'zh-CN': '暂无简介', en: 'No description', ja: '説明なし', ko: '설명 없음' },
        'group.members': { 'zh-CN': '群成员', en: 'Members', ja: 'メンバー', ko: '그룹 멤버' },

        // ---- 签到 ----
        'checkin.checked': { 'zh-CN': '已签', en: 'Done', ja: '済', ko: '완료' },
        'checkin.already': { 'zh-CN': '今天已经签过到啦！明天再来吧~', en: 'Already checked in today! Come back tomorrow~', ja: '今日はすでにチェックイン済み！また明日〜', ko: '오늘 이미 출석했습니다! 내일 다시 오세요~' },

        // ---- 其他 ----
        'moments.empty2': { 'zh-CN': '说点什么吧！', en: 'Say something!', ja: '何か書いてください！', ko: '무언가 작성하세요!' },
        'chat.unknown': { 'zh-CN': '未知', en: 'Unknown', ja: '不明', ko: '알 수 없음' },
        'profile.lazy': { 'zh-CN': '这个人很懒，什么都没写...', en: 'This user is lazy, nothing here...', ja: 'このユーザーは何も書いていません...', ko: '이 사용자는 아무것도 작성하지 않았습니다...' },
        'profile.joined': { 'zh-CN': '加入于', en: 'Joined', ja: '参加日', ko: '가입일' },
        'profile.recentMoments': { 'zh-CN': '📝 近期动态', en: '📝 Recent Moments', ja: '📝 最近のモーメント', ko: '📝 최근 모먼트' },
        'profile.noMoments': { 'zh-CN': '暂无动态', en: 'No moments yet', ja: 'モーメントなし', ko: '모먼트 없음' },
        'profile.changeAvatar': { 'zh-CN': '📷 更换头像', en: '📷 Change Avatar', ja: '📷 アバター変更', ko: '📷 아바타 변경' },
        'payment.wechat': { 'zh-CN': '💚 微信支付', en: '💚 WeChat Pay', ja: '💚 WeChat Pay', ko: '💚 위챗 페이' },
        'payment.alipay': { 'zh-CN': '💙 支付宝', en: '💙 Alipay', ja: '💙 Alipay', ko: '💙 알리페이' },
        'payment.noQR': { 'zh-CN': '管理员还没有设置收款码~', en: 'Admin has not set up payment QR codes yet~', ja: '管理者がまだQRコードを設定していません〜', ko: '관리자가 아직 결제 QR 코드를 설정하지 않았습니다~' },
        'payment.uploadTitle': { 'zh-CN': '上传收款码', en: 'Upload Payment QR', ja: 'QRコードアップロード', ko: '결제 QR 업로드' },
        'payment.wechatQR': { 'zh-CN': '💚 微信收款码', en: '💚 WeChat QR', ja: '💚 WeChat QR', ko: '💚 위챗 QR' },
        'payment.alipayQR': { 'zh-CN': '💙 支付宝收款码', en: '💙 Alipay QR', ja: '💙 Alipay QR', ko: '💙 알리페이 QR' },
        'payment.uploadBtn': { 'zh-CN': '上传', en: 'Upload', ja: 'アップロード', ko: '업로드' },
        'payment.uploadDesc': { 'zh-CN': '上传微信和支付宝的收款码，其他用户可以在打赏页面看到。', en: 'Upload payment QR codes for WeChat and Alipay.', ja: 'WeChatとAlipayのQRコードをアップロード。', ko: '위챗과 알리페이 결제 QR 코드를 업로드하세요.' },
        'feedback.desc': { 'zh-CN': '遇到问题或有建议？请告诉我们，管理员会尽快处理。', en: 'Found a bug or have a suggestion? Let us know!', ja: '問題や提案があればお知らせください。', ko: '문제나 제안이 있으면 알려주세요.' },
        'feedback.placeholder': { 'zh-CN': '请详细描述你的问题或建议...', en: 'Describe your issue or suggestion in detail...', ja: '問題や提案を詳しく記述してください...', ko: '문제나 제안을 자세히 설명하세요...' },
        'feedback.title': { 'zh-CN': '问题反馈', en: 'Feedback', ja: 'フィードバック', ko: '피드백' },
        'feedback.submit': { 'zh-CN': '提交反馈', en: 'Submit Feedback', ja: 'フィードバック送信', ko: '피드백 제출' },
        'feedback.cancel': { 'zh-CN': '取消', en: 'Cancel', ja: 'キャンセル', ko: '취소' },

        // ---- 举报 ----
        'report.title': { 'zh-CN': '举报用户', en: 'Report User', ja: 'ユーザーを通報', ko: '사용자 신고' },
        'report.desc': { 'zh-CN': '举报用户：{name}', en: 'Report user: {name}', ja: 'ユーザーを通報: {name}', ko: '사용자 신고: {name}' },
        'report.placeholder': { 'zh-CN': '请详细描述举报原因...', en: 'Describe the reason for this report...', ja: '通報理由を詳しく記述してください...', ko: '신고 사유를 자세히 설명하세요...' },
        'report.submit': { 'zh-CN': '提交举报', en: 'Submit Report', ja: '通報を送信', ko: '신고 제출' },
        'report.cancel': { 'zh-CN': '取消', en: 'Cancel', ja: 'キャンセル', ko: '취소' },
        'report.addImage': { 'zh-CN': '添加图片', en: 'Add Image', ja: '画像を追加', ko: '이미지 추가' },
        'report.maxImages': { 'zh-CN': '最多3张', en: 'Max 3 images', ja: '最大3枚まで', ko: '최대 3개' },
        'report.tooShort': { 'zh-CN': '举报内容至少2个字符', en: 'Report must be at least 2 chars', ja: '2文字以上入力してください', ko: '2자 이상 입력하세요' },
        'report.success': { 'zh-CN': '举报已提交，管理员会尽快处理', en: 'Report submitted, admin will review soon', ja: '通報が送信されました。管理者が確認します', ko: '신고가 제출되었습니다. 관리자가 검토할 예정입니다' },
        'report.newReportToast': { 'zh-CN': '收到新举报，请查看举报管理', en: 'New report received', ja: '新しい通報があります', ko: '새 신고가 도착했습니다' },
        'group.createTitle': { 'zh-CN': '创建群聊', en: 'Create Group', ja: 'グループ作成', ko: '그룹 만들기' },
        'group.namePlaceholder': { 'zh-CN': '群名称', en: 'Group Name', ja: 'グループ名', ko: '그룹 이름' },
        'group.descPlaceholder': { 'zh-CN': '群简介（选填）', en: 'Description (optional)', ja: '説明（任意）', ko: '설명（선택）' },
        'group.publicLabel': { 'zh-CN': '🌐 公开群（所有人可加入）', en: '🌐 Public (anyone can join)', ja: '🌐 公開（誰でも参加可能）', ko: '🌐 공개（누구나 참여 가능）' },
        'group.privateLabel': { 'zh-CN': '🔒 私密群（需密码加入）', en: '🔒 Private (password required)', ja: '🔒 非公開（パスワード必要）', ko: '🔒 비공개（비밀번호 필요）' },
        'group.passwordPlaceholder': { 'zh-CN': '入群密码', en: 'Join Password', ja: '参加パスワード', ko: '참여 비밀번호' },
        'group.createBtn': { 'zh-CN': '创建群聊', en: 'Create Group', ja: 'グループ作成', ko: '그룹 만들기' },
        'group.cancelBtn': { 'zh-CN': '取消', en: 'Cancel', ja: 'キャンセル', ko: '취소' },
        'group.nameRequired': { 'zh-CN': '请输入群名称', en: 'Please enter group name', ja: 'グループ名を入力してください', ko: '그룹 이름을 입력하세요' },
        'group.passwordRequired': { 'zh-CN': '私密群需要设置入群密码', en: 'Private group requires a password', ja: '非公開グループにはパスワードが必要です', ko: '비공개 그룹은 비밀번호가 필요합니다' },
        'group.created': { 'zh-CN': '群聊创建成功！', en: 'Group created!', ja: 'グループ作成成功！', ko: '그룹 생성 성공!' },
        'group.createFail': { 'zh-CN': '创建失败: ', en: 'Create failed: ', ja: '作成失敗: ', ko: '생성 실패: ' },
        'group.joinFail': { 'zh-CN': '加入失败: ', en: 'Join failed: ', ja: '参加失敗: ', ko: '참여 실패: ' },
        'group.passwordPrompt': { 'zh-CN': '请输入入群密码：', en: 'Enter group password:', ja: '参加パスワードを入力：', ko: '그룹 비밀번호 입력:' },
        'bubble.shopTitle': { 'zh-CN': '气泡商城 ✈️', en: 'Bubble Shop ✈️', ja: 'バブルショップ ✈️', ko: '버블 상점 ✈️' },
        'bubble.shopDesc': { 'zh-CN': '飞友专属航空主题气泡，积分兑换即可使用。', en: 'Aviation-themed bubbles. Redeem with points.', ja: '航空テーマのバブル。ポイントで交換。', ko: '항공 테마 버블. 포인트로 교환하세요.' },
        'bubble.current': { 'zh-CN': '当前气泡', en: 'Current', ja: '現在', ko: '현재' },
        'bubble.use': { 'zh-CN': '使用', en: 'Use', ja: '使用', ko: '사용' },
        'bubble.dayBtn': { 'zh-CN': '1天 🪙', en: '1d 🪙', ja: '1日 🪙', ko: '1일 🪙' },
        'bubble.permBtn': { 'zh-CN': '永久 🪙', en: 'Forever 🪙', ja: '永久 🪙', ko: '영구 🪙' },

        // ---- 附加 ----
        'payment.cancelBtn': { 'zh-CN': '取消', en: 'Cancel', ja: 'キャンセル', ko: '취소' },
        'group.passwordHint': { 'zh-CN': '设置密码后，其他用户需要输入密码才能加入', en: 'Users need password to join', ja: 'パスワード設定後、他のユーザーはパスワードが必要です', ko: '비밀번호 설정 후 다른 사용자가 비밀번호를 입력해야 참여 가능' },
        'group.nameRequired': { 'zh-CN': '群名称不能为空', en: 'Group name is required', ja: 'グループ名を入力してください', ko: '그룹 이름은 필수입니다' },
        'group.privateNeedPassword': { 'zh-CN': '私密群需要设置密码', en: 'Private group needs password', ja: '非公開グループにはパスワードが必要です', ko: '비공개 그룹은 비밀번호가 필요합니다' },
        'group.joined': { 'zh-CN': '已加入群聊！', en: 'Joined group!', ja: 'グループに参加しました！', ko: '그룹에 참여했습니다!' },
        'group.privateJoinTitle': { 'zh-CN': '加入私密群组', en: 'Join Private Group', ja: '非公開グループに参加', ko: '비공개 그룹 참여' },
        'group.privateJoinDesc': { 'zh-CN': '是私密群组，需要输入密码才能加入：', en: ' is a private group. Enter password to join:', ja: 'は非公開グループです。参加するにはパスワードを入力：', ko: '은(는) 비공개 그룹입니다. 비밀번호를 입력하세요:' },
        'group.passwordInput': { 'zh-CN': '请输入密码', en: 'Please enter password', ja: 'パスワードを入力してください', ko: '비밀번호를 입력하세요' },
        'group.joinBtn': { 'zh-CN': '加入', en: 'Join', ja: '参加', ko: '참여' },
        'group.cancelBtn': { 'zh-CN': '取消', en: 'Cancel', ja: 'キャンセル', ko: '취소' },
        'chat.private': { 'zh-CN': '私聊', en: 'PM', ja: 'DM', ko: '개인' },
        'chat.groupType': { 'zh-CN': '群聊', en: 'Group', ja: 'グループ', ko: '그룹' },
        'chat.disconnected': { 'zh-CN': '连接已断开，正在重新连接...', en: 'Disconnected. Reconnecting...', ja: '接続が切れました。再接続中...', ko: '연결이 끊어졌습니다. 재연결 중...' },
        'chat.reconnecting': { 'zh-CN': '重新连接中...', en: 'Reconnecting...', ja: '再接続中...', ko: '재연결 중...' },
        'chat.connectionFailed': { 'zh-CN': '连接失败，请检查网络', en: 'Connection failed. Check network.', ja: '接続失敗。ネットワークを確認してください。', ko: '연결 실패. 네트워크를 확인하세요.' },

        // ---- 时间 ----
        'time.justNow': { 'zh-CN': '刚刚', en: 'Just now', ja: 'たった今', ko: '방금' },
        'time.minAgo': { 'zh-CN': '分钟前', en: 'm ago', ja: '分前', ko: '분 전' },
        'time.hourAgo': { 'zh-CN': '小时前', en: 'h ago', ja: '時間前', ko: '시간 전' },

        // ---- 空状态提示 ----
        'contacts.emptyHint': { 'zh-CN': '添加好友后，这里会显示你的通讯录', en: 'Your contacts will appear here after adding friends', ja: '友達を追加すると、ここに連絡先が表示されます', ko: '친구를 추가하면 여기에 연락처가 표시됩니다' },
        'moments.emptyHint': { 'zh-CN': '发布你的第一条动态吧', en: 'Share your first moment', ja: '最初の投稿を共有しましょう', ko: '첫 번째 순간을 공유하세요' },
        'chat.placeholder': { 'zh-CN': '输入消息...', en: 'Type a message...', ja: 'メッセージを入力...', ko: '메시지 입력...' },
        'error.muted': { 'zh-CN': '你已被禁言，无法发送消息', en: 'You have been muted and cannot send messages', ja: 'ミュートされており、メッセージを送信できません', ko: '음소거되어 메시지를 보낼 수 없습니다' },
        'error.noChatSelected': { 'zh-CN': '请先选择一个聊天', en: 'Please select a chat first', ja: 'まずチャットを選択してください', ko: '먼저 채팅을 선택하세요' },
        'error.disconnected': { 'zh-CN': '连接已断开，正在重连...', en: 'Connection lost, reconnecting...', ja: '接続が切断されました、再接続中...', ko: '연결이 끊어졌습니다, 다시 연결 중...' },
    },

    // ========== 获取翻译 ==========
    t(key) {
        const msg = this.messages[key];
        if (!msg) {
            console.warn(`[i18n] Missing key: ${key}`);
            return key;
        }
        return msg[this.lang] || msg['zh-CN'] || key;
    },

    // ========== 切换语言 ==========
    setLang(lang) {
        this.lang = lang;
        localStorage.setItem('chat_lang', lang);
        document.documentElement.lang = lang;
        this.applyToPage();
        // 通知主应用刷新
        if (typeof App !== 'undefined' && App.renderAll) {
            App.renderAll();
        }
    },

    // ========== 应用到页面 ==========
    applyToPage() {
        // 更新 data-i18n 元素
        document.querySelectorAll('[data-i18n]').forEach(el => {
            const key = el.getAttribute('data-i18n');
            const text = this.t(key);
            if (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA') {
                el.placeholder = text;
            } else {
                el.textContent = text;
            }
        });

        // 更新 data-i18n-placeholder
        document.querySelectorAll('[data-i18n-placeholder]').forEach(el => {
            el.placeholder = this.t(el.getAttribute('data-i18n-placeholder'));
        });

        // 更新 data-i18n-title
        document.querySelectorAll('[data-i18n-title]').forEach(el => {
            el.title = this.t(el.getAttribute('data-i18n-title'));
        });

        // 更新 document.title
        document.title = this.t('app.title');
    }
};

// 全局快捷函数
function t(key) { return I18N.t(key); }

// 初始化
document.addEventListener('DOMContentLoaded', () => {
    I18N.applyToPage();
});
