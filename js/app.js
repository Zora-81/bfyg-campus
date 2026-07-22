/* ============================================================
   校园频道 — Full Platform App (Production)
   后端: InsForge / 前端: Vanilla JS + GSAP
   ============================================================ */
(function () {
  'use strict';

  // ==================== INS FORGE CLIENT ====================
  // 后端已迁移至 InsForge（Postgres + Auth + Storage + Realtime）。
  // SDK 由 js/if-client.js（ESM，CDN 引入）加载后注入 window.IF，
  // 就绪时派发 IF_READY 事件。前端通过 window.IF 调用所有后端能力。
  var IF = window.IF || null;
  window.addEventListener('IF_READY', function () { IF = window.IF; });

  // 兼容占位（不再使用本地 token / socket，保留变量名以免散落引用报错）
  var ws = null;
  var token = '';
  var connectionDot = document.querySelector('.connection-dot');

  // 聚合所有频道的消息总数（个人主页统计用）
  function countAllMessages() {
    var n = 0;
    for (var k in channelMessages) { if (channelMessages.hasOwnProperty(k)) n += channelMessages[k].length; }
    return n;
  }

  // ==================== STATE ====================

  // 可访问性：尊重系统"减少动效"设置
  var REDUCED_MOTION = !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);

  // 移动端检测
  function isMobile() {
    return window.innerWidth <= 900 || ('ontouchstart' in window);
  }

  // 公告栏（announcement 类型频道）仅限管理员发言
  function isChannelLocked() {
    return currentChannel && currentChannel.type === 'announcement' && (!currentUser || currentUser.role !== 'admin');
  }

  var currentUser = null; // { id, username, nickname, role, avatar_url }
  var channels = [];     // 服务器频道列表
  var channelMessages = {}; // { channelId: [msg, ...] }
  var likeAgg = {}; // { messageId: { total, mine } } 点赞聚合（前端计数，规避触发器/RLS）
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
  var loginRetry = document.getElementById('login-retry');
  var monsterLogin      = document.getElementById('monster-login');
  var loginCard         = document.getElementById('login-card');
  var modalClose        = document.getElementById('modal-close');
  var loginCardTitle    = document.getElementById('login-card-title');
  var loginCardSub      = document.getElementById('login-card-sub');
  var btnSubmitText     = document.getElementById('btn-submit-text');
  var loginFooterSwitch = document.getElementById('login-footer-switch');
  var loginSubmitLoader = document.getElementById('login-submit-loader');
  var loginLogoStar     = document.getElementById('login-logo-star');
  // 欢迎屏 / 加载 / 小怪兽
  var welcomeScreen     = document.getElementById('welcome-screen');
  var welcomeEnter      = document.getElementById('welcome-enter');
  var loadingStage      = document.getElementById('loading-stage');
  var loadingStar       = document.getElementById('loading-star');
  var _fromWelcome      = false; // 标记当前是否从欢迎屏进入，关闭弹窗时回到欢迎屏
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
  var mobileMenuBtn   = document.getElementById('hamburger-btn');
  var drawerOverlay   = document.getElementById('drawer-overlay');
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

  // ==================== REALTIME (InsForge) ====================

  // 收到新消息的统一处理（本地乐观追加 + 实时推送共用，按 id 去重）
  // 刷新某条消息下「已打开」的评论区（用于回复发送成功 / 实时评论到达时），
  // 用评论区局部刷新替代整频道 renderMessages()，避免打开的评论区被重建而关闭。
  function refreshOpenCommentFor(parentId) {
    if (!parentId || !currentChannel) return false;
    try {
      var rootId = findRootMessageId(parentId);
      var sec = document.getElementById('comment-' + rootId);
      if (sec && sec.classList.contains('open')) {
        var rMsg = findMessageById(currentChannel.id, rootId);
        if (rMsg) {
          renderCommentList(sec, rMsg);
          try { sec.scrollIntoView({ behavior:'smooth', block:'nearest' }); } catch(e){}
          return true;
        }
      }
    } catch (e) {}
    return false;
  }

  function handleIncomingMessage(msg) {
    var chId = msg.channel_id;
    if (!channelMessages[chId]) channelMessages[chId] = [];

    // 实时消息回来时，若本地还有同内容/同作者的 pending 消息，直接替换避免重复
    if (currentChannel && currentChannel.id === chId && !msg.isPending && msg.author_id && msg.content) {
      var pendingIdx = -1;
      for (var i = 0; i < channelMessages[chId].length; i++) {
        var m = channelMessages[chId][i];
        if (m.isPending && m.author_id === msg.author_id && m.content === msg.content) {
          pendingIdx = i; break;
        }
      }
      if (pendingIdx >= 0) {
        channelMessages[chId][pendingIdx] = msg;
        if (msg.parent_id) {
          refreshOpenCommentFor(msg.parent_id); // 评论/回复：只刷新评论区
        } else {
          replaceMessageNode(channelMessages[chId][pendingIdx].id, msg); // 就地替换 pending 节点
        }
        return;
      }
    }

    if (!channelMessages[chId].some(function(m){ return m.id === msg.id; })) {
      channelMessages[chId].push(msg);
    }

    if (currentChannel && currentChannel.id === chId) {
      // 避免实时回显与乐观替换导致的 DOM 重复：若该消息节点已存在则跳过
      if (messagesArea.querySelector('.msg-group[data-msg-id="' + msg.id + '"]')) {
        return;
      }
      // 倒序流：最新在最顶，跟随判断改为"是否已在顶部附近"
      var wasAtTop = isNearTop();
      // 增量追加这条新消息：他人的消息淡入；自己发的（已乐观显示）实时回显不播动画，避免闪烁
      var isSelfMsg = currentUser && msg.author_id === currentUser.id;
      appendMessageNode(msg, !isSelfMsg);
      if (wasAtTop || (currentUser && msg.author_id === currentUser.id)) {
        messagesArea.scrollTop = 0;
      } else {
        showScrollBtn(msg);
      }
    } else {
      // 其他频道：增加未读
      if (!unreadCounts[chId]) unreadCounts[chId] = 0;
      unreadCounts[chId]++;
      updateChannelBadges();
    }
  }

  // 收到「消息被删除」的实时事件（后台删除时由发起方广播 delete_message）。
  // 从内存数组摘除该消息及其全部子回复，当前频道则重建 DOM（自动还原已打开的评论区）。
  function handleIncomingDelete(payload) {
    if (!payload || !payload.id) return;
    var chId = payload.channel_id;
    if (!channelMessages[chId]) return;
    var delId = payload.id;
    var toRemove = {};
    toRemove[delId] = true;
    channelMessages[chId].forEach(function (m) { if (m.parent_id === delId) toRemove[m.id] = true; });
    var before = channelMessages[chId].length;
    channelMessages[chId] = channelMessages[chId].filter(function (m) { return !toRemove[m.id]; });
    if (channelMessages[chId].length === before) return; // 本频道没有这条，跳过
    if (currentChannel && currentChannel.id === chId) {
      renderMessages(); // 重建 DOM，已删消息（含其子回复）不再显示，已打开评论区自动还原
    }
  }

  // ── 兜底对账：实时 publish 可能不被服务器转发（客户端广播依赖不确定），
  //    故用户界面每 5 秒用本地消息 id 去库里问「还在不在」，已不存在的就地移除。
  //    这样后台删消息（含级联子回复）无需刷新、也无论实时是否生效，都能秒级消失。
  let deletionSyncTimer = null
  function startDeletionSync() {
    stopDeletionSync()
    deletionSyncTimer = setInterval(runDeletionSync, 5000)
  }
  function stopDeletionSync() {
    if (deletionSyncTimer) { clearInterval(deletionSyncTimer); deletionSyncTimer = null }
  }
  let _syncRunning = false
  async function runDeletionSync() {
    if (_syncRunning) return
    if (!IF || !currentChannel || !currentChannel.id) return
    if (document.hidden) return // 后台标签不查，省流量
    var chId = currentChannel.id
    var arr = channelMessages[chId]
    if (!arr || arr.length === 0) return
    var ids = arr.map(function (m) { return m.id })
    _syncRunning = true
    try {
      var alive = {}
      for (var i = 0; i < ids.length; i += 80) {
        var chunk = ids.slice(i, i + 80)
        var res = await IF.insforge.database
          .from('messages').select('id').in('id', chunk).eq('channel_id', chId)
        if (res && res.data) res.data.forEach(function (r) { alive[r.id] = true })
      }
      var removed = ids.filter(function (id) { return !alive[id] })
      if (removed.length === 0) return
      var rmSet = {}
      removed.forEach(function (id) { rmSet[id] = true })
      // 同时摘除其子回复（本地内存里 parent_id 指向被删父消息的）
      arr.forEach(function (m) { if (m.parent_id && rmSet[m.parent_id]) rmSet[m.id] = true })
      channelMessages[chId] = arr.filter(function (m) { return !rmSet[m.id] })
      if (currentChannel && currentChannel.id === chId) renderMessages()
    } catch (e) {}
    finally { _syncRunning = false }
  }

  // 订阅当前频道的实时消息（切换频道时调用）
  function subscribeCurrentChannel() {
    if (!IF || !currentChannel || !currentChannel.id) return;
    if (connectionDot) connectionDot.classList.add('ws-connected');
    IF.connectRealtime(currentChannel.id, {
      onMessage: handleIncomingMessage,
      onDelete: handleIncomingDelete,
      onRecall: handleIncomingRecall,
      onPresence: function(members) {
        var onlineEl = document.getElementById('rp-online-count');
        if (onlineEl) onlineEl.textContent = (members ? members.length : 0);
      }
    });
    startDeletionSync(); // 启动兜底对账（后台删消息无需刷新即消失）
  }

  function disconnectRealtime() {
    if (IF) IF.disconnectRealtime();
    stopDeletionSync(); // 停掉兜底对账定时器
    if (connectionDot) connectionDot.classList.remove('ws-connected');
    // 清理通知订阅：realtime handler、轮询定时器、订阅标记
    if (notifRtHandler && IF && IF.insforge && IF.insforge.realtime) {
      var rt2 = IF.insforge.realtime;
      try { rt2.off('new_notification', notifRtHandler); } catch (e) {}
      try { rt2.unsubscribe('notifications:' + (currentUser ? currentUser.id : '')); } catch (e) {}
    }
    notifRtHandler = null;
    notifRtSubscribed = false;
    if (_notifFallbackTimer) { clearInterval(_notifFallbackTimer); _notifFallbackTimer = null; }
    if (_pollUnreadInterval) { clearInterval(_pollUnreadInterval); _pollUnreadInterval = null; }
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

  // ==================== 登录流程：欢迎 → 加载 → 小怪兽登录 → 主界面 ====================

  function openLoginModal(mode){
    loginMode = mode;
    var vp0 = document.getElementById('verify-panel'); if(vp0) vp0.style.display='none';
    pendingVerifyEmail = null; pendingVerifyPassword = null;
    var nickGroup = document.getElementById('group-nickname');
    if(mode === 'signin'){
      loginCardTitle.textContent = '欢迎回来';
      loginCardSub.textContent = '使用你的账号登录校园频道';
      btnSubmitText.textContent = '登录';
      loginFooterSwitch.innerHTML = '还没有账号？<a href="#" id="link-switch-mode">立即注册</a>';
      if(nickGroup) nickGroup.style.display = 'none';
      var pwHint = document.getElementById('pw-hint');
      if(pwHint){ pwHint.style.display='none'; pwHint.className='input-hint'; }
    } else {
      loginCardTitle.textContent = '加入我们';
      loginCardSub.textContent = '创建账号，开启你的校园之旅';
      btnSubmitText.textContent = '注册';
      loginFooterSwitch.innerHTML = '已有账号？<a href="#" id="link-switch-mode">立即登录</a>';
      if(nickGroup) nickGroup.style.display = '';
      var pwHint2 = document.getElementById('pw-hint');
      if(pwHint2){ pwHint2.style.display=''; pwHint2.className='input-hint'; pwHint2.textContent='密码至少 8 位，需同时包含字母和数字'; }
    }
    var newLink = document.getElementById('link-switch-mode');
    if(newLink) newLink.addEventListener('click', function(e){ e.preventDefault(); openLoginModal(loginMode==='signin'?'signup':'signin'); });
    if(loginForm) loginForm.reset();
    clearLoginError();
    resetMonsterState();
    if(monsterLogin) monsterLogin.classList.add('active');
    startMonsterEyes();
  }
  function closeLoginModal(){
    var backToWelcome = _fromWelcome;
    if(monsterLogin){ monsterLogin.classList.remove('active'); stopMonsterEyes(); }
    if(backToWelcome && welcomeScreen){ welcomeScreen.classList.add('active'); _fromWelcome = false; }
  }

  // ── 欢迎屏 → 加载(双点→星→飞) → 小怪兽登录 ──
  var _loadingTimers = [];
  function clearLoadingTimers(){ _loadingTimers.forEach(clearTimeout); _loadingTimers = []; }
  function enterFromWelcome(){
    if(!welcomeScreen){ openLoginModal('signin'); return; }
    _fromWelcome = true;
    if(welcomeEnter) welcomeEnter.disabled = true;
    if(REDUCED_MOTION || typeof gsap === 'undefined'){
      welcomeScreen.classList.remove('active');
      openLoginModal('signin');
      return;
    }
    if(loadingStage){
      loadingStage.classList.add('active','phase-rotating');
      // rotating(0-1.2s) → merging(1.2-1.6s) → star(1.6-2.0s) → flying(2.0-2.85s)
      _loadingTimers.push(setTimeout(function(){ loadingStage.classList.remove('phase-rotating'); loadingStage.classList.add('phase-merging'); }, 1200));
      _loadingTimers.push(setTimeout(function(){ loadingStage.classList.remove('phase-merging'); loadingStage.classList.add('phase-star'); }, 1600));
      _loadingTimers.push(setTimeout(function(){
        loadingStage.classList.remove('phase-star'); loadingStage.classList.add('phase-flying');
        flyStarToCard();
      }, 2000));
      _loadingTimers.push(setTimeout(function(){
        clearLoadingTimers();
        loadingStage.classList.remove('active','phase-flying');
        if(welcomeScreen) welcomeScreen.classList.remove('active');
        openLoginModal('signin');
      }, 2850));
    } else {
      welcomeScreen.classList.remove('active');
      openLoginModal('signin');
    }
  }

  // 飞星：从 loading star 飞向登录卡片顶部星标
  function flyStarToCard(){
    if(!loginLogoStar) return;
    var cardRect = loginLogoStar.getBoundingClientRect();
    var tx = cardRect.left + cardRect.width/2;
    var ty = cardRect.top + cardRect.height/2;
    var fly = document.createElement('div');
    fly.className = 'loading-fly-star';
    fly.innerHTML = '<svg viewBox="0 0 100 100"><path d="M50 0 Q50 50 100 50 Q50 50 50 100 Q50 50 0 50 Q50 50 50 0 Z" /></svg>';
    document.body.appendChild(fly);
    fly.style.left = (window.innerWidth/2) + 'px';
    fly.style.top  = (window.innerHeight/2) + 'px';
    fly.style.opacity = '1';
    fly.style.transition = 'none';
    void fly.offsetWidth; // 强制回流
    fly.style.transition = 'left .85s cubic-bezier(.45,.05,.35,1), top .85s cubic-bezier(.45,.05,.35,1), opacity .85s ease';
    fly.style.left = tx + 'px';
    fly.style.top  = ty + 'px';
    setTimeout(function(){
      fly.style.opacity = '0';
      if(loginLogoStar){
        loginLogoStar.style.animation = 'none';
        void loginLogoStar.offsetWidth;
        loginLogoStar.style.animation = 'modalStarPop .5s ease';
      }
      setTimeout(function(){ if(fly.parentNode) fly.parentNode.removeChild(fly); }, 400);
    }, 850);
  }

  // ── 登录提交加载动画：恒星轨道校徽（GSAP 行星环绕）──
  var _loaderWatchdog = null;
  var _orbitTweens = [];
  function _startOrbitAnimation(){
    if(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    _stopOrbitAnimation();
    var o1 = document.querySelector('.orbit-1');
    var o2 = document.querySelector('.orbit-2');
    var o3 = document.querySelector('.orbit-3');
    if(o1 && typeof gsap !== 'undefined') _orbitTweens.push(gsap.to(o1, { rotation:'+=360', duration:6, repeat:-1, ease:'linear' }));
    if(o2 && typeof gsap !== 'undefined') _orbitTweens.push(gsap.to(o2, { rotation:'-=360', duration:9, repeat:-1, ease:'linear' }));
    if(o3 && typeof gsap !== 'undefined') _orbitTweens.push(gsap.to(o3, { rotation:'+=360', duration:12, repeat:-1, ease:'linear' }));
  }
  function _stopOrbitAnimation(){
    _orbitTweens.forEach(function(t){ if(t && t.kill) t.kill(); });
    _orbitTweens = [];
  }
  function showLoginLoader(){
    if(!loginSubmitLoader) return;
    loginSubmitLoader.classList.add('active');
    loginSubmitLoader.setAttribute('aria-hidden','false');
    _startOrbitAnimation();
    if(_loaderWatchdog){ clearTimeout(_loaderWatchdog); _loaderWatchdog = null; }
    _loaderWatchdog = setTimeout(function(){
      _loaderWatchdog = null;
      if(viewMain && viewMain.classList.contains('active')) return;
      try {
        _stopOrbitAnimation();
        if(loginSubmitLoader){ loginSubmitLoader.classList.remove('active'); loginSubmitLoader.setAttribute('aria-hidden','true'); loginSubmitLoader.style.opacity=''; }
        showLoginError({ message: '登录超时，可能是网络较慢或后端无响应。请检查网络后重试。' });
      } catch(e){}
    }, 12000);
  }
  function hideLoginLoader(cb){
    if(_loaderWatchdog){ clearTimeout(_loaderWatchdog); _loaderWatchdog = null; }
    _stopOrbitAnimation();
    if(!loginSubmitLoader){ if(cb) cb(); return; }
    loginSubmitLoader.classList.remove('active');
    loginSubmitLoader.setAttribute('aria-hidden','true');
    loginSubmitLoader.style.opacity = '';
    if(cb) cb();
  }

  // ── 小怪兽眼睛跟随鼠标（3 级弹簧，仿 BobZhang AnimatedCharacters）──
  var _eyeRAF = null, _eyeOn = false;
  var _eyeTarget = { x:0, y:0 };   // 鼠标归一化 -1..1
  var _eyeNorm   = { x:0, y:0 };   // 平滑后当前值
  var _eyeState  = 'idle';         // idle | email | pwfocus | error
  function startMonsterEyes(){
    if(_eyeOn) return; _eyeOn = true;
    window.addEventListener('mousemove', _onMonsterMouseMove);
    if(!_eyeRAF) _eyeRAF = requestAnimationFrame(_monsterEyeLoop);
  }
  function stopMonsterEyes(){
    _eyeOn = false;
    window.removeEventListener('mousemove', _onMonsterMouseMove);
  }
  function _onMonsterMouseMove(e){
    if(_eyeState === 'email' || _eyeState === 'pwfocus' || _eyeState === 'error') return; // 聚焦/错误时眼睛锁定
    _eyeTarget.x = (e.clientX / window.innerWidth) * 2 - 1;
    _eyeTarget.y = (e.clientY / window.innerHeight) * 2 - 1;
  }
  function _monsterEyeLoop(){
    if(!_eyeOn){ _eyeRAF = null; return; }
    _eyeNorm.x += (_eyeTarget.x - _eyeNorm.x) * 0.12;
    _eyeNorm.y += (_eyeTarget.y - _eyeNorm.y) * 0.12;
    var nx = _eyeNorm.x, ny = _eyeNorm.y;
    // 紫/黑：白眼底+黑瞳，移动瞳孔
    setPupil('monster-purple', nx*3.5, ny*3.5);
    setPupil('monster-black',  nx*3.5, ny*3.5);
    // 黄/橙：纯黑眼（黑上黑，瞳不可见），只移整张脸
    if(_eyeState === 'idle'){
      setFace('monster-purple', nx*14, ny*8);
      setFace('monster-black',  nx*12, ny*6);
      setFace('monster-yellow', nx*20, ny*5);
      setFace('monster-orange', nx*25, ny*10);
      setBody('monster-purple', nx*10);
      setBody('monster-black',  nx*8);
      setBody('monster-yellow', nx*8);
      setBody('monster-orange', nx*12);
    }
    _eyeRAF = requestAnimationFrame(_monsterEyeLoop);
  }
  function setPupil(id, x, y){
    var m = document.getElementById(id); if(!m) return;
    var ps = m.querySelectorAll('.pupil');
    for(var i=0;i<ps.length;i++){ ps[i].style.setProperty('--px', x+'px'); ps[i].style.setProperty('--py', y+'px'); }
  }
  function setFace(id, x, y){
    var f = document.querySelector('#'+id+' .monster-face'); if(!f) return;
    f.style.setProperty('--fx', x+'px'); f.style.setProperty('--fy', y+'px');
  }
  function setBody(id, x){
    var m = document.getElementById(id); if(!m) return;
    m.style.setProperty('--bx', x+'px');
  }
  // 设置怪兽状态（聚焦/错误时锁定眼睛 + 形变）
  function setMonsterState(s){
    _eyeState = s;
    if(monsterLogin){
      monsterLogin.classList.toggle('state-email',   s==='email');
      monsterLogin.classList.toggle('state-pwfocus', s==='pwfocus');
      monsterLogin.classList.toggle('state-error',   s==='error');
    }
    // 进入非 idle 状态时清除内联 transform 变量，让 CSS 状态类生效
    if(s !== 'idle'){
      ['monster-purple','monster-black','monster-yellow','monster-orange'].forEach(function(id){
        var m = document.getElementById(id); if(!m) return;
        m.style.removeProperty('--bx'); m.style.removeProperty('--by');
        m.style.removeProperty('--br'); m.style.removeProperty('--bsx'); m.style.removeProperty('--bsy');
        var f = m.querySelector('.monster-face'); if(f){ f.style.removeProperty('--fx'); f.style.removeProperty('--fy'); f.style.removeProperty('--fr'); }
        var ps = m.querySelectorAll('.pupil'); for(var i=0;i<ps.length;i++){ ps[i].style.removeProperty('--px'); ps[i].style.removeProperty('--py'); }
      });
    }
    if(s === 'idle'){ _eyeTarget.x = 0; _eyeTarget.y = 0; }
  }
  function resetMonsterState(){ setMonsterState('idle'); }

  // 入口现在只有 welcome → loading → monster-login
  if(modalClose) modalClose.addEventListener('click', closeLoginModal);
  document.addEventListener('keydown',function(e){
    if(e.key==='Escape' && monsterLogin && monsterLogin.classList.contains('active')) closeLoginModal();
  });

  // ── 输入框聚焦 → 小怪兽状态（眼睛锁定 + 形变）──
  var _emailInput = loginForm ? loginForm.querySelector('input[name="email"]') : null;
  var _pwInput    = loginForm ? loginForm.querySelector('input[name="password"]') : null;
  if(_emailInput){
    _emailInput.addEventListener('focus', function(){ if(_eyeState!=='error') setMonsterState('email'); });
    _emailInput.addEventListener('blur',  function(){ if(_eyeState==='email') setMonsterState('idle'); });
  }
  if(_pwInput){
    _pwInput.addEventListener('focus', function(){ if(_eyeState!=='error') setMonsterState('pwfocus'); });
    _pwInput.addEventListener('blur',  function(){ if(_eyeState==='pwfocus') setMonsterState('idle'); });
  }

  // ── 欢迎屏入口 ──
  if(welcomeEnter) welcomeEnter.addEventListener('click', enterFromWelcome);
  if(welcomeScreen && viewLogin && viewLogin.classList.contains('active')){
    welcomeScreen.classList.add('active');
  }

  // ==================== AUTH FLOW ====================

  function isLoggedIn() { return !!currentUser; } // InsForge 迁移后 token 废弃（cookie 会话），仅检查 currentUser

  // 彻底关闭登录页所有浮层，防止它们泄漏到主界面/个人主页之上
  function hideLoginOverlays(){
    if(welcomeScreen){ welcomeScreen.classList.remove('active'); welcomeScreen.setAttribute('aria-hidden','true'); }
    if(loadingStage){ loadingStage.classList.remove('active','phase-rotating','phase-merging','phase-star','phase-flying'); loadingStage.setAttribute('aria-hidden','true'); }
    if(loginSubmitLoader){ loginSubmitLoader.classList.remove('active'); loginSubmitLoader.setAttribute('aria-hidden','true'); loginSubmitLoader.style.opacity = ''; }
    if(monsterLogin){ monsterLogin.classList.remove('active'); stopMonsterEyes && stopMonsterEyes(); }
  }

  function showMain() {
    _fromWelcome = false;
    hideLoginOverlays();
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

    // 顶部导航栏头像
    var navAvatar = document.getElementById('nav-avatar');
    if(navAvatar){
      navAvatar.textContent = getInitial(currentUser.nickname || currentUser.username);
      navAvatar.style.background = getAvatarColor(currentUser.username);
    }

    // 加载频道列表（InsForge）
    IF.listChannels().then(function(list) {
      channels = filterDmChannels(list);
      renderChannels();
      if (channels.length > 0) {
        switchChannel(channels[0]);
      }
      fetchUnreadCount();
      subscribeNotifications();
    }).catch(function() {
      channels = [];
      renderChannels();
      showToast('加载频道失败，请检查网络', 'error');
    });

    if(window._carousel) window._carousel.stop();
    closeLoginModal();
  }

  // ── 带 GSAP 过渡动画的 showMain（登录成功后调用）──
  function showMainWithTransition(){
    _fromWelcome = false;
    // 1. 彻底关闭登录页所有浮层（welcome/loading/submit-loader/monster）
    hideLoginOverlays();

    // 2. 切换视图状态
    viewLogin.classList.remove('active');
    viewLogin.setAttribute('aria-hidden','true');
    viewMain.classList.add('active');
    viewMain.removeAttribute('aria-hidden');
    if(viewProfile){ viewProfile.classList.remove('active'); viewProfile.setAttribute('aria-hidden','true'); }
    document.body.classList.add('main-active');

    // 3. 渲染用户信息
    if(userNameEl) userNameEl.textContent = currentUser.nickname || currentUser.username;
    if(userAvatarEl){
      userAvatarEl.textContent = getInitial(currentUser.nickname || currentUser.username);
      userAvatarEl.style.background = getAvatarColor(currentUser.username);
      userAvatarEl.style.cursor = 'pointer';
      userAvatarEl.title = '点击查看个人主页';
      userAvatarEl.onclick = function(){ showProfile(); };
    }
    if(userTagEl) userTagEl.innerHTML = '<span class="status-dot online" style="width:8px;height:8px;display:inline-block;border-radius:50%;border:none"></span> 在线';
    var navAvatar = document.getElementById('nav-avatar');
    if(navAvatar){
      navAvatar.textContent = getInitial(currentUser.nickname || currentUser.username);
      navAvatar.style.background = getAvatarColor(currentUser.username);
    }

    // 4. 优雅入场动画（fromTo 显式终点 opacity:1 + clearProps 兜底，绝不留在 opacity:0）
    if(!REDUCED_MOTION && typeof gsap !== 'undefined'){
      try {
        gsap.killTweensOf([viewMain, '#top-nav', '#channel-main', '#message-input-area']);
        gsap.fromTo(viewMain, { y: 24, opacity: 0 }, { y: 0, opacity: 1, duration: 0.5, ease: 'power3.out', clearProps: 'opacity,transform' });
        gsap.fromTo('#top-nav', { y: -18, opacity: 0 }, { y: 0, opacity: 1, duration: 0.42, ease: 'power2.out', delay: 0.06, clearProps: 'opacity,transform' });
        gsap.fromTo('#channel-main', { y: 16, opacity: 0 }, { y: 0, opacity: 1, duration: 0.5, ease: 'power3.out', delay: 0.1, clearProps: 'opacity,transform' });
        // 输入栏默认隐藏（CSS display:none），不做入场动画
        // 用户点FAB或💬评论时 showInputBar() 才显示
      } catch(e){ console.warn('GSAP entrance skipped:', e); }
    }

    // 5. 加载频道数据（与动画并行）
    // 6. 创建FAB浮动按钮 + 隐藏底部输入栏（全平台）
    ensureFab();
    // 输入栏默认隐藏（点FAB或评论时才 showInputBar 显示）
    IF.listChannels().then(function(list) {
      channels = filterDmChannels(list);
      renderChannels();
      renderRightSidebar();
      if (channels.length > 0) { switchChannel(channels[0]); }
      fetchUnreadCount();
      subscribeNotifications();
    }).catch(function(err) {
      channels = []; renderChannels(); renderRightSidebar();
      showToast('加载频道失败，请检查网络', 'error');
    });

    if(window._carousel) window._carousel.stop();
  }

  function showLogin(){
    viewMain.classList.remove('active');
    viewMain.setAttribute('aria-hidden','true');
    viewLogin.classList.add('active');
    viewLogin.removeAttribute('aria-hidden');
    if(viewProfile){ viewProfile.classList.remove('active'); viewProfile.setAttribute('aria-hidden','true'); }
    document.body.classList.remove('main-active');
    // ── 重置登录子视图到初始状态（退出登录/返回时必须）──
    if(welcomeScreen){ welcomeScreen.classList.add('active'); welcomeScreen.setAttribute('aria-hidden','false'); }
    if(loadingStage){ loadingStage.classList.remove('active','phase-rotating','phase-merging','phase-star','phase-flying'); loadingStage.setAttribute('aria-hidden','true'); }
    clearLoadingTimers();
    if(monsterLogin){ monsterLogin.classList.remove('active'); stopMonsterEyes(); }
    if(welcomeEnter) welcomeEnter.disabled = false;
    // 清除 GSAP 留下的内联样式，避免下次打开错位
    if(loginCard){ loginCard.style.opacity = ''; loginCard.style.transform = ''; }
    // 清理加载层残留状态
    if(loginSubmitLoader){
      loginSubmitLoader.classList.remove('active');
      loginSubmitLoader.setAttribute('aria-hidden','true');
      loginSubmitLoader.style.opacity = '';
    }
    if(_loaderTl){ _loaderTl.kill(); _loaderTl = null; }
    // 恢复登录卡片可见性（隐藏态，等用户从欢迎屏进入后再 openLoginModal）
    if(typeof gsap !== 'undefined' && loginCard) gsap.set(loginCard,{opacity:0,scale:0.95,y:20});
    disconnectRealtime();
    channels = [];
    channelMessages = {};
    currentChannel = null;
    unreadCounts = {};
    if(window._carousel) window._carousel.start();
  }

  function showProfile() {
    hideLoginOverlays();
    viewMain.classList.remove('active');
    viewLogin.classList.remove('active');
    if(viewProfile) viewProfile.classList.add('active');
    document.body.classList.add('main-active');
    renderProfile();
  }

  function backToMain() {
    if(!isLoggedIn()){ showLogin(); return; }
    // 完整恢复主界面状态（与 showMain 保持一致）
    hideLoginOverlays();
    viewProfile.classList.remove('active');
    if(viewProfile) viewProfile.setAttribute('aria-hidden','true');
    viewLogin.classList.remove('active');
    viewMain.classList.add('active');
    viewMain.removeAttribute('aria-hidden');
    document.body.classList.add('main-active');
    // 重新触发入场动画确保视觉恢复
    if(!REDUCED_MOTION && typeof gsap !== 'undefined'){
      try {
        gsap.killTweensOf([viewMain, '#top-nav', '#channel-main', '#message-input-area']);
        gsap.fromTo(viewMain, { y: 12, opacity: 0 }, { y: 0, opacity: 1, duration: 0.35, ease: 'power2.out', clearProps: 'opacity,transform' });
        gsap.fromTo('#top-nav', { y: -10, opacity: 0 }, { y: 0, opacity: 1, duration: 0.28, ease: 'power2.out', delay: 0.04, clearProps: 'opacity,transform' });
        gsap.fromTo('#channel-main', { y: 10, opacity: 0 }, { y: 0, opacity: 1, duration: 0.35, ease: 'power2.out', delay: 0.08, clearProps: 'opacity,transform' });
      } catch(e){ console.warn('GSAP back-to-main skipped:', e); }
    }
    // 确保频道数据仍在（从个人主页返回时 channels 应该还在内存中）
    if(!channels || channels.length === 0){
      IF.listChannels().then(function(list){
        channels = filterDmChannels(list);
        renderChannels();
        renderRightSidebar();
        if(channels.length > 0) switchChannel(channels[0]);
      }).catch(function(){ channels=[]; renderChannels(); renderRightSidebar(); });
    } else {
      renderChannels();
      renderRightSidebar();
    }
    ensureFab();
  }

  // ==================== PROFILE PAGE ====================

  var ROLE_META = {
    admin:   { label: '系统管理员', icon: '🔧' },
    teacher: { label: '教师',       icon: '👩‍🏫' },
    student: { label: '在校学生',   icon: '📚' }
  };

  function renderProfile() {
    if (!viewProfile) return;
    var user = currentUser;
    if (!user) return;

    var roleMeta = ROLE_META[user.role] || ROLE_META.student;
    var avatarInner = user.avatar_url
      ? '<img src="'+escapeHtml(user.avatar_url)+'" alt="" onerror="this.style.display=\'none\'">'
      : getInitial(user.nickname||user.username);
    var titleBadge = user.title
      ? '<span class="profile-title-badge">✦ '+escapeHtml(user.title)+'</span>'
      : '<span class="profile-title-badge profile-title-empty">未设置称号</span>';

    viewProfile.innerHTML =
      '<div class="profile-container">'+
        '<button class="profile-back" id="profile-back">← 返回</button>'+
        '<div class="profile-card">'+
          '<div class="profile-avatar-wrap" id="avatar-upload-trigger" title="点击更换头像">'+
            '<div class="profile-avatar" id="prof-avatar-el" style="background:'+getAvatarColor(user.username)+'">'+avatarInner+'</div>'+
            '<div class="avatar-camera-overlay"><span>📷</span></div>'+
            '<input type="file" id="avatar-file-input" accept="image/*" style="display:none;">'+
          '</div>'+
          '<h2 class="profile-name">'+escapeHtml(user.nickname||user.username)+'</h2>'+
          '<p class="profile-username">@'+escapeHtml(user.username)+'</p>'+
          '<div class="profile-title-row" id="profile-title-row">'+titleBadge+'</div>'+
          '<p class="profile-bio">'+roleMeta.icon+' '+roleMeta.label+'</p>'+

          '<div class="profile-stats">'+
            '<div class="profile-stat"><span class="ps-num">'+roleMeta.label.slice(0,3)+'</span><span class="ps-label">身份</span></div>'+
            '<div class="profile-stat"><span class="ps-num" id="prof-channels">-</span><span class="ps-label">可见频道</span></div>'+
            '<div class="profile-stat"><span class="ps-num" id="prof-messages">-</span><span class="ps-label">我的消息</span></div>'+
            '<div class="profile-stat"><span class="ps-num" id="prof-joined">-</span><span class="ps-label">加入天数</span></div>'+
          '</div>'+

          // 编辑区（默认收起）
          '<div class="profile-edit" id="profile-edit" style="display:none;">'+
            '<div class="pe-field"><label>昵称</label>'+
              '<input type="text" id="pe-nickname" maxlength="20" placeholder="你的昵称" value="'+escapeHtml(user.nickname||'')+'"></div>'+
            '<div class="pe-field"><label>称号 <span class="pe-hint">可自拟 · 最多12字</span></label>'+
              '<input type="text" id="pe-title" maxlength="12" placeholder="如：学习委员 / 篮球队长" value="'+escapeHtml(user.title||'')+'"></div>'+
            '<div class="pe-actions">'+
              '<button class="profile-btn" id="pe-save">保存</button>'+
              '<button class="profile-btn profile-btn-outline" id="pe-cancel">取消</button>'+
            '</div>'+
            '<div class="pe-msg" id="pe-msg"></div>'+
          '</div>'+

          '<div class="profile-actions" id="profile-actions">'+
            '<button class="profile-btn" id="profile-edit-btn">编辑资料</button>'+
            (user.role === 'admin' ? '<button class="profile-btn profile-btn-outline" id="profile-admin-btn">管理后台</button>' : '')+
            '<button class="profile-btn profile-btn-outline" id="profile-logout-btn">退出登录</button>'+
          '</div>'+
        '</div>'+
      '</div>';

    // ---- 真实统计 ----
    var chEl = document.getElementById('prof-channels');
    if (chEl) chEl.textContent = (channels ? channels.length : 0);

    var joinedEl = document.getElementById('prof-joined');
    if (joinedEl) {
      var createdAt = user.created_at || (IF && IF.resolveAuthor ? (IF.resolveAuthor(user.id)||{}).created_at : null);
      if (createdAt) {
        var days = Math.max(0, Math.floor((Date.now() - new Date(createdAt).getTime()) / 86400000));
        joinedEl.textContent = days;
      } else { joinedEl.textContent = '—'; }
    }

    // 我的消息数：向后端真实统计（count head 查询，不拉全量）
    var msgEl = document.getElementById('prof-messages');
    if (msgEl) {
      if (IF && IF.insforge) {
        IF.insforge.database.from('messages')
          .select('*', { count: 'exact', head: true }).eq('author_id', user.id)
          .then(function(r){ msgEl.textContent = (r && typeof r.count === 'number') ? r.count : countAllMessages(); })
          .catch(function(){ msgEl.textContent = countAllMessages(); });
      } else { msgEl.textContent = countAllMessages(); }
    }

    // ---- 事件绑定 ----
    setTimeout(function() {
      var backBtn = document.getElementById('profile-back');
      if (backBtn) backBtn.addEventListener('click', backToMain);

      // ---- 头像上传 ----
      var avatarTrigger = document.getElementById('avatar-upload-trigger');
      var avatarInput   = document.getElementById('avatar-file-input');
      if (avatarTrigger && avatarInput) {
        avatarTrigger.addEventListener('click', function(e){
          // 防止在编辑模式下点头像误触（编辑模式不换头像）
          if (editBox && editBox.style.display === 'block') return;
          e.stopPropagation();
          avatarInput.click();
        });
        avatarInput.addEventListener('change', function(){
          var file = this.files && this.files[0];
          if (!file) return;
          // 校验
          if (!file.type.startsWith('image/')) { alert('请选择图片文件'); return; }
          if (file.size > 5*1024*1024) { alert('图片不能超过 5MB'); return; }
          var avatarEl  = document.getElementById('prof-avatar-el');
          var overlayEl = avatarTrigger.querySelector('.avatar-camera-overlay');
          // 本地预览
          var reader = new FileReader();
          reader.onload = function(ev) {
            if (avatarEl) {
              avatarEl.innerHTML = '<img src="'+ev.target.result+'" alt="" style="width:100%;height:100%;border-radius:50%;object-fit:cover;">';
              avatarEl.style.background = 'transparent';
            }
            if (overlayEl) overlayEl.style.display = 'none';
          };
          reader.readAsDataURL(file);
          // 上传到 InsForge Storage → 更新 profile
          (IF && IF.uploadFile ? IF.uploadFile(file) : Promise.reject('SDK未就绪'))
            .then(function(result) {
              var url = (result && result.url) || '';
              if (!url) throw new Error('上传未返回URL');
              return IF.updateMyProfile(currentUser.id, { avatar_url: url });
            })
            .then(function() {
              // 用上传返回的真实 URL（已改写为反代域名），而非本地预览的 data URL
              currentUser.avatar_url = url;
              // 同步更新导航栏头像
              var navA = document.getElementById('nav-avatar');
              if (navA && currentUser.avatar_url) {
                navA.innerHTML = '<img src="'+currentUser.avatar_url+'" alt="" style="width:100%;height:100%;border-radius:50%;object-fit:cover;" onerror="this.parentNode.textContent=\''+getInitial(currentUser.nickname||currentUser.username)+'\'">';
              }
              showToast('头像更新成功 ✅');
            })
            .catch(function(err) {
              console.error('[avatar] 上传失败', err);
              showToast('头像上传失败：' + ((err && err.message) || '未知错误'), 'error');
              // 回滚显示
              renderProfile();
            });
          this.value = ''; // 允许重复选同一文件
        });
      }

      var editBtn = document.getElementById('profile-edit-btn');
      var editBox = document.getElementById('profile-edit');
      var actionsBox = document.getElementById('profile-actions');
      if (editBtn) editBtn.addEventListener('click', function(){
        if (editBox) editBox.style.display = 'block';
        if (actionsBox) actionsBox.style.display = 'none';
      });
      var cancelBtn = document.getElementById('pe-cancel');
      if (cancelBtn) cancelBtn.addEventListener('click', function(){
        if (editBox) editBox.style.display = 'none';
        if (actionsBox) actionsBox.style.display = 'flex';
      });

      var saveBtn = document.getElementById('pe-save');
      if (saveBtn) saveBtn.addEventListener('click', function(){
        var nick = (document.getElementById('pe-nickname').value || '').trim();
        var ttl  = (document.getElementById('pe-title').value || '').trim();
        var msgBox = document.getElementById('pe-msg');
        if (!nick) { if (msgBox){ msgBox.textContent='昵称不能为空'; msgBox.className='pe-msg pe-msg-err'; } return; }
        saveBtn.disabled = true; saveBtn.textContent = '保存中…';
        if (msgBox) { msgBox.textContent=''; msgBox.className='pe-msg'; }
        Promise.resolve(IF && IF.updateMyProfile ? IF.updateMyProfile(user.id, { nickname: nick, title: ttl }) : Promise.reject(new Error('后端未就绪')))
          .then(function(){
            currentUser.nickname = nick;
            currentUser.title = ttl;
            // 同步顶部导航头像/名字
            var navName = document.getElementById('user-name');
            if (navName) navName.textContent = nick;
            renderProfile();
          })
          .catch(function(e){
            saveBtn.disabled = false; saveBtn.textContent = '保存';
            if (msgBox){ msgBox.textContent='保存失败：'+((e&&e.message)||'请重试'); msgBox.className='pe-msg pe-msg-err'; }
          });
      });

      var adminBtn = document.getElementById('profile-admin-btn');
      if (adminBtn) adminBtn.addEventListener('click', function() {
        window.location.href = 'admin.html';
      });

      var logoutBtn = document.getElementById('profile-logout-btn');
      if (logoutBtn) logoutBtn.addEventListener('click', function() {
        if (IF) IF.signOut().catch(function(){});
        currentUser = null;
        showLogin();
      });
    }, 60);
  }

  // ==================== CHANNELS ====================

  // ── 频道动画映射（GSAP） ──
  var chAnimMap = {
    '公告栏':   'typewriter',
    '综合大厅': 'bounce',
    '学习园地': 'flip',
    '生活日常': 'breathe',
    '二次元世界': 'rainbow'
  };

  // 骨架屏动画映射
  var chSkeletonMap = {
    '公告栏':   'notice',   '综合大厅': 'general',
    '学习园地': 'study',    '生活日常': 'life',
    '二次元世界': 'anime'
  };
  var _skeletonTL = null;

  function playChannelAnim(item, animType) {
    var nameEl = item.querySelector('.ch-name');
    if (!nameEl) return;
    try {
      switch(animType) {
        case 'typewriter':
          gsap.fromTo(nameEl,
            { clipPath: 'inset(0 100% 0 0)', opacity: 0.3 },
            { clipPath: 'inset(0 0% 0 0)', opacity: 1, duration: 0.5, ease: 'power2.inOut' }
          );
          var cursor = document.createElement('span');
          cursor.textContent = '\u252C'; cursor.style.cssText = 'color:var(--accent);animation:sk-blink 0.6s step-end infinite;margin-left:2px;';
          nameEl.appendChild(cursor);
          setTimeout(function(){ if(cursor.parentNode) cursor.remove(); }, 800);
          break;
        case 'bounce':
          gsap.fromTo(item,
            { scale: 0.82, opacity: 0.5 },
            { scale: 1, opacity: 1, duration: 0.55, ease: 'elastic.out(1, 0.35)' }
          );
          var ripple = document.createElement('div');
          ripple.style.cssText = 'position:absolute;inset:-4px;border-radius:12px;border:2px solid rgba(124,92,252,0.4);pointer-events:none;';
          item.style.position='relative'; item.appendChild(ripple);
          gsap.fromTo(ripple, {scale:0.8,opacity:1}, {scale:1.5,opacity:0,duration:0.5,ease:'power2.out',onComplete:function(){ripple.remove();}});
          break;
        case 'flip':
          gsap.fromTo(item,
            { rotationY: -90, opacity: 0, transformOrigin: 'left center' },
            { rotationY: 0, opacity: 1, duration: 0.5, ease: 'back.out(1.4)' }
          );
          break;
        case 'breathe':
          gsap.fromTo(item,
            { opacity: 0.5, scale: 0.95 },
            { opacity: 1, scale: 1, duration: 0.45, ease: 'sine.inOut', yoyo: true, repeat: 1 }
          );
          var glow = document.createElement('div');
          glow.style.cssText = 'position:absolute;inset:-4px;border-radius:12px;pointer-events:none;';
          item.style.position='relative'; item.appendChild(glow);
          gsap.fromTo(glow, {boxShadow:'0 0 0 rgba(16,185,129,0)'}, {
            boxShadow: '0 0 20px rgba(16,185,129,0.2)', duration: 0.9, yoyo:true, repeat:1,
            onComplete:function(){ if(glow.parentNode) glow.remove(); gsap.set(item,{clearProps:'all'}); }
          });
          break;
        case 'rainbow':
          gsap.to(nameEl, {
            color: ['#ff6b9d','#c56cf0','#17c0eb','#ffd32a','#ff6b9d'],
            duration: 0.6, ease: 'none',
            onComplete: function() { gsap.set(nameEl, { clearProps: 'color' }); }
          });
          var star = document.createElement('span'); star.textContent='\u2728';
          star.style.cssText = 'position:absolute;right:10px;top:50%;translateY(-50%);font-size:14px;pointer-events:none;';
          item.style.position='relative'; item.appendChild(star);
          gsap.fromTo(star, {opacity:0,scale:0,rotation:-180},
            {opacity:1,scale:1.4,rotation:0,duration:0.3,ease:'back.out(2)',
             yoyo:true,repeat:1,onComplete:function(){star.remove();}});
          break;
        default:
          gsap.fromTo(item, {x:-10,opacity:0.5},{x:0,opacity:1,duration:0.3,ease:'power2.out'});
      }
    } catch(e) {
      item.style.transition = 'transform 0.3s ease, opacity 0.3s ease';
      item.style.transform = 'scale(1.05)';
      setTimeout(function(){ item.style.transform=''; }, 300);
    }
  }

  // ── 频道图标映射（动态 CSS 动画图标） ──
  var chIconMap = {
    '公告栏':   'ch-icon-notice',
    '综合大厅': 'ch-icon-chat',
    '学习园地': 'ch-icon-book',
    '生活日常': 'ch-icon-life',
    '二次元世界': 'ch-icon-anime'
  };

  // ── 顶部频道信息卡：主题 key + 大动态图标模板 ──
  var chHeroMap = {
    '公告栏':   'notice',
    '综合大厅': 'chat',
    '学习园地': 'book',
    '生活日常': 'life',
    '二次元世界': 'anime'
  };
  var chHeroIcon = {
    notice: '<span class="hi hi-notice"><i class="hn-horn"></i><i class="hn-wave w1"></i><i class="hn-wave w2"></i><i class="hn-star"></i></span>',
    chat:   '<span class="hi hi-chat"><i class="hc-bubble b1"></i><i class="hc-bubble b2"></i><i class="hc-dots"></i></span>',
    book:   '<span class="hi hi-book"><i class="hb-cover"></i><i class="hb-spine"></i><i class="hb-page"></i><i class="hb-pen"></i></span>',
    life:   '<span class="hi hi-life"><i class="hl-heart"></i><i class="hl-ring r1"></i><i class="hl-ring r2"></i><i class="hl-leaf"></i></span>',
    anime:  '<span class="hi hi-anime"><i class="ha-star big"></i><i class="ha-ring"></i><i class="ha-star s1"></i><i class="ha-star s2"></i></span>'
  };
  var _reduceMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  function applyChannelCard(ch){
    var card = document.getElementById('nav-channel-card');
    var glow = document.getElementById('ch-card-glow');
    if(!card || !ch) return;
    var key = chHeroMap[ch.name] || 'chat';
    card.setAttribute('data-ch', key);
    if(_reduceMotion) { if(glow) glow.style.opacity = '0.55'; return; }
    try {
      gsap.fromTo(card, {backgroundColor:'rgba(255,255,255,0.05)'}, {backgroundColor:'', duration:0.5, ease:'power2.out', clearProps:'backgroundColor'});
    } catch(e) {
      if(glow) glow.style.opacity = '0.55';
    }
  }

  function renderChannels(){
    if(!sidebarChannels) return;
    sidebarChannels.innerHTML='';
    if (!channels || channels.length === 0) return;

    var groups = { announcement: [], public: [] };
    channels.forEach(function(ch) {
      if (ch.type === 'announcement') groups.announcement.push(ch);
      else groups.public.push(ch);
    });

    // ═══ 公告频道 — 不折叠 ═══
    groups.announcement.forEach(function(ch){
      var item=document.createElement('div');
      var isActive = currentChannel && currentChannel.id === ch.id;
      item.className='ch-item ch-notice'+(isActive?' active':''); item.dataset.channel=ch.id;
      item.innerHTML='<span class="ch-icon '+(chIconMap[ch.name]||'')+'"></span><span class="ch-name">'+escapeHtml(ch.name)+'</span>';
      item.addEventListener('click',function(){
        switchChannel(ch);
        playChannelAnim(this, chAnimMap[ch.name]||'bounce');
      });
      sidebarChannels.appendChild(item);
      if(isActive) playChannelAnim(item, chAnimMap[ch.name]||'bounce');
    });

    // ═══ 交流频道 — 可折叠 ═══
    if(groups.public.length > 0){
      var catDiv=document.createElement('div'); catDiv.className='ch-category';
      var title=document.createElement('div'); title.className='ch-category-title';
      title.innerHTML='<svg viewBox="0 0 12 12"><path d="M2 4l4 4 4-4" fill="none" stroke="currentColor" stroke-width="1.5"/></svg>\uD83D\uDCAC \u4ea4\u6d41\u9891\u9053';
      var list=document.createElement('div'); list.className='ch-list';
      title.addEventListener('click',function(){ this.classList.toggle('collapsed'); list.style.display=this.classList.contains('collapsed')?'none':''; });

      groups.public.forEach(function(ch){
        var item=document.createElement('div');
        var isActive = currentChannel && currentChannel.id === ch.id;
        item.className='ch-item'+(isActive?' active':''); item.dataset.channel=ch.id;
        item.innerHTML='<span class="ch-icon '+(chIconMap[ch.name]||'')+'"></span><span class="ch-name">'+escapeHtml(ch.name)+'</span>';
        item.addEventListener('click',function(){
          switchChannel(ch);
          playChannelAnim(this, chAnimMap[ch.name]||'bounce');
        });
        list.appendChild(item);
        if(isActive) playChannelAnim(item, chAnimMap[ch.name]||'bounce');
      });
      catDiv.appendChild(title); catDiv.appendChild(list); sidebarChannels.appendChild(catDiv);
    }

    // 入场交错动画
    var allItems = sidebarChannels.querySelectorAll('.ch-item');
    if (allItems.length > 0) {
      try { gsap.fromTo(allItems, {opacity:0,x:-20}, {opacity:1,x:0,duration:0.4,stagger:0.08,ease:'power2.out',overwrite:true}); } catch(e){}
    }
  }

  // ==================== 频道专属骨架屏（GSAP） ====================

  function getChannelSkeletonHTML(type) {
    switch(type) {
      case 'notice':
        return '<div class="sk-channel sk-notice"><div class="sk-n-icon">\uD83D\uDCE2</div><div class="sk-n-body">' +
          '<div class="sk-n-line"><span></span></div><div class="sk-n-line"><span></span></div>' +
          '<div class="sk-n-line short"><span></span></div><div class="sk-n-line"><span></span></div>' +
          '<div class="sk-n-line short"><span></span></div></div></div>';
      case 'general':
        return '<div class="sk-channel sk-general">' +
          '<div class="sk-b-row"><div class="sk-b-dot"></div><div class="sk-b-dot"></div><div class="sk-b-dot"></div></div>' +
          '<div class="sk-p-lines"><div class="sk-pl"></div><div class="sk-pl"></div><div class="sk-pl short"></div></div>' +
          '<div class="sk-p-lines"><div class="sk-pl short"></div><div class="sk-pl"></div><div class="sk-pl"></div></div>' +
          '<div class="sk-p-lines"><div class="sk-pl"></div><div class="sk-pl short"></div><div class="sk-pl"></div></div></div>';
      case 'study':
        return '<div class="sk-channel sk-study">' +
          '<div class="sk-book"><div class="sk-bk-spine"></div><div class="sk-bk-page p1"></div><div class="sk-bk-page p2"></div><div class="sk-bk-page p3"></div></div>' +
          '<div class="sk-t-lines"><div class="sk-tl"></div><div class="sk-tl"></div><div class="sk-tl short"></div></div>' +
          '<div class="sk-t-lines"><div class="sk-tl short"></div><div class="sk-tl"></div><div class="sk-tl"></div></div>' +
          '<div class="sk-t-lines"><div class="sk-tl"></div><div class="sk-tl short"></div><div class="sk-tl"></div></div></div>';
      case 'life':
        return '<div class="sk-channel sk-life">' +
          '<div class="sk-w-avatar"><div class="sk-w-ring r1"></div><div class="sk-w-ring r2"></div></div>' +
          '<div class="sk-br-lines"><div class="sk-bl"></div><div class="sk-bl"></div><div class="sk-bl short"></div></div>' +
          '<div class="sk-br-lines"><div class="sk-bl short"></div><div class="sk-bl"></div><div class="sk-bl"></div></div>' +
          '<div class="sk-br-lines"><div class="sk-bl"></div><div class="sk-bl short"></div><div class="sk-bl"></div></div></div>';
      case 'anime':
        return '<div class="sk-channel sk-anime">' +
          '<div class="sk-s-avatar">\u2726</div>' +
          '<div class="sk-r-lines"><div class="sk-rl"></div><div class="sk-rl"></div><div class="sk-rl short"></div></div>' +
          '<div class="sk-r-lines"><div class="sk-rl short"></div><div class="sk-rl"></div><div class="sk-rl"></div></div>' +
          '<div class="sk-r-lines"><div class="sk-rl"></div><div class="sk-rl short"></div><div class="sk-rl"></div></div>' +
          '<div class="sk-f-stars"><span>\u2726</span><span>\u2727</span><span>\u2726</span></div></div>';
      default:
        var h='';
        for(var i=0;i<5;i++) h+='<div class="msg-skeleton"><div class="sk-avatar"></div><div class="sk-body"><div class="sk-line"></div><div class="sk-line"></div><div class="sk-line"></div></div></div>';
        return h;
    }
  }

  function playSkeletonAnimation(type, container) {
    try {
      if (_skeletonTL) { _skeletonTL.kill(); _skeletonTL = null; }
      var tl = gsap.timeline({ repeat: -1 });

      switch(type) {
        case 'notice':
          tl.fromTo(container.querySelectorAll('.sk-n-line span'),{width:'0%'},{width:'100%',duration:0.6,stagger:0.25,ease:'power1.inOut'})
            .to(container.querySelectorAll('.sk-n-line span'),{opacity:0.4,duration:0.3,stagger:0.15})
            .to(container.querySelectorAll('.sk-n-line span'),{opacity:1,width:'100%',duration:0.4,stagger:0.15})
            .to(container.querySelector('.sk-n-icon'),{scale:1.15,duration:0.3,yoyo:true,repeat:1},0);
          break;
        case 'general':
          tl.fromTo('.sk-b-dot',{scale:0,opacity:0},{scale:1,opacity:1,duration:0.4,stagger:0.12,ease:'elastic.out(1,0.5)'})
            .to('.sk-b-dot',{y:-8,duration:0.25,stagger:0.08,ease:'power2.out',yoyo:true,repeat:1})
            .fromTo('.sk-pl',{scaleX:0},{scaleX:1,duration:0.5,stagger:0.08,ease:'power2.inOut',transformOrigin:'left'},0.2)
            .to('.sk-pl',{opacity:0.5,duration:0.4,stagger:0.08},'-=0.2')
            .to('.sk-pl',{opacity:1,duration:0.4,stagger:0.08});
          break;
        case 'study':
          tl.fromTo('.sk-bk-page',{rotationY:-90,opacity:0},{rotationY:0,opacity:1,duration:0.6,stagger:0.2,ease:'power2.out',transformOrigin:'left center'})
            .to('.sk-bk-page',{rotationY:5,duration:0.2,yoyo:true,repeat:1},'-=0.3')
            .fromTo('.sk-tl',{width:'0%'},{width:'100%',duration:0.4,stagger:0.06,ease:'power1.inOut'},0.3)
            .to('.sk-tl',{opacity:0.6,duration:0.3,stagger:0.06},'-=0.2')
            .to('.sk-tl',{opacity:1,duration:0.3,stagger:0.06})
            .to('.sk-bk-spine',{backgroundColor:'#a78bfa',duration:0.5,yoyo:true,repeat:1},0);
          break;
        case 'life':
          tl.to('.sk-w-ring',{scale:1.6,opacity:0,duration:1.2,stagger:0.3,ease:'power2.out',repeat:-1},0)
            .fromTo('.sk-bl',{width:'30%',opacity:0.4},{width:'100%',opacity:1,duration:0.8,stagger:0.08,ease:'sine.inOut',yoyo:true,repeat:-1},0)
            .to('.sk-w-avatar',{scale:1.05,duration:1.5,ease:'sine.inOut',yoyo:true,repeat:-1},0);
          break;
        case 'anime':
          tl.fromTo('.sk-rl',{backgroundPosition:'200% 0'},{backgroundPosition:'-200% 0',duration:1.2,stagger:0.15,ease:'none',repeat:-1},0)
            .to('.sk-s-avatar',{rotation:360,duration:2,ease:'none',repeat:-1},0)
            .to('.sk-f-stars span',{y:-10,opacity:0,duration:1.5,stagger:0.4,ease:'power1.out',repeat:-1},0);
          break;
      }
      _skeletonTL = tl;
    } catch(e) { _skeletonTL = null; }
  }

  function showMessageSkeleton(){
    if(!messagesArea) return;
    var type = currentChannel ? (chSkeletonMap[currentChannel.name]||'default') : 'default';
    messagesArea.innerHTML = '<div class="skeleton-wrapper">'+getChannelSkeletonHTML(type)+'</div>';
    playSkeletonAnimation(type, messagesArea);
  }

  // ── 右侧边栏渲染（贴吧风格：热点话题 + 频道推荐）──
  function renderRightSidebar() {
    var hotEl = document.getElementById('hot-topics');
    var popupHotEl = document.getElementById('hot-topics-mobile');
    var recEl = document.getElementById('rec-channels');
    if (!hotEl || !recEl) return;

    var hotItems = computeHotItems();
    buildHotCards(hotEl, hotItems);
    if (popupHotEl) buildHotCards(popupHotEl, hotItems);

    // ② 频道推荐：显示非公告频道
    recEl.innerHTML = '';
    var publicChannels = channels.filter(function(c) { return c.type !== 'announcement'; });
    if (publicChannels.length === 0) {
      recEl.innerHTML = '<li style="padding:10px;color:var(--text-muted);font-size:0.82rem;">暂无推荐频道</li>';
    } else {
      publicChannels.slice(0, 5).forEach(function(ch) {
        var li = document.createElement('li');
        li.className = 'channel-rec-item';
        // 统计消息数
        var msgs = channelMessages[ch.id] || [];
        var msgCount = msgs.length;
        // 随机颜色
        var colors = ['#7c5cfc','#f43f5e','#10b981','#f59e0b','#06b6d4','#8b5cf6'];
        var color = colors[Math.abs(hashCode(ch.name)) % colors.length];

        li.innerHTML =
          '<div class="channel-rec-avatar" style="background:linear-gradient(135deg,'+color+','+color+'88)">'+
            escapeHtml((ch.name||'?').charAt(0))+
          '</div>'+
          '<div class="channel-rec-info">'+
            '<div class="channel-rec-name">#'+escapeHtml(ch.name)+'</div>'+
            '<div class="channel-rec-desc">'+(ch.description || '校园交流')+'</div>'+
            '<div class="channel-rec-stats">💬 '+msgCount+' 条消息</div>'+
          '</div>';
        li.addEventListener('click', function() { switchChannel(ch); });
        recEl.appendChild(li);
      });
    }
  }

  // 计算热度榜（评论数 + 48h 时间衰减）
  function computeHotItems() {
    var allMsgs = [];
    var commentCounts = {}; // 顶层消息 id -> 评论/回复数
    Object.keys(channelMessages).forEach(function(chId) {
      var msgs = channelMessages[chId] || [];
      msgs.forEach(function(m) {
        if (m.parent_id) {
          commentCounts[m.parent_id] = (commentCounts[m.parent_id] || 0) + 1; // 统计评论
        } else {
          allMsgs.push(m); // 只取原始消息（话题）
        }
      });
    });
    // 热度分：评论权重高（每条 +10），时间衰减（48h 半衰期，0~5）
    var nowTs = Date.now();
    allMsgs.forEach(function(m) {
      var ageH = (nowTs - new Date(m.created_at).getTime()) / 3600000;
      if (isNaN(ageH) || ageH < 0) ageH = 0;
      var timeScore = Math.exp(-ageH / 48);
      var cc = commentCounts[m.id] || 0;
      m._heat = cc * 10 + timeScore * 5;
      m._comments = cc;
    });
    allMsgs.sort(function(a, b){ return b._heat - a._heat; });
    return allMsgs.slice(0, 7);
  }

  // 渲染一组热门话题卡片（桌面侧栏 + 移动端 popup 复用）
  function buildHotCards(listEl, hotItems) {
    listEl.innerHTML = '';
    if (hotItems.length === 0) {
      listEl.innerHTML = '<li style="padding:10px;color:var(--text-muted);font-size:0.82rem;">暂无热点话题</li>';
      return;
    }
    hotItems.forEach(function(msg, i) {
      var li = document.createElement('li');
      var rank = i + 1;
      // 截取内容作为标题
      var title = msg.content_type === 'text' ? msg.content.slice(0, 30) : '[图片]';
      if (title.length >= 30) title += '...';
      var cc = msg._comments || 0;
      // 频道名
      var chName = '?';
      var ch = channels.find(function(c){ return c.id == msg.channel_id; });
      if (ch) chName = ch.name;
      // 相对时间
      var ageStr = (typeof formatRelativeTime === 'function') ? formatRelativeTime(msg.created_at) : '';
      // 热度条宽度：相对榜首归一化（最小 14% 保证可见）
      var maxHeat = hotItems.length ? hotItems[0]._heat : 1;
      var pct = maxHeat > 0 ? Math.round((msg._heat / maxHeat) * 100) : 0;
      pct = Math.max(14, Math.min(100, pct));

      li.className = 'hot-card';
      li.innerHTML =
        '<span class="hot-card-rank'+(rank<=3?' top3':'')+'">'+rank+'</span>'+
        '<div class="hot-card-body">'+
          '<div class="hot-card-title">'+escapeHtml(title)+'</div>'+
          '<div class="hot-card-meta">'+escapeHtml(chName)+' · '+cc+' 讨论</div>'+
          '<div class="hot-card-foot">'+
            '<span class="hot-card-time">'+escapeHtml(ageStr)+'</span>'+
            '<span class="hot-heat-track"><span class="hot-heat-fill" style="width:'+pct+'%"></span></span>'+
          '</div>'+
        '</div>';
      li.style.animationDelay = (i * 55) + 'ms'; // 交错入场
      li.title = (ch ? '#'+chName+' · ' : '') + cc + ' 条讨论 · ' + ageStr;
      li.addEventListener('click', function() {
        if (!ch) return;
        // 关键修复：切频道是异步加载，等消息渲染完（onAfterRender）再滚动+高亮，
        // 否则 querySelector 找不到元素，只会切频道不滚到消息。
        pendingJumpMsgId = msg.id; // 告知 switchChannel 把该消息纳入渲染窗口（即使是很早的消息）
        switchChannel(ch, function() {
          var msgEl = messagesArea
            ? messagesArea.querySelector('.msg-group[data-msg-id="'+msg.id+'"]')
            : null;
          if (msgEl) {
            requestAnimationFrame(function(){
              msgEl.scrollIntoView({ behavior:'auto', block:'center' });
              if (typeof hideScrollBtn === 'function') hideScrollBtn();
              // B+C：主题色描边呼吸 + 顶部「来自热门话题」标签
              msgEl.classList.add('msg-hot-highlight');
              var existing = msgEl.querySelector('.msg-hot-badge');
              if (existing) existing.remove();
              var badge = document.createElement('span');
              badge.className = 'msg-hot-badge';
              badge.textContent = '🔥 来自热门话题';
              msgEl.appendChild(badge);
              setTimeout(function(){
                msgEl.classList.remove('msg-hot-highlight');
                if (badge.parentNode) badge.remove();
              }, 3600);
            });
          }
        });
      });
      listEl.appendChild(li);
    });
  }

  // 简单哈希（用于稳定随机色）
  function hashCode(str) {
    var hash = 0;
    for (var i = 0; i < str.length; i++) { hash = ((hash << 5) - hash) + str.charCodeAt(i); }
    return hash;
  }

  function switchChannel(ch, onAfterRender){
    var prevChannel = currentChannel; // 切换前频道，用于缓存/订阅判断
    renderWinEnd = RENDER_WIN; // 进入频道重置渲染窗口（pendingJumpMsgId 由调用方在 switchChannel 前设置）
    // Mark previous as read
    if (prevChannel && prevChannel.id !== ch.id) {
      lastReadTimestamps[prevChannel.id] = Date.now();
      unreadCounts[prevChannel.id] = 0;
      updateChannelBadges();
    }

    currentChannel = ch;
    lastReadTimestamps[ch.id] = Date.now();
    unreadCounts[ch.id] = 0;
    updateChannelBadges();

    if(channelTitle) channelTitle.textContent=ch.name;
    if(channelDesc) channelDesc.textContent=ch.description||'';
    applyChannelCard(ch);
    updateInputRestriction();

    document.querySelectorAll('.ch-item').forEach(function(el){ el.classList.toggle('active', parseInt(el.dataset.channel) === ch.id); });

    // 切频道时收起输入框
    hideInputBar();

    // ── 跳转性能优化：避免每次都重新拉取 + 全量重渲染 ──
    if (prevChannel && prevChannel.id === ch.id) {
      // 已在目标频道：若目标消息不在当前 DOM（窗口外），先扩展窗口重渲染；否则零重渲染直接定位
      if (pendingJumpMsgId && messagesArea && !messagesArea.querySelector('.msg-group[data-msg-id="'+pendingJumpMsgId+'"]')) {
        renderMessages(); // 内部会清空 pendingJumpMsgId
      } else {
        pendingJumpMsgId = null; // 目标已在 DOM，手动清空，避免污染后续渲染
      }
      if (typeof onAfterRender === 'function') { try { onAfterRender(); } catch (e) {} }
    } else if (channelMessages[ch.id] && channelMessages[ch.id].length) {
      // 缓存命中：跳过网络拉取，直接复用已加载消息渲染
      renderMessages();
      hideScrollBtn();
      if (typeof onAfterRender === 'function') { try { onAfterRender(); } catch (e) {} }
    } else {
      // 首次加载：拉取消息 + 点赞聚合
      showMessageSkeleton();
      IF.getMessages(ch.id).then(function(list) {
        channelMessages[ch.id] = list || [];
        var ids = (list || []).map(function(m){ return m.id; });
        var afterAgg = function() {
          renderMessages();
          if (messagesArea) { messagesArea.scrollTop = 0; } // 进入频道停在顶部，自然一些
          hideScrollBtn();
          if (typeof onAfterRender === 'function') {
            try { onAfterRender(); } catch (e) {}
          }
        };
        // 聚合本频道所有消息的点赞（一次查询，前端计数；无触发器/无计数列/无 RLS 冲突）
        if (ids.length && currentUser && IF.getLikeAggregates) {
          IF.getLikeAggregates(ids, currentUser.id).then(function(agg){
            likeAgg = agg || {};
            // 一致性兜底：自己点过赞的消息至少 total=1
            for (var mid in likeAgg) {
              if (likeAgg.hasOwnProperty(mid) && likeAgg[mid].mine && likeAgg[mid].total <= 0) {
                likeAgg[mid].total = 1;
              }
            }
            afterAgg();
          }).catch(function(){ likeAgg = {}; afterAgg(); });
        } else {
          likeAgg = {};
          afterAgg();
        }
      }).catch(function() {
        renderMessages();
        if (typeof onAfterRender === 'function') { try { onAfterRender(); } catch (e) {} }
      });
    }

    if(pinBar) pinBar.classList.remove('visible');
    if(annBanner) annBanner.classList.remove('visible');
    closeDrawer();

    // Realtime 订阅当前频道
    if (IF) {
      if (prevChannel && prevChannel.id && prevChannel.id !== ch.id) {
        IF.unsubscribeChannel(prevChannel.id);
      }
      subscribeCurrentChannel();
    }
  }

  // 公告栏（announcement）限制：仅管理员可发言
  function updateInputRestriction() {
    var locked = isChannelLocked();
    var compose = document.getElementById('btn-compose');
    if (compose) {
      compose.style.display = locked ? 'none' : '';
      compose.disabled = locked;
    }
    var inputArea = document.getElementById('message-input-area');
    if (inputArea) inputArea.classList.toggle('locked-announcement', locked);
    if (msgInput) {
      msgInput.disabled = locked;
      msgInput.placeholder = locked
        ? '公告频道仅限管理员发言'
        : ('发送消息到 ' + (currentChannel ? currentChannel.name : ''));
    }
    if (btnAttach) btnAttach.disabled = locked;
    var emojiBtn = document.querySelector('.emoji-btn');
    if (emojiBtn) emojiBtn.disabled = locked;
    if (btnSend) btnSend.disabled = locked;
    if (locked) {
      hideInputBar();
      if (channelDesc && currentChannel) {
        var base = currentChannel.description || '';
        channelDesc.textContent = base + (base ? ' · ' : '') + '仅管理员可发言';
      }
    }
  }

  // ==================== MESSAGES ====================

  // 构建单条消息 DOM 节点（renderMessages / appendMessageNode / replaceMessageNode 共用）
  function buildMessageGroup(msg) {
    var group = document.createElement('div');
    group.className = 'msg-group' + (msg.isPending ? ' msg-pending' : '') + (msg.isFailed ? ' msg-failed' : '') + (msg.is_mod ? ' msg-group-mod' : '') + (msg.is_recalled ? ' msg-recalled-admin' : '');
    group.setAttribute('data-msg-id', msg.id || '');

    // ── 撤回（软删除）可见性 ──
    // 非管理员：看不到任何已撤回消息（等同彻底删除）。
    // 管理员：仍可见，消息内容显示红色以识别已撤回。
    if (msg.is_recalled) {
      if (!(currentUser && currentUser.role === 'admin')) {
        return null; // 非管理员不可见
      }
      // 管理员继续走正常渲染，className 会加 msg-recalled-admin 标红
    }

    if (msg.is_pinned) { group.style.background = 'rgba(240,178,50,0.04)'; group.style.borderRadius = 'var(--r)'; }

    if (msg.is_pinned) {
      var pinBadge = document.createElement('div'); pinBadge.className = 'msg-pin-indicator'; pinBadge.textContent = '📌 置顶'; group.appendChild(pinBadge);
    }

    // Quote (reply reference)
    var quoteHtml = '';
    if (msg.parent_id) {
      var parentMsg = findMessageById(currentChannel.id, msg.parent_id);
      if (parentMsg) {
        var qAuthor = (IF ? IF.resolveAuthor(parentMsg.author_id) : { nickname: '未知' });
        var qName = qAuthor.nickname || qAuthor.username || '未知用户';
        var qText = parentMsg.content_type === 'text' ? parentMsg.content : (parentMsg.content_type === 'image' ? '[图片]' : '[文件]');
        if (qText && qText.length > 50) qText = qText.slice(0, 50) + '…';
        quoteHtml = '<div class="msg-quote"><span class="quote-author">@'+escapeHtml(qName)+'</span><span class="quote-text">'+escapeHtml(qText)+'</span></div>';
      }
    }

    // 转发预览块（HuLa 范式：显示"X 转发了消息" + 原消息预览卡）
    var forwardHtml = '';
    if (msg.forward_from) {
      var fAuthor = msg.forward_author || '某人';
      var fPreview = msg.forward_preview || '';
      if (fPreview && fPreview.length > 120) fPreview = fPreview.slice(0, 120) + '…';
      forwardHtml = '<div class="msg-forward"><div class="msg-forward-head">🔁 '+escapeHtml(fAuthor)+' 转发了消息</div><div class="msg-forward-card">'+escapeHtml(fPreview)+'</div></div>';
    }

    var author = (IF ? IF.resolveAuthor(msg.author_id) : { username: '未知', nickname: '未知用户' });

    // 头像（优先头像图，否则首字母）
    var avatarInner;
    if (author.avatar_url) {
      avatarInner = '<img src="'+escapeHtml(author.avatar_url)+'" alt="'+escapeHtml(author.nickname||'')+'" onerror="this.style.display=\'none\'">';
    } else {
      avatarInner = getInitial(author.nickname||author.username||'?');
    }
    var avatarBg = getAvatarColor(author.username||'未知');

    // 称号（来自用户 profile 的 title 字段；无则不渲染）
    var titleHtml = '';
    if (author.title) {
      titleHtml = '<span class="msg-feed-title" title="'+escapeHtml(author.title)+'">✦ '+escapeHtml(author.title)+'</span>';
    }

    // 角色标签
    var role = author.role || 'member';
    var roleLabel = role === 'admin' ? '管理员' : role === 'moderator' ? '版主' : '成员';
    var roleCls = role === 'admin' ? 'admin' : role === 'moderator' ? 'moderator' : 'member';

    // 内容区块（文字 / 图片横排 / 文件）
    var contentBlock;
    if (msg.content_type === 'image') {
      var imgs = [];
      try {
        var imgData = JSON.parse(msg.content);
        imgs = Array.isArray(imgData) ? imgData : [imgData];
      } catch(e) {}
      if (imgs.length === 0) {
        contentBlock = '<div class="msg-content">[image]</div>';
      } else if (imgs.length > 1) {
        var ghtml = imgs.map(function(im){
          var url = im.url || im;
          return '<div class="msg-img-wrap" onclick="window.openImg(\''+escapeHtml(url)+'\')"><img src="'+escapeHtml(url)+'" alt="图片" loading="lazy" onerror="this.parentElement.innerHTML=\'<div class=msg-file-broken>image broken</div>\'"></div>';
        }).join('');
        contentBlock = '<div class="msg-img-gallery">'+ghtml+'</div>';
      } else {
        var oneUrl = imgs[0].url || imgs[0];
        contentBlock = '<div class="msg-content"><div class="msg-img-wrap" onclick="window.openImg(\''+escapeHtml(oneUrl)+'\')"><img src="'+escapeHtml(oneUrl)+'" alt="图片" loading="lazy" onerror="this.parentElement.innerHTML=\'<div class=msg-file-broken>image broken</div>\'"></div></div>';
      }
    } else if (msg.content_type === 'file') {
      try {
        var fileData = JSON.parse(msg.content);
        contentBlock = '<div class="msg-content"><div class="msg-file-card"><span class="msg-file-icon">file</span><div class="msg-file-info"><a href="'+escapeHtml(fileData.url)+'" target="_blank" class="msg-file-name">' + escapeHtml(fileData.name) + '</a><span class="msg-file-size">' + formatFileSize(fileData.size) + '</span></div></div></div>';
      } catch(e) { contentBlock = '<div class="msg-content">[file]</div>'; }
    } else {
      contentBlock = '<div class="msg-content">'+formatMsgText(msg.content)+'</div>';
    }

    // 状态（发送中 / 失败）
    var statusHtml = '';
    if (msg.isPending) statusHtml = '<span class="msg-status">(发送中...)</span>';
    else if (msg.isFailed) statusHtml = '<span class="msg-status">(发送失败)</span>';

    // 互动栏（贴吧风格：发送时间 ❤点赞 💬评论 🔁转发）
    var la = likeAgg[msg.id] || { total: 0, mine: false };
    // 一致性兜底：若 mine=true 但 total=0，说明聚合/状态不同步，至少显示 1（自己）
    if (la.mine && la.total <= 0) la.total = 1;
    var replyCount = (channelMessages[currentChannel.id] || []).filter(function(m){ return m.parent_id === msg.id; }).length;
    var interactionsHtml =
      '<div class="msg-interactions">'+
        '<div class="msg-interactions-left">'+
          createTimeCharsHtml(msg.created_at, msg.id)+
        '</div>'+
        '<div class="msg-interactions-right">'+
          '<button type="button" class="msg-interact-btn'+(la.mine?' liked':'')+'" data-act="like" data-msg-id="'+msg.id+'">♥ <span class="msg-interact-count">'+ la.total +'</span></button>'+
          '<button type="button" class="msg-interact-btn" data-act="comment" data-msg-id="'+msg.id+'">💬 <span class="msg-interact-count">'+ replyCount +'</span></button>'+
          '<button type="button" class="msg-interact-btn" data-act="share" data-msg-id="'+msg.id+'" title="转发">🔁</button>'+
        '</div>'+
      '</div>'+
      '<div class="msg-comment-section" id="comment-'+msg.id+'"></div>';

    // 贴吧风格模板：头像+昵称横排 → 内容 → 底部互动
    group.innerHTML =
      '<div class="msg-feed-left">'+
        '<div class="msg-feed-avatar" style="background:'+avatarBg+'">'+avatarInner+'</div>'+
        '<div class="msg-feed-meta">'+
          '<span class="msg-feed-name">'+escapeHtml(author.nickname||author.username||'未知')+'</span>'+
          '<span class="msg-feed-role"><span class="role-badge '+roleCls+'">'+roleLabel+'</span></span>'+
          titleHtml+
          (statusHtml ? '<span class="msg-status">'+statusHtml+'</span>' : '')+
        '</div>'+
      '</div>'+
      '<div class="msg-feed-body">'+
        quoteHtml+
        forwardHtml+
        contentBlock+
        interactionsHtml+
      '</div>';

    // 绑定互动按钮事件
    bindInteractionButtons(group, msg);
    // 绑定长按（移动）/右键（桌面）触发浮现撤回按键（仅有权限时）
    bindRecallTrigger(group, msg);
    return group;
  }

  // ── 撤回功能 ────────────────────────────────────────────────────────────
  // 是否有权撤回该消息：管理员随时；自己发的且 1 分钟内
  function canRecall(msg) {
    if (!currentUser || !msg) return false;
    if (currentUser.role === 'admin') return true;
    if (msg.author_id !== currentUser.id) return false;
    var ageSec = (Date.now() - new Date(msg.created_at).getTime()) / 1000;
    return ageSec < 60;
  }

  // 给消息节点绑定长按（移动）触发浮现撤回按键
  // 桌面右键统一走 messagesArea 事件委托，防止子元素/浏览器默认菜单截胡。
  function bindRecallTrigger(group, msg) {
    if (!canRecall(msg)) return;
    var timer = null, startX = 0, startY = 0;

    // 触摸/笔：pointerdown 起 500ms 视为长按
    group.addEventListener('pointerdown', function (e) {
      if (e.pointerType === 'mouse') return; // 鼠标走右键
      startX = e.clientX; startY = e.clientY;
      if (timer) clearTimeout(timer);
      timer = setTimeout(function () { triggerTouch(e); }, 500);
    });
    var triggerTouch = function (e) {
      if (!e) return;
      try { e.preventDefault(); e.stopPropagation(); } catch (err) {}
      showRecallPop(msg, group);
    };
    var cancel = function (e) {
      if (timer) { clearTimeout(timer); timer = null; }
      if (e && e.clientX !== undefined &&
          (Math.abs(e.clientX - startX) > 10 || Math.abs(e.clientY - startY) > 10)) { if (timer) clearTimeout(timer); }
    };
    group.addEventListener('pointermove', cancel);
    group.addEventListener('pointerup', cancel);
    group.addEventListener('pointercancel', cancel);
  }

  // 桌面右键：在消息列表容器上统一监听（事件委托），捕获阶段阻止浏览器默认菜单。
  // 点在非消息区域时放行默认菜单；点在消息上且有权撤回时浮现撤回键。
  if (messagesArea) {
    messagesArea.addEventListener('contextmenu', function (e) {
      if (!e) return;
      var group = e.target && e.target.closest ? e.target.closest('.msg-group') : null;
      if (!group) return; // 非消息区域保留浏览器默认菜单
      var msgId = group.getAttribute('data-msg-id');
      var msg = currentChannel ? findMessageById(currentChannel.id, msgId) : null;
      if (!msg || !canRecall(msg)) return; // 无权也放行默认菜单
      e.preventDefault();
      e.stopPropagation();
      try { e.returnValue = false; } catch (err) {}
      showRecallPop(msg, group);
      return false;
    }, true);
  }

  // 当前已打开的撤回浮层（同一时刻只一个）
  var _recallPop = null;
  function closeRecallPop() {
    if (!_recallPop) return;
    var el = _recallPop; _recallPop = null;
    try {
      if (typeof gsap !== 'undefined' && !REDUCED_MOTION) {
        gsap.to(el, { opacity: 0, x: 12, duration: 0.14, onComplete: function () { if (el.parentNode) el.parentNode.removeChild(el); } });
      } else if (el.parentNode) el.parentNode.removeChild(el);
    } catch (e) { if (el.parentNode) el.parentNode.removeChild(el); }
  }

  // 在气泡旁浮现「撤回」按键（GSAP 动画）
  function showRecallPop(msg, group) {
    closeRecallPop();
    var pop = document.createElement('div');
    pop.className = 'recall-pop';
    var btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'recall-pop-btn';
    btn.textContent = '撤回';
    pop.appendChild(btn);
    group.appendChild(pop);
    _recallPop = pop;

    // 临近 1 分钟过期自动关闭浮层
    if (currentUser && currentUser.role !== 'admin') {
      var ageSec = (Date.now() - new Date(msg.created_at).getTime()) / 1000;
      var left = 60000 - ageSec * 1000;
      if (left > 0) setTimeout(function () { if (_recallPop === pop) closeRecallPop(); }, left);
    }

    btn.addEventListener('click', function (e) {
      e.stopPropagation();
      closeRecallPop();
      doRecall(msg);
    });

    if (typeof gsap !== 'undefined' && !REDUCED_MOTION) {
      gsap.fromTo(pop, { opacity: 0, x: 12, scale: 0.9 }, { opacity: 1, x: 0, scale: 1, duration: 0.22, ease: 'back.out(2)' });
    }

    // 点击空白/其他消息/滚动时关闭
    setTimeout(function () {
      document.addEventListener('click', function onDoc(e) {
        if (_recallPop === pop && !pop.contains(e.target)) {
          closeRecallPop();
          document.removeEventListener('click', onDoc, true);
        }
      }, true);
      if (messagesArea) messagesArea.addEventListener('scroll', function onScroll() {
        closeRecallPop();
        messagesArea.removeEventListener('scroll', onScroll);
      }, { once: true });
    }, 0);
  }

  // 执行撤回：乐观更新 + 请求 + 广播
  function doRecall(msg) {
    if (!currentChannel || !currentUser || msg._recalling) return;
    msg._recalling = true;
    var recalledBy = currentUser.id;
    applyRecall(msg.id, recalledBy); // 乐观：自己先消失/占位
    IF.recallMessage(currentChannel.id, msg.id, recalledBy).then(function () {
      IF.publishRecall(currentChannel.id, msg.id, recalledBy);
      showToast('已撤回', 'info');
    }).catch(function () {
      // 回滚
      msg._recalling = false;
      msg.is_recalled = false;
      var node = messagesArea ? messagesArea.querySelector('.msg-group[data-msg-id="' + msg.id + '"]') : null;
      if (node) {
        var fresh = buildMessageGroup(msg);
        if (fresh) node.replaceWith(fresh); else node.remove();
      }
      showToast('撤回失败（可能已超过 1 分钟）', 'error');
    });
  }

  // ── 评论删除（自己或管理员，无时间限制）──
  function canDeleteComment(comment) {
    if (!currentUser || !comment) return false;
    if (currentUser.role === 'admin') return true;
    return comment.author_id === currentUser.id;
  }
  var _commentDelPop = null;
  function closeCommentDelPop() {
    if (!_commentDelPop) return;
    var el = _commentDelPop; _commentDelPop = null;
    try {
      if (typeof gsap !== 'undefined' && !REDUCED_MOTION) {
        gsap.to(el, { opacity: 0, x: 12, duration: 0.14, onComplete: function () { if (el.parentNode) el.parentNode.removeChild(el); } });
      } else if (el.parentNode) el.parentNode.removeChild(el);
    } catch (e) { if (el.parentNode) el.parentNode.removeChild(el); }
  }
  function showCommentDeletePop(comment, item) {
    closeCommentDelPop();
    var pop = document.createElement('div');
    pop.className = 'recall-pop';
    var btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'recall-pop-btn';
    btn.textContent = '删除';
    pop.appendChild(btn);
    item.appendChild(pop);
    _commentDelPop = pop;
    btn.addEventListener('click', function (e) {
      e.stopPropagation();
      closeCommentDelPop();
      doDeleteComment(comment);
    });
    if (typeof gsap !== 'undefined' && !REDUCED_MOTION) {
      gsap.fromTo(pop, { opacity: 0, x: 12, scale: 0.9 }, { opacity: 1, x: 0, scale: 1, duration: 0.22, ease: 'back.out(2)' });
    }
    setTimeout(function () {
      document.addEventListener('click', function onDoc(e) {
        if (_commentDelPop === pop && !pop.contains(e.target)) { closeCommentDelPop(); document.removeEventListener('click', onDoc, true); }
      }, true);
    }, 0);
  }
  function bindCommentDelete(item, comment) {
    if (!canDeleteComment(comment)) return;
    var fired = false;
    var trigger = function (e) {
      if (fired) return; fired = true;
      if (e && e.preventDefault) e.preventDefault();
      if (e && e.stopPropagation) e.stopPropagation();
      showCommentDeletePop(comment, item);
    };
    item.addEventListener('contextmenu', trigger);
    item.addEventListener('pointerdown', function (e) {
      if (e.pointerType === 'mouse') return;
      var sx = e.clientX, sy = e.clientY; fired = false;
      var t = setTimeout(function () { trigger(e); }, 500);
      var c = function (ev) {
        clearTimeout(t);
        if (ev && ev.clientX !== undefined && (Math.abs(ev.clientX - sx) > 10 || Math.abs(ev.clientY - sy) > 10)) fired = true;
      };
      item.addEventListener('pointermove', c);
      item.addEventListener('pointerup', c);
      item.addEventListener('pointercancel', c);
    });
  }
  function doDeleteComment(comment) {
    if (!currentChannel || !currentUser || comment._deleting) return;
    comment._deleting = true;
    var node = document.querySelector('.msg-comment-item[data-comment-id="' + comment.id + '"]');
    if (node) node.style.opacity = '0.4';
    IF.recallMessage(currentChannel.id, comment.id, currentUser.id).then(function () {
      IF.publishRecall(currentChannel.id, comment.id, currentUser.id);
      var arr = channelMessages[currentChannel.id] || [];
      var idx = arr.findIndex(function (m) { return m.id === comment.id; });
      if (idx >= 0) arr.splice(idx, 1);
      // 同步点赞聚合
      if (likeAgg[comment.id]) delete likeAgg[comment.id];
      if (node) node.remove();
      showToast('已删除评论', 'info');
    }).catch(function () {
      comment._deleting = false;
      if (node) node.style.opacity = '';
      showToast('删除失败，请重试', 'error');
    });
  }

  // 应用撤回效果到本地：更新内存数组 + DOM
  function applyRecall(msgId, recalledBy) {
    if (!currentChannel) return;
    var arr = channelMessages[currentChannel.id] || [];
    var target = null;
    for (var i = 0; i < arr.length; i++) { if (arr[i].id === msgId) { target = arr[i]; break; } }
    if (target) { target.is_recalled = true; target.recalled_by = recalledBy; }
    var node = messagesArea ? messagesArea.querySelector('.msg-group[data-msg-id="' + msgId + '"]') : null;
    if (!node) return;
    if (currentUser && currentUser.role === 'admin') {
      var fresh = buildMessageGroup(target);
      if (fresh) { node.replaceWith(fresh); } else { node.remove(); }
    } else {
      node.remove();
      if (target) { var idx = arr.indexOf(target); if (idx >= 0) arr.splice(idx, 1); }
    }
  }

  // 收到他人撤回的实时事件
  function handleIncomingRecall(payload) {
    if (!payload || !payload.id) return;
    applyRecall(payload.id, payload.recalled_by);
  }

  // 增量追加单条消息节点（发消息乐观插入 / 实时收到新消息时用），只动新节点、不重建整个频道
  function appendMessageNode(msg, animate) {
    if (!messagesArea) return;
    var node = buildMessageGroup(msg);
    if (!node) return;
    // 倒序流：新消息插到消息列表最顶，但要保持在欢迎卡/分隔线之后，
    // 避免 welcome-card 被顶到消息上方。
    var welcome = messagesArea.querySelector('.welcome-card');
    var divider = messagesArea.querySelector('.day-divider');
    var ref = divider ? divider.nextSibling : (welcome ? welcome.nextSibling : messagesArea.firstChild);
    if (ref) {
      messagesArea.insertBefore(node, ref);
    } else {
      messagesArea.appendChild(node);
    }
    if (animate && typeof gsap !== 'undefined' && !REDUCED_MOTION) {
      gsap.killTweensOf(node);
      gsap.fromTo(node, { scale: 0.92, opacity: 0 },
        { scale: 1, opacity: 1, duration: 0.45, ease: 'elastic.out(1,0.75)', clearProps: 'opacity,transform' });
    }
    // 发送时间字符逐显动画（无论是否启用入场动画，时间文字都按 GSAP 字符动画处理）
    if (node) animateTimeChars(node);
  }

  // 就地替换 pending 节点为真实消息节点（不重建整个频道），只更新这一个节点
  function replaceMessageNode(tempId, realMsg) {
    if (!messagesArea) return;
    var old = messagesArea.querySelector('.msg-group[data-msg-id="' + tempId + '"]');
    if (!old) { renderMessages(); return; } // 找不到（如已被其他路径重建）则退化为整页渲染
    // 倒序流：跟随判断改为"是否已在顶部附近"
    var wasAtTop = isNearTop();
    var newNode = buildMessageGroup(realMsg);
    old.replaceWith(newNode);
    // 替换后若原本在顶部，平滑贴顶：避免 pending 与真实节点高度差导致内容瞬间下跳
    if (wasAtTop) {
      messagesArea.scrollTo({ top: 0, behavior: 'smooth' });
    }
    // 无缝替换：不播整体入场动画，但发送时间按 GSAP 字符逐显重播一次
    if (newNode) animateTimeChars(newNode);
  }

  var RENDER_WIN = 80;           // 单次渲染消息上限，避免大频道全量重建 DOM 卡顿
  var renderWinEnd = RENDER_WIN; // 当前已渲染到（从最新起的条数）
  var pendingJumpMsgId = null;   // 跳转到指定消息时，renderMessages 需把它纳入渲染窗口

  function renderMessages(){
    if(!messagesArea) return;
    // 销毁骨架屏动画（消息加载完毕后）
    if (_skeletonTL) { _skeletonTL.kill(); _skeletonTL = null; }
    var msgs = channelMessages[currentChannel ? currentChannel.id : ''] || [];
    // 只渲染顶层消息；评论（parent_id 非空）只显示在对应评论区，避免"下发一条真实消息"的错觉
    msgs = msgs.filter(function(m){ return !m.parent_id; });

    // 保留已打开的评论区：renderMessages 会重建整个 DOM（评论区默认关闭），
    // 这里先记录哪些 root 评论区是打开的，渲染后还原，回复/实时评论到达时评论区不会被关掉
    var openCommentRoots = [];
    try {
      messagesArea.querySelectorAll('.msg-comment-section.open').forEach(function(sec){
        var id = sec.id && sec.id.replace(/^comment-/, '');
        if (id) openCommentRoots.push(id);
      });
    } catch(e){}

    messagesArea.innerHTML='';

    if (!currentChannel) return;

    var welcome=document.createElement('div'); welcome.className='welcome-card';
    var wcKey = chHeroMap[currentChannel.name] || 'chat';
    welcome.setAttribute('data-ch', wcKey);
    welcome.innerHTML='<span class="welcome-hero">'+(chHeroIcon[wcKey]||chHeroIcon.chat)+'</span>'+
      '<div class="welcome-text"><h3>'+escapeHtml(currentChannel.name)+'</h3><p>'+(currentChannel.description||'')+'</p></div>';
    messagesArea.appendChild(welcome);

    // GSAP：欢迎卡入场（图标回弹 + 文字淡入）
    if (typeof gsap !== 'undefined' && !_reduceMotion) {
      try {
        var wh=welcome.querySelector('.welcome-hero'), wt=welcome.querySelector('.welcome-text');
        if(wh) gsap.fromTo(wh, {scale:0.5, rotation:-12, opacity:0}, {scale:1, rotation:0, opacity:1, duration:0.5, ease:'back.out(1.7)', clearProps:'transform'});
        if(wt) gsap.fromTo(wt, {opacity:0, x:-12}, {opacity:1, x:0, duration:0.4, ease:'power2.out', clearProps:'transform'});
      } catch(e){}
    }

    if(msgs.length){
      var divider=document.createElement('div'); divider.className='day-divider'; divider.innerHTML='<span>消息</span>';
      messagesArea.appendChild(divider);
    }

    // 渲染窗口：倒序流最新在顶；默认渲染最近 RENDER_WIN 条，避免大频道全量重建 DOM
    var dispMsgs = msgs.slice().reverse(); // 最新在前（顶），最旧在后（底）
    var jumping = !!pendingJumpMsgId;
    if (pendingJumpMsgId) {
      for (var _k=0; _k<dispMsgs.length; _k++){ if (dispMsgs[_k].id === pendingJumpMsgId){ if (_k >= renderWinEnd) renderWinEnd = Math.min(dispMsgs.length, _k + 20); break; } }
    }
    var renderCount = Math.min(renderWinEnd, dispMsgs.length);
    for (var _i=0; _i<renderCount; _i++){
      var node = buildMessageGroup(dispMsgs[_i]);
      if (node) messagesArea.appendChild(node);
    }
    // 仍有更早消息：底部「加载更早」按钮（纯前端分页，数据已在缓存中，无后端开销）
    if (renderCount < dispMsgs.length) {
      var _more = document.createElement('div');
      _more.className = 'load-earlier';
      _more.textContent = '↑ 加载更早消息';
      _more.addEventListener('click', function(){
        renderWinEnd = Math.min(dispMsgs.length, renderWinEnd + RENDER_WIN);
        renderMessages();
      });
      messagesArea.appendChild(_more);
    }
    pendingJumpMsgId = null; // 消费后清空，避免影响后续渲染

    // Auto-scroll only if already at top（倒序流：最新在最顶，跟随顶部）；跳转时跳过，交给 onAfterRender 定位
    if (!jumping && isNearTop()) {
      messagesArea.scrollTo({ top: 0, behavior: 'smooth' });
    }

    // GSAP：消息交错进场（stagger）—— 用 fromTo 显式终点 opacity:1 + clearProps 兜底，绝不留在 opacity:0
    if (typeof gsap !== 'undefined' && !REDUCED_MOTION) {
      var groups = messagesArea.querySelectorAll('.msg-group');
      if (groups.length) {
        gsap.killTweensOf(groups);
        gsap.fromTo(groups,
          { y: 14, opacity: 0 },
          { y: 0, opacity: 1, duration: 0.42, ease: 'power3.out',
            stagger: { each: 0.04, start: 0.05 },
            clearProps: 'opacity,transform' });  // 动画结束清 inline，回 CSS 默认(可见)
      }
      // 欢迎卡片轻微弹入（更精致）
      var wc = messagesArea.querySelector('.welcome-card');
      if (wc) {
        gsap.killTweensOf(wc);
        gsap.fromTo(wc, { opacity: 0, y: -10, scale: 0.96 },
          { opacity: 1, y: 0, scale: 1, duration: 0.5, ease: 'back.out(1.6)', clearProps: 'opacity,transform' });
      }
      // 发送时间字符逐显：历史消息加载时也逐个淡入，避免只有新消息才有动效
      var timeChars = messagesArea.querySelectorAll('.msg-time-char');
      if (timeChars.length) {
        gsap.killTweensOf(timeChars);
        gsap.fromTo(timeChars,
          { opacity: 0, y: 5 },
          { opacity: 1, y: 0, duration: 0.3, ease: 'power2.out',
            stagger: { each: 0.02, start: 0.08 },
            clearProps: 'opacity,transform' });
      }
    }
    // 更新右侧边栏（消息变化后刷新热点）
    renderRightSidebar();

    // 还原已打开的评论区（renderMessages 重建 DOM 后恢复打开状态并刷新内容）
    openCommentRoots.forEach(function(rootId){
      var sec = document.getElementById('comment-' + rootId);
      var rMsg = findMessageById(currentChannel.id, rootId);
      if (sec && rMsg) {
        sec.classList.add('open');
        renderCommentList(sec, rMsg);
      }
    });
  }

  // ── 浏览量模拟（纯前端，基于时间衰减）──
  function simulateViews(createdAt) {
    if (!createdAt) return '1';
    var ageMs = Date.now() - new Date(createdAt).getTime();
    var ageHours = Math.max(0.1, ageMs / 3600000);
    // 越新浏览越高：base × e^(-0.03×hours) + 随机扰动
    var base = Math.floor(300 * Math.exp(-0.03 * ageHours) + Math.random() * 50 + 10);
    if (base >= 10000) return (base / 10000).toFixed(1) + '万+';
    if (base >= 1000) return (base / 1000).toFixed(1) + 'k+';
    return String(base);
  }

  // ── 移动端评论模式（非回复模式）──
  var _commentTargetId = null; // 当前正在评论哪条消息的 ID
  function getCommentTarget() { return _commentTargetId; }
  function setCommentTarget(msgId) { _commentTargetId = msgId; }

  // ── 绑定互动按钮事件（点赞/评论/分享）──
  function bindInteractionButtons(group, msg) {
    group.querySelectorAll('.msg-interact-btn').forEach(function(btn) {
      btn.addEventListener('click', function(e) {
        e.stopPropagation();
        var act = btn.getAttribute('data-act');
        if (act === 'like') {
          // 真实点赞：写 message_likes 表（Flarum 范式），乐观更新 + 后台持久化
          if (!IF || !IF.toggleLike || !currentUser) return;
          var lBtn = btn;
          var lIsLiked = !lBtn.classList.contains('liked');
          if (lIsLiked) lBtn.classList.add('liked'); else lBtn.classList.remove('liked');
          var lCount = lBtn.querySelector('.msg-interact-count');
          var lCur = parseInt(lCount.textContent) || 0;
          var lNext = lIsLiked ? lCur + 1 : Math.max(0, lCur - 1);
          lCount.textContent = lNext;
          if (!likeAgg[msg.id]) likeAgg[msg.id] = { total: lCur, mine: false };
          likeAgg[msg.id].total = lNext;
          likeAgg[msg.id].mine = lIsLiked;
          // 粒子爆裂特效（仅点赞时迸发；取消赞只做颜色回退）
          if (lIsLiked) burstHeart(lBtn, lCount);
          IF.toggleLike(msg.id, currentUser.id).then(function(res){
            if (res) {
              // 同步后端返回的真实状态，防止 liked=true 但 total=0 的显示不一致
              var realTotal = (typeof res.total === 'number') ? res.total : lNext;
              var realLiked = !!res.liked;
              if (realLiked && realTotal <= 0) realTotal = 1;
              lBtn.classList.toggle('liked', realLiked);
              lCount.textContent = realTotal;
              likeAgg[msg.id].total = realTotal;
              likeAgg[msg.id].mine = realLiked;
            }
          }).catch(function(){
            // 失败回滚到之前状态
            if (lIsLiked) lBtn.classList.remove('liked'); else lBtn.classList.add('liked');
            lCount.textContent = lCur;
            likeAgg[msg.id].total = lCur;
            likeAgg[msg.id].mine = !lIsLiked;
            showToast('点赞失败，请重试', 'error');
          });
        } else if (act === 'comment') {
          if (isChannelLocked()) { showToast('公告频道仅限管理员评论', 'error', 4000); return; }
          // 评论 = 真实回复：展开子回复列表 + 进入回复模式（发送带 parent_id）
          var cSec = document.getElementById('comment-'+msg.id);
          if (cSec) {
            document.querySelectorAll('.msg-comment-section.open').forEach(function(el){
              if (el !== cSec) { el.classList.remove('open'); el.innerHTML=''; }
            });
            var cOpen = cSec.classList.toggle('open');
            if (cOpen) {
              renderCommentList(cSec, msg);
              cSec.scrollIntoView({ behavior:'smooth', block:'nearest' });
              setReply(msg); // 进入回复模式：输入框显示"回复 @X"，发送带 parent_id = msg.id
              setCommentTarget(msg.id); // 移动端评论模式同步
            } else if (replyingTo && replyingTo.id === msg.id) {
              clearReply();
              setCommentTarget(null);
            }
          }
          showInputBar();
          setTimeout(function(){
            var input = document.getElementById('msg-input');
            if (input) input.focus();
          }, 300);
        } else if (act === 'share') {
          // 转发：弹窗选目标频道 → 发一条带 forward_from 的新消息
          openForwardModal(msg);
        }
      });
    });
  }

  // ── 评论列表渲染（真实回复 = parent_id 子消息，支持二级楼中楼）──
  function renderCommentList(sec, rootMsg) {
    var all = channelMessages[currentChannel.id] || [];
    // 平铺列表：主评论 depth=0，所有回复统一 depth>0，不再随嵌套层级逐级右移
    var flat = [];
    function collect(parentId, depth) {
      all.filter(function(m){ return m.parent_id === parentId; }).forEach(function(c){
        flat.push({ c: c, depth: depth });
        collect(c.id, depth + 1);
      });
    }
    collect(rootMsg.id, 0);
    if (!flat.length) {
      sec.innerHTML = '<div class="msg-comment-empty">暂无评论，来抢沙发~</div>';
      return;
    }

    var allIds = flat.map(function(item){ return item.c.id; });

    function renderAfter(agg) {
      var DEFAULT_SHOW = 3;
      var INCREMENT = 6;
      var total = flat.length;
      var visibleCount = Math.min(DEFAULT_SHOW, total);
      var remaining = total - visibleCount;

      var htmlNodes = flat.map(function(item){
        return renderCommentNode(item.c, all, agg, rootMsg, item.depth);
      });

      sec.innerHTML =
        '<div class="comment-header">'+
          '<span class="comment-title">全部回复</span>'+
          '<span class="comment-count">'+total+'条</span>'+
        '</div>'+
        '<div class="comment-list">' + htmlNodes.slice(0, visibleCount).join('') + '</div>'+
        (remaining > 0
          ? '<div class="comment-footer-bar">'+
              '<span class="comment-more-btn" data-act="comment-more" data-root-id="'+rootMsg.id+'" data-shown="'+visibleCount+'" data-total="'+total+'">—— 展开评论 ('+remaining+'条未显示)</span>'+
              '<span class="comment-collapse-btn" data-act="comment-collapse" data-root-id="'+rootMsg.id+'">收起 ∧</span>'+
            '</div>'
          : '<div class="comment-footer-bar">'+
              '<span class="comment-collapse-btn" data-act="comment-collapse" data-root-id="'+rootMsg.id+'">收起 ∧</span>'+
            '</div>');

      // 存储完整 HTML 节点供后续增量展开
      sec._commentHtmlCache = htmlNodes;
      bindCommentEvents(sec, rootMsg);
    }

    // 关键：先同步渲染评论（保证一定可见），点赞数再异步补。
    renderAfter({});
    if (currentUser && IF.getLikeAggregates && allIds.length) {
      IF.getLikeAggregates(allIds, currentUser.id).then(function(agg){
        if (!sec.classList.contains('open')) return;
        // 就地更新点赞数，不再重建整个列表（避免打开评论区时闪一下）
        sec.querySelectorAll('.msg-comment-item').forEach(function(node){
          var cid = node.getAttribute('data-comment-id');
          var la = agg[cid];
          if (la) {
            // 一致性兜底：自己点过赞至少算 1
            if (la.mine && la.total <= 0) la.total = 1;
            var btn = node.querySelector('.comment-like-btn');
            var cnt = node.querySelector('.comment-like-count');
            if (btn) { btn.textContent = la.mine ? '♥' : '♡'; btn.classList.toggle('liked', !!la.mine); }
            if (cnt) cnt.textContent = la.total;
          }
        });
      }).catch(function(){ /* 评论已同步渲染，忽略 */ });
    }
  }

  function getCommentText(m) {
    if (m.content_type === 'text') return m.content || '';
    if (m.content_type === 'image') return '[图片]';
    if (m.content_type === 'file') return '[文件]';
    return m.content || '';
  }

  function renderCommentNode(comment, all, agg, rootMsg, depth) {
    var a = IF.resolveAuthor(comment.author_id);
    var name = a.nickname || a.username || '未知';
    var color = getAvatarColor(a.username || '?');
    var init = getInitial(name);
    var la = agg[comment.id] || { total: 0, mine: false };
    // 一致性兜底：自己点过赞至少算 1
    if (la.mine && la.total <= 0) la.total = 1;
    var timeStr = formatTime(comment.created_at);
    var text = getCommentText(comment);

    // 二级楼中楼：昵称行显示 "回复者 ▸ 被回复者"（实心小三角，平铺列表中不再嵌套缩进）
    var nameHtml = '<span class="comment-name">'+escapeHtml(name)+'</span>';
    if (depth > 0 && comment.parent_id) {
      var parentC = all.find(function(m){ return m.id === comment.parent_id; });
      if (parentC) {
        var pa = IF.resolveAuthor(parentC.author_id);
        nameHtml =
          '<span class="comment-name">'+escapeHtml(name)+'</span>'+
          '<span class="reply-arrow">▸</span>'+
          '<span class="reply-target">'+escapeHtml(pa.nickname || pa.username || '未知')+'</span>';
      }
    }

    return '<div class="msg-comment-item" data-comment-id="'+comment.id+'" data-depth="'+depth+'">'+
      '<div class="msg-comment-avatar" style="background:'+color+'">'+init+'</div>'+
      '<div class="msg-comment-body">'+
        '<div class="comment-name-row">'+nameHtml+'</div>'+
        '<div class="msg-comment-text">'+escapeHtml(text)+'</div>'+
        '<div class="comment-footer">'+
          '<span class="comment-time">'+timeStr+'</span>'+
          '<span class="comment-dot">·</span>'+
          '<button type="button" class="comment-reply-text" data-act="reply-comment" data-msg-id="'+comment.id+'">回复</button>'+
        '</div>'+
      '</div>'+
      '<div class="comment-like-col">'+
        '<div class="comment-like-row">'+
          '<button type="button" class="comment-like-btn'+(la.mine?' liked':'')+'" data-act="like-comment" data-msg-id="'+comment.id+'">'+(la.mine?'♥':'♡')+'</button>'+
          '<span class="comment-like-count">'+la.total+'</span>'+
        '</div>'+
      '</div>'+
    '</div>';
  }

  function bindCommentEvents(sec, rootMsg) {
    // 评论删除：右键/长按浮现「删除」浮层（自己或管理员）
    sec.querySelectorAll('.msg-comment-item').forEach(function(item){
      var cid = item.getAttribute('data-comment-id');
      var c = findMessageById(currentChannel.id, cid);
      if (c) bindCommentDelete(item, c);
    });
    sec.querySelectorAll('[data-act="like-comment"]').forEach(function(btn){
      btn.addEventListener('click', function(e){
        e.stopPropagation();
        if (!currentUser || !IF || !IF.toggleLike) return;
        var msgId = btn.getAttribute('data-msg-id');
        var countEl = btn.parentElement.querySelector('.comment-like-count');
        var wasLiked = btn.classList.contains('liked');
        var cur = countEl ? parseInt(countEl.textContent) || 0 : 0;
        // 乐观更新
        btn.classList.toggle('liked', !wasLiked);
        if (countEl) countEl.textContent = Math.max(0, cur + (wasLiked ? -1 : 1));
        btn.innerHTML = btn.classList.contains('liked') ? '♥' : '♡';
        if (!wasLiked) burstHeart(btn, countEl); // 点赞迸发特效
        IF.toggleLike(msgId, currentUser.id).then(function(res){
          var realTotal = (typeof res.total === 'number') ? res.total : (cur + (wasLiked ? -1 : 1));
          var realLiked = !!res.liked;
          if (realLiked && realTotal <= 0) realTotal = 1;
          btn.classList.toggle('liked', realLiked);
          if (countEl) countEl.textContent = realTotal;
          btn.innerHTML = realLiked ? '♥' : '♡';
        }).catch(function(){
          btn.classList.toggle('liked', wasLiked);
          if (countEl) countEl.textContent = cur;
          btn.innerHTML = wasLiked ? '♥' : '♡';
        });
      });
    });

    sec.querySelectorAll('[data-act="reply-comment"]').forEach(function(btn){
      btn.addEventListener('click', function(e){
        e.stopPropagation();
        if (isChannelLocked()) { showToast('公告频道仅限管理员评论', 'error', 4000); return; }
        var msgId = btn.getAttribute('data-msg-id');
        var cmt = findMessageById(currentChannel.id, msgId);
        if (cmt) {
          setReply(cmt);
          setCommentTarget(cmt.id); // 同步移动端评论目标，确保 sendMessage 用正确 parentId
          showInputBar();
          setTimeout(function(){ if (msgInput) msgInput.focus(); }, 100);
        }
      });
    });

    // 评论区底部「收起」关闭当前评论区；「展开评论」每次追加6条
    sec.querySelectorAll('[data-act="comment-collapse"]').forEach(function(btn){
      btn.addEventListener('click', function(e){
        e.stopPropagation();
        var rootId = btn.getAttribute('data-root-id');
        var cSec = document.getElementById('comment-'+rootId);
        if (cSec) { cSec.classList.remove('open'); cSec.innerHTML = ''; }
      });
    });
    sec.querySelectorAll('[data-act="comment-more"]').forEach(function(btn){
      btn.addEventListener('click', function(e){
        e.stopPropagation();
        var rootId = btn.getAttribute('data-root-id');
        var cSec = document.getElementById('comment-'+rootId);
        if (!cSec || !cSec._commentHtmlCache) return;
        var list = cSec.querySelector('.comment-list');
        if (!list) return;

        var shown = parseInt(btn.getAttribute('data-shown')||'0', 10);
        var total = parseInt(btn.getAttribute('data-total')||'0', 10);
        var INCREMENT = 6;
        var newShown = Math.min(shown + INCREMENT, total);

        // 追加新节点
        var frag = document.createDocumentFragment();
        for (var i = shown; i < newShown; i++) {
          var tmp = document.createElement('div');
          tmp.innerHTML = cSec._commentHtmlCache[i];
          var node = tmp.firstElementChild;
          if (node) frag.appendChild(node);
        }
        list.appendChild(frag);

        // 重新绑定新节点的事件
        bindCommentEvents(list, { id: rootId });

        btn.setAttribute('data-shown', newShown);
        var remaining = total - newShown;
        if (remaining <= 0) {
          btn.style.display = 'none';
        } else {
          btn.textContent = '—— 展开评论 ('+remaining+'条未显示)';
        }
      });
    });
  }

  // 增量插入单条评论节点（回复评论时用）：不重建整个评论列表、不滚动频道，保持原位置，避免"刷新一下"
  function appendCommentNode(sec, comment, parentId, rootMsg) {
    var list = sec.querySelector('.comment-list');
    if (!list) return;
    var all = channelMessages[currentChannel.id] || [];
    var depth = 0;
    if (parentId) {
      var pNode = list.querySelector('.msg-comment-item[data-comment-id="'+parentId+'"]');
      if (pNode) depth = (parseInt(pNode.getAttribute('data-depth')||'0',10)) + 1;
    }
    var tmp = document.createElement('div');
    tmp.innerHTML = renderCommentNode(comment, all, {}, rootMsg, depth);
    var node = tmp.firstElementChild;
    if (!node) return;
    // 平铺列表为前序 DFS，父节点之后、其父树末尾即为新回复插入点
    var after = null;
    if (parentId) {
      var p = list.querySelector('.msg-comment-item[data-comment-id="'+parentId+'"]');
      if (p) {
        after = p;
        var n = p.nextElementSibling;
        while (n && n.classList.contains('msg-comment-item')) {
          if ((parseInt(n.getAttribute('data-depth')||'0',10)) <= depth-1) break;
          after = n;
          n = n.nextElementSibling;
        }
      }
    }
    if (after) after.after(node); else list.appendChild(node);
    bindCommentEvents(node, rootMsg);
    // 更新回复计数
    var countEl = sec.querySelector('.comment-count');
    if (countEl) {
      var prev = parseInt((countEl.textContent||'').replace(/[^0-9]/g,'')) || 0;
      countEl.textContent = (prev+1) + '条';
    }
  }

  // 就地替换评论区的 pending 节点为真实评论（不重建列表、不闪、不跳位置）
  function replaceCommentNode(tempId, realMsg) {
    var node = document.querySelector('.msg-comment-item[data-comment-id="'+tempId+'"]');
    if (!node) return false;
    var depth = parseInt(node.getAttribute('data-depth')||'0',10);
    var sec = node.closest('.msg-comment-section');
    var rootId = sec ? (sec.id||'').replace(/^comment-/, '') : '';
    var rootMsg = findMessageById(currentChannel.id, rootId);
    var all = channelMessages[currentChannel.id] || [];
    var tmp = document.createElement('div');
    tmp.innerHTML = renderCommentNode(realMsg, all, {}, rootMsg, depth);
    var newNode = tmp.firstElementChild;
    if (!newNode) return false;
    node.replaceWith(newNode);
    bindCommentEvents(newNode, rootMsg);
    return true;
  }

  function findRootMessageId(childId) {
    var m = findMessageById(currentChannel.id, childId);
    while (m && m.parent_id) {
      var parent = findMessageById(currentChannel.id, m.parent_id);
      if (!parent) break;
      m = parent;
    }
    return m ? m.id : childId;
  }

  // ── 转发弹窗：选目标频道 → 发带 forward_from 的新消息（HuLa 范式）──
  var forwardModal = null;
  function openForwardModal(msg) {
    if (!currentUser || !IF) return;
    closeForwardModal();
    var fAuthor = (IF ? IF.resolveAuthor(msg.author_id) : { nickname:'未知' });
    var fName = fAuthor.nickname || fAuthor.username || '未知';
    var fPreview = msg.content_type === 'text' ? msg.content : (msg.content_type === 'image' ? '[图片]' : '[文件]');
    if (fPreview && fPreview.length > 120) fPreview = fPreview.slice(0, 120) + '…';
    var shareUrl = 'https://bfgzlt.cc.cd';
    var shareText = fName + '：' + fPreview;

    forwardModal = document.createElement('div');
    forwardModal.className = 'modal-mask';
    forwardModal.id = 'forward-modal';
    forwardModal.innerHTML =
      '<div class="modal-box forward-box">'+
        '<div class="modal-title">转发 / 分享</div>'+
        '<div class="forward-preview">'+escapeHtml(fPreview)+'</div>'+
        '<div class="forward-section-title">转发到站内频道</div>'+
        '<div class="forward-channels" id="forward-channels"></div>'+
        '<div class="forward-section-title">分享到其他平台</div>'+
        '<div class="share-grid" id="share-grid">'+
          (navigator.share ? '<button class="share-item" data-share="web">📱 系统分享</button>' : '')+
          '<button class="share-item" data-share="wechat">💬 微信</button>'+
          '<button class="share-item" data-share="weibo">🐦 微博</button>'+
          '<button class="share-item" data-share="qq">🐧 QQ</button>'+
          '<button class="share-item" data-share="copy">🔗 复制链接</button>'+
          '<button class="share-item" data-share="card">🖼 生成卡片</button>'+
        '</div>'+
        '<div id="share-extra"></div>'+
        '<div class="modal-actions"><button class="btn-cancel" id="forward-cancel">取消</button></div>'+
      '</div>';
    document.body.appendChild(forwardModal);

    // 站内频道列表
    var chWrap = forwardModal.querySelector('#forward-channels');
    IF.listChannels().then(function(chs){
      (chs || []).forEach(function(ch){
        if (currentChannel && ch.id === currentChannel.id) return;
        if (ch.type === 'announcement' && (!currentUser || currentUser.role !== 'admin')) return;
        var b = document.createElement('button');
        b.className = 'forward-ch-item';
        b.textContent = '# ' + ch.name;
        b.addEventListener('click', function(){
          IF.forwardMessage(ch.id, currentUser.id, {
            forwardFrom: msg.id, forwardAuthor: fName, forwardPreview: fPreview, content: fPreview
          }).then(function(){
            closeForwardModal();
            showToast('已转发到 #' + ch.name);
          }).catch(function(){ showToast('转发失败，请重试', 'error'); });
        });
        chWrap.appendChild(b);
      });
      if (!chs || !chs.length) chWrap.innerHTML = '<div class="forward-hint">暂无其他频道</div>';
    }).catch(function(){ chWrap.innerHTML = '<div class="forward-hint">加载频道失败</div>'; });

    // 站外分享
    var grid = forwardModal.querySelector('#share-grid');
    var extra = forwardModal.querySelector('#share-extra');
    grid.addEventListener('click', function(e){
      var btn = e.target.closest('.share-item'); if (!btn) return;
      handleShare(btn.getAttribute('data-share'), { url: shareUrl, text: shareText, preview: fPreview, author: fName, msg: msg }, extra);
    });

    forwardModal.querySelector('#forward-cancel').addEventListener('click', closeForwardModal);
    forwardModal.addEventListener('click', function(e){ if (e.target === forwardModal) closeForwardModal(); });
  }
  function handleShare(kind, data, extra) {
    var url = data.url, text = data.text, preview = data.preview;
    if (kind === 'web') {
      if (navigator.share) navigator.share({ title:'宝丰一高校园频道', text:text, url:url }).catch(function(){});
      return;
    }
    if (kind === 'copy') { copyText(url); showToast('链接已复制', 'info'); return; }
    if (kind === 'weibo') { window.open('https://service.weibo.com/share/share.php?url='+encodeURIComponent(url)+'&title='+encodeURIComponent(text), '_blank'); return; }
    if (kind === 'qq') { window.open('https://connect.qq.com/widget/shareqq/index.html?url='+encodeURIComponent(url)+'&title='+encodeURIComponent(text), '_blank'); return; }
    if (kind === 'wechat') {
      extra.innerHTML = '<div class="share-tip">长按或扫码，在微信中打开</div><div id="wx-qr" class="wx-qr"></div>';
      var qrBox = document.getElementById('wx-qr');
      if (typeof qrcode !== 'undefined') {
        try {
          var qr = qrcode(0, 'M'); qr.addData(url); qr.make();
          var img = document.createElement('img'); img.src = qr.createDataURL(6); img.alt = '二维码';
          qrBox.innerHTML = ''; qrBox.appendChild(img);
        } catch(e){ qrBox.textContent = url; }
      } else { qrBox.textContent = url; }
      return;
    }
    if (kind === 'card') { genShareCard(data); return; }
  }
  function copyText(t) {
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(t);
      else { var ta=document.createElement('textarea'); ta.value=t; document.body.appendChild(ta); ta.select(); document.execCommand('copy'); ta.remove(); }
    } catch(e){}
  }
  function wrapCardText(ctx, text, x, y, maxW, lh) {
    var chars = (text||'').split(''); var line=''; var yy=y;
    for (var i=0;i<chars.length;i++){
      var test = line + chars[i];
      if (ctx.measureText(test).width > maxW && line) { ctx.fillText(line, x, yy); line = chars[i]; yy += lh; }
      else line = test;
      if (yy > 280) break;
    }
    ctx.fillText(line, x, yy);
  }
  function genShareCard(data) {
    var W=600, H=340, canvas=document.createElement('canvas');
    canvas.width=W; canvas.height=H;
    var ctx=canvas.getContext('2d');
    var g=ctx.createLinearGradient(0,0,W,H);
    g.addColorStop(0,'#1a1a2e'); g.addColorStop(1,'#221a3e');
    ctx.fillStyle=g; ctx.fillRect(0,0,W,H);
    ctx.fillStyle='#a78bfa'; ctx.beginPath(); ctx.arc(44,46,24,0,Math.PI*2); ctx.fill();
    ctx.fillStyle='#fff'; ctx.font='bold 24px sans-serif'; ctx.textAlign='center'; ctx.textBaseline='middle';
    ctx.fillText((data.author||'匿').slice(0,1), 44, 46);
    ctx.textAlign='left'; ctx.fillStyle='#e7e9f5'; ctx.font='bold 19px sans-serif';
    ctx.fillText(data.author||'匿名', 80, 38);
    ctx.fillStyle='#8b90b5'; ctx.font='13px sans-serif';
    ctx.fillText('宝丰一高校园频道', 80, 58);
    ctx.fillStyle='#fff'; ctx.font='17px sans-serif';
    wrapCardText(ctx, data.preview, 32, 108, W-64, 27);
    ctx.fillStyle='#8b90b5'; ctx.font='13px sans-serif';
    ctx.fillText('来自 bfgzlt.cc.cd', 32, H-26);
    var finish = function(){
      var extra=document.getElementById('share-extra'); if(!extra) return;
      var box=document.createElement('div'); box.className='card-preview-box';
      canvas.className='card-preview-img';
      var dl=document.createElement('a'); dl.className='share-item'; dl.textContent='⬇ 保存图片';
      dl.href=canvas.toDataURL('image/png'); dl.download='share-card.png';
      box.appendChild(canvas); box.appendChild(dl); extra.innerHTML=''; extra.appendChild(box);
    };
    if (typeof qrcode !== 'undefined') {
      try {
        var qr = qrcode(0, 'M'); qr.addData(data.url); qr.make();
        var img = new Image();
        img.onload = function(){ ctx.drawImage(img, W-112, H-112, 92, 92); finish(); };
        img.onerror = finish;
        img.src = qr.createDataURL(4);
      } catch(e){ finish(); }
    } else { finish(); }
  }
  function closeForwardModal() {
    if (forwardModal) { forwardModal.remove(); forwardModal = null; }
  }

  // ── 输入栏显隐控制（全平台） ──
  var fab = null; // FAB 已移除（compose 按钮在头部右上角），保留变量避免报错
  function ensureFab() {
    // FAB 已废弃：发消息入口改为头部「+」(btn-compose) 按钮
    return;
  }
  // 点输入框以外的空白区域收起输入框（捕获阶段监听，避免误关）
  var docClickBound = false;
  function onDocClickOutside(e) {
    var ia = document.getElementById('message-input-area');
    if (!ia) return;
    if (ia.classList.contains('input-visible') && !ia.contains(e.target)) {
      hideInputBar();
    }
  }
  function showInputBar() {
    if (isChannelLocked()) { showToast('公告频道仅限管理员发言', 'error', 4000); return; }
    var ia = document.getElementById('message-input-area');
    if (ia) {
      ia.classList.add('input-visible');
    }
    updateComposeBtn(true);
    // 延迟到本次点击完成后再绑定，避免"打开这次点击"被误判为空白点击
    if (!docClickBound) {
      docClickBound = true;
      setTimeout(function(){ document.addEventListener('click', onDocClickOutside, true); }, 0);
    }
  }
  function hideInputBar() {
    var ia = document.getElementById('message-input-area');
    if (ia) {
      ia.classList.remove('input-visible');
    }
    // 更新 compose 按钮状态
    updateComposeBtn(false);
    if (docClickBound) {
      docClickBound = false;
      document.removeEventListener('click', onDocClickOutside, true);
    }
  }
  function toggleInputBar() {
    var ia = document.getElementById('message-input-area');
    if (!ia) return;
    if (ia.classList.contains('input-visible')) {
      hideInputBar();
    } else {
      setCommentTarget(null); // 退出评论模式，发新消息
      showInputBar();
      var input = document.getElementById('msg-input');
      if (input) {
        var orig = input.getAttribute('data-original-placeholder');
        input.placeholder = orig || ('发送消息到 #' + (currentChannel ? currentChannel.name : ''));
        setTimeout(function(){ input.focus(); }, 100);
      }
    }
  }
  function updateComposeBtn(active) {
    var btn = document.getElementById('btn-compose');
    if (!btn) return;
    btn.classList.toggle('compose-active', active);
  }

  function formatFileSize(bytes) {
    if (!bytes) return '0 B';
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024*1024) return (bytes/1024).toFixed(1) + ' KB';
    return (bytes/(1024*1024)).toFixed(1) + ' MB';
  }

  function formatTime(ts) {
    if (!ts) return '';
    var d = new Date(ts); // InsForge TIMESTAMPTZ 为 ISO 8601（带时区），直接解析
    var now = new Date();
    var today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    var yesterday = new Date(today.getTime() - 24*60*60*1000);
    var dDay = new Date(d.getFullYear(), d.getMonth(), d.getDate());
    if (dDay.getTime() === today.getTime()) {
      return String(d.getHours()).padStart(2,'0')+':'+String(d.getMinutes()).padStart(2,'0');
    }
    if (dDay.getTime() === yesterday.getTime()) {
      return '昨天 '+String(d.getHours()).padStart(2,'0')+':'+String(d.getMinutes()).padStart(2,'0');
    }
    return (d.getMonth()+1)+'/'+d.getDate()+' '+String(d.getHours()).padStart(2,'0')+':'+String(d.getMinutes()).padStart(2,'0');
  }

  // 相对时间（用于消息发送时间）：刚刚 / x分钟前 / x小时前 / 昨天 / 月/日 时:分
  function formatRelativeTime(ts) {
    if (!ts) return '';
    var d = new Date(ts);
    var nowMs = Date.now();
    var diff = nowMs - d.getTime();
    var sec = Math.floor(diff / 1000);
    if (sec < 60) return '刚刚';
    var min = Math.floor(sec / 60);
    if (min < 60) return min + '分钟前';
    var hour = Math.floor(min / 60);
    if (hour < 24) return hour + '小时前';
    var today = new Date();
    var todayStart = new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime();
    var yesterdayStart = todayStart - 24*60*60*1000;
    var dDayStart = new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
    if (dDayStart === yesterdayStart) {
      return '昨天 ' + String(d.getHours()).padStart(2,'0') + ':' + String(d.getMinutes()).padStart(2,'0');
    }
    return (d.getMonth()+1) + '/' + d.getDate() + ' ' + String(d.getHours()).padStart(2,'0') + ':' + String(d.getMinutes()).padStart(2,'0');
  }

  // 把相对时间拆成单个字符，用于 GSAP 字符逐显动画
  function createTimeCharsHtml(ts, id) {
    var text = formatRelativeTime(ts);
    var chars = text.split('').map(function(c) {
      return '<span class="msg-time-char">' + (c === ' ' ? '&nbsp;' : escapeHtml(c)) + '</span>';
    }).join('');
    return '<span class="msg-send-time" data-timestamp="' + escapeHtml(ts) + '" data-msg-id="' + (id || '') + '">' + chars + '</span>';
  }

  // 对消息发送时间执行字符逐显动画（仅在新消息增量插入时调用）
  function animateTimeChars(node) {
    if (!node) return;
    var chars = node.querySelectorAll('.msg-time-char');
    if (!chars.length) return;
    if (typeof gsap !== 'undefined' && !REDUCED_MOTION) {
      gsap.killTweensOf(chars);
      gsap.fromTo(chars,
        { opacity: 0, y: 6 },
        { opacity: 1, y: 0, duration: 0.35, ease: 'power2.out', stagger: 0.05, clearProps: 'opacity,transform' });
    }
  }

  // 每分钟刷新一次所有相对时间（例如 5分钟前 → 6分钟前）
  function updateRelativeTimes() {
    if (!messagesArea) return;
    messagesArea.querySelectorAll('.msg-send-time[data-timestamp]').forEach(function(node) {
      var ts = node.getAttribute('data-timestamp');
      if (!ts) return;
      var newText = formatRelativeTime(ts);
      // 只有当文本变化才替换，避免破坏 gsap 正在播放的动画
      if (node.textContent === newText) return;
      var chars = newText.split('').map(function(c) {
        return '<span class="msg-time-char">' + (c === ' ' ? '&nbsp;' : escapeHtml(c)) + '</span>';
      }).join('');
      node.innerHTML = chars;
    });
  }
  var _relativeTimeInterval = setInterval(updateRelativeTimes, 60 * 1000);

  // ── Reply / quote state ─────────────────────
  var replyingTo = null;
  var replyBar = null;

  function buildReplyBar() {
    if (replyBar) return;
    var inputArea = document.getElementById('message-input-area');
    if (!inputArea) return;
    replyBar = document.createElement('div');
    replyBar.id = 'reply-bar';
    replyBar.className = 'reply-bar';
    replyBar.innerHTML =
      '<div class="reply-info">' +
        '<span class="reply-label" id="reply-label"></span>' +
        '<span class="reply-preview" id="reply-preview"></span>' +
      '</div>' +
      '<button type="button" class="reply-cancel" id="reply-cancel" aria-label="取消回复">&times;</button>';
    // 插入到输入框 wrapper 之前
    var wrapper = inputArea.querySelector('.message-input-wrapper');
    inputArea.insertBefore(replyBar, wrapper);
    replyBar.querySelector('#reply-cancel').addEventListener('click', function(e){
      e.preventDefault();
      clearReply();
    });
  }

  function setReply(msg) {
    if (!msg) return;
    if (isChannelLocked()) { showToast('公告频道仅限管理员评论', 'error', 4000); return; }
    buildReplyBar();
    if (!replyBar) return;
    replyingTo = msg;
    var author = (IF ? IF.resolveAuthor(msg.author_id) : { nickname: '未知' });
    var name = author.nickname || author.username || '未知用户';
    var preview = msg.content_type === 'text' ? msg.content : (msg.content_type === 'image' ? '[图片]' : '[文件]');
    if (preview && preview.length > 60) preview = preview.slice(0, 60) + '…';
    document.getElementById('reply-label').textContent = '回复 @' + name;
    document.getElementById('reply-preview').textContent = preview;
    replyBar.classList.add('open');
    if (msgInput) msgInput.focus();
  }

  function clearReply() {
    replyingTo = null;
    if (replyBar) replyBar.classList.remove('open');
    // 退出评论模式
    setCommentTarget(null);
    // 恢复placeholder
    if (msgInput) {
      var orig = msgInput.getAttribute('data-original-placeholder');
      msgInput.placeholder = orig || '';
    }
    // 退出评论模式时隐藏输入栏（全平台）
    hideInputBar();
  }

  function findMessageById(channelId, id) {
    var arr = channelMessages[channelId] || [];
    for (var i = 0; i < arr.length; i++) {
      if (arr[i].id === id) return arr[i];
    }
    return null;
  }

  function sendMessage(){
    if(!msgInput||!currentUser||!currentChannel||!IF) return;
    var text=msgInput.value.trim(); if(!text) return;
    if (isChannelLocked()) { showToast('公告频道仅限管理员发言', 'error', 4000); return; }

    // ═══ 移动端评论模式：追加内联评论，不发新消息到频道 ═══
    var cmtId = getCommentTarget();
    if (cmtId) {
      // 移动端评论与桌面回复模式统一：映射到 replyingTo，确保真实发送并持久化
      var cmtMsg = findMessageById(currentChannel.id, cmtId);
      if (cmtMsg) setReply(cmtMsg);
      setCommentTarget(null);
    }

    // ═══ 正常频道消息（非评论模式）═══

    var parentId = (replyingTo && replyingTo.id) ? replyingTo.id : null;

    // 乐观 UI：立即清空输入、显示本地"发送中"消息，再后台请求
    var tempId = 'pending-' + Date.now() + '-' + Math.random().toString(36).slice(2,8);
    var pendingMsg = {
      id: tempId,
      channel_id: currentChannel.id,
      author_id: currentUser.id,
      content: text,
      content_type: 'text',
      parent_id: parentId,
      created_at: new Date().toISOString(),
      isPending: true
    };
    if (!channelMessages[currentChannel.id]) channelMessages[currentChannel.id] = [];
    channelMessages[currentChannel.id].push(pendingMsg);
    msgInput.value='';
    msgInput.focus();
    clearReply();
    if (parentId) {
      // 回复评论：增量插入新回复节点（不重建整个评论列表、不滚动频道，保持原位置），避免闪屏 + 跳位置
      var rRoot = findRootMessageId(parentId);
      var rSec = document.getElementById('comment-' + rRoot);
      if (rSec && rSec.classList.contains('open')) {
        var rMsg = findMessageById(currentChannel.id, rRoot);
        if (rMsg) appendCommentNode(rSec, pendingMsg, parentId, rMsg);
      }
    } else {
      // 普通频道消息：增量追加这条（不重建整个频道），彻底避免全量重渲染卡顿
      appendMessageNode(pendingMsg, false);
      // 倒序流：自己发的消息总是滚到顶，确保"发送后消息显示在最上面"
      if (messagesArea) {
        messagesArea.scrollTo({ top: 0, behavior: 'smooth' });
      }
    }

    // 后台发送（跨国链路慢，不要等 UI）
    IF.sendMessage(currentChannel.id, text, currentUser.id, parentId).then(function(msg){
      replacePendingMessage(tempId, currentChannel.id, msg);
      // 触发 @ 提及通知：@ 解析交给后端 RPC，前端只传完整 content
      try {
        if (currentChannel.type === 'dm') {
          // 私聊：给对方发私信通知（不 @ 提醒）；friendId 来自进入私聊时记录的映射
          var dmFriend = dmChannelToFriend[currentChannel.id];
          if (dmFriend && IF.notifyDm && typeof IF.notifyDm === 'function') {
            IF.notifyDm({
              messageId: msg.id,
              authorId: currentUser.id,
              channelId: currentChannel.id,
              friendId: dmFriend,
              content: (msg.content != null ? msg.content : text)
            }).catch(function(){});
          }
        } else if (IF.notifyMentions && typeof IF.notifyMentions === 'function') {
          IF.notifyMentions({
            messageId: msg.id,
            authorId: currentUser.id,
            channelId: currentChannel.id,
            content: (msg.content != null ? msg.content : text)
          }).catch(function(){});
        }
      } catch (e) {}
      // 回复发送成功后，就地替换评论区的 pending 节点为真实评论（不重建列表、不闪、不跳位置）
      try {
        if (parentId) {
          replaceCommentNode(tempId, msg);
        }
      } catch (e) {}
      // AI 审核：异步调用，命中违纪后服务端已落库 bot 警告评论 + 通知，主动重拉当前频道与红点
      try {
        if (window.IF) {
          IF.moderateMessage(msg).then(function (res) {
            if (res && res.violation && currentChannel && currentChannel.id) {
              IF.getMessages(currentChannel.id).then(function (list) {
                channelMessages[currentChannel.id] = list || [];
                if (!parentId) {
                  renderMessages(); // renderMessages 末尾已按 nearBottom 平滑跟随，不再硬跳
                } else {
                  // 回复被审核：保持打开的评论区，刷新它显示 bot 警告
                  var mRoot = findRootMessageId(parentId);
                  var mSec = document.getElementById('comment-' + mRoot);
                  if (mSec && mSec.classList.contains('open')) {
                    var mMsg = findMessageById(currentChannel.id, mRoot);
                    if (mMsg) renderCommentList(mSec, mMsg);
                  }
                }
              }).catch(function () {});
              updateNotifBadge();
            }
          }).catch(function () {});
        }
      } catch (e) {}
    }).catch(function(err){
      markPendingFailed(tempId, currentChannel.id);
      var raw = (err && err.message) || '';
      var isMuted = /muted|禁言|row-level security|violates|425/i.test(raw + '');
      if (isMuted) {
        showToast('你已被禁言，暂时不能发言～有疑问可联系管理员', 'error', 5000);
        return;
      }
      var isNetwork = /network|failed to fetch|fetch|timeout|abort|offline|connect/i.test(raw + '');
      showToast(isNetwork
        ? '发送失败：网络波动，请稍候点发送再试'
        : (raw || '发送失败'), 'error', 4000);
      // eslint-disable-next-line no-console
      console.error('sendMessage failed:', err);
    });
  }

  function replacePendingMessage(tempId, channelId, realMsg) {
    if (!realMsg || !realMsg.id || !channelId) return;
    var arr = channelMessages[channelId] || [];
    for (var i = 0; i < arr.length; i++) {
      if (arr[i].id === tempId) {
        arr[i] = realMsg;
        // 评论（parent_id 非空）：节点在评论区，已由 sendMessage 回调里的 replaceCommentNode 就地替换；此处不重渲染频道，避免闪屏
        if (realMsg.parent_id) return;
        // 就地替换这一个节点（不重建整个频道）
        if (currentChannel && currentChannel.id === channelId) {
          replaceMessageNode(tempId, realMsg);
        } else {
          renderMessages();
        }
        return;
      }
    }
    // 未找到临时消息时仍正常渲染（实时事件已替换）
    handleIncomingMessage(realMsg);
  }

  function markPendingFailed(tempId, channelId) {
    if (!channelId) return;
    var arr = channelMessages[channelId] || [];
    for (var i = 0; i < arr.length; i++) {
      if (arr[i].id === tempId) {
        arr[i].isPending = false;
        arr[i].isFailed = true;
        renderMessages();
        return;
      }
    }
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
    if (isChannelLocked()) { showToast('公告频道仅限管理员上传文件', 'error', 4000); fileInput.value=''; return; }
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

    IF.uploadFile(file).then(function(data){
      removeToast();
      if (!data || !data.url) { showToast('上传失败', 'error'); return; }
      return IF.sendFileMessage(currentChannel.id, currentUser.id, {
        url: data.url, name: file.name, size: file.size, isImage: isImage
      }).then(function(msg){
        if (msg) handleIncomingMessage(msg);
      });
    }).catch(function(){
      removeToast();
      showToast('上传失败，请检查网络', 'error');
    });

    fileInput.value = ''; // 允许重复选同一文件
  }

  // ── Emoji picker ──────────────────────────
  var emojiBtn = document.querySelector('.emoji-btn');
  var emojiPanel = null;
  var EMOJIS = ['😀','😁','😂','🤣','😊','😍','😘','😎','🤔','😅','😭','😡','👍','👎','👌','🙏','💪','👏','🎉','🔥','❤️','💔','⭐','✨','🌹','🍺','🍻','☕','🌈','☀️','🌙','⚡','💡','✅','❌','❓','💯','🚀','📌','📚','🎓','🏫','😴','🤝','😇','🥳','😋','🤩','😏','💤','🙄','😱','🥰','😜','🤗','😢','😤','🤯','🤓','🧐','👀','💬','📝','📷','🎵','⚽','🏀','🎮','🐱','🐶','🌸','🍎','🍔','🍕','☕️','🍰','🎂','💰','💎','🔔','📢','💡'];

  function buildEmojiPanel() {
    if (emojiPanel) return;
    emojiPanel = document.createElement('div');
    emojiPanel.id = 'emoji-panel';
    emojiPanel.className = 'emoji-panel';
    var grid = document.createElement('div');
    grid.className = 'emoji-grid';
    EMOJIS.forEach(function(e){
      var b = document.createElement('button');
      b.type = 'button';
      b.className = 'emoji-item';
      b.textContent = e;
      b.addEventListener('click', function(ev){
        ev.preventDefault();
        ev.stopPropagation();
        insertAtCursor(msgInput, e);
        msgInput.focus();
      });
      grid.appendChild(b);
    });
    emojiPanel.appendChild(grid);
    var inputArea = document.getElementById('message-input-area');
    if (inputArea) inputArea.appendChild(emojiPanel);
  }

  function insertAtCursor(input, text) {
    if (!input) return;
    var start = input.selectionStart || input.value.length;
    var end = input.selectionEnd || input.value.length;
    input.value = input.value.substring(0, start) + text + input.value.substring(end);
    var pos = start + text.length;
    input.setSelectionRange(pos, pos);
  }

  function toggleEmojiPanel(force) {
    buildEmojiPanel();
    if (!emojiPanel) return;
    var show = (typeof force === 'boolean') ? force : !emojiPanel.classList.contains('open');
    emojiPanel.classList.toggle('open', show);
    // 关闭提及下拉，避免叠加
    if (show) hideMentionDropdown();
  }

  if (emojiBtn) {
    emojiBtn.addEventListener('click', function(e){
      e.preventDefault();
      e.stopPropagation();
      toggleEmojiPanel();
    });
  }
  // 点外部 / ESC 关闭表情面板
  document.addEventListener('click', function(e){
    if (emojiPanel && emojiPanel.classList.contains('open') &&
        !e.target.closest('#emoji-panel') && !e.target.closest('.emoji-btn')) {
      toggleEmojiPanel(false);
    }
  });
  document.addEventListener('keydown', function(e){
    if (e.key === 'Escape' && emojiPanel && emojiPanel.classList.contains('open')) {
      toggleEmojiPanel(false);
    }
  });

  // ── Toast ───────────────────────────────────
  var toastEl = null;
  var toastTimer = null;
  function showToast(msg, type, duration) {
    removeToast();
    toastEl = document.createElement('div');
    toastEl.className = 'upload-toast upload-toast-' + (type||'info');
    toastEl.textContent = msg;
    document.body.appendChild(toastEl);
    // info 也自动消失，避免长期遮挡下方错误提示/操作按钮
    var ms = duration || (type === 'error' ? 3500 : 2500);
    toastTimer = setTimeout(removeToast, ms);
  }
  function removeToast() {
    if (toastTimer) { clearTimeout(toastTimer); toastTimer = null; }
    if (toastEl) { toastEl.remove(); toastEl = null; }
  }

  // 把 SDK 抛出的网络错误转成人话，并在网络错误时显示重试按钮
  function showLoginError(err) {
    var msg = (err && err.message) || '请求失败';
    var isNetwork = /network|failed to fetch|fetch|timeout|abort|offline|connect/i.test(msg);
    if (isNetwork) {
      msg = '网络连接失败，后端地址当前可能无法从中国手机网络访问。请切换 Wi-Fi、关闭省流量模式或开启代理后重试。';
      if (loginRetry) loginRetry.style.display = 'inline-flex';
    } else {
      if (loginRetry) loginRetry.style.display = 'none';
    }
    // 恢复登录卡片可见性（加载动画可能已将其淡出；无 GSAP 时须显式置 1，否则回退 CSS 默认 opacity:0）
    if (loginCard) { loginCard.style.opacity = '1'; loginCard.style.transform = ''; }
    if (loginSubmitLoader) { loginSubmitLoader.classList.remove('active'); loginSubmitLoader.setAttribute('aria-hidden','true'); loginSubmitLoader.style.opacity = ''; }
    if (monsterLogin) monsterLogin.classList.add('active');
    if (_eyeState !== 'error') setMonsterState('error');
    if (loginError) loginError.textContent = msg;
  }
  function clearLoginError() {
    if (loginError) loginError.textContent = '';
    if (loginRetry) loginRetry.style.display = 'none';
  }

  // ── 通知锚点跳转：跳到指定消息并高亮 ────────
  function highlightMessageNode(node) {
    if (!node) return;
    node.classList.remove('msg-highlight');
    void node.offsetWidth; // 强制重排以重启动画
    node.classList.add('msg-highlight');
    setTimeout(function() { node.classList.remove('msg-highlight'); }, 2400);
  }

  function scrollToMessage(msgId) {
    if (!msgId) return;
    var attempts = 0;
    function tryFind() {
      var node = messagesArea ? messagesArea.querySelector('.msg-group[data-msg-id="' + msgId + '"]') : null;
      if (!node) node = document.querySelector('.msg-comment-item[data-comment-id="' + msgId + '"]');
      if (!node) node = document.querySelector('[data-id="' + msgId + '"]');
      if (node) {
        try { node.scrollIntoView({ behavior: REDUCED_MOTION ? 'auto' : 'smooth', block: 'center' }); } catch (e) {
          if (node.scrollIntoView) node.scrollIntoView();
        }
        highlightMessageNode(node);
        return;
      }
      attempts++;
      if (attempts < 50) setTimeout(tryFind, 80); // 等待频道消息渲染/网络加载
    }
    tryFind();
  }

  // ── Notification ─────────────────────────────
  var unreadNotifCount = 0;

  function fetchUnreadCount() {
    if (!IF) return;
    IF.unreadCount().then(function(count){
      count = count || 0;
      if (count > unreadNotifCount) {
        // 实时未覆盖时的兜底：出现新未读通知，刷新好友列表与下拉（不只红点）
        if (typeof renderFriends === 'function') renderFriends();
        if (notifyDropdown && notifyDropdown.style.display === 'block') loadNotifications();
        // 新未读若是好友类，弹明确浮层提示（实时链路未覆盖时的兜底可见性）
        if (IF.listNotifications) {
          IF.listNotifications().then(function(list) {
            var n = list && list[0];
            if (n && !n.is_read && (n.type === 'friend_request' || n.type === 'friend_accepted')) {
              if (typeof showToast === 'function') {
                showToast((n.type === 'friend_request' ? '💌 ' : '✅ ') + (n.title || '好友通知'),
                          n.type === 'friend_accepted' ? 'success' : 'info', 4500);
              }
            }
          }).catch(function() {});
        }
      }
      unreadNotifCount = count;
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

  var notifyOpen = false;
  function openNotifDropdown() {
    if (!notifyDropdown || !notifyList) return;
    if (notifyOpen) { hideNotifDropdown(); return; }
    notifyOpen = true;
    notifyDropdown.style.display = 'block';
    // 强制重置动画残留，避免卡在 opacity:0 不可见
    notifyDropdown.style.opacity = '1';
    notifyDropdown.style.transform = 'none';
    if (!REDUCED_MOTION && typeof gsap !== 'undefined') {
      gsap.killTweensOf(notifyDropdown);
      gsap.from(notifyDropdown, { opacity: 0, y: -8, duration: 0.24, ease: 'power2.out' });
    }
    loadNotifications();
    // 进入 dropdown 即加载好友数据（无论当前 Tab，确保切换即时）
    renderFriends();
  }

  function loadNotifications() {
    if (!IF || !notifyList) return;
    IF.listNotifications().then(function(list) {
        if (!list) list = [];
        notifyList.innerHTML = '';
        if (list.length === 0) {
          notifyList.innerHTML = '<div class="notify-empty">暂无通知</div>';
          return;
        }
        list.forEach(function(n) {
          if (n.type === 'dm') return; // 私信不进通知 tab，未读只在好友列表显示
          var item = document.createElement('div');
          item.className = 'notify-item' + (n.is_read ? '' : ' unread');
          var isFriendReq = n.type === 'friend_request' || n.type === 'friend' || n.type === 'friend_request_received';
          // 已读的好友请求不再显示操作按钮（已处理过，防止反复点击）
          var showActions = isFriendReq && !n.is_read;
          item.innerHTML =
            '<span class="notify-icon">' + (n.type === 'mention' ? '💬' : (isFriendReq ? '👋' : '🔔')) + '</span>' +
            '<div class="notify-body">' +
              '<div class="notify-title">' + escapeHtml(n.title) + '</div>' +
              '<div class="notify-preview">' + escapeHtml(n.body) + '</div>' +
            '</div>' +
            (showActions ? '<div class="notify-actions"><button type="button" class="notify-btn notify-accept" data-action="accept">同意</button><button type="button" class="notify-btn notify-reject" data-action="reject">拒绝</button></div>' : '');
          if (showActions) {
            var acceptBtn = item.querySelector('.notify-accept');
            var rejectBtn = item.querySelector('.notify-reject');
            if (acceptBtn) {
              acceptBtn.addEventListener('click', function(e) {
                e.stopPropagation();
                respondToFriendRequest(n, 'accept', item);
              });
            }
            if (rejectBtn) {
              rejectBtn.addEventListener('click', function(e) {
                e.stopPropagation();
                respondToFriendRequest(n, 'reject', item);
              });
            }
          } else {
            item.addEventListener('click', function() {
              markNotifRead(n.id);
              if (n.link) {
                // 解析 /channel/{id}#msg-{id}：支持锚点跳转并高亮对应消息
                var hashIdx = n.link.indexOf('#');
                var chPart = hashIdx >= 0 ? n.link.slice(0, hashIdx) : n.link;
                var frag = hashIdx >= 0 ? n.link.slice(hashIdx + 1) : '';
                var chId = chPart.replace('/channel/', '').replace(/\/+$/, '');
                var msgId = '';
                var m = frag && frag.match(/^msg-(.+)$/);
                if (m) msgId = m[1];
                if (chId) {
                  var ch = channels.find(function(c) { return String(c.id) === String(chId); });
                  if (ch) {
                    if (msgId) {
                      switchChannel(ch, function() { scrollToMessage(msgId); });
                    } else {
                      switchChannel(ch);
                    }
                  }
                }
              }
              hideNotifDropdown();
            });
          }
          notifyList.appendChild(item);
        });
      }).catch(function(){});
  }

  function respondToFriendRequest(n, action, item) {
    if (!IF || !IF.friendRespond) {
      if (typeof showToast === 'function') showToast('无法操作好友请求', 'error', 2000);
      return;
    }
    var acceptBtn = item && item.querySelector('.notify-accept');
    var rejectBtn = item && item.querySelector('.notify-reject');
    if (acceptBtn) acceptBtn.disabled = true;
    if (rejectBtn) rejectBtn.disabled = true;

    function doRespond(id) {
      IF.friendRespond(id, action)
        .then(function() {
          // 从 DOM 移除该通知项（而非仅改透明度），防止反复操作
          if (item && item.parentNode) item.parentNode.removeChild(item);
          markNotifRead(n.id);
          renderFriends();
          // 重载通知列表确保干净状态（原 friend_request 通知已被 RPC 删除）
          loadNotifications();
          // 同步刷新弹窗好友列表
          if (typeof loadFriendsToPopup === 'function') loadFriendsToPopup();
        })
        .catch(function(err) {
          if (acceptBtn) acceptBtn.disabled = false;
          if (rejectBtn) rejectBtn.disabled = false;
          var raw = (err && (err.message || err.error_description || err.msg || String(err))) || '操作失败';
          if (typeof showToast === 'function') showToast(raw, 'error', 2500);
        });
    }

    // 新通知 link 已修复，旧通知 link 为空，兜底从 pending 列表找
    var m = n.link ? n.link.match(/[?&]id=([^&]+)/) : null;
    var id = m ? m[1] : '';
    if (id) { doRespond(id); return; }

    function clearStaleNotif() {
      item.style.opacity = '0.55';
      var actions = item.querySelector('.notify-actions');
      if (actions) actions.innerHTML = '<span class="notify-status">已过期</span>';
      markNotifRead(n.id);
    }

    function pickByTitle(incoming) {
      var senderName = (n.title || '').replace(/[[:space:]]*想加你为好友[[:space:]]*$/, '').trim();
      if (!senderName) return null;
      var matches = incoming.filter(function(p) {
        var name = p.other && (p.other.nickname || p.other.username || '');
        return name && name.indexOf(senderName) !== -1;
      });
      return matches.length === 1 ? matches[0] : null;
    }

    if (IF.friendsList) {
      IF.friendsList().then(function(res) {
        var pending = (res && res.pending) || [];
        var incoming = pending.filter(function(p) { return p.direction === 'in'; });
        if (incoming.length === 1) {
          doRespond(incoming[0].id);
        } else if (incoming.length > 1) {
          var picked = pickByTitle(incoming);
          if (picked) {
            doRespond(picked.id);
          } else {
            if (acceptBtn) acceptBtn.disabled = false;
            if (rejectBtn) rejectBtn.disabled = false;
            if (typeof showToast === 'function') showToast('该通知未携带请求ID，请在「好友」列表中操作', 'error', 2500);
          }
        } else {
          clearStaleNotif();
          if (acceptBtn) acceptBtn.disabled = false;
          if (rejectBtn) rejectBtn.disabled = false;
          if (typeof showToast === 'function') showToast('该请求已处理或已过期，已移除通知', 'error', 2000);
        }
      }).catch(function() {
        if (acceptBtn) acceptBtn.disabled = false;
        if (rejectBtn) rejectBtn.disabled = false;
        if (typeof showToast === 'function') showToast('无法操作好友请求', 'error', 2000);
      });
    } else {
      if (acceptBtn) acceptBtn.disabled = false;
      if (rejectBtn) rejectBtn.disabled = false;
      if (typeof showToast === 'function') showToast('缺少请求ID', 'error', 2000);
    }
  }

  function markNotifRead(id) {
    IF.markRead(id).then(function() {
      unreadNotifCount = Math.max(0, unreadNotifCount - 1);
      updateNotifBadge();
    }).catch(function(){});
  }

  function hideNotifDropdown() {
    if (!notifyDropdown || !notifyOpen) return;
    notifyOpen = false;
    if (REDUCED_MOTION || typeof gsap === 'undefined') {
      notifyDropdown.style.display = 'none';
      return;
    }
    gsap.killTweensOf(notifyDropdown);
    gsap.to(notifyDropdown, { opacity: 0, y: -8, duration: 0.16, ease: 'power2.in', onComplete: function(){ notifyDropdown.style.display = 'none'; } });
  }

  function markAllRead() {
    IF.markAllRead().then(function() {
      unreadNotifCount = 0;
      updateNotifBadge();
      loadNotifications();
    }).catch(function(){});
  }

  if (btnNotify) btnNotify.addEventListener('click', function(e){ if (e) e.stopPropagation(); openNotifDropdown(); });
  if (notifyMarkAll) notifyMarkAll.addEventListener('click', markAllRead);

  // Compose (+) button: toggle input bar
  var btnCompose = document.getElementById('btn-compose');
  if (btnCompose) btnCompose.addEventListener('click', function(e){
    e.stopPropagation();
    toggleInputBar();
  });

  // Close dropdown on outside click
  document.addEventListener('click', function(e) {
    if (notifyDropdown && notifyDropdown.style.display === 'block' &&
        !e.target.closest('#notify-wrap')) {
      hideNotifDropdown();
    }
  });

  // Esc 关闭输入框
  document.addEventListener('keydown', function(e){
    if (e.key === 'Escape') {
      var ia = document.getElementById('message-input-area');
      if (ia && ia.classList.contains('input-visible')) hideInputBar();
    }
  });

  // ── Friends Tab（好友 Tab）────────────────────
  var tabNotif   = document.getElementById('tab-notif');
  var tabFriends = document.getElementById('tab-friends');
  var panelNotif = document.getElementById('panel-notif');
  var panelFriends = document.getElementById('panel-friends');
  var friendsListEl = document.getElementById('friends-list');
  var friendsReqEl  = document.getElementById('friends-requests');
  var friendAddInput = document.getElementById('friend-add-input');
  var friendAddBtn  = document.getElementById('friend-add-btn');
  var friendSearchResults = document.getElementById('friend-search-results');

  function switchNotifyTab(tab) {
    if (!tabNotif || !tabFriends || !panelNotif || !panelFriends) return;
    var isFriends = tab === 'friends';
    tabNotif.classList.toggle('active', !isFriends);
    tabFriends.classList.toggle('active', isFriends);
    panelNotif.style.display = isFriends ? 'none' : 'flex';
    panelFriends.style.display = isFriends ? 'flex' : 'none';
    if (isFriends) renderFriends();
  }
  if (tabNotif) tabNotif.addEventListener('click', function(){ switchNotifyTab('notif'); });
  if (tabFriends) tabFriends.addEventListener('click', function(){ switchNotifyTab('friends'); });

  function friendAvatarHtml(u) {
    var name = (u && (u.nickname || u.username)) || '同学';
    var initial = getInitial(name);
    if (u && u.avatar_url) {
      return '<div class="friend-avatar"><img src="' + u.avatar_url + '" alt="" onerror="this.parentNode.textContent=\'' + initial + '\'"></div>';
    }
    return '<div class="friend-avatar" style="background:' + getAvatarColor((u && u.username) || '?') + '">' + initial + '</div>';
  }

  function renderFriendList(container, list, isRequest) {
    if (!container) return;
    container.innerHTML = '';
    if (!list || list.length === 0) {
      container.innerHTML = '<div class="notify-empty">' + (isRequest ? '暂无请求' : '暂无好友') + '</div>';
      return;
    }
    list.forEach(function(u) {
      var user = u.other || u;   // entry.other 才是用户资料对象
      var item = document.createElement('div');
      item.className = 'friend-item';
      item.innerHTML = friendAvatarHtml(user) +
        '<span class="friend-name">' + escapeHtml((user && (user.nickname || user.username)) || '同学') + '</span>';
      var actions = document.createElement('span');
      actions.className = 'friend-actions';
      if (!isRequest) {
        var rm = document.createElement('button');
        rm.type = 'button';
        rm.className = 'friend-btn friend-remove';
        rm.textContent = '移除';
        rm.addEventListener('click', function(e) {
          e.stopPropagation();
          if (!IF || !IF.friendRemove || !user.id) return;
          IF.friendRemove(user.id).then(function(){ renderFriends(); }).catch(function(){});
        });
        actions.appendChild(rm);
      } else {
        var acc = document.createElement('button');
        acc.type = 'button';
        acc.className = 'friend-btn friend-accept';
        acc.textContent = '接受';
        acc.addEventListener('click', function(e) {
          e.stopPropagation();
          if (!IF || !IF.friendRespond || !u.id) return;
          IF.friendRespond(u.id, 'accept').then(function(){ renderFriends(); }).catch(function(){});
        });
        var rej = document.createElement('button');
        rej.type = 'button';
        rej.className = 'friend-btn friend-reject';
        rej.textContent = '拒绝';
        rej.addEventListener('click', function(e) {
          e.stopPropagation();
          if (!IF || !IF.friendRespond || !u.id) return;
          IF.friendRespond(u.id, 'reject').then(function(){ renderFriends(); }).catch(function(){});
        });
        actions.appendChild(acc);
        actions.appendChild(rej);
      }
      item.appendChild(actions);
      container.appendChild(item);
    });
  }

  function renderFriends() {
    if (!IF || !IF.friendsList || !friendsListEl || !friendsReqEl) return;
    IF.friendsList().then(function(data) {
      data = data || {};
      // 兼容多种返回结构：{ friends, requests } 或 { accepted, pending }
      var friends = data.friends || data.accepted || [];
      var requests = data.requests || data.pending || [];
      renderFriendList(friendsListEl, friends, false);
      renderFriendList(friendsReqEl, requests, true);
    }).catch(function() {
      if (friendsListEl) friendsListEl.innerHTML = '<div class="notify-empty">加载失败</div>';
    });
  }

  if (friendAddBtn && friendAddInput) {
    function isUuid(str) {
      return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(str);
    }
    function clearSearchCandidates() {
      if (!friendSearchResults) return;
      friendSearchResults.innerHTML = '';
      friendSearchResults.classList.remove('visible');
    }
    function renderSearchCandidates(list) {
      if (!friendSearchResults) return;
      friendSearchResults.innerHTML = '';
      if (!list || list.length === 0) {
        friendSearchResults.classList.remove('visible');
        return;
      }
      list.forEach(function(u) {
        var item = document.createElement('div');
        item.className = 'friend-search-candidate';
        item.setAttribute('data-id', u.id);
        item.innerHTML = friendAvatarHtml(u) +
          '<span class="friend-name">' + escapeHtml((u && (u.nickname || u.username)) || '同学') + '</span>' +
          '<span class="friend-username">' + escapeHtml((u && u.username) || '') + '</span>';
        item.addEventListener('click', function(e) {
          e.stopPropagation();
          sendFriendRequest(u.id, u);
        });
        friendSearchResults.appendChild(item);
      });
      friendSearchResults.classList.add('visible');
    }
    function sendFriendRequest(targetId, targetUser) {
      if (!IF || !IF.friendRequest || !targetId) return;
      if (friendAddBtn) friendAddBtn.disabled = true;
      Promise.resolve(IF.friendRequest(targetId))
        .then(function() {
          if (friendAddInput) friendAddInput.value = '';
          clearSearchCandidates();
          renderFriends();
          var name = (targetUser && (targetUser.nickname || targetUser.username)) || '该用户';
          if (typeof showToast === 'function') showToast('已向 ' + name + ' 发送好友申请', 'success', 2500);
        })
        .catch(function(err) {
          var raw = (err && (err.message || err.error_description || err.msg || String(err))) || '加好友失败';
          if (typeof showToast === 'function') showToast(raw, 'error', 3000);
        })
        .then(function() { if (friendAddBtn) friendAddBtn.disabled = false; });
    }
    function onAddFriendClick() {
      if (!IF || !friendAddInput) return;
      clearSearchCandidates();
      var val = (friendAddInput.value || '').trim();
      if (!val) {
        if (typeof showToast === 'function') showToast('请输入 uid 或昵称', 'error', 2000);
        return;
      }
      // uuid 直接发送请求
      if (isUuid(val)) {
        sendFriendRequest(val);
        return;
      }
      // 昵称/用户名搜索
      if (!IF.searchUsers) {
        if (typeof showToast === 'function') showToast('暂不支持昵称搜索', 'error', 2000);
        return;
      }
      if (friendAddBtn) friendAddBtn.disabled = true;
      Promise.resolve(IF.searchUsers(val, 5))
        .then(function(list) {
          if (!list || list.length === 0) {
            if (typeof showToast === 'function') showToast('未找到用户：' + val, 'error', 2500);
            return;
          }
          // 始终显示候选列表，让用户点选确认，避免误发
          renderSearchCandidates(list);
        })
        .catch(function(err) {
          var raw = (err && (err.message || err.error_description || err.msg || String(err))) || '搜索失败';
          if (typeof showToast === 'function') showToast(raw, 'error', 2500);
        })
        .then(function() { if (friendAddBtn) friendAddBtn.disabled = false; });
    }
    friendAddBtn.addEventListener('click', function(e) {
      e.stopPropagation();
      onAddFriendClick();
    });
    friendAddInput.addEventListener('keydown', function(e) {
      if (e.key === 'Enter') { e.preventDefault(); onAddFriendClick(); }
    });
    // 输入变化时清空候选，避免旧候选残留
    friendAddInput.addEventListener('input', clearSearchCandidates);
  }

  // ── Realtime 通知订阅（最小订阅，不干扰聊天订阅）──
  var notifRtHandler = null;
  var notifRtSubscribed = false;
  var _notifFallbackTimer = null;
  // 实时订阅失败时的兜底：4s 短轮询未读 + 好友列表，保证被加方几秒内必看到通知
  function startNotifFallbackPoll() {
    if (_notifFallbackTimer) return;
    _notifFallbackTimer = setInterval(function() {
      if (document.visibilityState === 'visible' && currentUser && IF && IF.unreadCount) {
        fetchUnreadCount();
        if (typeof renderFriends === 'function') renderFriends();
      }
    }, 4000);
  }
  function subscribeNotifications() {
    if (notifRtSubscribed) return;
    if (!IF || !IF.insforge || !IF.insforge.realtime || !currentUser) return;
    notifRtSubscribed = true;
    var rt = IF.insforge.realtime;
    var subscribe = function() {
      var channel = 'notifications:' + currentUser.id;
      try {
        rt.subscribe(channel).then(function(resp) {
          if (!resp || !resp.ok) {
            console.warn('[notif-rt] 订阅失败，启用兜底轮询', resp && resp.error);
            startNotifFallbackPoll();
            return;
          }
          if (notifRtHandler) { try { rt.off('new_notification', notifRtHandler); } catch (e) {} }
          notifRtHandler = function(payload) {
            var rec = (payload && (payload.record || payload)) || {};
            if (rec.user_id && rec.user_id !== currentUser.id) return;
            if (rec.type === 'dm') {
              // 私信未读只在好友列表显示，不冒顶部铃红点
              var fu = parseDmLink(rec.link);
              if (fu) {
                dmUnread[fu.friendId] = (dmUnread[fu.friendId] || 0) + 1;
                refreshFriendBadges();
              }
              return;
            }
            unreadNotifCount = (unreadNotifCount || 0) + 1;
            updateNotifBadge();
            if (notifyDropdown && notifyDropdown.style.display === 'block') loadNotifications();
            // 好友关系变化时同步刷新好友列表（解决"对方同意后列表不显示"）
            if (rec.type === 'friend_accepted' || rec.type === 'friend_request') {
              renderFriends();
              if (typeof loadFriendsToPopup === 'function') loadFriendsToPopup();
              // 明确浮层提示，避免"通知没显示"误判（不只静默亮铃标）
              if (typeof showToast === 'function') {
                if (rec.type === 'friend_request') showToast('💌 ' + (rec.title || '收到新的好友申请'), 'info', 4500);
                else showToast('✅ ' + (rec.title || '对方已接受你的好友申请'), 'success', 4500);
              }
            }
          };
          rt.on('new_notification', notifRtHandler);
        }).catch(function(e) { console.warn('[notif-rt] subscribe', e); });
      } catch (e) { console.warn('[notif-rt] subscribe', e); }
    };
    try {
      var c = rt.connect();
      if (c && typeof c.then === 'function') c.then(subscribe).catch(subscribe);
      else subscribe();
    } catch (e) { console.warn('[notif-rt] connect', e); }
  }

  var _pollUnreadInterval = setInterval(function() {
    if (document.visibilityState === 'visible' && currentUser && IF && IF.unreadCount) {
      fetchUnreadCount();
    }
  }, 15000);

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
    // InsForge 消息对象只有 author_id（无 username/nickname），须走 resolveAuthor 查 profileCache
    if (members.length === 0 && currentChannel) {
      var msgs = channelMessages[currentChannel.id] || [];
      var seen = {};
      msgs.forEach(function(msg) {
        var author = (IF && IF.resolveAuthor ? IF.resolveAuthor(msg.author_id) : null);
        var uname = author ? (author.username || '') : '';
        if (uname && !seen[uname]) {
          seen[uname] = true;
          members.push({ username: uname, nickname: author.nickname || uname });
        }
      });
    }
    return members;
  }
  // 倒序流：判断用户是否已接近顶部（最新消息在顶部）
  function isNearTop(){
    if(!messagesArea) return true;
    return messagesArea.scrollTop < 80;
  }

  // 点赞粒子爆裂特效：扩散环 + 7 颗粒子飞散 + 心形弹跳 + 数字弹跳
  function burstHeart(btn, countEl) {
    if (REDUCED_MOTION || typeof gsap === 'undefined') return;
    try {
      var rect = btn.getBoundingClientRect();
      var cx = rect.left + rect.width/2;
      var cy = rect.top + rect.height/2;
      var ring = document.createElement('span');
      ring.className = 'like-ring';
      ring.style.left = cx + 'px'; ring.style.top = cy + 'px';
      document.body.appendChild(ring);
      gsap.set(ring, { xPercent:-50, yPercent:-50, scale:0.4, opacity:0.9 });
      gsap.to(ring, { scale:2.6, opacity:0, duration:0.5, ease:'power2.out', onComplete:function(){ ring.remove(); } });
      var n = 7;
      for (var i=0; i<n; i++) {
        var p = document.createElement('span');
        p.className = 'like-particle';
        p.style.left = cx + 'px'; p.style.top = cy + 'px';
        document.body.appendChild(p);
        var angle = (Math.PI*2) * (i/n) + (Math.random()*0.6-0.3);
        var dist = 24 + Math.random()*20;
        gsap.set(p, { xPercent:-50, yPercent:-50, x:0, y:0, scale:0.4+Math.random()*0.6, opacity:1 });
        gsap.to(p, { x:Math.cos(angle)*dist, y:Math.sin(angle)*dist, opacity:0, scale:0, duration:0.55+Math.random()*0.3, ease:'power2.out', onComplete:(function(node){ return function(){ node.remove(); }; })(p) });
      }
      gsap.fromTo(btn, { scale:1 }, { scale:1.35, duration:0.16, ease:'power2.out', yoyo:true, repeat:1 });
      if (countEl) gsap.fromTo(countEl, { scale:1.5 }, { scale:1, duration:0.3, ease:'back.out(2)' });
    } catch(e){}
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
      // 倒序流：滚回顶部（看到最新）即隐藏"回到顶部"按钮
      if (isNearTop()) {
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
      // 倒序流：该按钮变为"回到顶部（最新）"
      if(messagesArea){
        messagesArea.scrollTo({ top: 0, behavior: 'smooth' });
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

  // ==================== CHANNEL DRAWER ====================
  // PC 与移动端共用同一个抽屉（#sidebar → .channel-drawer）。
  // 只有点击 hamburger-btn 才打开；showMain() 绝不调用，避免移动端反复弹出。

  function openDrawer(){
    var drawer = document.getElementById('sidebar'); // channel-drawer
    var overlay = document.getElementById('drawer-overlay');
    if(!drawer) return;
    // 关闭头像弹窗
    var popup = document.getElementById('avatar-popup');
    if(popup) { popup.classList.remove('open'); if(typeof gsap !== 'undefined') gsap.set(popup,{x:'100%'}); }

    // 显隐完全由 CSS .open + transition 驱动，GSAP 不控制抽屉位置，
    // 这样即使 GSAP 未加载或动画未跑完，抽屉也一定停在 translateX(0) 可见。
    drawer.classList.add('open');
    if(overlay) overlay.classList.add('active');
    if(!REDUCED_MOTION && typeof gsap !== 'undefined'){
      // 仅做遮罩淡入 + 列表内容轻入场（不影响抽屉显隐）
      gsap.killTweensOf(overlay);
      gsap.fromTo(overlay, {autoAlpha:0}, {autoAlpha:1, duration:0.28});
      var inner = drawer.querySelector('.channel-list, .drawer-inner, .drawer-header');
      if(inner){
        gsap.killTweensOf(inner);
        gsap.fromTo(inner, {autoAlpha:0, y:14}, {autoAlpha:1, y:0, duration:0.32, delay:0.04, ease:'expo.out'});
      }
    }
  }
  function closeDrawer(){
    var drawer = document.getElementById('sidebar');
    var overlay = document.getElementById('drawer-overlay');
    if(!drawer) return;
    // 移除 .open 即由 CSS transition 滑回 -100%，不依赖 GSAP
    drawer.classList.remove('open');
    if(overlay){
      if(REDUCED_MOTION || typeof gsap === 'undefined'){
        overlay.classList.remove('active');
      } else {
        gsap.killTweensOf(overlay);
        gsap.to(overlay, {autoAlpha:0, duration:0.24, onComplete:function(){ overlay.classList.remove('active'); }});
      }
    }
  }

  if(mobileMenuBtn) mobileMenuBtn.addEventListener('click',function(e){
    e.stopPropagation();
    if(sidebar && sidebar.classList.contains('open')) closeDrawer();
    else openDrawer();
  });
  document.addEventListener('click',function(e){
    if(sidebar && sidebar.classList.contains('open') && !sidebar.contains(e.target) && e.target !== mobileMenuBtn){
      closeDrawer();
    }
  });
  if(drawerOverlay) drawerOverlay.addEventListener('click', closeDrawer);
  // 可访问性：抽屉打开时按 ESC 关闭
  document.addEventListener('keydown', function(e){
    if(e.key==='Escape' && sidebar && sidebar.classList.contains('open')) closeDrawer();
  });

  // ==================== AVATAR POPUP（替代 right-panel） ====================

  var avatarPopup = null;
  var avatarPopupOverlay = null;

  function initAvatarPopup(){
    avatarPopup = document.getElementById('avatar-popup');
    avatarPopupOverlay = document.getElementById('avatar-popup-overlay');
    var btn = document.getElementById('nav-avatar-btn');
    if(btn){
      btn.addEventListener('click', function(e){
        e.stopPropagation();
        if(avatarPopup && avatarPopup.classList.contains('open')) closeAvatarPopup();
        else openAvatarPopup();
      });
    }
    if(avatarPopupOverlay) avatarPopupOverlay.addEventListener('click', closeAvatarPopup);
  }

  function openAvatarPopup(){
    if(!avatarPopup) return;
    // 关闭频道抽屉
    if(sidebar && sidebar.classList.contains('open')) closeDrawer();
    
    avatarPopup.classList.add('open');
    if(avatarPopupOverlay) avatarPopupOverlay.classList.add('active');
    if(!REDUCED_MOTION && typeof gsap !== 'undefined'){
      gsap.killTweensOf(avatarPopup);
      gsap.fromTo(avatarPopup, {x:'100%'}, {x:'0%', duration:0.32, ease:'expo.out'});
      if(avatarPopupOverlay){
        gsap.killTweensOf(avatarPopupOverlay);
        gsap.fromTo(avatarPopupOverlay, {autoAlpha:0}, {autoAlpha:1, duration:0.28});
      }
    }
    // 加载成员列表到弹窗
    loadMembersToPopup();
    loadFriendsToPopup();
    updatePopupUserCard();
  }

  function closeAvatarPopup(){
    if(!avatarPopup) return;
    if(REDUCED_MOTION || typeof gsap === 'undefined'){
      avatarPopup.classList.remove('open');
      if(avatarPopupOverlay) avatarPopupOverlay.classList.remove('active');
      return;
    }
    gsap.killTweensOf([avatarPopup, avatarPopupOverlay]);
    gsap.to(avatarPopupOverlay, {autoAlpha:0, duration:0.24});
    gsap.to(avatarPopup, {
      x:'100%', duration:0.30, ease:'expo.in',
      onComplete:function(){ avatarPopup.classList.remove('open'); }
    });
    if(avatarPopupOverlay) avatarPopupOverlay.classList.remove('active');
  }

  // ==================== BACKGROUND SETTINGS ====================

  var BG_STORAGE_KEY = 'campus_main_bg_v1';
  var THEME_NAMES = { starry: '星空', light: '白昼极简', classroom: '自然森绿', custom: '我的壁纸' };

  var currentBg = { theme: 'starry', customUrl: '', blur: 0, dim: 38 };

  function loadBackgroundSettings(){
    try {
      var saved = localStorage.getItem(BG_STORAGE_KEY);
      if (saved) currentBg = JSON.parse(saved);
    } catch(e) {}
    applyTheme(currentBg.theme || 'starry', false);
  }

  function saveBackgroundSettings(){
    try { localStorage.setItem(BG_STORAGE_KEY, JSON.stringify(currentBg)); } catch(e) {}
  }

  // 全站主题：starry/light/classroom 的配色 + 背景均由 CSS [data-theme] 控制；
  // custom 用 JS 注入用户图片，全站配色沿用深色（starry）基底。
  function applyTheme(theme, animate){
    var root = document.documentElement;
    var body = document.body;

    if (theme === 'custom' && currentBg.customUrl) {
      body.dataset.theme = 'custom';
      root.style.setProperty('--main-bg-image', 'url(' + currentBg.customUrl + ')');
      var dim = (currentBg.dim || 38) / 100;
      root.style.setProperty('--main-bg-overlay', 'linear-gradient(180deg, rgba(0,0,0,' + (dim * 0.35).toFixed(2) + ') 0%, rgba(0,0,0,' + dim.toFixed(2) + ') 100%)');
      root.style.setProperty('--main-bg-blur', (currentBg.blur || 0) + 'px');
      root.style.setProperty('--main-bg-dim', dim.toFixed(2));
    } else {
      body.dataset.theme = theme;
      // 清除 custom 可能残留的 inline 变量，交还 CSS [data-theme] 控制
      root.style.removeProperty('--main-bg-image');
      root.style.removeProperty('--main-bg-overlay');
      root.style.removeProperty('--main-bg-blur');
      root.style.removeProperty('--main-bg-dim');
    }

    // 自定义主题显示滑块 (both panels)
    var sliders = document.getElementById('bg-sliders');
    var settingsSliders = document.getElementById('settings-bg-sliders');
    if (sliders) sliders.style.display = (theme === 'custom') ? 'flex' : 'none';
    if (settingsSliders) settingsSliders.style.display = (theme === 'custom') ? 'flex' : 'none';

    // 更新按钮激活态
    var themes = document.querySelectorAll('.bg-theme');
    themes.forEach(function(btn){
      btn.classList.toggle('active', btn.dataset.theme === theme);
    });

    // 同步漂浮光点配色
    if (typeof window.__rebuildMainDots === 'function') {
      window.__rebuildMainDots(theme === 'custom' ? 'starry' : theme);
    }

    if (animate && !REDUCED_MOTION && typeof gsap !== 'undefined') {
      var mainBg = document.getElementById('main-bg');
      var mainDots = document.getElementById('main-dots');
      if (mainBg) {
        gsap.killTweensOf(mainBg);
        gsap.fromTo(mainBg, { opacity: 0, scale: 1.05 }, { opacity: 1, scale: 1, duration: 0.9, ease: 'power2.out' });
      }
      if (mainDots) {
        gsap.killTweensOf(mainDots);
        gsap.fromTo(mainDots, { opacity: 0, scale: 1.02 }, { opacity: 1, scale: 1, duration: 1.0, ease: 'power2.out' });
      }
    }
  }

  // ─── GSAP 星空微交互：视差 + 流星彩蛋 ───
  function setupStarryGsapEffects(){
    if (REDUCED_MOTION || typeof gsap === 'undefined') return;

    var mainBg = document.getElementById('main-bg');
    var mainDots = document.getElementById('main-dots');
    if (!mainBg || !mainDots) return;

    // 鼠标视差：背景层与 Canvas 层错位移动，营造纵深
    var hasQuickTo = typeof gsap.quickTo === 'function';
    var bgX, bgY, dotsX, dotsY;
    if (hasQuickTo) {
      bgX = gsap.quickTo(mainBg, 'x', { duration: 1.2, ease: 'power2.out' });
      bgY = gsap.quickTo(mainBg, 'y', { duration: 1.2, ease: 'power2.out' });
      dotsX = gsap.quickTo(mainDots, 'x', { duration: 0.8, ease: 'power2.out' });
      dotsY = gsap.quickTo(mainDots, 'y', { duration: 0.8, ease: 'power2.out' });
    }

    var parallax = { x: 0, y: 0 };
    window.addEventListener('mousemove', function(e){
      if (document.body.dataset.theme !== 'starry') return;
      var nx = (e.clientX / window.innerWidth - 0.5) * 2;
      var ny = (e.clientY / window.innerHeight - 0.5) * 2;
      parallax.x = -nx; parallax.y = -ny;
      if (hasQuickTo) {
        bgX(parallax.x * 10); bgY(parallax.y * 6);
        dotsX(parallax.x * 18); dotsY(parallax.y * 10);
      } else {
        gsap.to(mainBg, { x: parallax.x * 10, y: parallax.y * 6, duration: 1.2, ease: 'power2.out', overwrite: true });
        gsap.to(mainDots, { x: parallax.x * 18, y: parallax.y * 10, duration: 0.8, ease: 'power2.out', overwrite: true });
      }
    }, { passive: true });

  }

  function initBackgroundSettings(){
    loadBackgroundSettings();
    setupStarryGsapEffects();

    var themes = document.getElementById('bg-themes');
    var fileInput = document.getElementById('bg-file-input');
    var blurInput = document.getElementById('bg-blur');
    var dimInput = document.getElementById('bg-dim');
    var resetBtn = document.getElementById('bg-reset');

    if (themes) {
      themes.addEventListener('click', function(e){
        var btn = e.target.closest('.bg-theme');
        if (!btn) return;
        var theme = btn.dataset.theme;
        if (theme === 'custom') {
          if (fileInput) fileInput.click();
        } else {
          currentBg.theme = theme;
          saveBackgroundSettings();
          applyTheme(theme, true);
          // Sync settings panel
          if (typeof syncThemeActiveState === 'function') {
            syncThemeActiveState(document.getElementById('settings-bg-themes'));
            syncThemeActiveState(themes);
          }
        }
      });
    }

    if (fileInput) {
      fileInput.addEventListener('change', function(e){
        var file = e.target.files && e.target.files[0];
        if (!file) return;
        if (!/^image\//.test(file.type)) { showToast('请选择图片文件'); return; }
        if (file.size > 4 * 1024 * 1024) { showToast('图片超过 4MB，建议压缩后重试'); return; }
        var reader = new FileReader();
        reader.onload = function(ev){
          currentBg.theme = 'custom';
          currentBg.customUrl = ev.target.result;
          saveBackgroundSettings();
          applyTheme('custom', true);
          showToast('壁纸已应用 ✅');
          if (typeof syncThemeActiveState === 'function') {
            syncThemeActiveState(document.getElementById('settings-bg-themes'));
            syncThemeActiveState(themes);
          }
        };
        reader.readAsDataURL(file);
      });
    }

    if (blurInput) {
      blurInput.value = currentBg.blur || 0;
      blurInput.addEventListener('input', function(){
        currentBg.blur = parseInt(this.value, 10);
        saveBackgroundSettings();
        applyTheme(currentBg.theme, false);
      });
    }

    if (dimInput) {
      dimInput.value = currentBg.dim || 38;
      dimInput.addEventListener('input', function(){
        currentBg.dim = parseInt(this.value, 10);
        saveBackgroundSettings();
        applyTheme(currentBg.theme, false);
      });
    }

    if (resetBtn) {
      resetBtn.addEventListener('click', function(){
        currentBg = { theme: 'starry', customUrl: '', blur: 0, dim: 38 };
        saveBackgroundSettings();
        applyTheme('starry', true);
        if (blurInput) blurInput.value = 0;
        if (dimInput) dimInput.value = 38;
        showToast('已恢复默认背景');
        // Sync settings panel
        var settingsSliders = document.getElementById('settings-bg-sliders');
        if (settingsSliders) settingsSliders.style.display = 'none';
        if (typeof syncThemeActiveState === 'function') {
          syncThemeActiveState(document.getElementById('settings-bg-themes'));
          syncThemeActiveState(themes);
        }
      });
    }
  }

  function updatePopupUserCard(){
    if (!currentUser) return;
    var nameEl = document.getElementById('popup-user-name');
    var avatarEl = document.getElementById('popup-user-avatar');
    if (nameEl) nameEl.textContent = currentUser.nickname || currentUser.username || '同学';
    if (avatarEl) {
      if (currentUser.avatar_url) {
        avatarEl.innerHTML = '<img src="' + currentUser.avatar_url + '" alt="" onerror="this.parentNode.textContent=\'' + getInitial(currentUser.nickname || currentUser.username) + '\'">';
      } else {
        avatarEl.textContent = getInitial(currentUser.nickname || currentUser.username);
        avatarEl.style.background = getAvatarColor(currentUser.username);
      }
    }
  }

  // 将成员列表渲染进头像弹窗
  function loadMembersToPopup(){
    if(!avatarPopup) return;
    var listEl = avatarPopup.querySelector('#avatar-popup-members');
    if(!listEl) return;
    var members = getChannelMembers();
    if(!members || members.length === 0){
      listEl.innerHTML = '<div class="popup-empty">暂无成员</div>';
      return;
    }
    listEl.innerHTML = '';
    members.slice(0, 50).forEach(function(m){
      var item = document.createElement('div');
      item.className = 'popup-member';
      item.innerHTML =
        '<div class="popup-member-avatar" style="background:'+getAvatarColor(m.username)+'">'+getInitial(m.nickname||m.username)+'</div>'+
        '<span class="popup-member-name">'+escapeHtml(m.nickname||m.username)+'</span>';
      listEl.appendChild(item);
    });
  }

  // 移动端键盘弹出后，确保消息输入框可见
  if(msgInput){
    msgInput.addEventListener('focus', function(){
      setTimeout(function(){ if(msgInput.scrollIntoView) msgInput.scrollIntoView({ block:'nearest' }); }, 300);
    });
  }

  // ==================== LOGIN FORM ====================

  var pendingVerifyEmail = null;   // 注册后待验证的邮箱
  var pendingVerifyPassword = null; // 注册时填的密码，验证成功后若未自动建会话则兜底登录

  // 忘记密码：通过 InsForge 发送重置验证码邮件
  var forgotLink = document.getElementById('forgot-link');
  if (forgotLink) {
    forgotLink.addEventListener('click', function(e) {
      e.preventDefault();
      if (!loginForm || !IF) { showToast('后端未就绪', 'error'); return; }
      var email = (new FormData(loginForm).get('email') || '').trim();
      if (!email) { showLoginError({message:'请先输入邮箱'}); return; }
      if (forgotLink._busy) return;
      forgotLink._busy = true;
      forgotLink.style.opacity = '0.6';
      IF.sendResetPasswordEmail(email)
        .then(function(){
          forgotLink._busy = false;
          forgotLink.style.opacity = '';
          showResetPanel(email);
        })
        .catch(function(err){
          forgotLink._busy = false;
          forgotLink.style.opacity = '';
          showToast((err&&err.message)||'发送失败', 'error');
        });
    });
  }

  if(loginForm){
    loginForm.addEventListener('submit',function(e){
      e.preventDefault();
      if(loginForm._submitting) return; // 防重复提交
      loginForm._submitting = true;
      clearLoginError();
      var submitBtn = loginForm.querySelector('[type="submit"], .btn-login');
      if(submitBtn){ submitBtn.disabled = true; submitBtn.textContent = loginMode==='signup'?'注册中...':'登录中...'; }
      // 立即显示 GSAP 加载动画
      showLoginLoader();
      var fd=new FormData(loginForm);
      var email=(fd.get('email')||'').trim();
      var p=(fd.get('password')||'').trim();
      var nick=(fd.get('nickname')||'').trim();
      var done = function(){
        loginForm._submitting = false;
        if(submitBtn){ submitBtn.disabled = false; submitBtn.textContent = loginMode==='signup'?'注册':'登录'; }
        hideLoginLoader(); // 出错时关闭加载动画
      };
      if(!email||!p){ showLoginError({message:'请输入邮箱和密码'}); done(); return; }
      if(!IF){ showLoginError({message:'后端未就绪，请刷新页面'}); done(); return; }

      if(loginMode==='signup'){
        if(!nick){ showLoginError({message:'请输入昵称'}); done(); return; }
        if(p.length < 8 || !/[a-zA-Z]/.test(p) || !/\d/.test(p)){
          showLoginError({message:'密码至少 8 位，需同时包含字母和数字'});
          done(); return;
        }
        IF.signUp(email, p, nick, nick).then(function(res) {
          if (res.requireEmailVerification) {
            showVerifyPanel(email, p);
            done(); return;
          }
          if (res.user) { onLoginSuccess(res.user); return; }
          // 兜底：任何未识别响应都关闭加载层，避免卡住
          done();
        }).catch(function(err){
          var msg = (err && (err.message || err.error_description || err.msg || '')) + '';
          // 邮箱已存在 / 需验证 / 任何账号类错误 → 一律进验证面板并补发验证码，
          // 不再把表单留在登录页（这是此前“点注册跳回登录页”的根因）。
          if (/already|exists|registered|已注册|已存在|占用|in use|verif|confirm|not confirmed|email|unexpected error|sign up|network|failed to fetch/i.test(msg)) {
            showVerifyPanel(email, p);
            done(); return;
          }
          showLoginError(err);
          done();
        });
      } else {
        IF.signIn(email, p).then(function(user) {
          onLoginSuccess(user);
        }).catch(function(err){
          showLoginError(err);
          done();
        });
      }
    });
  }

  if(loginRetry){
    loginRetry.addEventListener('click', function(){
      if(loginForm) loginForm.dispatchEvent(new Event('submit', { bubbles:true, cancelable:true }));
    });
  }

  // 注册时实时提示密码强度
  if(loginForm){
    var pwInput = loginForm.querySelector('input[name="password"]');
    if(pwInput){
      pwInput.addEventListener('input', function(){
        var hint = document.getElementById('pw-hint');
        if(!hint || loginMode!=='signup') return;
        var v = pwInput.value || '';
        var hasLetter = /[a-zA-Z]/.test(v);
        var hasNum = /\d/.test(v);
        if(v.length >= 8 && hasLetter && hasNum){
          hint.textContent = '密码强度：符合要求'; hint.className = 'input-hint ok';
        } else if(v.length >= 6 && (hasLetter || hasNum)){
          hint.textContent = '密码强度：建议 8 位以上并同时含字母和数字'; hint.className = 'input-hint warn';
        } else if(v.length > 0){
          hint.textContent = '密码至少 8 位，需同时包含字母和数字'; hint.className = 'input-hint err';
        } else {
          hint.textContent = '密码至少 8 位，需同时包含字母和数字'; hint.className = 'input-hint';
        }
      });
    }
  }

  function onLoginSuccess(user) {
    function go(u){
      currentUser = u;
      try { clearLoginError(); } catch(e){}
      // 先关闭加载层，再用 GSAP 过渡到主界面
      hideLoginLoader(function(){
        try { showMainWithTransition(); } catch(err){ console.error('showMain error:', err); }
      });
    }
    if (IF) {
      // 带 8s 超时：completePendingProfile 需连 InsForge DB（新加坡），
      // 国内网络不稳定时可能 hang。超时后直接进主界面，profile 已在 signIn 时建好。
      var settled = false;
      var timer = setTimeout(function(){ if(!settled){ settled=true; go(user); } }, 8000);
      IF.completePendingProfile(user).then(function(u){
        if(!settled){ settled=true; clearTimeout(timer); go(u); }
      }).catch(function(){
        if(!settled){ settled=true; clearTimeout(timer); go(user); }
      });
    } else {
      go(user);
    }
  }

  // 显示邮箱验证面板（注册返回 requireEmailVerification 时）
  function showVerifyPanel(email, password){
    pendingVerifyEmail = email;
    pendingVerifyPassword = password || null;
    // 把密码暂存到 sessionStorage，避免页面刷新后丢失
    try { if(password) sessionStorage.setItem('bfyg_pending_password', password); } catch(e){}
    // 强制收起加载层、恢复卡片/遮罩可见（不依赖 GSAP 或外部 done()，避免被 opacity:0 藏掉）
    if(loginSubmitLoader){ loginSubmitLoader.classList.remove('active'); loginSubmitLoader.setAttribute('aria-hidden','true'); loginSubmitLoader.style.opacity=''; }
    if(monsterLogin){ monsterLogin.classList.add('active'); monsterLogin.style.opacity='1'; monsterLogin.style.visibility='visible'; monsterLogin.style.pointerEvents='auto'; }
    if(loginCard){ loginCard.style.opacity='1'; loginCard.style.transform=''; loginCard.style.filter=''; loginCard.style.visibility='visible'; }
    if(loginForm) loginForm.style.display='none';
    if(loginFooterSwitch) loginFooterSwitch.style.display='none';
    var vp=document.getElementById('verify-panel');
    if(vp){ vp.style.display='block'; vp.style.opacity='1'; vp.style.position='relative'; vp.style.zIndex='2'; }
    var disp=document.getElementById('verify-email-display'); if(disp) disp.textContent=email;
    var err=document.getElementById('verify-error'); if(err) err.textContent='';
    var sub=document.getElementById('verify-sub'); if(sub) sub.textContent='正在向 '+email+' 发送验证码…';
    var codeInput=document.getElementById('verify-code');
    if(codeInput){ codeInput.value=''; setTimeout(function(){ try{codeInput.focus();}catch(e){} }, 300); }
    // 自动补发验证码（注册/已注册未验证都会走到这里），确保用户一定能拿到码
    if(IF && pendingVerifyEmail){
      IF.resendVerification(pendingVerifyEmail).then(function(){
        if(sub) sub.textContent='验证码已发送至 '+pendingVerifyEmail+'，请输入邮箱中的 6 位验证码';
      }).catch(function(e2){
        console.warn('自动补发验证码失败:', e2);
        if(sub) sub.textContent='验证码发送失败，请点击下方“重新发送验证码”';
      });
    }
  }
  function hideVerifyPanel(){
    var vp=document.getElementById('verify-panel'); if(vp) vp.style.display='none';
    if(loginForm) loginForm.style.display='';
    if(loginFooterSwitch) loginFooterSwitch.style.display='';
  }

  function submitVerifyCode(){
    var codeInput=document.getElementById('verify-code');
    var err=document.getElementById('verify-error');
    var code=(codeInput&&codeInput.value||'').trim();
    if(!code){ if(err) err.textContent='请输入验证码'; return; }
    if(!IF){ if(err) err.textContent='后端未就绪，请刷新页面'; return; }
    if(!pendingVerifyEmail){ if(err) err.textContent='会话已失效，请重新注册'; return; }
    // 如果页面刷新过，从 sessionStorage 恢复密码
    if(!pendingVerifyPassword){
      try { pendingVerifyPassword = sessionStorage.getItem('bfyg_pending_password'); } catch(e){}
    }
    btnVerify.disabled=true;
    IF.verifyEmail(pendingVerifyEmail, code, pendingVerifyPassword).then(function(user){
      btnVerify.disabled=false;
      try { sessionStorage.removeItem('bfyg_pending_password'); } catch(e){}
      onLoginSuccess(user);
    }).catch(function(e2){
      btnVerify.disabled=false;
      var raw=(e2&&e2.message)||'';
      var low=(raw+'').toLowerCase();
      var fullMsg=raw;
      if (low.indexOf('invalid')!==-1 || low.indexOf('incorrect')!==-1 || low.indexOf('mismatch')!==-1 || low.indexOf('expired')!==-1) {
        fullMsg='验证码错误或已过期，请检查邮箱中的最新验证码，或点击“重新发送验证码”';
      } else if (low.indexOf('network')!==-1 || low.indexOf('failed to fetch')!==-1 || low.indexOf('timeout')!==-1) {
        fullMsg='网络连接不稳定，请稍后重试';
      }
      if(err) err.textContent=fullMsg;
      // eslint-disable-next-line no-console
      console.error('verifyEmail failed:', e2);
    });
  }
  var btnVerify=document.getElementById('btn-verify');
  if(btnVerify){
    btnVerify.addEventListener('click', submitVerifyCode);
  }
  var verifyCodeInput=document.getElementById('verify-code');
  if(verifyCodeInput){
    verifyCodeInput.addEventListener('input', function(){
      var v=(verifyCodeInput.value||'').trim();
      // 输入满 6 位数字自动提交
      if(v.length===6 && /^\d{6}$/.test(v)){
        submitVerifyCode();
      }
    });
  }
  var linkResend=document.getElementById('link-resend-code');
  if(linkResend){
    var resendCountdown = null;
    linkResend.addEventListener('click',function(e){
      e.preventDefault();
      var err=document.getElementById('verify-error');
      if(!IF||!pendingVerifyEmail){ if(err) err.textContent='会话已失效，请重新注册'; return; }
      if(linkResend._disabled) return;
      linkResend._disabled = true;
      var originalText = linkResend.textContent;
      IF.resendVerification(pendingVerifyEmail).then(function(){
        showToast('验证码已重新发送，请查收邮箱','info');
        if(err) err.textContent='';
        var left = 60;
        linkResend.textContent = originalText + ' (' + left + 's)';
        resendCountdown = setInterval(function(){
          left--;
          if(left <= 0){
            clearInterval(resendCountdown);
            linkResend._disabled = false;
            linkResend.textContent = originalText;
          } else {
            linkResend.textContent = originalText + ' (' + left + 's)';
          }
        }, 1000);
      }).catch(function(e2){
        linkResend._disabled = false;
        linkResend.textContent = originalText;
        if(err) err.textContent=(e2&&e2.message)||'重发失败';
      });
    });
  }
  var linkBack=document.getElementById('link-back-login');
  if(linkBack){
    linkBack.addEventListener('click',function(e){
      e.preventDefault();
      hideVerifyPanel();
      openLoginModal('signin');
    });
  }

  // ==================== 重置密码 ====================
  var resetPanel = document.getElementById('reset-panel');
  var resetEmailDisplay = document.getElementById('reset-email-display');
  var resetNewPasswordInput = document.getElementById('reset-password');
  var resetConfirmInput = document.getElementById('reset-confirm');
  var resetCodeInput = document.getElementById('reset-code');
  var resetErrorEl = document.getElementById('reset-error');
  var btnReset = document.getElementById('btn-reset');
  var resetSub = document.getElementById('reset-sub');
  var pendingResetEmail = null;

  function showResetPanel(email) {
    pendingResetEmail = email;
    // 收起加载层、恢复卡片可见
    if (loginSubmitLoader) { loginSubmitLoader.classList.remove('active'); loginSubmitLoader.setAttribute('aria-hidden','true'); loginSubmitLoader.style.opacity=''; }
    if (monsterLogin) { monsterLogin.classList.add('active'); monsterLogin.style.opacity='1'; monsterLogin.style.visibility='visible'; monsterLogin.style.pointerEvents='auto'; }
    if (loginCard) { loginCard.style.opacity='1'; loginCard.style.transform=''; loginCard.style.filter=''; loginCard.style.visibility='visible'; }
    if (loginForm) loginForm.style.display='none';
    if (loginFooterSwitch) loginFooterSwitch.style.display='none';
    var vp = document.getElementById('verify-panel'); if (vp) vp.style.display='none';
    if (resetPanel) { resetPanel.style.display='block'; resetPanel.style.opacity='1'; resetPanel.style.position='relative'; resetPanel.style.zIndex='2'; }
    if (resetEmailDisplay) resetEmailDisplay.textContent = email;
    if (resetSub) resetSub.textContent = '我们已向 ' + email + ' 发送了 6 位验证码，请查收邮箱';
    if (resetErrorEl) resetErrorEl.textContent='';
    if (resetNewPasswordInput) resetNewPasswordInput.value='';
    if (resetConfirmInput) resetConfirmInput.value='';
    if (resetCodeInput) { resetCodeInput.value=''; setTimeout(function(){ try { resetCodeInput.focus(); } catch(e){} }, 300); }
  }

  function hideResetPanel() {
    if (resetPanel) resetPanel.style.display='none';
    if (loginForm) loginForm.style.display='';
    if (loginFooterSwitch) loginFooterSwitch.style.display='';
    pendingResetEmail = null;
  }

  function submitReset() {
    if (!IF || !pendingResetEmail) { if (resetErrorEl) resetErrorEl.textContent='会话已失效，请重新点击忘记密码'; return; }
    var code = (resetCodeInput && resetCodeInput.value || '').trim();
    var np = (resetNewPasswordInput && resetNewPasswordInput.value || '').trim();
    if (!code) { if (resetErrorEl) resetErrorEl.textContent='请输入验证码'; return; }
    if (!/^\d{6}$/.test(code)) { if (resetErrorEl) resetErrorEl.textContent='验证码为 6 位数字'; return; }
    if (!np) { if (resetErrorEl) resetErrorEl.textContent='请设置新密码'; return; }
    if (np.length < 8 || !/[a-zA-Z]/.test(np) || !/\d/.test(np)) {
      if (resetErrorEl) resetErrorEl.textContent='密码至少 8 位，需同时包含字母和数字';
      return;
    }
    var confirmPw = (resetConfirmInput && resetConfirmInput.value || '').trim();
    if (!confirmPw) { if (resetErrorEl) resetErrorEl.textContent='请再次输入新密码'; return; }
    if (confirmPw !== np) { if (resetErrorEl) resetErrorEl.textContent='两次输入的密码不一致'; return; }
    if (btnReset) { btnReset.disabled = true; var bt = btnReset.querySelector('.btn-text'); if (bt) bt.textContent = '重置中...'; }
    IF.exchangeResetPasswordToken(pendingResetEmail, code)
      .then(function (tk) {
        if (!tk || !tk.token) throw new Error('验证码无效或已过期');
        return IF.resetPassword(np, tk.token);
      })
      .then(function () {
        if (btnReset) { btnReset.disabled = false; var bt = btnReset.querySelector('.btn-text'); if (bt) bt.textContent = '确认重置'; }
        showToast('密码已重置，请用新密码登录', 'success');
        hideResetPanel();
        openLoginModal('signin');
      })
      .catch(function (e2) {
        if (btnReset) { btnReset.disabled = false; var bt = btnReset.querySelector('.btn-text'); if (bt) bt.textContent = '确认重置'; }
        var raw = (e2 && e2.message) || '';
        var low = (raw + '').toLowerCase();
        var fullMsg = raw;
        if (low.indexOf('invalid') !== -1 || low.indexOf('incorrect') !== -1 || low.indexOf('mismatch') !== -1 || low.indexOf('expired') !== -1 || low.indexOf('token') !== -1) {
          fullMsg = '验证码错误或已过期，请检查邮箱中的最新验证码，或点击“重新发送验证码”';
        } else if (low.indexOf('network') !== -1 || low.indexOf('failed to fetch') !== -1 || low.indexOf('timeout') !== -1) {
          fullMsg = '网络连接不稳定，请稍后重试';
        }
        if (resetErrorEl) resetErrorEl.textContent = fullMsg || '重置失败，请重试';
        console.error('resetPassword failed:', e2);
      });
  }

  if (btnReset) btnReset.addEventListener('click', submitReset);
  if (resetCodeInput) {
    resetCodeInput.addEventListener('input', function () {
      this.value = (this.value || '').replace(/\D/g, '').slice(0, 6);
    });
  }

  var linkResendReset = document.getElementById('link-resend-reset');
  if (linkResendReset) {
    linkResendReset.addEventListener('click', function (e) {
      e.preventDefault();
      if (!IF || !pendingResetEmail) { if (resetErrorEl) resetErrorEl.textContent='会话已失效，请重新点击忘记密码'; return; }
      if (linkResendReset._disabled) return;
      linkResendReset._disabled = true;
      var originalText = linkResendReset.textContent;
      IF.sendResetPasswordEmail(pendingResetEmail).then(function () {
        showToast('验证码已重新发送，请查收邮箱', 'info');
        if (resetErrorEl) resetErrorEl.textContent = '';
        var left = 60;
        linkResendReset.textContent = originalText + ' (' + left + 's)';
        var t = setInterval(function () {
          left--;
          if (left <= 0) { clearInterval(t); linkResendReset._disabled = false; linkResendReset.textContent = originalText; }
          else { linkResendReset.textContent = originalText + ' (' + left + 's)'; }
        }, 1000);
      }).catch(function (e2) {
        linkResendReset._disabled = false;
        linkResendReset.textContent = originalText;
        if (resetErrorEl) resetErrorEl.textContent = (e2 && e2.message) || '重发失败';
      });
    });
  }

  var linkBackReset = document.getElementById('link-back-login-reset');
  if (linkBackReset) {
    linkBackReset.addEventListener('click', function (e) {
      e.preventDefault();
      hideResetPanel();
      openLoginModal('signin');
    });
  }

  function bindPasswordToggle(btn, input){
    if(!btn||!input) return;
    var EYE_OPEN='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>';
    var EYE_OFF='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/></svg>';
    btn.addEventListener('click',function(){
      var show = input.type==='password';
      input.type = show ? 'text' : 'password';
      btn.innerHTML = show ? EYE_OFF : EYE_OPEN;
      btn.setAttribute('aria-label', show ? '隐藏密码' : '显示密码');
    });
  }
  if(togglePw) bindPasswordToggle(togglePw, loginForm.querySelector('input[name="password"]'));
  var resetPw=document.getElementById('reset-password');
  var resetPwToggle=document.getElementById('toggle-reset-pw');
  bindPasswordToggle(resetPwToggle, resetPw);
  var resetConfirm=document.getElementById('reset-confirm');
  var resetConfirmToggle=document.getElementById('toggle-reset-confirm');
  bindPasswordToggle(resetConfirmToggle, resetConfirm);

  // ==================== LOGOUT (with GSAP animation) ====================

  var btnLogout = document.getElementById('btn-logout');
  if(btnLogout){
    // Hover micro-animation: gentle pulse + color shift
    if (typeof gsap !== 'undefined') {
      btnLogout.addEventListener('mouseenter', function(){
        gsap.to(this, { scale: 1.12, duration: 0.28, ease: 'back.out(2)' });
        gsap.to(this.querySelector('svg'), { rotation: 8, duration: 0.3, ease: 'power2.out' });
      });
      btnLogout.addEventListener('mouseleave', function(){
        gsap.to(this, { scale: 1, duration: 0.25, ease: 'power2.out' });
        gsap.to(this.querySelector('svg'), { rotation: 0, duration: 0.25, ease: 'power2.out' });
      });
      // Click: door-swing exit animation
      btnLogout.addEventListener('click', function(e){
        e.preventDefault();
        var self = this;
        gsap.timeline()
          .to(self, { rotation: -20, scale: 0.85, opacity: 0.6, duration: 0.18, ease: 'power2.in' })
          .to(self.querySelector('svg'), { x: -4, duration: 0.18, ease: 'power2.in' }, 0)
          .add(function(){
            if (IF) IF.signOut().catch(function(){});
            currentUser = null;
            showLogin();
            // Reset button state for next login session
            gsap.set(self, { rotation: 0, scale: 1, opacity: 1, x: 0 });
            gsap.set(self.querySelector('svg'), { x: 0, rotation: 0 });
          });
      });
    } else {
      // Fallback without GSAP
      btnLogout.addEventListener('click',function(e){
        e.preventDefault();
        if (IF) IF.signOut().catch(function(){});
        currentUser = null;
        showLogin();
      });
    }
  }

  // ==================== SETTINGS PANEL ====================

  var settingsPanel = null;
  var settingsOverlay = null;

  function initSettingsPanel() {
    settingsPanel = document.getElementById('settings-panel');
    settingsOverlay = document.getElementById('settings-overlay');
    var openBtn = document.getElementById('btn-drawer-settings');
    var closeBtn = document.getElementById('settings-close-btn');

    if (!settingsPanel || !openBtn) return;

    function openSettings() {
      // Close avatar popup if open
      if (typeof closeAvatarPopup === 'function') closeAvatarPopup();
      settingsOverlay.classList.add('active');
      settingsPanel.classList.add('open');
      document.body.style.overflow = 'hidden';
      // GSAP entrance
      if (typeof gsap !== 'undefined') {
        gsap.fromTo(settingsPanel,
          { x: 60 },
          { x: 0, duration: 0.35, ease: 'expo.out' }
        );
        gsap.fromTo(settingsOverlay,
          { opacity: 0 },
          { opacity: 1, duration: 0.25, ease: 'power2.out' }
        );
        // Stagger section reveal
        var sections = settingsPanel.querySelectorAll('.settings-section');
        if (sections.length) {
          gsap.fromTo(sections,
            { y: 16, opacity: 0 },
            { y: 0, opacity: 1, stagger: 0.06, duration: 0.32, ease: 'power2.out', delay: 0.1 }
          );
        }
      }
      // Init background settings within panel (mirror logic)
      initSettingsBackground();
    }

    function closeSettings() {
      settingsOverlay.classList.remove('active');
      settingsPanel.classList.remove('open');
      document.body.style.overflow = '';
      if (typeof gsap !== 'undefined') {
        gsap.to(settingsPanel, { x: '100%', duration: 0.28, ease: 'power3.in' });
        gsap.to(settingsOverlay, { opacity: 0, duration: 0.2, ease: 'power2.out',
          onComplete: function() { settingsOverlay.classList.remove('active'); }
        });
      }
    }

    openBtn.addEventListener('click', openSettings);
    if (closeBtn) closeBtn.addEventListener('click', closeSettings);
    if (settingsOverlay) settingsOverlay.addEventListener('click', closeSettings);

    // ESC to close
    document.addEventListener('keydown', function(e) {
      if (e.key === 'Escape' && settingsPanel && settingsPanel.classList.contains('open')) {
        closeSettings();
      }
    });

    // Settings gear button hover animation
    if (typeof gsap !== 'undefined') {
      openBtn.addEventListener('mouseenter', function(){
        gsap.to(this, { rotation: 30, duration: 0.35, ease: 'back.out(2.5)' });
      });
      openBtn.addEventListener('mouseleave', function(){
        gsap.to(this, { rotation: 0, duration: 0.4, ease: 'elastic.out(1, 0.5)' });
      });
    }
  }

  // Background settings inside the settings panel (mirrors original but uses #settings-* IDs)
  function initSettingsBackground() {
    var themes = document.getElementById('settings-bg-themes');
    var fileInput = document.getElementById('settings-bg-file-input');
    var blurInput = document.getElementById('settings-bg-blur');
    var dimInput = document.getElementById('settings-bg-dim');
    var resetBtn = document.getElementById('settings-bg-reset');

    // Sync active state from current theme
    syncThemeActiveState(themes);

    if (themes) {
      // Remove any previous listener by cloning approach not needed (fresh on each open)
      themes.addEventListener('click', function(e){
        var btn = e.target.closest('.bg-theme');
        if (!btn) return;
        var theme = btn.dataset.theme;
        if (theme === 'custom') {
          if (fileInput) fileInput.click();
        } else {
          currentBg.theme = theme;
          saveBackgroundSettings();
          applyTheme(theme, true);
          // Sync settings panel
          syncThemeActiveState(themes);
        }
      });
    }

    if (fileInput) {
      fileInput.addEventListener('change', function(e){
        var file = e.target.files && e.target.files[0];
        if (!file) return;
        if (!/^image\//.test(file.type)) { showToast('请选择图片文件'); return; }
        if (file.size > 4 * 1024 * 1024) { showToast('图片超过 4MB，建议压缩后重试'); return; }
        var reader = new FileReader();
        reader.onload = function(ev){
          currentBg.theme = 'custom';
          currentBg.customUrl = ev.target.result;
          saveBackgroundSettings();
          applyTheme('custom', true);
          showToast('壁纸已应用 ✅');
          syncThemeActiveState(document.getElementById('settings-bg-themes'));
        };
        reader.readAsDataURL(file);
      });
    }

    // Show/hide custom sliders
    var slidersDiv = document.getElementById('settings-bg-sliders');
    if (slidersDiv) {
      if (currentBg.theme === 'custom') slidersDiv.style.display = 'flex';
      else slidersDiv.style.display = 'none';
    }

    if (blurInput) {
      blurInput.value = currentBg.blur || 0;
      blurInput.addEventListener('input', function(){
        currentBg.blur = parseInt(this.value, 10);
        saveBackgroundSettings();
        applyTheme(currentBg.theme, false);
      });
    }

    if (dimInput) {
      dimInput.value = currentBg.dim || 38;
      dimInput.addEventListener('input', function(){
        currentBg.dim = parseInt(this.value, 10);
        saveBackgroundSettings();
        applyTheme(currentBg.theme, false);
      });
    }

    if (resetBtn) {
      resetBtn.addEventListener('click', function(){
        currentBg = { theme: 'starry', customUrl: '', blur: 0, dim: 38 };
        saveBackgroundSettings();
        applyTheme('starry', true);
        if (blurInput) blurInput.value = 0;
        if (dimInput) dimInput.value = 38;
        if (slidersDiv) slidersDiv.style.display = 'none';
        showToast('已恢复默认背景');
        syncThemeActiveState(document.getElementById('settings-bg-themes'));
        syncThemeActiveState(document.getElementById('bg-themes'));
      });
    }
  }

  // Sync active class across both theme pickers (avatar popup + settings panel)
  function syncThemeActiveState(container) {
    if (!container) return;
    container.querySelectorAll('.bg-theme').forEach(function(btn){
      btn.classList.toggle('active', btn.dataset.theme === currentBg.theme);
    });
  }

  // ==================== INIT ====================

  // 检查自动登录（InsForge 会话由 cookie 管理，无需本地 token）
  function initAuth() {
    if (!IF) return;
    IF.getCurrentUser().then(function(user) {
      if (user) {
        currentUser = user;
        showMain();
      }
    }).catch(function(){});
  }
  if (window.IF) initAuth();
  else window.addEventListener('IF_READY', initAuth);

  initAvatarPopup();
  initBackgroundSettings();
  initSettingsPanel();

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
        div.innerHTML =
          '<div class="msg-feed-left">'+
            '<div class="msg-feed-avatar" style="background:linear-gradient(135deg,#7c5cfc,#5a3de0)">🏫</div>'+
            '<div class="msg-feed-meta">'+
              '<span class="msg-feed-name">系统</span>'+
              '<span class="msg-feed-role"><span class="role-badge admin">官方</span></span>'+
            '</div>'+
          '</div>'+
          '<div class="msg-feed-body">'+
            '<div class="msg-content"><strong>'+item.title+'</strong><br><br>'+item.content+'</div>'+
            '<div class="msg-interactions">'+
              '<div class="msg-interactions-left">'+createTimeCharsHtml(new Date().toISOString())+'</div>'+
              '<div class="msg-interactions-right">'+
                '<button type="button" class="msg-interact-btn" data-act="like">♥ <span class="msg-interact-count">0</span></button>'+
                '<button type="button" class="msg-interact-btn" data-act="comment">💬 <span class="msg-interact-count">0</span></button>'+
                '<button type="button" class="msg-interact-btn" data-act="share">↗</button>'+
              '</div>'+
            '</div>'+
            '<div class="msg-comment-section"></div>'+
          '</div>';
        messagesArea.appendChild(div);
      });
      messagesArea.scrollTop = 0; // 学校简介频道同样停在顶部
    });
  }

// ===== LOGIN CAROUSEL =====

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
          var bimg = document.createElement('img'); bimg.src = imgSrc; bimg.alt = ''; bimg.loading = 'lazy';
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

  // ==================== 好友私聊 DM ====================
  // 私信未读只显示在好友列表（顶部铃不冒红点），计数内存维护。
  var dmUnread = {};            // friendId -> 未读数
  var dmChannelToFriend = {};   // dmChannelId -> friendId（发送私信通知用）
  var dmReturnChannel = null;   // 进入私聊前的公共频道（返回目标）
  var dmBackBtn = document.getElementById('dm-back-btn');

  // 过滤 DM 频道：私聊房间只通过好友列表进入，不进公共频道列表
  function filterDmChannels(list) {
    return (list || []).filter(function(c) { return c.type !== 'dm'; });
  }

  // 解析通知 link：/dm/{channelId}/{friendId}
  function parseDmLink(link) {
    if (!link) return null;
    var m = String(link).match(/^\/dm\/([^/]+)\/([^/]+)/);
    if (!m) return null;
    return { channelId: m[1], friendId: m[2] };
  }

  // 渲染好友列表到头像弹窗（整行点击进入私聊）
  function loadFriendsToPopup() {
    var box = document.getElementById('panel-friends-list');
    if (!box || !IF) return;
    IF.friendsList().then(function(res) {
      var friends = (res && res.friends) || [];
      box.innerHTML = '';
      if (!friends.length) {
        box.innerHTML = '<div class="popup-empty">暂无好友，去通知里加好友吧</div>';
        return;
      }
      friends.forEach(function(f) {
        var u = f.other || {};
        var item = document.createElement('div');
        item.className = 'friend-item' + (dmUnread[u.id] ? ' has-unread' : '');
        item.setAttribute('data-friend', u.id);
        var initial = getInitial(u.nickname || u.username || '友');
        var av = u.avatar_url
          ? '<img src="'+escapeHtml(u.avatar_url)+'" alt="" onerror="this.style.display=\'none\'">'
          : escapeHtml(initial);
        item.innerHTML =
          '<div class="friend-avatar" style="background:'+getAvatarColor(u.username||u.id)+'">'+av+'</div>'+
          '<span class="friend-name">'+escapeHtml(u.nickname || u.username || '未知用户')+'</span>'+
          '<span class="friend-badge">'+(dmUnread[u.id]||'')+'</span>';
        item.addEventListener('click', function() { openDm(f); });
        box.appendChild(item);
      });
    }).catch(function() {
      box.innerHTML = '<div class="popup-empty">好友加载失败</div>';
    });
  }

  // 刷新已渲染好友项的未读红点（收到私信实时更新）
  function refreshFriendBadges() {
    var box = document.getElementById('panel-friends-list');
    if (!box) return;
    box.querySelectorAll('.friend-item').forEach(function(item) {
      var fid = item.getAttribute('data-friend');
      var n = dmUnread[fid] || 0;
      item.classList.toggle('has-unread', n > 0);
      var badge = item.querySelector('.friend-badge');
      if (badge) badge.textContent = n;
    });
  }

  // 进入与某好友的私聊（复用 switchChannel + 现有消息体系）
  function openDm(friend) {
    if (!IF || !currentUser) return;
    var u = friend.other || {};
    if (!u.id) return;
    dmReturnChannel = currentChannel; // 记住返回目标（进入前是公共频道）
    closeAvatarPopup();
    IF.findOrCreateDm(u.id).then(function(res) {
      if (!res || res.error || !res.id) { showToast('打开私聊失败', 'error'); return; }
      dmChannelToFriend[res.id] = u.id;
      var dmChannel = { id: res.id, name: (u.nickname || u.username || '好友'), type: 'dm', description: '私聊' };
      document.body.classList.add('dm-mode');
      switchChannel(dmChannel, function() {
        if (msgInput) msgInput.placeholder = '发私信给 ' + (u.nickname || u.username);
        // 进入动画：聊天区从右侧轻微滑入
        if (!REDUCED_MOTION && typeof gsap !== 'undefined') {
          var main = document.getElementById('channel-main');
          if (main) gsap.fromTo(main, { x: 24, autoAlpha: 0 }, { x: 0, autoAlpha: 1, duration: 0.32, ease: 'expo.out', clearProps: 'opacity,transform' });
        }
        dmUnread[u.id] = 0;          // 进入即清空该好友未读
        refreshFriendBadges();
      });
    }).catch(function(e) {
      showToast('打开私聊失败：' + ((e && e.message) || '未知错误'), 'error');
    });
  }

  // 返回公共频道（带 GSAP 过渡）
  function returnFromDm() {
    document.body.classList.remove('dm-mode');
    var target = dmReturnChannel || (channels && channels[0]) || null;
    if (!target) {
      if (IF && IF.listChannels) {
        IF.listChannels().then(function(list){
          channels = filterDmChannels(list);
          renderChannels();
          if (channels[0]) switchChannel(channels[0]);
        });
      }
      return;
    }
    switchChannel(target, function() {
      if (!REDUCED_MOTION && typeof gsap !== 'undefined') {
        var main = document.getElementById('channel-main');
        if (main) gsap.fromTo(main, { x: 30, autoAlpha: 0 }, { x: 0, autoAlpha: 1, duration: 0.32, ease: 'expo.out', clearProps: 'opacity,transform' });
      }
      if (dmBackBtn) gsap.set(dmBackBtn, { x: 0, opacity: 1, clearProps: 'transform,opacity' });
    });
  }

  // 返回箭头交互：hover 微动 + 点击滑出后返回
  if (dmBackBtn) {
    dmBackBtn.addEventListener('click', function(e) {
      e.stopPropagation();
      if (REDUCED_MOTION || typeof gsap === 'undefined') { returnFromDm(); return; }
      var main = document.getElementById('channel-main');
      gsap.killTweensOf([dmBackBtn, main]);
      var tl = gsap.timeline({ onComplete: function(){ returnFromDm(); } });
      tl.to(dmBackBtn, { x: -22, opacity: 0, duration: 0.18, ease: 'power2.in' }, 0);
      if (main) tl.to(main, { x: -28, autoAlpha: 0, duration: 0.24, ease: 'power2.in' }, 0);
    });
    dmBackBtn.addEventListener('mouseenter', function() {
      if (REDUCED_MOTION || typeof gsap === 'undefined') return;
      gsap.to(dmBackBtn, { x: -4, scale: 1.08, duration: 0.2, ease: 'power2.out' });
    });
    dmBackBtn.addEventListener('mouseleave', function() {
      if (REDUCED_MOTION || typeof gsap === 'undefined') return;
      gsap.to(dmBackBtn, { x: 0, scale: 1, duration: 0.2, ease: 'power2.out' });
    });
  }
})();
