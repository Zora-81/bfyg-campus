/* ═══════════════════════════════════════════════════
   校园频道 — 后台管理系统 JS (Production)
   对接真实 API: 用户管理 · 帖子审核 · 数据看板
   ═══════════════════════════════════════════════════ */
(function () {
  'use strict';

  var API_BASE = '/api';
  var token = localStorage.getItem('bfyg_token') || '';

  function apiGet(path) {
    return fetch(API_BASE + path, { headers: { Authorization: 'Bearer ' + token } })
      .then(function(r) { return r.json(); });
  }
  function apiPatch(path, body) {
    return fetch(API_BASE + path, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token },
      body: JSON.stringify(body)
    }).then(function(r) { return r.json(); });
  }
  function apiDelete(path) {
    return fetch(API_BASE + path, {
      method: 'DELETE', headers: { Authorization: 'Bearer ' + token }
    }).then(function(r) { return r.json(); });
  }
  function apiPost(path, body) {
    return fetch(API_BASE + path, {
      method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token },
      body: JSON.stringify(body)
    }).then(function(r) { return r.json(); });
  }

  // Check auth - redirect if not admin
  apiGet('/auth/me').then(function(res) {
    if (!res.user || res.user.role !== 'admin') {
      alert('需要管理员权限，即将跳转到首页');
      window.location.href = 'index.html';
      return;
    }
    init();
  }).catch(function() {
    window.location.href = 'index.html';
  });

  /* ========== STATE ========== */
  var state = {
    currentModule: 'users',
    userSortKey: null, userSortDir: 'asc', userPage: 1, userPageSize: 8,
    userEditingId: null,
    postSortKey: null, postSortDir: 'asc', postPage: 1, postPageSize: 8,
    postStatusFilter: '',
    usersData: [], postsData: [], dashboardStats: {}
  };

  /* ========== UI HELPERS ========== */
  var avatarColors = [
    'linear-gradient(135deg,#7c5cfc,#a78bfa)','linear-gradient(135deg,#10b981,#34d399)',
    'linear-gradient(135deg,#f59e0b,#fbbf24)','linear-gradient(135deg,#ff6b8a,#ff8fa3)',
    'linear-gradient(135deg,#06b6d4,#22d3ee)','linear-gradient(135deg,#ec4899,#f472b6)',
  ];
  function getAvatarColor(name) {
    var h = 0; for (var i = 0; i < name.length; i++) h = name.charCodeAt(i) + ((h << 5) - h);
    return avatarColors[Math.abs(h) % avatarColors.length];
  }
  function esc(s) { var d = document.createElement('div'); d.textContent = s; return d.innerHTML; }
  function getInitial(n) { return n ? n.charAt(0).toUpperCase() : '?'; }

  /* ========== INIT ========== */
  function init() {
    bindNav();
    bindMobileMenu();
    bindUserModule();
    bindPostModule();
    bindModals();
    loadUsers();
    loadDashboard();
    renderModule('users');
  }

  function loadUsers() {
    apiGet('/admin/users?limit=100').then(function(res) {
      state.usersData = res.users || [];
      if (state.currentModule === 'users') renderUsers();
    });
  }

  function loadDashboard() {
    apiGet('/admin/stats').then(function(res) {
      state.dashboardStats = res;
      if (state.currentModule === 'dashboard') renderDashboard();
    });
  }

  /* ========== NAVIGATION ========== */
  function bindNav() {
    document.querySelectorAll('.admin-nav-item').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var module = this.dataset.module;
        switchModule(module);
      });
    });
  }

  function switchModule(module) {
    state.currentModule = module;
    document.querySelectorAll('.admin-nav-item').forEach(function (b) {
      b.classList.toggle('active', b.dataset.module === module);
    });
    document.querySelectorAll('.admin-module').forEach(function (m) {
      m.classList.toggle('active', m.id === 'module-' + module);
    });
    var titles = { users: '用户管理', posts: '帖子审核', dashboard: '数据看板' };
    var descs = { users: '管理系统用户与权限', posts: '审核与管理频道内容', dashboard: '平台数据概览与分析' };
    document.getElementById('admin-header-title').textContent = titles[module] || '';
    document.getElementById('admin-header-desc').textContent = descs[module] || '';
    if (module === 'dashboard') loadDashboard();
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
  }

  /* ========== USER MANAGEMENT ========== */
  function bindUserModule() {
    document.getElementById('user-search').addEventListener('input', function () { state.userPage = 1; renderUsers(); });
    document.getElementById('user-role-filter').addEventListener('change', function () { state.userPage = 1; renderUsers(); });
    document.getElementById('user-status-filter').addEventListener('change', function () { state.userPage = 1; renderUsers(); });
    document.getElementById('btn-add-user').addEventListener('click', function () { showToast('添加用户请在首页注册页面操作', 'info'); });

    document.getElementById('user-select-all').addEventListener('change', function () {
      var checked = this.checked;
      document.querySelectorAll('#user-tbody .admin-checkbox').forEach(function (cb) { cb.checked = checked; });
    });

    document.querySelectorAll('#user-table th[data-sort]').forEach(function (th) {
      th.addEventListener('click', function () {
        var key = this.dataset.sort;
        if (state.userSortKey === key) {
          state.userSortDir = state.userSortDir === 'asc' ? 'desc' : 'asc';
        } else {
          state.userSortKey = key; state.userSortDir = 'asc';
        }
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
      if (search && (u.username||'').toLowerCase().indexOf(search)===-1 && (u.nickname||'').toLowerCase().indexOf(search)===-1) return false;
      if (roleFilter && u.role !== roleFilter) return false;
      if (statusFilter && u.status !== statusFilter) return false;
      return true;
    });
  }

  function sortUsers(list) {
    if (!state.userSortKey) return list;
    return list.sort(function (a, b) {
      var va = a[state.userSortKey]||'', vb = b[state.userSortKey]||'';
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

    var roleLabels = { admin: '管理员', moderator: '版主', student: '学生' };
    var roleBadgeClass = { admin: 'badge-purple', moderator: 'badge-info', student: 'badge-default' };
    var statusLabels = { active: '正常', banned: '已封禁' };

    var tbody = document.getElementById('user-tbody');
    tbody.innerHTML = '';

    if (!page.length) {
      tbody.innerHTML = '<tr><td colspan="7"><div class="admin-empty"><div class="empty-icon">📭</div><div class="empty-text">没有匹配的用户</div></div></td></tr>';
    } else {
      page.forEach(function (u) {
        var tr = document.createElement('tr');
        var displayName = u.nickname || u.username;
        var roleLabel = roleLabels[u.role] || u.role;
        var roleBadge = roleBadgeClass[u.role] || 'badge-default';
        var statusChecked = u.status === 'active' ? 'checked' : '';
        var statusLabel = statusLabels[u.status] || u.status;
        var createdAt = (u.created_at || '').split('T')[0] || '';

        tr.innerHTML =
          '<td><input type="checkbox" class="admin-checkbox user-checkbox" data-id="' + u.id + '" /></td>' +
          '<td><div class="tbl-user">' +
            '<div class="tbl-user-avatar" style="background:' + getAvatarColor(displayName) + '">' + getInitial(displayName) + '</div>' +
            '<div><div class="tbl-user-name">' + esc(displayName) + '</div><div class="tbl-user-id">@' + esc(u.username || '') + '</div></div>' +
          '</div></td>' +
          '<td>' + esc(u.username || '') + '</td>' +
          '<td><span class="badge ' + roleBadge + '">' + roleLabel + '</span></td>' +
          '<td><label class="toggle-switch"><input type="checkbox" ' + statusChecked + ' data-action="toggle-status" data-id="' + u.id + '" /><span class="toggle-slider"></span></label> ' +
            '<span style="font-size:var(--text-xs);color:var(--text-dim);margin-left:4px;">' + statusLabel + '</span></td>' +
          '<td>' + createdAt + '</td>' +
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
        var uid = parseInt(this.dataset.id);
        var newStatus = this.checked ? 'active' : 'banned';
        apiPatch('/admin/users/' + uid, { status: newStatus }).then(function(res) {
          if (!res.error) {
            loadUsers();
            showToast(newStatus === 'active' ? '已启用用户' : '已封禁用户', 'info');
          }
        });
      });
    });

    renderPagination('user', total, totalPages);
  }

  function openUserModal(userId) {
    state.userEditingId = userId;
    var u = state.usersData.find(function(x) { return x.id === parseInt(userId); });
    if (!u) return;
    document.getElementById('form-username').value = u.username;
    document.getElementById('form-displayname').value = u.nickname;
    document.getElementById('form-role').value = u.role;
    document.getElementById('form-password').value = '';
    document.getElementById('user-modal-title').textContent = '编辑用户';
    document.getElementById('user-modal-overlay').classList.add('active');
  }

  function closeUserModal() {
    document.getElementById('user-modal-overlay').classList.remove('active');
  }

  function confirmUserModal() {
    var role = document.getElementById('form-role').value;
    if (state.userEditingId) {
      apiPatch('/admin/users/' + state.userEditingId, { role: role }).then(function(res) {
        if (!res.error) {
          loadUsers();
          showToast('用户信息已更新', 'success');
          closeUserModal();
        } else {
          showToast(res.error, 'error');
        }
      });
    }
  }

  function toggleBanUser(userId) {
    var u = state.usersData.find(function(x) { return x.id === parseInt(userId); });
    if (!u) return;
    var newStatus = u.status === 'active' ? 'banned' : 'active';
    var msg = newStatus === 'banned' ? '确认封禁用户「' + u.nickname + '」？' : '确认解封用户「' + u.nickname + '」？';
    if (!confirm(msg)) return;
    apiPatch('/admin/users/' + userId, { status: newStatus }).then(function(res) {
      if (!res.error) {
        loadUsers();
        showToast(newStatus === 'banned' ? '已封禁' : '已解封', 'success');
      }
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
        btn.addEventListener('click', (function (pg) {
          return function () {
            if (prefix === 'user') { state.userPage = pg; renderUsers(); }
            else { state.postPage = pg; renderPosts(); }
          };
        })(p));
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
      for (var i = start; i <= end; i++) pages.push(i);
      if (page < total - 2) pages.push(-1);
      pages.push(total);
    }
    return pages;
  }

  /* ========== POST REVIEW ========== */
  function bindPostModule() {
    document.getElementById('post-search').addEventListener('input', function () { state.postPage = 1; renderPosts(); });
    document.getElementById('post-channel-filter').addEventListener('change', function () { state.postPage = 1; renderPosts(); });
    document.querySelectorAll('#post-table th[data-sort]').forEach(function (th) {
      th.addEventListener('click', function () {
        var key = this.dataset.sort;
        if (state.postSortKey === key) {
          state.postSortDir = state.postSortDir === 'asc' ? 'desc' : 'asc';
        } else { state.postSortKey = key; state.postSortDir = 'asc'; }
        document.querySelectorAll('#post-table th').forEach(function (h) { h.classList.remove('sort-asc', 'sort-desc'); });
        this.classList.add('sort-' + state.postSortDir);
        state.postPage = 1;
        renderPosts();
      });
    });
    document.getElementById('post-select-all').addEventListener('change', function () {
      var checked = this.checked;
      document.querySelectorAll('#post-tbody .admin-checkbox').forEach(function (cb) { cb.checked = checked; });
    });

    // Batch actions
    document.getElementById('btn-batch-approve').addEventListener('click', function () {
      var selected = getSelectedPostIds();
      if (selected.length === 0) { showToast('请先选择帖子', 'info'); return; }
      if (!confirm('确认批量通过 ' + selected.length + ' 条帖子？（仅作标记，不会删除）')) return;
      showToast('已标记 ' + selected.length + ' 条为已审核', 'success');
      // 清除选项
      document.querySelectorAll('#post-tbody .admin-checkbox').forEach(function(cb) { cb.checked = false; });
      document.getElementById('post-select-all').checked = false;
    });
    document.getElementById('btn-batch-reject').addEventListener('click', function () {
      var selected = getSelectedPostIds();
      if (selected.length === 0) { showToast('请先选择帖子', 'info'); return; }
      if (!confirm('确认批量删除 ' + selected.length + ' 条帖子？此操作不可恢复！')) return;
      apiPost('/admin/posts/batch-delete', { ids: selected.map(Number) }).then(function(res) {
        if (!res.error) {
          showToast('已删除 ' + res.deleted + ' 条帖子', 'success');
          loadPostsData();
        }
      });
    });

    loadPostChannels();

    // Load messages as posts
    loadPostsData();
  }

  function loadPostsData() {
    apiGet('/admin/posts?limit=100').then(function(res) {
      state.postsData = res.posts || [];
      state.postTotal = res.total || 0;
      if (state.currentModule === 'posts') renderPosts();
    }).catch(function() {
      state.postsData = [];
    });
  }

  // Load channels for filter
  function loadPostChannels() {
    apiGet('/admin/channels').then(function(res) {
      var sel = document.getElementById('post-channel-filter');
      if (!sel) return;
      sel.innerHTML = '<option value="">全部频道</option>';
      (res.channels || []).forEach(function(c) {
        sel.innerHTML += '<option value="' + c.id + '">#' + esc(c.name) + '</option>';
      });
    }).catch(function(){});
  }

  function getFilteredPosts() {
    var search = (document.getElementById('post-search').value || '').toLowerCase();
    var channelFilter = document.getElementById('post-channel-filter').value;
    return state.postsData.filter(function (p) {
      if (channelFilter && String(p.channel_id) !== channelFilter) return false;
      if (search && (p.content||'').toLowerCase().indexOf(search)===-1 && (p.username||'').toLowerCase().indexOf(search)===-1) return false;
      return true;
    });
  }

  function getSelectedPostIds() {
    var ids = [];
    document.querySelectorAll('#post-tbody .admin-checkbox:checked').forEach(function(cb) {
      ids.push(cb.dataset.id);
    });
    return ids;
  }

  function renderPosts() {
    var filtered = getFilteredPosts();
    if (state.postSortKey) {
      filtered.sort(function (a, b) {
        var va = a[state.postSortKey]||'', vb = b[state.postSortKey]||'';
        if (typeof va === 'string') va = va.toLowerCase();
        if (typeof vb === 'string') vb = vb.toLowerCase();
        if (va < vb) return state.postSortDir === 'asc' ? -1 : 1;
        if (va > vb) return state.postSortDir === 'asc' ? 1 : -1;
        return 0;
      });
    }
    var total = filtered.length;
    var totalPages = Math.ceil(total / state.postPageSize) || 1;
    if (state.postPage > totalPages) state.postPage = totalPages;
    var start = (state.postPage - 1) * state.postPageSize;
    var page = filtered.slice(start, start + state.postPageSize);

    var tbody = document.getElementById('post-tbody');
    tbody.innerHTML = '';

    if (!page.length) {
      tbody.innerHTML = '<tr><td colspan="7"><div class="admin-empty"><div class="empty-icon">📋</div><div class="empty-text">没有匹配的帖子</div></div></td></tr>';
    } else {
      page.forEach(function (p) {
        var tr = document.createElement('tr');
        var timeStr = p.created_at ? formatTime(p.created_at) : '';
        var typeLabel = p.content_type === 'image' ? '🖼 图片' : p.content_type === 'file' ? '📎 文件' : '💬 文本';
        var preview = p.content_type === 'text' ? (p.content || '').substring(0, 80) : '[' + typeLabel + ']';
        tr.innerHTML =
          '<td><input type="checkbox" class="admin-checkbox post-checkbox" data-id="' + p.id + '" /></td>' +
          '<td><span style="font-weight:500;color:var(--text);">' + esc(p.nickname || p.username || '未知') + '</span></td>' +
          '<td><div class="tbl-post-preview">' + esc(preview) + '</div></td>' +
          '<td>#' + esc(p.channel_name || '频道' + p.channel_id) + '</td>' +
          '<td>' + timeStr + '</td>' +
          '<td>' + typeLabel + '</td>' +
          '<td><div class="col-actions">' +
            '<button class="btn-danger btn-xs" data-action="delete-post" data-id="' + p.id + '">删除</button>' +
          '</div></td>';
        tbody.appendChild(tr);
      });
    }

    tbody.querySelectorAll('[data-action="delete-post"]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var pid = parseInt(this.dataset.id);
        if (!confirm('确认删除此帖子？此操作不可恢复！')) return;
        apiDelete('/admin/posts/' + pid).then(function(res) {
          if (!res.error) {
            showToast('已删除', 'success');
            loadPostsData();
          } else {
            showToast(res.error || '删除失败', 'error');
          }
        });
      });
    });

    renderPagination('post', total, totalPages);
  }

  function formatTime(ts) {
    if (!ts) return '';
    var d = new Date(ts + 'Z');
    var now = new Date();
    if (d.toDateString() === now.toDateString()) {
      return String(d.getHours()).padStart(2,'0')+':'+String(d.getMinutes()).padStart(2,'0');
    }
    return (d.getMonth()+1)+'/'+d.getDate()+' '+String(d.getHours()).padStart(2,'0')+':'+String(d.getMinutes()).padStart(2,'0');
  }

  /* ========== DASHBOARD ========== */
  function renderDashboard() {
    var stats = state.dashboardStats.stats || {};
    document.getElementById('stat-total-users').textContent = stats.userCount || '0';
    document.getElementById('stat-active-channels').textContent = stats.channelCount || '0';
    document.getElementById('stat-today-msgs').textContent = stats.msgToday || '0';
    document.getElementById('stat-pending-posts').textContent = stats.msgCount || '0';

    // Chart
    var chartEl = document.getElementById('chart-messages');
    var trend = state.dashboardStats.trend || [];
    var days = ['日', '一', '二', '三', '四', '五', '六'];
    var maxVal = 1;
    trend.forEach(function(d) { if (d.count > maxVal) maxVal = d.count; });

    if (trend.length === 0) {
      chartEl.innerHTML = '<div style="text-align:center;padding:40px;color:var(--text-dim);">暂无数据</div>';
    } else {
      chartEl.innerHTML = trend.map(function (d) {
        var dayOfWeek = days[new Date(d.date + 'T00:00:00').getDay()];
        var pct = maxVal > 0 ? (d.count / maxVal * 100).toFixed(1) : 0;
        return '<div class="chart-bar" style="height:' + pct + '%;"><span class="bar-label">' + dayOfWeek + '</span></div>';
      }).join('');
    }

    // Activity
    var actList = document.getElementById('activity-list');
    var recent = state.dashboardStats.recent || [];
    var dotColors = ['success', 'info', 'warning', 'info', 'success'];
    if (recent.length === 0) {
      actList.innerHTML = '<div class="activity-item"><div class="activity-content">暂无最近活动</div></div>';
    } else {
      actList.innerHTML = recent.map(function (a, i) {
        var timeStr = formatTime(a.created_at);
        return '<div class="activity-item">' +
          '<div class="activity-dot ' + (dotColors[i % dotColors.length]) + '"></div>' +
          '<div class="activity-content"><strong>' + esc(a.nickname || a.username) + '</strong> 在 ' + esc(a.channel_name || '频道') + ' 发了消息: ' + esc((a.content || '').substring(0, 30)) + '</div>' +
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
  }

  /* ========== TOAST ========== */
  function showToast(msg, type) {
    var container = document.getElementById('toast-container');
    var toast = document.createElement('div');
    toast.className = 'toast ' + (type || 'info');
    toast.textContent = msg;
    toast.addEventListener('click', function () { this.remove(); });
    container.appendChild(toast);
    setTimeout(function () { if (toast.parentNode) toast.remove(); }, 3000);
  }

})();
