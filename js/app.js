/* ============================================================
   校园频道 — Full Platform App (Production)
   后端: Express + Socket.io + SQLite / 前端: Vanilla JS
   ============================================================ */
(function () {
  'use strict';

  // ==================== API CLIENT ====================

  var API_BASE = '/api';
  var ws = null;
  var token = localStorage.getItem('bfyg_token') || '';

  function apiGet(path) {
    return fetch(API_BASE + path, { headers: { Authorization: 'Bearer ' + token } })
      .then(function(r) { return r.json(); });
  }
  function apiPost(path, body) {
    return fetch(API_BASE + path, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token },
      body: JSON.stringify(body)
    }).then(function(r) { return r.json(); });
  }
  function apiPatch(path, body) {
    return fetch(API_BASE + path, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token },
      body: JSON.stringify(body)
    }).then(function(r) { return r.json(); });
  }
  function apiDelete(path) {
    return fetch(API_BASE + path, {
      method: 'DELETE',
      headers: { Authorization: 'Bearer ' + token }
    }).then(function(r) { return r.json(); });
  }

  // ==================== STATE ====================

  var currentUser = null; // { id, username, nickname, role, avatar_url }
  var channels = [];     // 服务器频道列表
  var channelMessages = {}; // { channelId: [msg, ...] }
  var currentChannel = null; // 当前选中的频道对象 (含 id)
  var unreadCounts = {};
  var lastReadTimestamps = {};
  var onlineUsers = [];

  // ==================== DOM REFS ====================

  var viewLogin = document.getElementById('view-login');
  var viewMain  = document.getElementById('view-main');
  var viewProfile = document.getElementById('view-profile');
  var loginForm  = document.getElementById('login-form');
  var loginError = document.getElementById('login-error');
  var loginEntry        = document.getElementById('login-entry');
  var loginModalOverlay = document.getElementById('login-modal-overlay');
  var loginCardModal    = document.getElementById('login-card-modal');
  var modalClose        = document.getElementById('modal-close');
  var btnSignin         = document.getElementById('btn-signin');
  var btnSignup         = document.getElementById('btn-signup');
  var loginCardTitle    = document.getElementById('login-card-title');
  var loginCardSub      = document.getElementById('login-card-sub');
  var btnSubmitText     = document.getElementById('btn-submit-text');
  var loginFooterSwitch = document.getElementById('login-footer-switch');
  var loginMode = 'signin';
  var sidebar         = document.getElementById('sidebar');
  var sidebarChannels = document.getElementById('sidebar-channels');
  var channelTitle    = document.getElementById('channel-title');
  var channelDesc     = document.getElementById('channel-desc');
  var messagesArea    = document.getElementById('messages-area');
  var msgInput        = document.getElementById('msg-input');
  var btnSend         = document.getElementById('btn-send');
  var btnAttach       = document.getElementById('btn-attach');
  var fileInput       = document.getElementById('file-input');
  var mobileMenuBtn   = document.getElementById('mobile-menu-btn');
  var sidebarOverlay  = document.getElementById('sidebar-overlay');
  var userNameEl      = document.getElementById('user-name');
  var userAvatarEl    = document.getElementById('user-avatar');
  var userTagEl       = document.getElementById('user-tag');
  var memberCount     = document.getElementById('member-count');
  var togglePw        = document.getElementById('toggle-pw');
  var pinBar       = document.getElementById('pin-bar');
  var pinText      = document.getElementById('pin-text');
  var pinCount     = document.getElementById('pin-count');
  var annBanner    = document.getElementById('announcement-banner');
  var annContent   = document.getElementById('ann-content');
  var annClose     = document.getElementById('ann-close');
  var memberRolesContainer = document.getElementById('member-roles-container');
  var rpOnlineCount = document.getElementById('rp-online-count');
  var scrollBottomBtn = document.getElementById('scroll-bottom-btn');
  var newMsgDot = document.getElementById('new-msg-dot');
  var connectionDot = document.getElementById('connection-dot');
  var btnNotify     = document.getElementById('btn-notify');
  var notifyBadge   = document.getElementById('notify-badge');
  var notifyDropdown= document.getElementById('notify-dropdown');
  var notifyList    = document.getElementById('notify-list');
  var notifyMarkAll = document.getElementById('notify-mark-all');

  // ==================== AVATAR HELPERS ====================

  var avatarColors = [
    'linear-gradient(135deg,#7c5cfc,#a78bfa)','linear-gradient(135deg,#10b981,#34d399)',
    'linear-gradient(135deg,#f59e0b,#fbbf24)','linear-gradient(135deg,#ff6b8a,#ff8fa3)',
    'linear-gradient(135deg,#06b6d4,#22d3ee)','linear-gradient(135deg,#ec4899,#f472b6)',
    'linear-gradient(135deg,#8b5cf6,#c084fc)','linear-gradient(135deg,#ef4444,#f87171)',
    'linear-gradient(135deg,#14b8a6,#2dd4bf)',
  ];
  function getAvatarColor(name) {
    var h=0; for(var i=0;i<name.length;i++) h=name.charCodeAt(i)+((h<<5)-h);
    return avatarColors[Math.abs(h)%avatarColors.length];
  }
  function getInitial(n) { return n?n.charAt(0).toUpperCase():'?'; }
  function escapeHtml(s) {
    var d=document.createElement('div'); d.textContent=s; return d.innerHTML;
  }
  function formatMsgText(text){
    text = escapeHtml(text); // 唯一一次 HTML 转义（防 XSS），必须在 Markdown 格式化之前
    text=text.replace(/\*\*(.*?)\*\*/g,'<strong>$1</strong>');
    text=text.replace(/`([^`]+)`/g,'<code>$1</code>');
    text=text.replace(/\n/g,'<br>');
    // @mention highlight
    text=text.replace(/@(\S+?)(?=\s|$|<)/g,'<span class="msg-mention">@$1</span>');
    return text;
  }

  // ==================== SOCKET.IO ====================

  function connectSocket() {
    if (ws && ws.connected) return;
    ws = io({ auth: { token: token } });

    ws.on('connect', function() {
      console.log('[ws] 已连接');
      if (connectionDot) connectionDot.classList.add('ws-connected');
      // 重新加入当前频道
      if (currentChannel && currentChannel.id) {
        ws.emit('join-channel', currentChannel.id);
      }
    });

    ws.on('disconnect', function() {
      console.log('[ws] 断开');
      if (connectionDot) connectionDot.classList.remove('ws-connected');
    });

    ws.on('new-message', function(msg) {
      var chId = msg.channel_id;
      if (!channelMessages[chId]) channelMessages[chId] = [];
      // 去重
      if (!channelMessages[chId].some(function(m){ return m.id === msg.id; })) {
        channelMessages[chId].push(msg);
      }

      if (currentChannel && currentChannel.id === chId) {
        // 当前频道：直接渲染
        var wasAtBottom = isNearBottom();
        renderMessages();
        if (wasAtBottom || msg.username === (currentUser && currentUser.username)) {
          messagesArea.scrollTop = messagesArea.scrollHeight;
        } else {
          showScrollBtn(msg);
        }
        // 新消息单独 pop 动画（覆盖 stagger 的最后一条）
        if (typeof anime === 'function') {
          var last = messagesArea.querySelector('.msg-group:last-child');
          if (last) {
            anime.remove(last);
            anime({
              targets: last,
              scale: [0.92, 1],
              opacity: [0, 1],
              duration: 380,
              easing: 'spring(1, 90, 12, 0)'
            });
          }
        }
      } else {
        // 其他频道：增加未读
        if (!unreadCounts[chId]) unreadCounts[chId] = 0;
        unreadCounts[chId]++;
        updateChannelBadges();
      }
    });

    ws.on('user-online', function(data) {
      console.log('[ws] 用户上线:', data.username);
    });

    ws.on('user-offline', function(data) {
      console.log('[ws] 用户离线:', data.userId);
    });

    ws.on('new-notification', function(data) {
      unreadNotifCount++;
      updateNotifBadge();
      showToast('新通知: ' + data.title, 'info');
    });

    ws.on('error-msg', function(msg) {
      if (typeof msg === 'string') alert(msg);
    });

    ws.on('connect_error', function(err) {
      console.error('[ws] 连接失败:', err.message);
    });
  }

  // ==================== TEXT TYPE ====================

  var twTexts = [
    "青春不散场，我们在校园频道等你",
    "那些年，我们一起走过的校园时光",
    "分享每一份快乐，记录每一刻成长",
    "连接你我，点亮青春的每个瞬间",
    "课间的欢笑，课堂的专注，都在这里",
    "宝丰一高 · 我们的青春主场",
  ];
  var twIdx=0, twCharIdx=0, twIsDeleting=false, twTimer;
  var twEl = document.querySelector('.tw-text');
  function twType(){
    var current=twTexts[twIdx];
    if(!twIsDeleting){
      if(twCharIdx<current.length){ twEl.textContent=current.substring(0,twCharIdx+1); twCharIdx++; twTimer=setTimeout(twType,60+Math.random()*40); }
      else { twIsDeleting=true; twTimer=setTimeout(twType,2000); }
    } else {
      if(twCharIdx>0){ twEl.textContent=current.substring(0,twCharIdx-1); twCharIdx--; twTimer=setTimeout(twType,30); }
      else { twIsDeleting=false; twIdx=(twIdx+1)%twTexts.length; twTimer=setTimeout(twType,400); }
    }
  }
  if(twEl) twTimer=setTimeout(twType,800);

  // ==================== LOGIN MODAL ====================

  function openLoginModal(mode){
    loginMode=mode;
    if(mode==='signin'){
      loginCardTitle.textContent='欢迎回来';
      loginCardSub.textContent='使用你的账号登录校园频道';
      btnSubmitText.textContent='登录';
      loginFooterSwitch.innerHTML='还没有账号？<a href="#" id="link-switch-mode">立即注册</a>';
    } else {
      loginCardTitle.textContent='加入我们';
      loginCardSub.textContent='创建账号，开启你的校园之旅';
      btnSubmitText.textContent='注册';
      loginFooterSwitch.innerHTML='已有账号？<a href="#" id="link-switch-mode">立即登录</a>';
    }
    var newLink=document.getElementById('link-switch-mode');
    if(newLink) newLink.addEventListener('click',function(e){ e.preventDefault(); openLoginModal(loginMode==='signin'?'signup':'signin'); });
    if(loginForm) loginForm.reset();
    if(loginError) loginError.textContent='';
    // anime.js 驱动弹窗动画（spring 弹簧效果，比纯 CSS 更自然）
    loginModalOverlay.classList.add('active');
    anime.remove([loginModalOverlay, loginCardModal]);
    anime({
      targets: loginModalOverlay,
      opacity: [0, 1],
      duration: 250,
      easing: 'linear'
    });
    anime({
      targets: loginCardModal,
      translateY: [40, 0],
      scale: [0.94, 1],
      opacity: [0, 1],
      duration: 600,
      easing: 'spring(1, 80, 10, 0)'
    });
  }
  function closeLoginModal(){
    anime.remove([loginModalOverlay, loginCardModal]);
    anime({
      targets: loginCardModal,
      translateY: [0, 20],
      scale: [1, 0.96],
      opacity: [1, 0],
      duration: 250,
      easing: 'easeInQuad'
    });
    anime({
      targets: loginModalOverlay,
      opacity: [1, 0],
      duration: 300,
      easing: 'linear',
      complete: function(){ loginModalOverlay.classList.remove('active'); }
    });
  }
  if(btnSignin) btnSignin.addEventListener('click',function(){ openLoginModal('signin'); });
  if(btnSignup) btnSignup.addEventListener('click',function(){ openLoginModal('signup'); });
  if(modalClose) modalClose.addEventListener('click',closeLoginModal);
  if(loginModalOverlay) loginModalOverlay.addEventListener('click',function(e){ if(e.target===loginModalOverlay) closeLoginModal(); });
  document.addEventListener('keydown',function(e){
    if(e.key==='Escape'&&loginModalOverlay.classList.contains('active')) closeLoginModal();
  });

  // ==================== AUTH FLOW ====================

  function isLoggedIn() { return !!token && !!currentUser; }

  function showMain() {
    viewLogin.classList.remove('active');
    viewLogin.setAttribute('aria-hidden','true');
    viewMain.classList.add('active');
    viewMain.removeAttribute('aria-hidden');
    if(viewProfile){ viewProfile.classList.remove('active'); viewProfile.setAttribute('aria-hidden','true'); }
    document.body.classList.add('main-active');

    if(userNameEl) userNameEl.textContent = currentUser.nickname || currentUser.username;
    if(userAvatarEl){
      userAvatarEl.textContent = getInitial(currentUser.nickname || currentUser.username);
      userAvatarEl.style.background = getAvatarColor(currentUser.username);
      userAvatarEl.style.cursor = 'pointer';
      userAvatarEl.title = '点击查看个人主页';
      userAvatarEl.onclick = function(){ showProfile(); };
    }
    if(userTagEl) userTagEl.innerHTML = '<span class="status-dot online" style="width:8px;height:8px;display:inline-block;border-radius:50%;border:none"></span> 在线';

    // 加载频道列表
    apiGet('/channels').then(function(res) {
      channels = res.channels || [];
      renderChannels();
      if (channels.length > 0) {
        switchChannel(channels[0]);
      }
      // Sow socket
      connectSocket();
      fetchUnreadCount();
    }).catch(function() {
      // 离线模式：使用本地频道占位
      channels = [{ id: 1, name: '全频道大厅', description: '离线模式', type: 'public', member_count: 0, joined: true }];
      renderChannels();
      if (channels.length > 0) switchChannel(channels[0]);
    });

    if(window._carousel) window._carousel.stop();
    closeLoginModal();
  }

  function showLogin(){
    viewMain.classList.remove('active');
    viewMain.setAttribute('aria-hidden','true');
    viewLogin.classList.add('active');
    viewLogin.removeAttribute('aria-hidden');
    if(viewProfile){ viewProfile.classList.remove('active'); viewProfile.setAttribute('aria-hidden','true'); }
    document.body.classList.remove('main-active');
    loginModalOverlay.classList.remove('active');
    loginCardModal.classList.remove('active');
    // 清除 anime.js 留下的内联样式，避免下次打开错位
    loginModalOverlay.style.opacity = '';
    loginCardModal.style.opacity = '';
    loginCardModal.style.transform = '';
    if (ws) { ws.disconnect(); }
    channels = [];
    channelMessages = {};
    currentChannel = null;
    unreadCounts = {};
    if(window._carousel) window._carousel.start();
  }

  function showProfile() {
    viewMain.classList.remove('active');
    viewLogin.classList.remove('active');
    if(viewProfile) viewProfile.classList.add('active');
    document.body.classList.add('main-active');
    renderProfile();
  }

  function backToMain() {
    if(!isLoggedIn()){ showLogin(); return; }
    viewProfile.classList.remove('active');
    viewMain.classList.add('active');
  }

  // ==================== PROFILE PAGE ====================

  function renderProfile() {
    if (!viewProfile) return;
    var user = currentUser;
    if (!user) return;

    viewProfile.innerHTML =
      '<div class="profile-container">'+
        '<button class="profile-back" id="profile-back">← 返回</button>'+
        '<div class="profile-card">'+
          '<div style="width:80px;height:80px;margin:0 auto 16px;"><div class="profile-avatar" style="background:'+getAvatarColor(user.username)+'">'+getInitial(user.nickname||user.username)+'</div></div>'+
          '<h2 class="profile-name">'+escapeHtml(user.nickname||user.username)+'</h2>'+
          '<p class="profile-username">@'+escapeHtml(user.username)+'</p>'+
          '<p class="profile-bio">'+(user.role === 'admin' ? '🔧 系统管理员' : user.role === 'moderator' ? '🛡️ 频道版主' : '📚 在校学生')+'</p>'+
        '<div class="profile-stats">'+
          '<div class="profile-stat"><span class="ps-num">'+(user.role==='admin'?'管理员':user.role==='moderator'?'版主':'成员')+'</span><span class="ps-label">身份</span></div>'+
          '<div class="profile-stat"><span class="ps-num">'+channels.length+'</span><span class="ps-label">频道</span></div>'+
          '<div class="profile-stat"><span class="ps-num">在线</span><span class="ps-label">状态</span></div>'+
        '</div>'+
          '<div class="profile-actions">'+
            (user.role === 'admin' ? '<button class="profile-btn" id="profile-admin-btn">管理后台</button>' : '')+
            '<button class="profile-btn profile-btn-outline" id="profile-logout-btn">退出登录</button>'+
          '</div>'+
        '</div>'+
      '</div>';

    setTimeout(function() {
      var backBtn = document.getElementById('profile-back');
      if (backBtn) backBtn.addEventListener('click', backToMain);

      var adminBtn = document.getElementById('profile-admin-btn');
      if (adminBtn) adminBtn.addEventListener('click', function() {
        window.location.href = 'admin.html';
      });

      var logoutBtn = document.getElementById('profile-logout-btn');
      if (logoutBtn) logoutBtn.addEventListener('click', function() {
        localStorage.removeItem('bfyg_token');
        token = '';
        currentUser = null;
        showLogin();
      });
    }, 100);
  }

  // ==================== CHANNELS ====================

  function renderChannels(){
    if(!sidebarChannels) return;
    sidebarChannels.innerHTML='';
    if (!channels || channels.length === 0) return;

    // 分组：公告 / 聊天 / 生活
    var groups = { announcement: [], public: [] };
    channels.forEach(function(ch) {
      if (ch.type === 'announcement') groups.announcement.push(ch);
      else groups.public.push(ch);
    });

    var cats = [
      { label: '📢 公告频道', items: groups.announcement },
      { label: '💬 交流频道', items: groups.public },
    ];

    cats.forEach(function(cat) {
      if (cat.items.length === 0) return;
      var catDiv=document.createElement('div'); catDiv.className='ch-category';
      var title=document.createElement('div'); title.className='ch-category-title';
      title.innerHTML='<svg viewBox="0 0 12 12"><path d="M2 4l4 4 4-4" fill="none" stroke="currentColor" stroke-width="1.5"/></svg>'+cat.label;
      var list=document.createElement('div'); list.className='ch-list';
      title.addEventListener('click',function(){ this.classList.toggle('collapsed'); list.style.display=this.classList.contains('collapsed')?'none':''; });

      cat.items.forEach(function(ch){
        var item=document.createElement('div');
        var isActive = currentChannel && currentChannel.id === ch.id;
        item.className='ch-item'+(isActive?' active':''); item.dataset.channel=ch.id;
        item.innerHTML='<span class="ch-icon">#</span><span class="ch-name">'+escapeHtml(ch.name)+'</span>';
        item.addEventListener('click',function(){ switchChannel(ch); });
        list.appendChild(item);
      });
      catDiv.appendChild(title); catDiv.appendChild(list); sidebarChannels.appendChild(catDiv);
    });
  }

  function switchChannel(ch){
    // Mark previous as read
    if (currentChannel && currentChannel.id !== ch.id) {
      lastReadTimestamps[currentChannel.id] = Date.now();
      unreadCounts[currentChannel.id] = 0;
      updateChannelBadges();
    }

    currentChannel = ch;
    lastReadTimestamps[ch.id] = Date.now();
    unreadCounts[ch.id] = 0;
    updateChannelBadges();

    if(channelTitle) channelTitle.textContent=ch.name;
    if(channelDesc) channelDesc.textContent=ch.description||'';
    if(msgInput) msgInput.placeholder='发送消息到 #'+ch.name;

    document.querySelectorAll('.ch-item').forEach(function(el){ el.classList.toggle('active', parseInt(el.dataset.channel) === ch.id); });

    // Load messages from server
    showMessageSkeleton();
    apiGet('/messages/' + ch.id).then(function(res) {
      channelMessages[ch.id] = (res.messages || []).concat(res.pinned || []);
      renderMessages();
      if (messagesArea) { messagesArea.scrollTop = messagesArea.scrollHeight; }
      hideScrollBtn();
    }).catch(function() {
      renderMessages();
    });

    if(pinBar) pinBar.classList.remove('visible');
    if(annBanner) annBanner.classList.remove('visible');
    closeSidebar();

    // Socket join
    if (ws && ws.connected) {
      if (currentChannel && currentChannel.id !== ch.id) {
        ws.emit('leave-channel', currentChannel.id);
      }
      ws.emit('join-channel', ch.id);
    }
  }

  // ==================== MESSAGES ====================

  function showMessageSkeleton(){
    if(!messagesArea) return;
    var skeletonHTML = '';
    for(var i=0;i<5;i++){
      skeletonHTML += '<div class="msg-skeleton"><div class="sk-avatar"></div><div class="sk-body"><div class="sk-line"></div><div class="sk-line"></div><div class="sk-line"></div></div></div>';
    }
    messagesArea.innerHTML = skeletonHTML;
  }

  function renderMessages(){
    if(!messagesArea) return;
    var msgs = channelMessages[currentChannel ? currentChannel.id : ''] || [];
    messagesArea.innerHTML='';

    if (!currentChannel) return;

    var welcome=document.createElement('div'); welcome.className='welcome-card';
    welcome.innerHTML='<h3># '+escapeHtml(currentChannel.name)+'</h3><p>'+(currentChannel.description||'')+'</p>';
    messagesArea.appendChild(welcome);

    if(msgs.length){
      var divider=document.createElement('div'); divider.className='day-divider'; divider.innerHTML='<span>消息</span>';
      messagesArea.appendChild(divider);
    }

    msgs.forEach(function(msg) {
      var group=document.createElement('div');
      group.className='msg-group';
      if(msg.is_pinned){ group.style.background='rgba(240,178,50,0.04)'; group.style.borderRadius='var(--r)'; }

      if(msg.is_pinned){
        var pinBadge=document.createElement('div'); pinBadge.className='msg-pin-indicator'; pinBadge.textContent='📌 置顶'; group.appendChild(pinBadge);
      }

      // Header
      var header=document.createElement('div'); header.className='msg-header';
      header.innerHTML=
        '<div class="msg-avatar" style="background:'+getAvatarColor(msg.username||'未知')+'">'+getInitial(msg.nickname||msg.username||'?')+'</div>'+
        '<span class="msg-author">'+escapeHtml(msg.nickname||msg.username||'未知')+'</span>'+
        '<span class="msg-time">'+formatTime(msg.created_at)+'</span>';
      group.appendChild(header);

      // Content
      var content=document.createElement('div'); content.className='msg-content';
      if (msg.content_type === 'image') {
        try {
          var imgData = JSON.parse(msg.content);
          content.innerHTML = '<div class="msg-img-wrap" onclick="window.openImg(\'' + escapeHtml(imgData.url) + '\')"><img src="' + escapeHtml(imgData.url) + '" alt="图片" loading="lazy" onerror="this.parentElement.innerHTML=\'<div class=msg-file-broken>image broken</div>\'"></div>';
        } catch(e) { content.textContent = '[image]'; }
      } else if (msg.content_type === 'file') {
        try {
          var fileData = JSON.parse(msg.content);
          content.innerHTML = '<div class="msg-file-card"><span class="msg-file-icon">file</span><div class="msg-file-info"><a href="' + escapeHtml(fileData.url) + '" target="_blank" class="msg-file-name">' + escapeHtml(fileData.name) + '</a><span class="msg-file-size">' + formatFileSize(fileData.size) + '</span></div></div>';
        } catch(e) { content.textContent = '[file]'; }
      } else {
        content.innerHTML = formatMsgText(msg.content);
      }
      group.appendChild(content);

      messagesArea.appendChild(group);
    });

    // Auto-scroll only if already at bottom
    if (isNearBottom()) {
      messagesArea.scrollTop=messagesArea.scrollHeight;
    }

    // anime.js：消息交错进场（stagger）
    if (typeof anime === 'function') {
      var groups = messagesArea.querySelectorAll('.msg-group');
      if (groups.length) {
        anime.remove(groups);
        anime({
          targets: groups,
          translateY: [14, 0],
          opacity: [0, 1],
          delay: anime.stagger(45, { start: 60 }),
          duration: 320,
          easing: 'easeOutQuad'
        });
      }
    }
  }

  function formatFileSize(bytes) {
    if (!bytes) return '0 B';
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024*1024) return (bytes/1024).toFixed(1) + ' KB';
    return (bytes/(1024*1024)).toFixed(1) + ' MB';
  }

  function formatTime(ts) {
    if (!ts) return '';
    var d = new Date(ts + 'Z'); // SQLite 存的是 UTC
    var now = new Date();
    if (d.toDateString() === now.toDateString()) {
      return String(d.getHours()).padStart(2,'0')+':'+String(d.getMinutes()).padStart(2,'0');
    }
    return (d.getMonth()+1)+'/'+d.getDate()+' '+String(d.getHours()).padStart(2,'0')+':'+String(d.getMinutes()).padStart(2,'0');
  }

  function sendMessage(){
    if(!msgInput||!currentUser||!currentChannel) return;
    var text=msgInput.value.trim(); if(!text) return;

    if (ws && ws.connected) {
      ws.emit('send-message', { channelId: currentChannel.id, content: text });
    } else {
      // Fallback: HTTP POST
      apiPost('/messages/' + currentChannel.id, { content: text }).then(function() {
        // 消息会通过 socket 广播回来，这里只需清输入
      });
    }
    msgInput.value='';
    msgInput.focus();
  }

  if(btnSend) btnSend.addEventListener('click',sendMessage);
  if(msgInput) msgInput.addEventListener('keydown',function(e){
    if(e.key==='Enter'&&!e.shiftKey){ e.preventDefault(); sendMessage(); }
  });

  // ── File upload ──────────────────────────────
  if(btnAttach && fileInput) {
    btnAttach.addEventListener('click', function(){ fileInput.click(); });
    fileInput.addEventListener('change', handleFileUpload);
  }

  function handleFileUpload() {
    if(!fileInput.files || !fileInput.files[0] || !currentChannel) return;
    var file = fileInput.files[0];

    // 文件大小检查 (10MB)
    if (file.size > 10 * 1024 * 1024) {
      showToast('文件太大，最大 10MB', 'error');
      fileInput.value = '';
      return;
    }

    var formData = new FormData();
    formData.append('file', file);

    // 显示上传中状态
    var isImage = file.type.startsWith('image/');
    showToast('上传中...', 'info');

    fetch('/api/upload', {
      method: 'POST',
      headers: { Authorization: 'Bearer ' + token },
      body: formData
    })
    .then(function(r) { return r.json(); })
    .then(function(data) {
      removeToast();
      if (data.success) {
        // 通过 WebSocket 发送图片/文件消息
        if (ws && ws.connected) {
          ws.emit('send-message', {
            channelId: currentChannel.id,
            content: JSON.stringify({ url: data.url, name: data.filename, size: data.size, isImage: data.isImage }),
            contentType: data.isImage ? 'image' : 'file'
          });
        }
      } else {
        showToast(data.error || '上传失败', 'error');
      }
    })
    .catch(function() {
      removeToast();
      showToast('上传失败，请检查网络', 'error');
    });

    fileInput.value = ''; // 允许重复选同一文件
  }

  // ── Toast ───────────────────────────────────
  var toastEl = null;
  var toastTimer = null;
  function showToast(msg, type) {
    removeToast();
    toastEl = document.createElement('div');
    toastEl.className = 'upload-toast upload-toast-' + (type||'info');
    toastEl.textContent = msg;
    document.body.appendChild(toastEl);
    if (type !== 'info') {
      toastTimer = setTimeout(removeToast, 2500);
    }
  }
  function removeToast() {
    if (toastTimer) { clearTimeout(toastTimer); toastTimer = null; }
    if (toastEl) { toastEl.remove(); toastEl = null; }
  }

  // ── Notification ─────────────────────────────
  var unreadNotifCount = 0;

  function fetchUnreadCount() {
    if (!token) return;
    fetch('/api/notifications/unread-count', { headers: { Authorization: 'Bearer ' + token } })
      .then(function(r) { return r.json(); })
      .then(function(data) {
        unreadNotifCount = data.count || 0;
        updateNotifBadge();
      }).catch(function(){});
  }

  function updateNotifBadge() {
    if (!notifyBadge) return;
    if (unreadNotifCount > 0) {
      notifyBadge.style.display = 'flex';
      notifyBadge.textContent = unreadNotifCount > 99 ? '99+' : unreadNotifCount;
    } else {
      notifyBadge.style.display = 'none';
    }
  }

  function openNotifDropdown() {
    if (!notifyDropdown || !notifyList) return;
    var isOpen = notifyDropdown.style.display === 'block';
    if (isOpen) {
      if (typeof anime === 'function') {
        anime.remove(notifyDropdown);
        anime({
          targets: notifyDropdown,
          opacity: [1, 0],
          translateY: [0, -8],
          duration: 180,
          easing: 'easeInQuad',
          complete: function(){ notifyDropdown.style.display = 'none'; }
        });
      } else {
        notifyDropdown.style.display = 'none';
      }
    } else {
      notifyDropdown.style.display = 'block';
      if (typeof anime === 'function') {
        anime.remove(notifyDropdown);
        anime({
          targets: notifyDropdown,
          opacity: [0, 1],
          translateY: [-8, 0],
          duration: 240,
          easing: 'easeOutQuad'
        });
      }
      loadNotifications();
    }
  }

  function loadNotifications() {
    if (!token || !notifyList) return;
    fetch('/api/notifications', { headers: { Authorization: 'Bearer ' + token } })
      .then(function(r) { return r.json(); })
      .then(function(data) {
        var list = data.notifications || [];
        notifyList.innerHTML = '';
        if (list.length === 0) {
          notifyList.innerHTML = '<div class="notify-empty">暂无通知</div>';
          return;
        }
        list.forEach(function(n) {
          var item = document.createElement('div');
          item.className = 'notify-item' + (n.is_read ? '' : ' unread');
          item.innerHTML =
            '<span class="notify-icon">' + (n.type === 'mention' ? '💬' : '🔔') + '</span>' +
            '<div class="notify-body">' +
              '<div class="notify-title">' + escapeHtml(n.title) + '</div>' +
              '<div class="notify-preview">' + escapeHtml(n.body) + '</div>' +
            '</div>';
          item.addEventListener('click', function() {
            markNotifRead(n.id);
            if (n.link) {
              // navigate to the linked channel
              var chId = n.link.replace('/channel/', '');
              if (chId) {
                var ch = channels.find(function(c) { return c.id == chId; });
                if (ch) switchChannel(ch);
              }
            }
            hideNotifDropdown();
          });
          notifyList.appendChild(item);
        });
      }).catch(function(){});
  }

  function markNotifRead(id) {
    fetch('/api/notifications/' + id + '/read', {
      method: 'PATCH',
      headers: { Authorization: 'Bearer ' + token }
    }).then(function() {
      unreadNotifCount = Math.max(0, unreadNotifCount - 1);
      updateNotifBadge();
    }).catch(function(){});
  }

  function hideNotifDropdown() {
    if (!notifyDropdown || notifyDropdown.style.display !== 'block') return;
    if (typeof anime === 'function') {
      anime.remove(notifyDropdown);
      anime({
        targets: notifyDropdown,
        opacity: [1, 0],
        translateY: [0, -8],
        duration: 160,
        easing: 'easeInQuad',
        complete: function(){ notifyDropdown.style.display = 'none'; }
      });
    } else {
      notifyDropdown.style.display = 'none';
    }
  }

  function markAllRead() {
    fetch('/api/notifications/read-all', {
      method: 'PATCH',
      headers: { Authorization: 'Bearer ' + token }
    }).then(function() {
      unreadNotifCount = 0;
      updateNotifBadge();
      loadNotifications();
    }).catch(function(){});
  }

  if (btnNotify) btnNotify.addEventListener('click', openNotifDropdown);
  if (notifyMarkAll) notifyMarkAll.addEventListener('click', markAllRead);

  // Close dropdown on outside click
  document.addEventListener('click', function(e) {
    if (notifyDropdown && notifyDropdown.style.display === 'block' &&
        !e.target.closest('#notify-wrap')) {
      hideNotifDropdown();
    }
  });

  // ── @mention autocomplete ────────────────────
  var mentionDropdown = null;
  var mentionQuery = '';
  var mentionIndex = -1;
  var mentionStartPos = -1;

  if (msgInput) {
    msgInput.addEventListener('input', function(e) {
      var val = msgInput.value;
      var pos = msgInput.selectionStart;
      // 查找最近的 @ 位置
      var atIdx = -1;
      for (var i = pos - 1; i >= 0; i--) {
        if (val[i] === '@') { atIdx = i; break; }
        if (val[i] === ' ') break;
      }
      if (atIdx >= 0 && atIdx < pos) {
        mentionQuery = val.substring(atIdx + 1, pos);
        mentionStartPos = atIdx;
        showMentionDropdown(mentionQuery);
      } else {
        hideMentionDropdown();
      }
    });

    msgInput.addEventListener('keydown', function(e) {
      if (!mentionDropdown) return;
      var items = mentionDropdown.querySelectorAll('.mention-item');
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        mentionIndex = Math.min(mentionIndex + 1, items.length - 1);
        updateMentionActive(items);
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        mentionIndex = Math.max(mentionIndex - 1, 0);
        updateMentionActive(items);
      } else if (e.key === 'Enter' && mentionIndex >= 0 && items[mentionIndex]) {
        e.preventDefault();
        items[mentionIndex].click();
      } else if (e.key === 'Escape') {
        hideMentionDropdown();
      }
    });
  }

  function showMentionDropdown(query) {
    // 获取当前频道在线成员
    var members = getChannelMembers();
    var filtered = members.filter(function(m) {
      return m.username.toLowerCase().includes(query.toLowerCase()) ||
             (m.nickname && m.nickname.toLowerCase().includes(query.toLowerCase()));
    });

    if (filtered.length === 0) { hideMentionDropdown(); return; }

    if (!mentionDropdown) {
      mentionDropdown = document.createElement('div');
      mentionDropdown.className = 'mention-dropdown';
      document.getElementById('message-input-area').appendChild(mentionDropdown);
    }

    mentionIndex = 0;
    mentionDropdown.innerHTML = '';
    filtered.slice(0, 8).forEach(function(m, idx) {
      var item = document.createElement('div');
      item.className = 'mention-item' + (idx === 0 ? ' active' : '');
      item.innerHTML =
        '<div class="mention-avatar" style="background:' + getAvatarColor(m.username) + '">' + getInitial(m.nickname || m.username) + '</div>' +
        '<span class="mention-name">' + escapeHtml(m.nickname || m.username) + '</span>';
      item.addEventListener('mousedown', function(e) {
        e.preventDefault();
        insertMention(m.username);
      });
      mentionDropdown.appendChild(item);
    });
    mentionDropdown.style.display = 'block';
  }

  function updateMentionActive(items) {
    items.forEach(function(item, i) {
      item.classList.toggle('active', i === mentionIndex);
    });
  }

  function hideMentionDropdown() {
    if (mentionDropdown) { mentionDropdown.style.display = 'none'; }
    mentionIndex = -1;
  }

  function insertMention(username) {
    if (mentionStartPos >= 0) {
      var val = msgInput.value;
      msgInput.value = val.substring(0, mentionStartPos) + '@' + username + ' ' + val.substring(msgInput.selectionStart);
      // 移动光标到 @username 之后
      var newPos = mentionStartPos + username.length + 2;
      msgInput.setSelectionRange(newPos, newPos);
    }
    hideMentionDropdown();
    msgInput.focus();
  }

  // Helpers for mention dropdown
  function getChannelMembers() {
    // 从在线用户 + 频道信息中构建成员列表
    var members = [];
    // 优先使用频道信息中的成员（如果有的话）
    if (currentChannel && currentChannel.members) {
      members = currentChannel.members;
    }
    // 补充在线用户
    if (onlineUsers && onlineUsers.length > 0) {
      onlineUsers.forEach(function(u) {
        if (!members.find(function(m) { return m.username === u.username; })) {
          members.push({ username: u.username, nickname: u.username });
        }
      });
    }
    // 如果还是空的，从频道已有消息中提取用户
    if (members.length === 0 && currentChannel) {
      var msgs = channelMessages[currentChannel.id] || [];
      var seen = {};
      msgs.forEach(function(msg) {
        if (!seen[msg.username]) {
          seen[msg.username] = true;
          members.push({ username: msg.username, nickname: msg.nickname || msg.username });
        }
      });
    }
    return members;
  }
  function isNearBottom(){
    if(!messagesArea) return true;
    return messagesArea.scrollHeight - messagesArea.scrollTop - messagesArea.clientHeight < 80;
  }

  function showScrollBtn(msg){
    if(!scrollBottomBtn) return;
    scrollBottomBtn.classList.add('visible');
    if (msg && newMsgDot) {
      newMsgDot.textContent = '!';
      newMsgDot.classList.add('show');
    }
  }

  function hideScrollBtn(){
    if(!scrollBottomBtn) return;
    scrollBottomBtn.classList.remove('visible');
    if (newMsgDot) newMsgDot.classList.remove('show');
  }

  if(messagesArea){
    messagesArea.addEventListener('scroll', function(){
      if (isNearBottom()) {
        hideScrollBtn();
        if (unreadCounts[currentChannel && currentChannel.id]) {
          unreadCounts[currentChannel.id] = 0;
          updateChannelBadges();
        }
      }
    });
  }

  if(scrollBottomBtn){
    scrollBottomBtn.addEventListener('click', function(){
      if(messagesArea){
        messagesArea.scrollTo({ top: messagesArea.scrollHeight, behavior: 'smooth' });
      }
      hideScrollBtn();
    });
  }

  function updateChannelBadges(){
    document.querySelectorAll('.ch-item').forEach(function(el){
      var chId = parseInt(el.dataset.channel);
      var existing = el.querySelector('.ch-badge');
      var count = unreadCounts[chId] || 0;
      if (count > 0) {
        if (!existing) {
          var badge = document.createElement('span');
          badge.className = 'ch-badge';
          el.appendChild(badge);
        }
        el.querySelector('.ch-badge').textContent = count > 99 ? '99+' : count;
      } else if (existing) {
        existing.remove();
      }
    });
  }

  // ==================== MOBILE SIDEBAR ====================

  function openSidebar(){
    if(!sidebar) return;
    sidebar.classList.add('open');
    if(sidebarOverlay) sidebarOverlay.classList.add('active');
    if(typeof anime === 'function'){
      anime.remove([sidebar, sidebarOverlay]);
      anime({
        targets: sidebar,
        translateX: ['-100%', '0%'],
        duration: 320,
        easing: 'easeOutExpo'
      });
      if(sidebarOverlay){
        anime({
          targets: sidebarOverlay,
          opacity: [0, 1],
          duration: 280,
          easing: 'linear'
        });
      }
    }
  }
  function closeSidebar(){
    if(!sidebar) return;
    if(typeof anime === 'function'){
      anime.remove([sidebar, sidebarOverlay]);
      anime({
        targets: sidebarOverlay,
        opacity: [1, 0],
        duration: 240,
        easing: 'linear'
      });
      anime({
        targets: sidebar,
        translateX: ['0%', '-100%'],
        duration: 300,
        easing: 'easeInExpo',
        complete: function(){ sidebar.classList.remove('open'); }
      });
      if(sidebarOverlay) sidebarOverlay.classList.remove('active');
    } else {
      sidebar.classList.remove('open');
      if(sidebarOverlay) sidebarOverlay.classList.remove('active');
    }
  }

  if(mobileMenuBtn) mobileMenuBtn.addEventListener('click',function(){
    if(sidebar.classList.contains('open')) closeSidebar();
    else openSidebar();
  });
  document.addEventListener('click',function(e){
    if(sidebar&&sidebar.classList.contains('open')&&!sidebar.contains(e.target)&&e.target!==mobileMenuBtn){
      closeSidebar();
    }
  });
  if(sidebarOverlay) sidebarOverlay.addEventListener('click',closeSidebar);

  // ==================== LOGIN FORM ====================

  if(loginForm){
    loginForm.addEventListener('submit',function(e){
      e.preventDefault();
      var fd=new FormData(loginForm);
      var u=(fd.get('username')||'').trim();
      var p=(fd.get('password')||'').trim();
      if(!u||!p){ if(loginError) loginError.textContent='请输入账号和密码'; return; }

      if(loginMode==='signup'){
        var displayName = prompt('请输入你的显示名称：', u)||u;
        apiPost('/auth/register', { username: u, password: p, nickname: displayName }).then(function(res) {
          if (res.error) { if(loginError) loginError.textContent=res.error; return; }
          onLoginSuccess(res);
        });
      } else {
        apiPost('/auth/login', { username: u, password: p }).then(function(res) {
          if (res.error) { if(loginError) loginError.textContent=res.error; return; }
          onLoginSuccess(res);
        });
      }
    });
  }

  function onLoginSuccess(res) {
    token = res.token;
    currentUser = res.user;
    localStorage.setItem('bfyg_token', token);
    if(loginError) loginError.textContent='';
    showMain();
  }

  if(togglePw){
    togglePw.addEventListener('click',function(){
      var pw=loginForm.querySelector('input[name="password"]');
      if(!pw) return;
      pw.type=pw.type==='password'?'text':'password';
    });
  }

  // ==================== LOGOUT ====================

  var btnLogout = document.getElementById('btn-logout');
  if(btnLogout) btnLogout.addEventListener('click',function(e){
    e.preventDefault();
    localStorage.removeItem('bfyg_token');
    token = '';
    currentUser = null;
    showLogin();
  });

  // ==================== INIT ====================

  // 检查自动登录
  if (token) {
    apiGet('/auth/me').then(function(res) {
      if (res.user) {
        currentUser = res.user;
        showMain();
      } else {
        localStorage.removeItem('bfyg_token');
        token = '';
      }
    }).catch(function() {
      localStorage.removeItem('bfyg_token');
      token = '';
    });
  }

  updateCharacter();

  // ==================== SCHOOL INTRO (click server header) ====================

  var serverHeader = document.querySelector('.sidebar-server');
  if (serverHeader) {
    serverHeader.style.cursor = 'pointer';
    serverHeader.addEventListener('click', function() {
      if (channelTitle) channelTitle.textContent = '学校简介';
      if (channelDesc) channelDesc.textContent = '宝丰一高历史与荣誉';
      if (msgInput) msgInput.placeholder = '浏览学校介绍';
      document.querySelectorAll('.ch-item').forEach(function(el){ el.classList.remove('active'); });
      serverHeader.classList.add('active');
      if (pinBar) pinBar.classList.remove('visible');
      if (annBanner) annBanner.classList.remove('visible');
      if (!messagesArea) return;

      messagesArea.innerHTML = '';
      var welcome = document.createElement('div');
      welcome.className = 'welcome-card';
      welcome.innerHTML = '<h3>🏫 学校简介</h3><p>宝丰县第一高级中学 — 崇德尚学 · 厚积薄发</p>';
      messagesArea.appendChild(welcome);

      var info = [
        { title: '基本信息', content: '📌 创建于1956年，位于河南省平顶山市宝丰县。<br>占地面积：340亩 | 在校学生：约6000人 | 教学班级：99个 | 教职工：422人<br>校训：崇德尚学 · 厚积薄发' },
        { title: '荣誉成就', content: '🏆 2005年 河南省示范性高中<br>🏆 2019年 清华大学生源中学<br>🏆 河南省教育系统先进集体<br>🏆 河南省园林单位<br>🏆 省级文明校园' },
        { title: '师资力量', content: '👩‍🏫 专任教师338人<br>高级教师99人 | 一级教师116人<br>国家级骨干教师2人 | 省级骨干教师18人 | 省级学科带头人7人' },
      ];
      info.forEach(function(item) {
        var div = document.createElement('div');
        div.className = 'msg-group';
        div.innerHTML = '<div class="msg-header"><div class="msg-avatar" style="background:linear-gradient(135deg,#7c5cfc,#5a3de0)">🏫</div><span class="msg-author">系统</span><span class="msg-time">学校资料</span></div><div class="msg-content"><strong>'+item.title+'</strong><br><br>'+item.content+'</div>';
        messagesArea.appendChild(div);
      });
      messagesArea.scrollTop = messagesArea.scrollHeight;
    });
  }

})();

// ===== SOCKET.IO CLIENT LOADER =====
(function() {
  var script = document.createElement('script');
  script.src = '/socket.io/socket.io.js';
  script.onload = function() { console.log('[client] Socket.io 客户端已加载'); };
  script.onerror = function() { console.error('[client] Socket.io 加载失败，实时聊天不可用'); };
  document.head.appendChild(script);
})();

// ===== LOGIN CAROUSEL =====
(function() {
  'use strict';

  var CARD_IMAGES = [
    '../images/campus-01.jpg',
    '../images/campus-02.jpg',
    '../images/campus-03.jpg',
    '../images/campus-04.jpg'
  ];
  var CARD_INFO = [
    { title: '校园公寓', desc: '温馨家园 · 青春栖息' },
    { title: '运动场', desc: '挥洒汗水 · 追逐梦想' },
    { title: '厚德载物', desc: '校训精神 · 薪火相传' },
    { title: '樱花大道', desc: '春暖花开 · 美好时光' },
  ];

  var container = document.getElementById('loginCarousel');
  if (!container) return;

  var CARD_COUNT = 4;
  var cards = [];
  var progress = 0;
  var mouse = { x: 0, y: 0, targetX: 0, targetY: 0 };
  var cardW = 360, cardH = 220;
  if (window.innerWidth < 640) { cardW = 220; cardH = 140; }
  else if (window.innerWidth < 1000) { cardW = 280; cardH = 180; }
  var frameId = 0;
  var thicknessLayers = [-1.47, -0.73, 0, 0.73, 1.47];

  var camera = document.createElement('div');
  camera.className = 'login-camera';
  container.appendChild(camera);

  function buildCards() {
    for (var i = 0; i < CARD_COUNT; i++) {
      var card = document.createElement('div');
      card.className = 'login-3d-card';
      card.style.width = cardW + 'px';
      card.style.height = cardH + 'px';
      var imgSrc = CARD_IMAGES[i % CARD_IMAGES.length];
      var info = CARD_INFO[i % CARD_INFO.length];

      for (var li = 0; li < thicknessLayers.length; li++) {
        var zOff = thicknessLayers[li];
        var isFront = (li === thicknessLayers.length - 1);
        var isBack = (li === 0);
        var layer = document.createElement('div');
        layer.className = 'login-3d-card-layer';

        if (!isFront && !isBack) {
          layer.className += ' login-3d-card-mid';
          layer.style.transform = 'translateZ(' + zOff + 'px)';
        } else if (isFront) {
          layer.className += ' login-3d-card-front';
          layer.style.transform = 'translateZ(' + zOff + 'px)';
          var img = document.createElement('img');
          img.src = imgSrc; img.alt = info.title; img.loading = 'eager';
          layer.appendChild(img);
          var overlay = document.createElement('div'); overlay.className = 'campus-overlay';
          overlay.innerHTML = '<div class="campus-card-title">' + info.title + '</div><div class="campus-card-desc">' + info.desc + '</div>';
          layer.appendChild(overlay);
        } else {
          layer.className += ' login-3d-card-back';
          layer.style.transform = 'translateZ(' + zOff + 'px) rotateX(180deg)';
          var bimg = document.createElement('img'); bimg.src = imgSrc; bimg.alt = '';
          layer.appendChild(bimg);
        }
        card.appendChild(layer);
      }
      camera.appendChild(card);
      cards.push(card);
    }
  }

  document.addEventListener('mousemove', function(e) {
    mouse.targetX = (e.clientX - window.innerWidth / 2) / (window.innerWidth / 2);
    mouse.targetY = (e.clientY - window.innerHeight / 2) / (window.innerHeight / 2);
    mouse.targetX = Math.max(-1, Math.min(1, mouse.targetX));
    mouse.targetY = Math.max(-1, Math.min(1, mouse.targetY));
  });
  document.addEventListener('mouseleave', function() { mouse.targetX = 0; mouse.targetY = 0; });

  var wheelAccum = 0;
  container.addEventListener('wheel', function(e) {
    e.preventDefault();
    wheelAccum += e.deltaY * 0.004;
    var step = Math.round(wheelAccum);
    if (step !== 0) { progress += step; wheelAccum -= step; }
  }, { passive: false });

  var stopped = false;

  function renderLoop() {
    if (stopped) return;
    progress += 0.005;
    mouse.x += (mouse.targetX - mouse.x) * 0.08;
    mouse.y += (mouse.targetY - mouse.y) * 0.08;

    var h = window.innerHeight;
    var D = 1350;
    var gap = 36;
    var peekAmount = -55;

    var continuousProgress = progress;
    var roundedIndex = Math.round(continuousProgress);
    var diffFromRound = continuousProgress - roundedIndex;
    var easedDiff = Math.sign(diffFromRound) * Math.pow(Math.abs(diffFromRound) * 2, 4.2) / 2;
    var virtualActiveIndex = roundedIndex + easedDiff;

    for (var i = 0; i < CARD_COUNT; i++) {
      var card = cards[i];
      if (!card) continue;
      var offset = i - virtualActiveIndex;
      var halfCount = CARD_COUNT / 2;
      while (offset > halfCount) offset -= CARD_COUNT;
      while (offset < -halfCount) offset += CARD_COUNT;

      var absOffset = Math.abs(offset);
      var sign = Math.sign(offset);
      if (absOffset > 3.0) { card.style.opacity = '0'; card.style.pointerEvents = 'none'; continue; }
      card.style.pointerEvents = 'auto';
      var edgeFade = Math.max(0, Math.min(1, (3.0 - absOffset) / 0.7));
      card.style.opacity = edgeFade.toFixed(3);

      var y = 0, z = 0, rot = 0;
      if (absOffset <= 1) {
        var t = absOffset; var et = t * t * (3 - 2 * t);
        var targetY = cardH + gap; y = -sign * (et * targetY);
        z = 200 + et * (110 - 200); rot = et * 132;
      } else if (absOffset <= 2) {
        var t = absOffset - 1; var et = t * t * (3 - 2 * t);
        var yStart = cardH + gap; var zStart = 110; var rotStart = 132;
        var zEnd = -30; var rotEnd = 175;
        var sEnd = D / (D - zEnd);
        var yEnd = (h / 2 - peekAmount) / sEnd - (cardH / 2);
        var currentY = yStart + et * (yEnd - yStart);
        y = -sign * currentY; z = zStart + et * (zEnd - zStart);
        rot = rotStart + et * (rotEnd - rotStart);
      } else {
        var t = Math.min(absOffset - 2, 1); var et = t * t * (3 - 2 * t);
        var zStart = -30; var rotStart = 175; var zEnd3 = -120; var rotEnd3 = 195;
        var sEnd2 = D / (D - zStart);
        var yEnd2 = (h / 2 - peekAmount) / sEnd2 - (cardH / 2);
        var sEnd3 = D / (D - zEnd3);
        var yEnd3 = (h / 2 + 100) / sEnd3 + (cardH / 2);
        var currentY = yEnd2 + et * (yEnd3 - yEnd2);
        y = -sign * currentY; z = zStart + et * (zEnd3 - zStart);
        rot = rotStart + et * (rotEnd3 - rotStart);
      }

      var localCardRotation = -sign * rot;
      var centerFactor = Math.max(0, 1 - absOffset);
      var maxTiltY = 15, maxTiltX = 12;
      var activeTiltX = -mouse.y * maxTiltX * centerFactor;
      var activeTiltY = mouse.x * maxTiltY * centerFactor;
      var totalRotX = localCardRotation + activeTiltX;
      var totalRotY = activeTiltY;

      card.style.zIndex = Math.round(z).toString();
      card.style.transform =
        'translateY(' + y.toFixed(2) + 'px) ' +
        'translateZ(' + z.toFixed(2) + 'px) ' +
        'rotateX(' + totalRotX.toFixed(2) + 'deg) ' +
        'rotateY(' + totalRotY.toFixed(2) + 'deg) ' +
        'rotateZ(-3deg)';
    }
    frameId = requestAnimationFrame(renderLoop);
  }

  function startCarousel() {
    if (stopped) { stopped = false; frameId = requestAnimationFrame(renderLoop); }
  }
  function stopCarousel() {
    stopped = true;
    if (frameId) { cancelAnimationFrame(frameId); frameId = 0; }
  }

  window._carousel = { start: startCarousel, stop: stopCarousel };
  buildCards();
  frameId = requestAnimationFrame(renderLoop);

  // ==================== IMAGE LIGHTBOX ====================
  window.openImg = function(url) {
    var overlay = document.createElement('div');
    overlay.className = 'img-lightbox';
    overlay.innerHTML = '<div class="img-lightbox-bg"></div><img src="'+url+'" class="img-lightbox-img"><button class="img-lightbox-close">&times;</button>';
    overlay.querySelector('.img-lightbox-bg').onclick = function(){ overlay.remove(); };
    overlay.querySelector('.img-lightbox-close').onclick = function(){ overlay.remove(); };
    overlay.onclick = function(e){ if(e.target===overlay) overlay.remove(); };
    document.body.appendChild(overlay);
  };
})();
