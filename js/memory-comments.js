// ===== 记忆树 · 评论客户端 =====
// 后端可切换：'local'（浏览器 localStorage）| 'insforge'（InsForge 云端，和频道消息同款）
// 切换：window.MT_CONFIG.commentsBackend（缺省 insforge）
// 云端表：memory_comments（RLS：已审可见、登录可写、仅管理员可删）
// 发完即显示（status=1），与频道消息一致，不做先审后发。
// 挂载：window.MTComments

window.MTComments = (function () {
  const KEY = (window.MT_CONFIG && window.MT_CONFIG.commentsStorageKey) || 'mt_comments_v1';
  const BACKEND = (window.MT_CONFIG && window.MT_CONFIG.commentsBackend) || 'insforge';

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
      const rec = { id: uid(), itemId, content, authorName: authorName || '匿名同学', authorId: authorId || null, status: 1, created_at: Date.now() };
      arr.push(rec); writeLocal(arr);
      return { ok: true, status: 1, message: '评论已发布' };
    },
    async approve(id) {
      const arr = readLocal(); const c = arr.find(x => x.id === id); if (c) c.status = 1; writeLocal(arr); return { ok: true };
    },
    async reject(id) {
      const arr = readLocal(); const c = arr.find(x => x.id === id); if (c) c.status = -1; writeLocal(arr); return { ok: true };
    }
  };

  // InsForge 云端实现（和频道消息同款，直接走 SDK，不依赖 Pages Functions）
  // 表：memory_comments（item_id 关联 memory_posts.id）
  const cloud = {
    _db() { return (window.IF && window.IF.insforge) || null; },
    _fromCloud(r) {
      return { id: r.id, content: r.content, author_name: r.author_name, created_at: Number(r.created_at) || Date.now() };
    },
    async list(itemId) {
      const d = this._db(); if (!d) return [];
      const r = await d.database.from('memory_comments')
        .select('*').eq('item_id', itemId).order('created_at', { ascending: true });
      if (r.error) return [];
      return (r.data || []).map(c => this._fromCloud(c));
    },
    async pending() { return []; },   // 已取消审核，无待审队列
    async submit({ itemId, content, authorName, authorId }) {
      const d = this._db(); if (!d) return { ok: false };
      let id;
      try { if (window.crypto && window.crypto.randomUUID) id = window.crypto.randomUUID(); } catch (e) {}
      if (!id) id = 'c_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
      const rec = {
        id, item_id: itemId, content: String(content).trim(),
        author_name: authorName || '匿名同学',
        author_id: authorId || (window.__mtCurrentUserId) || null,
        status: 1, created_at: Date.now()
      };
      const r = await d.database.from('memory_comments').insert([rec]).select();
      if (r.error) return { ok: false, error: r.error };
      return { ok: true, status: 1, message: '评论已发布' };
    },
    async approve(id) { return { ok: true }; },
    async reject(id) { return { ok: true }; }
  };

  const impl = BACKEND === 'insforge' ? cloud : local;

  return {
    backend: BACKEND,
    list: (id) => impl.list(id),
    pending: () => impl.pending(),
    submit: (p) => impl.submit(p),
    approve: (id) => impl.approve(id),
    reject: (id) => impl.reject(id),
    refresh: () => Promise.resolve()
  };
})();
