// ===== 记忆树 · 评论客户端 =====
// 后端可切换：'local'（浏览器 localStorage，不接也行，现在就能用）
//            'insforge'（真实后端 + admin 审核，需 functions/comments.ts + 建表，config 里开启）
// 先审后发：提交 status=0（待审），通过 status=1 才展示。
// 挂载：window.MTComments

window.MTComments = (function () {
  const KEY = (window.MT_CONFIG && window.MT_CONFIG.commentsStorageKey) || 'mt_comments_v1';
  const BACKEND = (window.MT_CONFIG && window.MT_CONFIG.commentsBackend) || 'local';

  function readLocal() {
    try { return JSON.parse(localStorage.getItem(KEY) || '[]'); } catch (e) { return []; }
  }
  function writeLocal(arr) {
    try { localStorage.setItem(KEY, JSON.stringify(arr)); } catch (e) {}
  }
  const uid = () => 'c_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);

  // Local 实现
  const local = {
    async list(itemId) {
      return readLocal().filter(c => c.itemId === itemId && c.status === 1)
        .sort((a, b) => a.created_at - b.created_at)
        .map(c => ({ id: c.id, content: c.content, author_name: c.authorName, created_at: c.created_at }));
    },
    async pending() {
      return readLocal().filter(c => c.status === 0)
        .sort((a, b) => b.created_at - a.created_at)
        .map(c => ({ id: c.id, itemId: c.itemId, content: c.content, authorName: c.authorName, created_at: c.created_at }));
    },
    async submit({ itemId, content, authorName, authorId }) {
      const arr = readLocal();
      const rec = { id: uid(), itemId, content, authorName: authorName || '匿名同学', authorId: authorId || null, status: 0, created_at: Date.now() };
      arr.push(rec); writeLocal(arr);
      return { ok: true, status: 0, message: '已提交，等待审核通过后展示' };
    },
    async approve(id) {
      const arr = readLocal(); const c = arr.find(x => x.id === id); if (c) c.status = 1; writeLocal(arr); return { ok: true };
    },
    async reject(id) {
      const arr = readLocal(); const c = arr.find(x => x.id === id); if (c) c.status = -1; writeLocal(arr); return { ok: true };
    }
  };

  // InsForge 真实后端实现（预留，config.commentsBackend='insforge' 时启用）
  // 依赖 Pages Functions：/comments（GET 列表/POST 提交）、/admin/memory-comments（审核）
  async function api(path, method, body) {
    const r = await fetch(path, {
      method, headers: { 'Content-Type': 'application/json' },
      body: body ? JSON.stringify(body) : undefined
    });
    if (!r.ok) throw new Error('HTTP ' + r.status);
    return r.json();
  }
  const insforge = {
    async list(itemId) { const d = await api('/comments?itemId=' + encodeURIComponent(itemId), 'GET'); return d.comments || []; },
    async pending() { const d = await api('/admin/memory-comments?status=0', 'GET'); return d.comments || []; },
    async submit(p) { return api('/comments', 'POST', p); },
    async approve(id) { return api('/admin/memory-comments', 'PUT', { id, status: 1 }); },
    async reject(id) { return api('/admin/memory-comments', 'PUT', { id, status: -1 }); }
  };

  const impl = BACKEND === 'insforge' ? insforge : local;

  return {
    backend: BACKEND,
    list: (id) => impl.list(id),
    pending: () => impl.pending(),
    submit: (p) => impl.submit(p),
    approve: (id) => impl.approve(id),
    reject: (id) => impl.reject(id)
  };
})();
