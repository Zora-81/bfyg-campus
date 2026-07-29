// ===== 记忆树 · 用户留言（本地 localStorage 后端）=====
// 挂载：window.MTPosts
// 结构：{ id, content, authorName, anonymous, created_at }
// 后续可切 InsForge 真实后端：替换此模块实现即可。

window.MTPosts = (function () {
  const KEY = (window.MT_CONFIG && window.MT_CONFIG.postsStorageKey) || 'mt_posts_v1';

  function read() {
    try { return JSON.parse(localStorage.getItem(KEY) || '[]'); } catch (e) { return []; }
  }
  function write(arr) {
    try { localStorage.setItem(KEY, JSON.stringify(arr)); } catch (e) {}
  }
  const uid = () => 'p_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);

  return {
    list() { return read().sort((a, b) => b.created_at - a.created_at); },
    submit({ content, authorName, anonymous, imageUrl, authorId }) {
      const arr = read();
      const rec = {
        id: uid(), content: String(content).trim(),
        authorName: anonymous ? '匿名同学' : (authorName || '匿名同学'),
        anonymous: !!anonymous, imageUrl: imageUrl || '', authorId: authorId || null,
        created_at: Date.now()
      };
      arr.push(rec); write(arr);
      return { ok: true, post: rec };
    },
    remove(id) {
      const arr = read().filter(p => p.id !== id);
      write(arr);
      return { ok: true };
    },
    markReviewed(id) {
      const arr = read();
      const i = arr.findIndex(p => p.id === id);
      if (i >= 0) { arr[i].reviewed = true; write(arr); }
      return { ok: true };
    },
    // 首次进入时把预设照片种子为真实帖子；已存在的种子帖也会同步最新字段（作者、文案等更新可自动落地）
    ensureSeed(seedPosts) {
      const arr = read();
      const idxById = new Map(arr.map((p, i) => [p.id, i]));
      let changed = false;
      (seedPosts || []).forEach(sp => {
        const i = idxById.get(sp.id);
        if (i === undefined) {
          arr.push(sp);
          changed = true;
        } else if (sp.seeded) {
          // 种子帖：覆盖可能过时的 authorName / authorId / content / imageUrl / reviewed
          const existing = arr[i];
          const next = { ...existing };
          ['authorName', 'authorId', 'content', 'imageUrl', 'reviewed', 'anonymous', 'seeded'].forEach(k => {
            if (sp[k] !== undefined && sp[k] !== next[k]) { next[k] = sp[k]; changed = true; }
          });
          arr[i] = next;
        }
      });
      if (changed) write(arr);
      return { ok: true };
    },
    // 后端（InsForge）删除占位：后端就绪后在此实现，前端已预留调用点
    async removeRemote(id) { return { ok: true, skipped: true }; }
  };
})();
