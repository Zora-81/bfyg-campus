/* ══════════════════════════════════════════════════
   校园频道 — 后台管理系统 JS (InsForge 版)
   数据层: window.IF (if-client.js 注入的 InsForge SDK 封装)
   管理员写操作依赖 public.profiles 的 "profiles update admin" RLS 策略
   （服务端 public.is_admin() 校验，前端无法伪造身份越权）。
   profiles.role ∈ {admin, teacher, student}；status ∈ {active, disabled}
   ══════════════════════════════════════════════════ */
(function () {
  'use strict';

  var IF = window.IF || null;
  window.addEventListener('IF_READY', function () { IF = window.IF; if (IF) checkAuth(); });

  // 角色 / 状态取值以 public.profiles 表 schema 为准
  var ROLE_LABELS  = { admin: '管理员', teacher: '教师', student: '学生', moderator: '版主' };
  var ROLE_BADGE   = { admin: 'badge-purple', teacher: 'badge-info', student: 'badge-default', moderator: 'badge-info' };
  var STATUS_LABELS = { active: '正常', disabled: '已禁用', muted: '禁言中' };

  function db() { return IF.insforge.database; }

  var currentUser = null;
  var profileMap = {};   // id -> { username, nickname }
  var channelMap = {};   // id -> name
  var started = false;

  /* ========== STATE ========== */
  var state = {
    currentModule: 'users',
    userSortKey: null, userSortDir: 'asc', userPage: 1, userPageSize: 8,
    userEditingId: null,
    postSortKey: null, postSortDir: 'asc', postPage: 1,
    postView: 'all', flaggedData: [],
    usersData: [], postsData: [], dashboardStats: {}, wordlistData: [],
    dashboardTimer: null
  };

  /* ========== UI HELPERS ========== */
  var avatarColors = [
    'linear-gradient(135deg,#7c5cfc,#a78bfa)','linear-gradient(135deg,#10b981,#34d399)',
    'linear-gradient(135deg,#f59e0b,#fbbf24)','linear-gradient(135deg,#ff6b8a,#ff8fa3)',
    'linear-gradient(135deg,#06b6d4,#22d3ee)','linear-gradient(135deg,#ec4899,#f472b6)',
    'linear-gradient(135deg,#8b5cf6,#c084fc)','linear-gradient(135deg,#ef4444,#f87171)',
  ];
  function getAvatarColor(name) {
    var h = 0; for (var i = 0; i < name.length; i++) h = name.charCodeAt(i) + ((h << 5) - h);
    return avatarColors[Math.abs(h) % avatarColors.length];
  }
  function esc(s) { var d = document.createElement('div'); d.textContent = s; return d.innerHTML; }
  function getInitial(n) { return n ? n.charAt(0).toUpperCase() : '?'; }

  /* ========== AUTH ========== */
  function checkAuth() {
    if (started) return; started = true;
    if (!IF) { location.href = 'index.html'; return; }
    IF.getCurrentUser().then(function (user) {
      if (!user || user.role !== 'admin') {
        alert('需要管理员权限，即将跳转到首页');
        location.href = 'index.html';
        return;
      }
      currentUser = user;
      init();
    }).catch(function () { location.href = 'index.html'; });
  }

  /* ========== INIT ========== */
  function init() {
    bindNav();
    bindMobileMenu();
    bindUserModule();
    bindPostModule();
    bindWordModule();
    bindModals();
    // 先加载 profiles / channels 映射，再加载各模块数据
    Promise.all([loadProfileMap(), loadChannelMap()]).then(function () {
      loadUsers();
      loadPostsData();
      loadDashboard();
      renderModule('users');
    });
  }

  function loadProfileMap() {
    return IF.loadProfiles().then(function (map) {
      profileMap = map || {};
      return profileMap;
    }).catch(function () { profileMap = {}; return profileMap; });
  }
  function loadChannelMap() {
    return db().from('channels').select('id, name').then(function (r) {
      (r.data || []).forEach(function (c) { channelMap[c.id] = c.name; });
      return channelMap;
    }).catch(function () { return channelMap; });
  }

  function loadUsers() {
    var api = db();
    // 直查 profiles 表（email 列已从 auth.users 回填到 profiles，2026-07-20 新增）
    var call = api.from('profiles').select('id,username,nickname,email,avatar_url,title,role,status,created_at,warning_count,muted_until')
      .order('created_at', { ascending: false });
    call.then(function (r) {
        if (r.error) { showToast('加载用户失败：' + (r.error.message || ''), 'error'); return; }
        state.usersData = (r.data || []).map(function (u) {
          u.title = u.title || '';
          u.registered_at = u.created_at || u.registered_at || null;
          return u;
        });
        if (state.currentModule === 'users') renderUsers();
      })
      .catch(function (e) { showToast('加载用户失败：' + ((e && e.message) || '请检查网络'), 'error'); });
  }

  function loadDashboard() {
    var api = db();
    // 单个 RPC 聚合：总用户/频道/消息数 + 今日消息 + 7 天趋势 + 最近 6 条
    // （原本 11 个 count 请求合并为 1 个，后端按 Asia/Shanghai 时区分桶）
    if (api.rpc && typeof api.rpc === 'function') {
      api.rpc('get_dashboard_stats').then(function (r) {
        if (r.error) { loadDashboardFallback(); return; }
        var s = r.data;
        if (Array.isArray(s)) s = s[0];
        if (!s) { loadDashboardFallback(); return; }
        state.dashboardStats = {
          stats: {
            userCount: s.userCount || 0,
            channelCount: s.channelCount || 0,
            msgToday: s.msgToday || 0,
            msgCount: s.msgCount || 0
          },
          trend: s.trend || [],
          recent: (s.recent || []).map(function (m) {
            return {
              nickname: m.nickname || m.username || '未知',
              channel_name: m.channel_name || '频道',
              content: m.content,
              created_at: m.created_at
            };
          })
        };
        if (state.currentModule === 'dashboard') renderDashboard();
      }).catch(function () { loadDashboardFallback(); });
    } else {
      loadDashboardFallback();
    }
  }

  // 兜底：RPC 不可用时退回多请求方式（仅取总数，趋势置空）
  function loadDashboardFallback() {
    Promise.all([
      db().from('profiles').select('*', { count: 'exact', head: true }),
      db().from('channels').select('*', { count: 'exact', head: true }),
      db().from('messages').select('*', { count: 'exact', head: true }),
    ]).then(function (rs) {
      state.dashboardStats = {
        stats: {
          userCount: (rs[0] && rs[0].count) || 0,
          channelCount: (rs[1] && rs[1].count) || 0,
          msgToday: 0,
          msgCount: (rs[2] && rs[2].count) || 0
        },
        trend: [],
        recent: state.postsData.slice(0, 6).map(function (m) {
          return {
            nickname: m.nickname || m.username,
            channel_name: channelMap[m.channel_id] || '频道',
            content: m.content, created_at: m.created_at
          };
        })
      };
      if (state.currentModule === 'dashboard') renderDashboard();
    }).catch(function () { showToast('加载看板失败', 'error'); });
  }

  /* ========== NAVIGATION ========== */
  function bindNav() {
    document.querySelectorAll('.admin-nav-item').forEach(function (btn) {
      btn.addEventListener('click', function () { switchModule(this.dataset.module); });
    });
  }
  function switchModule(module) {
    state.currentModule = module;
    // 看板自动刷新：离开看板时停定时器，进看板时启动
    if (state.dashboardTimer) { clearInterval(state.dashboardTimer); state.dashboardTimer = null; }
    document.querySelectorAll('.admin-nav-item').forEach(function (b) {
      b.classList.toggle('active', b.dataset.module === module);
    });
    document.querySelectorAll('.admin-module').forEach(function (m) {
      m.classList.toggle('active', m.id === 'module-' + module);
    });
    var titles = { users: '用户管理', posts: '帖子审核', dashboard: '数据看板', wordlist: '敏感词库', logs: '审核日志' };
    var descs = { users: '管理系统用户与权限', posts: '审核与管理频道内容', dashboard: '平台数据概览与分析', wordlist: '管理与配置 AI 审核敏感词', logs: '谁在何时审了什么、结果如何' };
    document.getElementById('admin-header-title').textContent = titles[module] || '';
    document.getElementById('admin-header-desc').textContent = descs[module] || '';
    if (module === 'dashboard') {
      loadDashboard();
      // 每 10 秒自动刷新看板数据（违规播报/待审帖子/今日消息 全部更新）
      state.dashboardTimer = setInterval(function () { loadDashboard(); }, 10000);
    }
    renderModule(module);
    document.getElementById('admin-sidebar').classList.remove('open');
  }
  function bindMobileMenu() {
    document.getElementById('admin-mobile-toggle').addEventListener('click', function () {
      document.getElementById('admin-sidebar').classList.toggle('open');
    });
    document.addEventListener('click', function (e) {
      var sidebar = document.getElementById('admin-sidebar');
      if (sidebar.classList.contains('open') && !sidebar.contains(e.target) && e.target.id !== 'admin-mobile-toggle') {
        sidebar.classList.remove('open');
      }
    });
  }
  function renderModule(module) {
    if (module === 'users') renderUsers();
    else if (module === 'posts') renderPosts();
    else if (module === 'dashboard') renderDashboard();
    else if (module === 'wordlist') loadWordlist();
    else if (module === 'logs') loadLogs();
  }

  // 审核日志：谁在何时审了什么（直查 moderation_log 表，替代 get_moderation_log RPC）
  function loadLogs() {
    var api = db();
    if (!api.from) { renderLogs([]); return; }
    api.from('moderation_log').select('id, moderator_id, target_message_id, target_user_id, action, detail, created_at')
      .order('created_at', { ascending: false }).limit(200)
      .then(function (r) {
        if (r.error) { renderLogs([]); return; }
        renderLogs(r.data || []);
      }).catch(function () { renderLogs([]); });
  }
  var LOG_ACTION_LABELS = {
    ai_moderate: 'AI 自动审核', approve: '标记已审', reject: '删除帖子',
    ban: '封禁用户', unban: '解封用户', mute: '禁言', unmute: '解除禁言'
  };
  function renderLogs(list) {
    var tbody = document.getElementById('log-tbody');
    if (!tbody) return;
    tbody.innerHTML = '';
    if (!list.length) {
      tbody.innerHTML = '<tr><td colspan="5"><div class="admin-empty"><div class="empty-icon">🗂️</div><div class="empty-text">暂无审核日志</div></div></td></tr>';
    } else {
      list.forEach(function (l, i) {
        var tr = document.createElement('tr');
        var who = l.moderator_id
          ? (profileMap[l.moderator_id] ? (profileMap[l.moderator_id].nickname || profileMap[l.moderator_id].username) : '管理员')
          : '系统(AI)';
        var action = LOG_ACTION_LABELS[l.action] || l.action || '—';
        var timeStr = l.created_at ? formatFull(l.created_at) : '';
        tr.innerHTML =
          '<td>' + (i + 1) + '</td>' +
          '<td>' + esc(who) + '</td>' +
          '<td><span class="badge badge-default">' + esc(action) + '</span></td>' +
          '<td><div class="tbl-log-detail">' + esc(l.detail || '') + '</div></td>' +
          '<td>' + timeStr + '</td>';
        tbody.appendChild(tr);
      });
    }
    var info = document.getElementById('log-pagination-info');
    if (info) info.textContent = '共 ' + list.length + ' 条';
  }
  // 审核动作记日志（直插 moderation_log 表，moderator_id 取当前登录用户；RLS allow_log_all 允许写入）
  function logAdmin(action, detail, msgId, userId) {
    var api = db();
    if (!api.from) return;
    var mod = (typeof currentUser !== 'undefined' && currentUser && currentUser.id) ? currentUser.id : null;
    api.from('moderation_log').insert({
      moderator_id: mod,
      action: action, detail: detail || '',
      target_message_id: msgId || null, target_user_id: userId || null
    }).then(function (r) { if (r.error) console.error('[log] 失败', r.error); })
      .catch(function (e) { console.error('[log] 异常', e); });
  }

  /* ========== USER MANAGEMENT ========== */
  function bindUserModule() {
    document.getElementById('user-search').addEventListener('input', function () { state.userPage = 1; renderUsers(); });
    document.getElementById('user-role-filter').addEventListener('change', function () { state.userPage = 1; renderUsers(); });
    document.getElementById('user-status-filter').addEventListener('change', function () { state.userPage = 1; renderUsers(); });
    document.getElementById('btn-add-user').addEventListener('click', function () {
      showToast('添加用户请在首页注册页操作（后端 Auth 负责建号）', 'info');
    });
    document.getElementById('user-select-all').addEventListener('change', function () {
      var checked = this.checked;
      document.querySelectorAll('#user-tbody .admin-checkbox').forEach(function (cb) { cb.checked = checked; });
    });
    document.querySelectorAll('#user-table th[data-sort]').forEach(function (th) {
      th.addEventListener('click', function () {
        var key = this.dataset.sort;
        if (state.userSortKey === key) state.userSortDir = state.userSortDir === 'asc' ? 'desc' : 'asc';
        else { state.userSortKey = key; state.userSortDir = 'asc'; }
        document.querySelectorAll('#user-table th').forEach(function (h) { h.classList.remove('sort-asc', 'sort-desc'); });
        this.classList.add('sort-' + state.userSortDir);
        state.userPage = 1;
        renderUsers();
      });
    });
  }

  function getFilteredUsers() {
    var search = (document.getElementById('user-search').value || '').toLowerCase();
    var roleFilter = document.getElementById('user-role-filter').value;
    var statusFilter = document.getElementById('user-status-filter').value;
    return state.usersData.filter(function (u) {
      if (search && (u.username || '').toLowerCase().indexOf(search) === -1 &&
          (u.nickname || '').toLowerCase().indexOf(search) === -1 &&
          (u.email || '').toLowerCase().indexOf(search) === -1) return false;
      if (roleFilter && u.role !== roleFilter) return false;
      if (statusFilter && u.status !== statusFilter) return false;
      return true;
    });
  }
  function sortUsers(list) {
    if (!state.userSortKey) return list;
    return list.sort(function (a, b) {
      var va = a[state.userSortKey] || '', vb = b[state.userSortKey] || '';
      if (typeof va === 'string') va = va.toLowerCase();
      if (typeof vb === 'string') vb = vb.toLowerCase();
      if (va < vb) return state.userSortDir === 'asc' ? -1 : 1;
      if (va > vb) return state.userSortDir === 'asc' ? 1 : -1;
      return 0;
    });
  }

  function renderUsers() {
    var filtered = getFilteredUsers();
    var sorted = sortUsers(filtered);
    var total = sorted.length;
    var totalPages = Math.ceil(total / state.userPageSize) || 1;
    if (state.userPage > totalPages) state.userPage = totalPages;
    var start = (state.userPage - 1) * state.userPageSize;
    var page = sorted.slice(start, start + state.userPageSize);

    var tbody = document.getElementById('user-tbody');
    tbody.innerHTML = '';

    if (!page.length) {
      tbody.innerHTML = '<tr><td colspan="9"><div class="admin-empty"><div class="empty-icon">📭</div><div class="empty-text">没有匹配的用户</div></div></td></tr>';
    } else {
      page.forEach(function (u) {
        var tr = document.createElement('tr');
        var displayName = u.nickname || u.username;
        var roleLabel = ROLE_LABELS[u.role] || u.role || '学生';
        var roleBadge = ROLE_BADGE[u.role] || 'badge-default';
        var statusChecked = u.status === 'active' ? 'checked' : '';
        var registeredAt = u.registered_at ? formatFull(u.registered_at) : '';
        var titleHtml = u.title
          ? '<span class="badge" style="color:#ffe6a8;background:rgba(255,196,84,.14);border:1px solid rgba(255,196,84,.3);">✦ ' + esc(u.title) + '</span>'
          : '<span style="color:var(--text-dim);font-size:var(--text-xs);">—</span>';
        // 警告列（AI 自动审核累计）：满 3 次自动禁言 1 天
        var wc = u.warning_count || 0;
        var warnHtml = wc > 0
          ? '<span class="badge badge-warning" title="累计违纪警告，满3次自动禁言1天">' + wc + ' ⚠</span>'
          : '<span style="color:var(--text-dim);font-size:var(--text-xs);">0</span>';
        // 状态列：禁言中显示解除按钮；否则显示启用/禁用开关
        var isMuted = u.status === 'muted' || (u.muted_until && new Date(u.muted_until) > new Date());
        var statusHtml;
        if (isMuted) {
          var untilStr = u.muted_until ? formatFull(u.muted_until) : '';
          statusHtml =
            '<span class="badge badge-danger">🚫 禁言中</span>' +
            (untilStr ? '<span style="font-size:var(--text-xs);color:var(--text-dim);margin-left:4px;">至 ' + untilStr + '</span>' : '') +
            '<button class="btn-warn btn-xs" data-action="unmute-user" data-id="' + u.id + '" style="margin-left:6px;">解除禁言</button>';
        } else {
          var statusLabel = STATUS_LABELS[u.status] || u.status || '正常';
          statusHtml =
            '<label class="toggle-switch"><input type="checkbox" ' + statusChecked + ' data-action="toggle-status" data-id="' + u.id + '" /><span class="toggle-slider"></span></label> ' +
            '<span style="font-size:var(--text-xs);color:var(--text-dim);margin-left:4px;">' + statusLabel + '</span>';
        }
        // 头像列：有 avatar_url 显示图片，否则显示首字母圆圈
        var avatarHtml;
        if (u.avatar_url) {
          avatarHtml = '<div class="tbl-user-avatar" style="background:' + getAvatarColor(displayName) + ';padding:0;overflow:hidden;"><img src="' + esc(u.avatar_url) + '" alt="" style="width:100%;height:100%;object-fit:cover;border-radius:inherit;" onerror="this.parentNode.innerHTML=\'' + esc(getInitial(displayName)) + '\';this.parentNode.style.padding=\'\';" /></div>';
        } else {
          avatarHtml = '<div class="tbl-user-avatar" style="background:' + getAvatarColor(displayName) + '">' + getInitial(displayName) + '</div>';
        }
        tr.innerHTML =
          '<td><input type="checkbox" class="admin-checkbox user-checkbox" data-id="' + u.id + '" /></td>' +
          '<td><div class="tbl-user">' +
            avatarHtml +
            '<div><div class="tbl-user-name">' + esc(displayName) + '</div><div class="tbl-user-id">@' + esc(u.username || '') + '</div></div>' +
          '</div></td>' +
          '<td>' + esc(u.username || '') + '</td>' +
          '<td>' + warnHtml + '</td>' +
          '<td><span class="badge ' + roleBadge + '">' + roleLabel + '</span></td>' +
          '<td>' + titleHtml + '</td>' +
          '<td>' + statusHtml + '</td>' +
          '<td style="font-size:var(--text-sm);color:var(--text-dim);white-space:nowrap;">' + registeredAt + '</td>' +
          '<td><div class="col-actions">' +
            '<button class="btn-ghost btn-xs" data-action="edit-user" data-id="' + u.id + '">编辑</button>' +
            '<button class="btn-danger btn-xs" data-action="delete-user" data-id="' + u.id + '">封禁</button>' +
          '</div></td>';
        tbody.appendChild(tr);
      });
    }

    tbody.querySelectorAll('[data-action="edit-user"]').forEach(function (btn) {
      btn.addEventListener('click', function () { openUserModal(this.dataset.id); });
    });
    tbody.querySelectorAll('[data-action="delete-user"]').forEach(function (btn) {
      btn.addEventListener('click', function () { toggleBanUser(this.dataset.id); });
    });
    tbody.querySelectorAll('[data-action="toggle-status"]').forEach(function (cb) {
      cb.addEventListener('change', function () {
        var uid = this.dataset.id;
        var newStatus = this.checked ? 'active' : 'disabled';
        db().from('profiles').update({ status: newStatus }).eq('id', uid).then(function (r) {
          if (r.error) showToast('操作失败：' + (r.error.message || ''), 'error');
          else { loadUsers(); showToast(newStatus === 'active' ? '已启用用户' : '已封禁用户', 'info'); }
        });
      });
    });
    tbody.querySelectorAll('[data-action="unmute-user"]').forEach(function (btn) {
      btn.addEventListener('click', function () { unmuteUser(this.dataset.id); });
    });

    renderPagination('user', total, totalPages);
  }

  var userAvatarFile = null;   // 弹窗内待上传的头像文件（未选则为 null，保留原头像）
  function openUserModal(userId) {
    state.userEditingId = userId;
    userAvatarFile = null;
    var u = state.usersData.find(function (x) { return x.id === userId; });
    if (!u) return;
    document.getElementById('form-username').value = u.username;
    document.getElementById('form-displayname').value = u.nickname;
    var titleInput = document.getElementById('form-title');
    if (titleInput) titleInput.value = u.title || '';
    document.getElementById('form-email').value = u.email || '';
    document.getElementById('form-role').value = u.role || 'student';
    // 密码为单向 bcrypt 哈希，前端无法显示/直改；重置入口走"发送重置邮件"按钮
    // 头像预览回显（有图显示图，无图显示首字母）
    var av = document.getElementById('user-avatar-preview');
    if (av) {
      if (u.avatar_url) av.innerHTML = '<img src="' + u.avatar_url + '" alt="" style="width:100%;height:100%;object-fit:cover;border-radius:50%;" />';
      else { av.innerHTML = (u.username || '?').charAt(0).toUpperCase(); av.style.background = getAvatarColor(u.username); }
    }
    document.getElementById('user-modal-title').textContent = '编辑用户';
    document.getElementById('user-modal-overlay').classList.add('active');
  }
  function closeUserModal() {
    document.getElementById('user-modal-overlay').classList.remove('active');
  }
  function confirmUserModal() {
    if (!state.userEditingId) { closeUserModal(); return; }
    var u = state.usersData.find(function (x) { return x.id === state.userEditingId; });
    var role = document.getElementById('form-role').value;
    var nickname = (document.getElementById('form-displayname').value || '').trim();
    var titleInput = document.getElementById('form-title');
    var title = titleInput ? (titleInput.value || '').trim().slice(0, 12) : undefined;
    var patch = { role: role };
    if (nickname) patch.nickname = nickname;
    if (title !== undefined) patch.title = title;
    var doUpdate = function () {
      db().from('profiles').update(patch).eq('id', state.userEditingId).then(function (r) {
        if (r.error) showToast('更新失败：' + (r.error.message || ''), 'error');
        else { loadUsers(); showToast('用户资料已更新', 'success'); closeUserModal(); }
      });
    };
    // 有选新头像 → 先上传到 InsForge Storage，再写 avatar_url
    if (userAvatarFile) {
      showToast('正在上传头像…', 'info');
      IF.uploadFile(userAvatarFile).then(function (data) {
        patch.avatar_url = data.url;
        doUpdate();
      }).catch(function (e) {
        showToast('头像上传失败：' + (e && e.message ? e.message : e), 'error');
      });
    } else {
      doUpdate();
    }
  }
  function toggleBanUser(userId) {
    var u = state.usersData.find(function (x) { return x.id === userId; });
    if (!u) return;
    var newStatus = u.status === 'active' ? 'disabled' : 'active';
    var label = u.nickname || u.username;
    var msg = newStatus === 'disabled' ? '确认封禁用户「' + label + '」？封禁后该用户将无法登录与发言。' : '确认解封用户「' + label + '」？';
    if (!confirm(msg)) return;
    db().from('profiles').update({ status: newStatus }).eq('id', userId).then(function (r) {
      if (r.error) showToast('操作失败：' + (r.error.message || ''), 'error');
      else { loadUsers(); showToast(newStatus === 'disabled' ? '已封禁' : '已解封', 'success'); logAdmin(newStatus === 'disabled' ? 'ban' : 'unban', (newStatus === 'disabled' ? '封禁用户 ' : '解封用户 ') + label, null, userId); }
    });
  }
  function unmuteUser(userId) {
    if (!confirm('确认解除该用户的禁言？其在通知中的禁言记录仍保留。')) return;
    db().from('profiles').update({ status: 'active', muted_until: null }).eq('id', userId).then(function (r) {
      if (r.error) showToast('操作失败：' + (r.error.message || ''), 'error');
      else { setTimeout(function () { loadUsers(); }, 600); showToast('已解除禁言', 'success'); logAdmin('unmute', '解除禁言', null, userId); }
    });
  }

  function renderPagination(prefix, total, totalPages) {
    var infoEl = document.getElementById(prefix + '-pagination-info');
    var btnsEl = document.getElementById(prefix + '-pagination-btns');
    if (!infoEl || !btnsEl) return;
    infoEl.textContent = '共 ' + total + ' 条';
    var page = prefix === 'user' ? state.userPage : state.postPage;
    btnsEl.innerHTML = '';
    if (totalPages <= 1) return;
    var range = getPageRange(page, totalPages);
    for (var i = 0; i < range.length; i++) {
      var p = range[i];
      var btn = document.createElement('button');
      btn.className = 'pagination-btn' + (p === page ? ' active' : '');
      btn.textContent = p === -1 ? '...' : p;
      if (p !== -1) {
        (function (pg) {
          btn.addEventListener('click', function () {
            if (prefix === 'user') { state.userPage = pg; renderUsers(); }
            else { state.postPage = pg; renderPosts(); }
          });
        })(p);
      } else { btn.style.cursor = 'default'; }
      btnsEl.appendChild(btn);
    }
  }
  function getPageRange(page, total) {
    var pages = [];
    if (total <= 7) { for (var i = 1; i <= total; i++) pages.push(i); }
    else {
      pages.push(1);
      if (page > 3) pages.push(-1);
      var start = Math.max(2, page - 1), end = Math.min(total - 1, page + 1);
      for (var j = start; j <= end; j++) pages.push(j);
      if (page < total - 2) pages.push(-1);
      pages.push(total);
    }
    return pages;
  }

  /* ========== POST REVIEW ========== */
  function switchPostView(view) {
    state.postView = view;
    document.querySelectorAll('.post-view-tab').forEach(function (t) {
      t.classList.toggle('active', t.dataset.view === view);
    });
    var sel = document.getElementById('post-select-all');
    if (sel) sel.checked = false;
    renderPosts();
  }

  function bindPostModule() {
    document.querySelectorAll('.post-view-tab').forEach(function (tab) {
      tab.addEventListener('click', function () { switchPostView(this.dataset.view); });
    });
    document.getElementById('post-search').addEventListener('input', function () { renderPosts(); });
    document.getElementById('post-channel-filter').addEventListener('change', function () { renderPosts(); });
    document.querySelectorAll('#post-table th[data-sort]').forEach(function (th) {
      th.addEventListener('click', function () {
        var key = this.dataset.sort;
        if (state.postSortKey === key) state.postSortDir = state.postSortDir === 'asc' ? 'desc' : 'asc';
        else { state.postSortKey = key; state.postSortDir = 'asc'; }
        document.querySelectorAll('#post-table th').forEach(function (h) { h.classList.remove('sort-asc', 'sort-desc'); });
        this.classList.add('sort-' + state.postSortDir);
        renderPosts();
      });
    });
    document.getElementById('post-select-all').addEventListener('change', function () {
      var checked = this.checked;
      document.querySelectorAll('#post-tbody .admin-checkbox').forEach(function (cb) { cb.checked = checked; });
    });
    document.getElementById('btn-batch-approve').addEventListener('click', function () {
      var selected = getSelectedPostIds();
      if (selected.length === 0) { showToast('请先选择帖子', 'info'); return; }
      // 标记已审 = 落库 reviewed=true，移出待审队列，红圈减少（保留在频道，不删除）
      db().from('messages').update({ reviewed: true }).in('id', selected).then(function (r) {
        if (r.error) { showToast('操作失败：' + (r.error.message || ''), 'error'); return; }
        showToast('已标记 ' + selected.length + ' 条为已审核', 'success');
        logAdmin('approve', '批量标记 ' + selected.length + ' 条已审');
        document.getElementById('post-select-all').checked = false;
        setTimeout(loadFlaggedPosts, 400);   // 破读缓存后重载队列 + 红圈
      });
    });
    document.getElementById('btn-batch-reject').addEventListener('click', function () {
      var selected = getSelectedPostIds();
      if (selected.length === 0) { showToast('请先选择帖子', 'info'); return; }
      if (!confirm('确认批量删除 ' + selected.length + ' 条帖子？此操作不可恢复！')) return;
      db().from('messages').delete().in('id', selected).then(function (r) {
        if (r.error) showToast('删除失败：' + (r.error.message || ''), 'error');
        else {
          showToast('已删除 ' + selected.length + ' 条帖子', 'success');
          logAdmin('reject', '批量删除 ' + selected.length + ' 条帖子');
          // 级联删子回复（DB）
          try { db().from('messages').delete().in('parent_id', selected); } catch (e) {}
          // 本地立即摘除 + 实时广播，后台列表与用户界面均无需刷新即消失
          var posts = selected.map(findPostInState).filter(Boolean);
          purgePostsFromState(selected);
          posts.forEach(function (p) { if (p.channel_id) IF.publishDelete(p.channel_id, p.id); });
        }
      });
    });
    document.getElementById('btn-batch-overturn').addEventListener('click', function () {
      var selected = getSelectedPostIds();
      if (selected.length === 0) { showToast('请先选择帖子', 'info'); return; }
      if (!confirm('确认撤回 ' + selected.length + ' 条 AI 误判？将清除待审标记、恢复消息、扣回警告并通知用户。')) return;
      batchOverturn(selected);
    });
    loadPostChannels();
    loadPostsData(true);
    loadFlaggedPosts();
    // 帖子表格滚动到底 → 游标加载更多（避免 limit 截断丢失旧帖）
    var pWrap = document.getElementById('post-table-wrap');
    if (pWrap) {
      pWrap.addEventListener('scroll', function () {
        if (state.postView !== 'all' || !state.postHasMore || state.postLoading) return;
        if (this.scrollTop + this.clientHeight >= this.scrollHeight - 120) loadPostsData(false);
      });
    }
  }

  // 侧栏红圈 + tab 计数：只反映 AI 待审核（reviewed=false）的真实数量
  function updatePendingBadge(count) {
    var el = document.getElementById('pending-count');
    if (el) { el.textContent = count; el.style.display = count > 0 ? '' : 'none'; }
    var tabEl = document.getElementById('flagged-tab-count');
    if (tabEl) { tabEl.textContent = count; tabEl.style.display = count > 0 ? '' : 'none'; }
  }

  // 帖子列表：基于 created_at 游标滚动加载，避免 limit(100) 截断丢失旧帖
  function resolveMissingAuthors(list) {
    var missingIds = [];
    list.forEach(function (m) { if (m.author_id && !profileMap[m.author_id]) missingIds.push(m.author_id); });
    if (!missingIds.length) return;
    // 去重
    var seen = {};
    missingIds = missingIds.filter(function (id) { if (seen[id]) return false; seen[id] = true; return true; });
    db().from('profiles').select('id,username,nickname,avatar_url').in('id', missingIds).then(function (r) {
      if (!r.error && r.data) r.data.forEach(function (p) {
        profileMap[p.id] = p; // 补入全局 map，后续自动命中
      });
      // 回填这批消息的 username/nickname
      list.forEach(function (m) {
        if (!profileMap[m.author_id]) return;
        m.username = profileMap[m.author_id].username || '';
        m.nickname = profileMap[m.author_id].nickname || m.username || '未知';
      });
      if (state.currentModule === 'posts') renderPosts();
    }).catch(function () {});
  }

  function loadPostsData(reset) {
    if (reset) { state.postsData = []; state.postCursor = null; state.postHasMore = true; }
    if (!state.postHasMore || state.postLoading) return;
    state.postLoading = true; updatePostLoadStatus();
    var q = db().from('messages').select('id, content, content_type, created_at, channel_id, author_id, is_pinned, is_mod')
      .order('created_at', { ascending: false }).limit(50);
    if (state.postCursor) q = q.lt('created_at', state.postCursor);
    q.then(function (r) {
      state.postLoading = false;
      if (r.error) { showToast('加载帖子失败：' + (r.error.message || ''), 'error'); updatePostLoadStatus(); return; }
      var list = (r.data || []).filter(function (m) { return !m.is_mod; });
      list.forEach(function (m) {
        var p = profileMap[m.author_id];
        m.username = p ? p.username : '';
        m.nickname = p ? p.nickname : '未知';
      });
      resolveMissingAuthors(list);
      state.postsData = state.postsData.concat(list);
      if (list.length < 50) state.postHasMore = false;
      if (list.length > 0) state.postCursor = list[list.length - 1].created_at;
      updatePostLoadStatus();
      if (state.currentModule === 'posts' && state.postView === 'all') renderPosts();
    }).catch(function () { state.postLoading = false; state.postsData = []; updatePostLoadStatus(); });
  }
  function updatePostLoadStatus() {
    var info = document.getElementById('post-pagination-info');
    if (!info) return;
    if (state.postLoading) info.textContent = '加载中…';
    else if (!state.postHasMore) info.textContent = '已加载全部 ' + state.postsData.length + ' 条';
    else info.textContent = '已加载 ' + state.postsData.length + ' 条，下滑加载更多';
  }

  // AI 违规待审队列（有校园小管家警告评论的原消息）—— 直查替代 get_flagged_posts_v2 RPC
  function loadFlaggedPosts() {
    var api = db();
    if (!api.from) { state.flaggedData = []; updatePendingBadge(0); return; }
    // 1) 查所有审核子消息(is_mod=true)，拿 parent_id + content(判定理由)
    api.from('messages').select('id, parent_id, content, created_at').eq('is_mod', true)
      .order('created_at', { ascending: false }).then(function (r1) {
        if (r1.error) { state.flaggedData = []; updatePendingBadge(0); return; }
        var children = r1.data || [];
        if (!children.length) {
          state.flaggedData = []; updatePendingBadge(0);
          if (state.currentModule === 'posts' && state.postView === 'flagged') renderPosts();
          return;
        }
        var childMap = {};
        children.forEach(function (c) { if (c.parent_id) childMap[c.parent_id] = c.content; });
        var parentIds = Object.keys(childMap);
        // 2) 查这些父消息
        api.from('messages').select('id, content, content_type, is_pinned, created_at, channel_id, author_id, reviewed, mod_reason, mod_category, mod_severity')
          .in('id', parentIds).eq('is_mod', false).order('created_at', { ascending: false })
          .then(function (r2) {
            if (r2.error) { state.flaggedData = []; updatePendingBadge(0); return; }
            var list = (r2.data || []).map(function (m) {
              var p = profileMap[m.author_id];
              m.username = p ? p.username : '';
              m.nickname = p ? p.nickname : '未知';
              m._childReason = childMap[m.id] || m.mod_reason || '';
              return m;
            });
            resolveMissingAuthors(list);
            state.flaggedData = list;
            var pending = list.filter(function (m) { return !m.reviewed; }).length;
            updatePendingBadge(pending);
            if (state.currentModule === 'posts' && state.postView === 'flagged') renderPosts();
          }).catch(function () { state.flaggedData = []; updatePendingBadge(0); });
      }).catch(function () { state.flaggedData = []; updatePendingBadge(0); });
  }

  function loadPostChannels() {
    db().from('channels').select('id, name').then(function (r) {
      var sel = document.getElementById('post-channel-filter');
      if (!sel) return;
      sel.innerHTML = '<option value="">全部频道</option>';
      (r.data || []).forEach(function (c) {
        sel.innerHTML += '<option value="' + c.id + '">#' + esc(c.name) + '</option>';
      });
    }).catch(function () {});
  }

  // 撤回审核：AI 误判纠错。服务端 RPC overturn_moderation 一次性完成
  // 清待审标记 + 删机器人警告评论 + 扣回 warning_count + 给用户发通知（均绕过 RLS）
  function overturnPost(pid, cb) {
    db().rpc('overturn_moderation', { p_message_id: pid }).then(function (r) {
      if (r.error) { showToast('撤回失败：' + (r.error.message || ''), 'error'); if (cb) cb(false); return; }
      if (cb) cb(true);
    }).catch(function (e) { showToast('撤回异常：' + ((e && e.message) || ''), 'error'); if (cb) cb(false); });
  }
  function batchOverturn(ids) {
    var done = 0, ok = 0;
    ids.forEach(function (pid) {
      overturnPost(pid, function (success) {
        done++; if (success) ok++;
        if (done === ids.length) {
          showToast('已撤回 ' + ok + '/' + ids.length + ' 条误判', ok === ids.length ? 'success' : 'info');
          document.getElementById('post-select-all').checked = false;
          setTimeout(loadFlaggedPosts, 400);
        }
      });
    });
  }

  // 标记已审（可复用：行内按钮 / 详情弹窗）
  function approvePost(pid, cb) {
    db().from('messages').update({ reviewed: true }).eq('id', pid).then(function (r) {
      if (r.error) { showToast('操作失败：' + (r.error.message || ''), 'error'); if (cb) cb(false); return; }
      showToast('已标记为已审核', 'success');
      logAdmin('approve', '标记已审', pid);
      if (cb) cb(true);
      setTimeout(loadFlaggedPosts, 400);
    });
  }
  // 删除帖子（可复用：行内按钮 / 详情弹窗）
  function deletePost(pid, cb) {
    var p = findPostInState(pid);
    db().from('messages').delete().eq('id', pid).then(function (r) {
      if (r.error) { showToast('删除失败：' + (r.error.message || ''), 'error'); if (cb) cb(false); return; }
      showToast('已删除', 'success');
      logAdmin('reject', '删除帖子', pid);
      try { db().from('messages').delete().eq('parent_id', pid); } catch (e) {} // 级联删子回复（DB）
      purgePostsFromState([pid]); // 本地立即摘除（无需刷新）
      if (p && p.channel_id) IF.publishDelete(p.channel_id, pid); // 实时广播，用户界面秒消失
      if (cb) cb(true);
    });
  }

  // 帖子详情：查看完整消息 + AI 判定理由 + 上下文（原消息/回复），辅助管理员判断
  function openPostDetail(pid) {
    var p = findPostInState(pid);
    if (!p) { showToast('找不到该消息', 'info'); return; }
    var api = db();
    var parentP = p.parent_id
      ? api.from('messages').select('id,content,content_type,created_at,author_id,channel_id').eq('id', p.parent_id).eq('is_mod', false).single()
      : Promise.resolve({ data: null });
    var repliesP = api.from('messages').select('id,content,content_type,created_at,author_id').eq('parent_id', pid).eq('is_mod', false).order('created_at', { ascending: true });
    var botP = api.from('messages').select('content,created_at').eq('parent_id', pid).eq('is_mod', true).order('created_at', { ascending: true });
    Promise.all([parentP, repliesP, botP]).then(function (res) {
      renderPostDetail(p, (res[0] && res[0].data) || null, (res[1] && res[1].data) || [], (res[2] && res[2].data) || []);
    }).catch(function () {
      renderPostDetail(p, null, [], []);
    });
  }

  function renderPostDetail(p, parent, replies, bots) {
    var overlay = document.getElementById('post-detail-modal-overlay');
    var titleEl = document.getElementById('post-detail-title');
    var bodyEl = document.getElementById('post-detail-body');
    var actionsEl = document.getElementById('post-detail-actions');
    if (!overlay || !bodyEl) return;

    var chName = channelMap[p.channel_id] || ('频道' + p.channel_id);
    var author = p.nickname || p.username || '未知';
    titleEl.textContent = '#' + chName + ' · ' + author;

    var reasonText = (bots && bots.length)
      ? bots.map(function (b) { return b.content || ''; }).join('\n')
      : (p.mod_reason || p._childReason || '');
    var isFlagged = state.postView === 'flagged';

    var html = '';
    // 状态条
    var statusBadge = p.reviewed ? '<span class="badge badge-default">已审</span>' : '<span class="badge badge-warning">待审</span>';
    if (p.mod_overturned) statusBadge += ' <span class="badge badge-undo">已撤回</span>';
    html += '<div class="pd-status-row">' + statusBadge + '</div>';

    // 原消息（若是回复）
    if (parent) {
      var pa = profileMap[parent.author_id];
      var paName = pa ? (pa.nickname || pa.username || '未知') : '未知';
      html += '<div class="pd-section-label">原消息</div>' +
        '<div class="pd-ctx-card"><div class="pd-ctx-meta">' + esc(paName) + ' · ' + esc(formatFull(parent.created_at)) + '</div>' +
        '<div class="pd-content">' + esc(parent.content || '') + '</div></div>';
    }

    // 完整消息正文（不截断）
    html += '<div class="pd-section-label">消息内容</div>' +
      '<div class="pd-content pd-main">' + esc(p.content || '（空）') + '</div>';

    // AI 判定理由
    if (reasonText) {
      html += '<div class="pd-section-label">AI 判定理由</div>' +
        '<div class="pd-reason">' + esc(reasonText) + '</div>';
    }

    // 回复列表
    if (replies && replies.length) {
      html += '<div class="pd-section-label">回复（' + replies.length + '）</div>';
      replies.forEach(function (rp) {
        var ra = profileMap[rp.author_id];
        var raName = ra ? (ra.nickname || ra.username || '未知') : '未知';
        html += '<div class="pd-ctx-card"><div class="pd-ctx-meta">' + esc(raName) + ' · ' + esc(formatFull(rp.created_at)) + '</div>' +
          '<div class="pd-content">' + esc(rp.content || '') + '</div></div>';
      });
    }

    // 元数据
    html += '<div class="pd-section-label">元数据</div>' +
      '<div class="pd-meta-grid">' +
        metaItem('频道', '#' + esc(chName)) +
        metaItem('类型', esc(p.content_type || 'text')) +
        metaItem('发布时间', esc(formatFull(p.created_at))) +
        metaItem('分类', esc(p.mod_category || '—')) +
        metaItem('严重度', esc(String(p.mod_severity != null ? p.mod_severity : '—'))) +
        metaItem('作者ID', esc(p.author_id || '—')) +
      '</div>';

    bodyEl.innerHTML = html;

    // 动作按钮：仅未审核的待审消息显示 标记已审/撤回审核
    actionsEl.innerHTML = '';
    if (isFlagged && !p.reviewed) {
      var bApp = document.createElement('button');
      bApp.className = 'btn-primary btn-sm';
      bApp.textContent = '标记已审';
      bApp.addEventListener('click', function () { approvePost(p.id, function () { closePostDetail(); }); });
      var bOver = document.createElement('button');
      bOver.className = 'btn-undo btn-sm';
      bOver.textContent = '撤回审核';
      bOver.addEventListener('click', function () {
        if (!confirm('确认撤回该 AI 误判？将清除待审标记、恢复消息、扣回警告并通知用户。')) return;
        overturnPost(p.id, function (success) {
          if (success) { showToast('已撤回审核并通知用户', 'success'); logAdmin('overturn', '撤回审核（AI误判）', p.id, p.author_id); closePostDetail(); }
        });
      });
      actionsEl.appendChild(bApp);
      actionsEl.appendChild(bOver);
    }
    var bDel = document.createElement('button');
    bDel.className = 'btn-danger btn-sm';
    bDel.textContent = '删除';
    bDel.addEventListener('click', function () {
      if (!confirm('确认删除此帖子？此操作不可恢复！')) return;
      deletePost(p.id, function () { closePostDetail(); });
    });
    actionsEl.appendChild(bDel);

    overlay.classList.add('active');
  }
  function metaItem(k, v) {
    return '<div class="pd-meta-item"><div class="pd-meta-k">' + k + '</div><div class="pd-meta-v">' + v + '</div></div>';
  }
  function closePostDetail() {
    var overlay = document.getElementById('post-detail-modal-overlay');
    if (overlay) overlay.classList.remove('active');
  }

  function getFilteredPosts() {
    var search = (document.getElementById('post-search').value || '').toLowerCase();
    var channelFilter = document.getElementById('post-channel-filter').value;
    var source = state.postView === 'flagged' ? state.flaggedData : state.postsData;
    return source.filter(function (p) {
      if (channelFilter && String(p.channel_id) !== channelFilter) return false;
      if (search && (p.content || '').toLowerCase().indexOf(search) === -1 &&
          (p.username || '').toLowerCase().indexOf(search) === -1) return false;
      return true;
    });
  }
  function getSelectedPostIds() {
    var ids = [];
    document.querySelectorAll('#post-tbody .admin-checkbox:checked').forEach(function (cb) { ids.push(cb.dataset.id); });
    return ids;
  }
  // 从内存状态里按 id 找帖子（含频道，供实时广播用）
  function findPostInState(id) {
    var found = null;
    (state.postsData || []).forEach(function (m) { if (m.id === id) found = m; });
    if (!found) (state.flaggedData || []).forEach(function (m) { if (m.id === id) found = m; });
    return found;
  }
  // 删除成功后立即从列表内存摘除，无需等刷新（loadPostsData 无 reset 时只增量追加，不会移除）
  function purgePostsFromState(ids) {
    var set = {};
    ids.forEach(function (i) { set[i] = true; });
    if (state.postsData) state.postsData = state.postsData.filter(function (m) { return !set[m.id]; });
    if (state.flaggedData) state.flaggedData = state.flaggedData.filter(function (m) { return !set[m.id]; });
    if (state.currentModule === 'posts') renderPosts();
  }

  function renderPosts() {
    var filtered = getFilteredPosts();
    if (state.postSortKey) {
      filtered.sort(function (a, b) {
        var va = a[state.postSortKey] || '', vb = b[state.postSortKey] || '';
        if (typeof va === 'string') va = va.toLowerCase();
        if (typeof vb === 'string') vb = vb.toLowerCase();
        if (va < vb) return state.postSortDir === 'asc' ? -1 : 1;
        if (va > vb) return state.postSortDir === 'asc' ? 1 : -1;
        return 0;
      });
    }
    var total = filtered.length;
    var isFlagged = state.postView === 'flagged';

    var table = document.getElementById('post-table');
    if (table) table.classList.toggle('view-flagged', isFlagged);

    var tbody = document.getElementById('post-tbody');
    tbody.innerHTML = '';

    if (!total) {
      var emptyText = isFlagged ? '暂无 AI 待审帖子 🎉' : '没有匹配的帖子';
      tbody.innerHTML = '<tr><td colspan="8"><div class="admin-empty"><div class="empty-icon">📋</div><div class="empty-text">' + emptyText + '</div></div></td></tr>';
    } else {
      filtered.forEach(function (p) {
        var tr = document.createElement('tr');
        var timeStr = p.created_at ? formatTime(p.created_at) : '';
        var typeLabel = p.content_type === 'image' ? '🖼 图片' : p.content_type === 'file' ? '📎 文件' : '💬 文本';
        var preview = p.content_type === 'text' ? (p.content || '').substring(0, 80) : '[' + typeLabel + ']';
        var previewHtml = '<span class="tbl-post-text">' + esc(preview) + '</span>';
        var modReason = p.mod_reason || p._childReason || '';
        if (isFlagged && modReason) {
          var cm = modReason.match(/^【(.+?)·严重度(\d+)】(.*)$/s);
          if (cm) previewHtml += '<div class="tbl-mod-reason">⚠ ' + esc(cm[1]) + ' · 严重度 ' + esc(cm[2]) + '：' + esc(cm[3]) + '</div>';
          else previewHtml += '<div class="tbl-mod-reason">⚠ ' + esc(modReason) + '</div>';
        }
        var statusCell = isFlagged
          ? (p.reviewed
              ? '<span class="badge badge-default">已审</span>'
              : '<span class="badge badge-warning">待审</span>')
          : '';
        var actionBtns = '<button class="btn-ghost btn-xs" data-action="detail-post" data-id="' + p.id + '">详情</button>';
        if (isFlagged && !p.reviewed) {
          actionBtns += '<button class="btn-primary btn-xs" data-action="approve-post" data-id="' + p.id + '">标记已审</button>';
          actionBtns += '<button class="btn-undo btn-xs" data-action="overturn-post" data-id="' + p.id + '">撤回审核</button>';
        }
        actionBtns += '<button class="btn-danger btn-xs" data-action="delete-post" data-id="' + p.id + '">删除</button>';
        tr.innerHTML =
          '<td><input type="checkbox" class="admin-checkbox post-checkbox" data-id="' + p.id + '" /></td>' +
          '<td><span style="font-weight:500;color:var(--text);">' + esc(p.nickname || p.username || '未知') + '</span></td>' +
          '<td><div class="tbl-post-preview">' + previewHtml + '</div></td>' +
          '<td>#' + esc(channelMap[p.channel_id] || ('频道' + p.channel_id)) + '</td>' +
          '<td>' + timeStr + '</td>' +
          '<td>' + typeLabel + '</td>' +
          '<td class="col-status">' + statusCell + '</td>' +
          '<td><div class="col-actions">' + actionBtns + '</div></td>';
        tbody.appendChild(tr);
      });
    }

    tbody.querySelectorAll('[data-action="delete-post"]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var pid = this.dataset.id;
        if (!confirm('确认删除此帖子？此操作不可恢复！')) return;
        deletePost(pid);
      });
    });

    tbody.querySelectorAll('[data-action="approve-post"]').forEach(function (btn) {
      btn.addEventListener('click', function () { approvePost(this.dataset.id); });
    });

    tbody.querySelectorAll('[data-action="detail-post"]').forEach(function (btn) {
      btn.addEventListener('click', function () { openPostDetail(this.dataset.id); });
    });

    tbody.querySelectorAll('[data-action="overturn-post"]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var pid = this.dataset.id;
        var p = findPostInState(pid);
        if (!confirm('确认撤回该 AI 误判？将清除待审标记、恢复消息、扣回警告并通知用户。')) return;
        overturnPost(pid, function (success) {
          if (success) {
            showToast('已撤回审核并通知用户', 'success');
            logAdmin('overturn', '撤回审核（AI误判）', pid, p ? p.author_id : null);
            setTimeout(loadFlaggedPosts, 400);
          }
        });
      });
    });

    // 帖子审核：滚动式，不渲染分页按钮
    // all 视图加载状态由 updatePostLoadStatus 管理（游标滚动）；flagged 视图直接显示总数
    if (state.postView === 'flagged') {
      var pInfo = document.getElementById('post-pagination-info');
      if (pInfo) pInfo.textContent = '共 ' + total + ' 条';
    }
    var pBtns = document.getElementById('post-pagination-btns');
    if (pBtns) pBtns.innerHTML = '';
  }

  function formatTime(ts) {
    if (!ts) return '';
    var d = new Date(ts);
    if (isNaN(d.getTime())) return '';
    var now = new Date();
    if (d.toDateString() === now.toDateString()) {
      return String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0');
    }
    return (d.getMonth() + 1) + '/' + d.getDate() + ' ' + String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0');
  }
  function formatFull(ts) {
    if (!ts) return '';
    var d = new Date(ts);
    if (isNaN(d.getTime())) return '';
    function p(n) { return String(n).padStart(2, '0'); }
    return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate()) + ' ' + p(d.getHours()) + ':' + p(d.getMinutes()) + ':' + p(d.getSeconds());
  }

  /* ========== DASHBOARD ========== */
  function renderDashboard() {
    var stats = (state.dashboardStats && state.dashboardStats.stats) || {};
    document.getElementById('stat-total-users').textContent = stats.userCount || '0';
    document.getElementById('stat-active-channels').textContent = stats.channelCount || '0';
    document.getElementById('stat-today-msgs').textContent = stats.msgToday || '0';
    document.getElementById('stat-pending-posts').textContent = stats.msgCount || '0';

    var chartEl = document.getElementById('chart-messages');
    var trend = (state.dashboardStats && state.dashboardStats.trend) || [];
    if (!trend.length) {
      chartEl.innerHTML = '<div style="text-align:center;padding:40px;color:var(--text-dim);">暂无数据</div>';
    } else {
      var maxVal = 1;
      trend.forEach(function (d) { if (d.count > maxVal) maxVal = d.count; });
      chartEl.innerHTML = trend.map(function (d) {
        var dayOfWeek = ['日', '一', '二', '三', '四', '五', '六'][new Date(d.date + 'T00:00:00').getDay()];
        var pct = maxVal > 0 ? (d.count / maxVal * 100).toFixed(1) : 0;
        return '<div class="chart-bar" style="height:' + pct + '%;"><span class="bar-label">' + dayOfWeek + '</span></div>';
      }).join('');
    }

    var actList = document.getElementById('activity-list');
    var recent = (state.dashboardStats && state.dashboardStats.recent) || [];
    if (!recent.length) {
      actList.innerHTML = '<div class="activity-item"><div class="activity-content">暂无最近活动</div></div>';
    } else {
      var dotColors = ['success', 'info', 'warning', 'info', 'success', 'info'];
      actList.innerHTML = recent.map(function (a, i) {
        var timeStr = formatTime(a.created_at);
        return '<div class="activity-item">' +
          '<div class="activity-dot ' + (dotColors[i % dotColors.length]) + '"></div>' +
          '<div class="activity-content"><strong>' + esc(a.nickname || a.username) + '</strong> 在 ' + esc(a.channel_name || '频道') + ' 发了消息：' + esc((a.content || '').substring(0, 30)) + '</div>' +
          '<div class="activity-time">' + timeStr + '</div>' +
        '</div>';
      }).join('');
    }
  }

  /* ========== MODALS ========== */
  function bindModals() {
    document.getElementById('user-modal-close').addEventListener('click', closeUserModal);
    document.getElementById('user-modal-cancel').addEventListener('click', closeUserModal);
    document.getElementById('user-modal-confirm').addEventListener('click', confirmUserModal);
    // 代用户发起密码重置（平台不开放管理员直改，走邮件重置流程）
    var sendResetBtn = document.getElementById('btn-send-reset');
    if (sendResetBtn) sendResetBtn.addEventListener('click', function () {
      if (!state.userEditingId) return;
      var u = state.usersData.find(function (x) { return x.id === state.userEditingId; });
      if (!u || !u.email) { showToast('该用户无邮箱，无法发送重置邮件', 'error'); return; }
      showToast('正在发送重置邮件…', 'info');
      fetch(IF.INS_FORGE_URL + '/api/auth/email/send-reset-password', {
        method: 'POST',
        headers: { 'apikey': IF.ANON_KEY, 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: u.email })
      }).then(function (r) { return r.json(); }).then(function (data) {
        if (data && data.success) showToast('已向 ' + u.email + ' 发送密码重置邮件', 'success');
        else showToast('发送失败：' + ((data && data.message) || '未知错误'), 'error');
      }).catch(function () { showToast('发送失败（网络错误）', 'error'); });
    });
    var avPreview = document.getElementById('user-avatar-preview');
    var avInput = document.getElementById('user-avatar-input');
    var avBtn = document.getElementById('user-avatar-btn');
    if (avBtn) avBtn.addEventListener('click', function () { avInput.click(); });
    if (avPreview) avPreview.addEventListener('click', function () { avInput.click(); });
    if (avInput) avInput.addEventListener('change', function (e) {
      var f = e.target.files && e.target.files[0];
      if (!f) return;
      if (!/^image\//.test(f.type)) { showToast('请选择图片文件', 'error'); avInput.value = ''; return; }
      if (f.size > 5 * 1024 * 1024) { showToast('图片不能超过 5MB', 'error'); avInput.value = ''; return; }
      userAvatarFile = f;
      var reader = new FileReader();
      reader.onload = function (ev) {
        avPreview.innerHTML = '<img src="' + ev.target.result + '" alt="" style="width:100%;height:100%;object-fit:cover;border-radius:50%;" />';
        avPreview.style.background = 'transparent';
      };
      reader.readAsDataURL(f);
    });
    document.getElementById('user-modal-overlay').addEventListener('click', function (e) {
      if (e.target === this) closeUserModal();
    });
    document.getElementById('confirm-modal-close').addEventListener('click', function () {
      document.getElementById('confirm-modal-overlay').classList.remove('active');
    });
    document.getElementById('confirm-modal-cancel').addEventListener('click', function () {
      document.getElementById('confirm-modal-overlay').classList.remove('active');
    });
    document.getElementById('confirm-modal-overlay').addEventListener('click', function (e) {
      if (e.target === this) this.classList.remove('active');
    });
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') {
        document.querySelectorAll('.admin-modal-overlay.active').forEach(function (m) { m.classList.remove('active'); });
      }
    });
    // 帖子详情弹窗关闭
    var pdClose = document.getElementById('post-detail-close');
    if (pdClose) pdClose.addEventListener('click', closePostDetail);
    var pdCancel = document.getElementById('post-detail-cancel');
    if (pdCancel) pdCancel.addEventListener('click', closePostDetail);
    var pdOverlay = document.getElementById('post-detail-modal-overlay');
    if (pdOverlay) pdOverlay.addEventListener('click', function (e) { if (e.target === this) closePostDetail(); });
  }

  /* ========== WORDLIST MANAGEMENT (敏感词库) ========== */
  var CATEGORY_LABELS = { abuse: '辱骂攻击', spam: '广告引流', adult: '色情低俗', political: '政治敏感', conflict: '恶意引战', flood: '刷屏灌水' };
  var SEVERITY_LABELS = { 1: '轻微', 2: '中度', 3: '重度' };
  var SEVERITY_BADGE = { 1: 'badge-default', 2: 'badge-warning', 3: 'badge-danger' };
  var editingWordId = null;

  function bindWordModule() {
    document.getElementById('word-search').addEventListener('input', renderWordlist);
    document.getElementById('word-category-filter').addEventListener('change', renderWordlist);
    document.getElementById('word-status-filter').addEventListener('change', renderWordlist);
    document.getElementById('btn-add-word').addEventListener('click', function () {
      editingWordId = null;
      document.getElementById('word-modal-title').textContent = '添加词条';
      document.getElementById('form-word').value = '';
      document.getElementById('form-word-category').value = 'abuse';
      document.getElementById('form-word-severity').value = '2';
      document.getElementById('word-modal-overlay').classList.add('show');
    });
    document.getElementById('word-modal-close').addEventListener('click', closeWordModal);
    document.getElementById('word-modal-cancel').addEventListener('click', closeWordModal);
    document.getElementById('word-modal-save').addEventListener('click', saveWord);
    // 点击遮罩关闭
    document.getElementById('word-modal-overlay').addEventListener('click', function (e) {
      if (e.target === this) closeWordModal();
    });
    loadWordlist();
  }

  function closeWordModal() {
    document.getElementById('word-modal-overlay').classList.remove('show');
    editingWordId = null;
  }

  function loadWordlist() {
    db().from('blocklist').select('*').order('created_at', { ascending: false }).limit(200)
      .then(function (r) {
        if (r.error) { showToast('加载词库失败：' + (r.error.message || ''), 'error'); return; }
        state.wordlistData = r.data || [];
        renderWordlist();
      })
      .catch(function () { state.wordlistData = []; });
  }

  function getFilteredWords() {
    var search = (document.getElementById('word-search').value || '').toLowerCase();
    var catFilter = document.getElementById('word-category-filter').value;
    var stFilter = document.getElementById('word-status-filter').value;
    return (state.wordlistData || []).filter(function (w) {
      if (catFilter && w.category !== catFilter) return false;
      if (stFilter === 'enabled' && !w.enabled) return false;
      if (stFilter === 'disabled' && w.enabled) return false;
      if (search && w.word.toLowerCase().indexOf(search) === -1) return false;
      return true;
    });
  }

  function renderWordlist() {
    var filtered = getFilteredWords();
    var total = filtered.length;
    var tbody = document.getElementById('word-tbody');
    tbody.innerHTML = '';
    if (!total) {
      tbody.innerHTML = '<tr><td colspan="6"><div class="admin-empty"><div class="empty-icon">📝</div><div class="empty-text">暂无敏感词</div></div></td></tr>';
    } else {
      filtered.forEach(function (w, i) {
        var tr = document.createElement('tr');
        tr.innerHTML =
          '<td>' + (i + 1) + '</td>' +
          '<td><span style="font-weight:500;">' + esc(w.word) + '</span></td>' +
          '<td><span class="badge badge-info">' + esc(CATEGORY_LABELS[w.category] || w.category) + '</span></td>' +
          '<td><span class="badge ' + (SEVERITY_BADGE[w.severity] || 'badge-default') + '">' + (SEVERITY_LABELS[w.severity] || w.severity) + '</span></td>' +
          '<td>' + (w.enabled ? '<span class="badge badge-success">启用</span>' : '<span style="color:var(--text-muted);">已禁用</span>') + '</td>' +
          '<td><div class="col-actions">' +
            '<button class="btn-primary btn-xs" data-action="edit-word" data-id="' + w.id + '">编辑</button> ' +
            (w.enabled
              ? '<button class="btn-default btn-xs" data-action="toggle-word" data-id="' + w.id + '">禁用</button>'
              : '<button class="btn-primary btn-xs" data-action="toggle-word" data-id="' + w.id + '">启用</button>') + ' ' +
            '<button class="btn-danger btn-xs" data-action="delete-word" data-id="' + w.id + '">删除</button>' +
          '</div></td>';
        tbody.appendChild(tr);
      });
    }
    // 绑定操作按钮
    tbody.querySelectorAll('[data-action="edit-word"]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var wid = this.dataset.id;
        var w = state.wordlistData.find(function (x) { return x.id === wid; });
        if (!w) return;
        editingWordId = wid;
        document.getElementById('word-modal-title').textContent = '编辑词条';
        document.getElementById('form-word').value = w.word;
        document.getElementById('form-word-category').value = w.category;
        document.getElementById('form-word-severity').value = String(w.severity);
        document.getElementById('word-modal-overlay').classList.add('show');
      });
    });
    tbody.querySelectorAll('[data-action="toggle-word"]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var wid = this.dataset.id;
        var w = state.wordlistData.find(function (x) { return x.id === wid; });
        if (!w) return;
        db().from('blocklist').update({ enabled: !w.enabled }).eq('id', wid).then(function (r) {
          if (r.error) { showToast('操作失败：' + (r.error.message || ''), 'error'); return; }
          showToast((w.enabled ? '已禁用' : '已启用') + ': ' + w.word, 'success');
          loadWordlist();
        });
      });
    });
    tbody.querySelectorAll('[data-action="delete-word"]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var wid = this.dataset.id;
        var w = state.wordlistData.find(function (x) { return x.id === wid; });
        if (!w) return;
        if (!confirm('确认删除词条「' + w.word + '」？')) return;
        db().from('blocklist').delete().eq('id', wid).then(function (r) {
          if (r.error) { showToast('删除失败：' + (r.error.message || ''), 'error'); return; }
          showToast('已删除: ' + w.word, 'success');
          loadWordlist();
        });
      });
    });
    var pInfo = document.getElementById('word-pagination-info');
    if (pInfo) pInfo.textContent = '共 ' + total + ' 条';
  }

  function saveWord() {
    var word = (document.getElementById('form-word').value || '').trim();
    var category = document.getElementById('form-word-category').value;
    var severity = parseInt(document.getElementById('form-word-severity').value, 10);
    if (!word) { showToast('请输入敏感词', 'info'); return; }
    var data = { word: word, category: category, severity: severity, enabled: true };
    if (editingWordId) {
      db().from('blocklist').update(data).eq('id', editingWordId).then(function (r) {
        if (r.error) { showToast('保存失败：' + (r.error.message || ''), 'error'); return; }
        showToast('已更新: ' + word, 'success');
        closeWordModal();
        loadWordlist();
      });
    } else {
      db().from('blocklist').insert([data]).then(function (r) {
        if (r.error) { showToast('添加失败：' + (r.error.message || ''), 'error'); return; }
        showToast('已添加: ' + word, 'success');
        closeWordModal();
        loadWordlist();
      });
    }
  }
  function showToast(msg, type) {
    var container = document.getElementById('toast-container');
    if (!container) return;
    var toast = document.createElement('div');
    toast.className = 'toast ' + (type || 'info');
    toast.textContent = msg;
    toast.addEventListener('click', function () { this.remove(); });
    container.appendChild(toast);
    setTimeout(function () { if (toast.parentNode) toast.remove(); }, 3000);
  }

  /* ========== BOOT ========== */
  if (window.IF) checkAuth();
  // 否则由顶部 IF_READY 监听触发
})();
