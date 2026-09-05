// ===== 记忆树 · 帖子存储 =====
// 挂载：window.MTPosts
// 后端可切换：'local'（浏览器 localStorage）| 'insforge'（InsForge 云端，和频道消息同款）
// 切换：window.MT_CONFIG.postsBackend（缺省 insforge）
// 云端表：memory_posts（RLS：全员可读、登录可写、仅管理员可删）
// 前端统一结构：{ id, content, authorName, anonymous, imageUrl, authorId, created_at, isPost, ... }
// 说明：list()/submit() 保持「同步返回」以兼容现有调用方；云端数据通过内存缓存 _cache 镜像，
//       所有写操作乐观更新缓存并后台异步落库，与频道消息体验一致（发完即显示）。

window.MTPosts = (function () {
  const KEY = (window.MT_CONFIG && window.MT_CONFIG.postsStorageKey) || 'mt_posts_v1';
  const BACKEND = (window.MT_CONFIG && window.MT_CONFIG.postsBackend) || 'insforge';

  const db = () => (window.IF && window.IF.insforge) || null;
  function uid() { return 'p_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7); }
  function uuid() {
    try { if (window.crypto && window.crypto.randomUUID) return window.crypto.randomUUID(); } catch (e) {}
    return '10000000-1000-4000-8000-100000000000'.replace(/[0]/g, () =>
      '0123456789abcdef'[Math.floor(Math.random() * 16)]);
  }
  // 云端行 -> 前端对象
  function fromCloud(r) {
    if (!r) return null;
    return {
      id: r.id,
      content: r.content || '',
      title: r.title || '',
      authorName: r.author_name || '匿名同学',
      anonymous: !!r.anonymous,
      imageUrl: r.image_url || '',
      authorId: r.author_id || null,
      reviewed: true,               // 云端已改为先发后审，后台一律显示「已审」
      created_at: Number(r.created_at) || Date.now(),
      isPost: true
    };
  }
  // 前端对象 -> 云端行
  function toCloud(p) {
    return {
      id: p.id,
      content: p.content || '',
      title: p.title || '',
      author_name: p.authorName || '匿名同学',
      anonymous: !!p.anonymous,
      image_url: p.imageUrl || '',
      author_id: p.authorId || null,
      created_at: Number(p.created_at)
    };
  }

  // ---------------- Local ----------------
  const local = {
    _read() { try { return JSON.parse(localStorage.getItem(KEY) || '[]'); } catch (e) { return []; } },
    _write(a) { try { localStorage.setItem(KEY, JSON.stringify(a)); } catch (e) {} },
    list() { return this._read().sort((a, b) => b.created_at - a.created_at); },
    submit({ title, content, authorName, anonymous, imageUrl, authorId }) {
      const arr = this._read();
      const rec = {
        id: uid(), title: (title || '').trim(), content: String(content || '').trim(),
        authorName: anonymous ? '匿名同学' : (authorName || '匿名同学'),
        anonymous: !!anonymous, imageUrl: imageUrl || '', authorId: authorId || null,
        created_at: Date.now(), isPost: true
      };
      arr.push(rec); this._write(arr);
      return { ok: true, post: rec };
    },
    remove(id) { this._write(this._read().filter(p => p.id !== id)); return { ok: true }; },
    markReviewed(id) {
      const a = this._read(); const i = a.findIndex(p => p.id === id);
      if (i >= 0) { a[i].reviewed = true; this._write(a); }
      return { ok: true };
    },
    ensureSeed(seedPosts) {
      const arr = this._read();
      const idx = new Map(arr.map((p, i) => [p.id, i]));
      let changed = false;
      (seedPosts || []).forEach(sp => {
        const i = idx.get(sp.id);
        if (i === undefined) { arr.push(sp); changed = true; }
        else if (sp.seeded) {
          const ex = arr[i]; const nx = { ...ex };
          ['authorName', 'authorId', 'content', 'imageUrl', 'reviewed', 'anonymous', 'seeded'].forEach(k => {
            if (sp[k] !== undefined && sp[k] !== nx[k]) { nx[k] = sp[k]; changed = true; }
          });
          arr[i] = nx;
        }
      });
      if (changed) this._write(arr);
      return { ok: true };
    },
    async removeRemote(id) { return this.remove(id); },
    async refresh() { return this.list(); }
  };

  // ---------------- InsForge 云端（和频道消息同款）----------------
  const cloud = {
    _cache: null,
    async _fetch() {
      const d = db(); if (!d) throw new Error('insforge not ready');
      const r = await d.database.from('memory_posts').select('*').order('created_at', { ascending: false });
      if (r.error) throw r.error;
      return (r.data || []).map(fromCloud).filter(Boolean);
    },
    // 幂等刷新：仅在未加载过时才请求云端，避免后台搜索每次都打网络
    async refresh(force) {
      if (this._cache && !force) return this._cache;
      try { this._cache = await this._fetch(); }
      catch (e) { if (!this._cache) this._cache = []; }
      return this._cache || [];
    },
    list() { return (this._cache || []).slice().sort((a, b) => b.created_at - a.created_at); },
    submit({ title, content, authorName, anonymous, imageUrl, authorId }) {
      const id = uuid();
      const rec = {
        id, title: (title || '').trim(), content: String(content || '').trim(),
        authorName: anonymous ? '匿名同学' : (authorName || '匿名同学'),
        anonymous: !!anonymous, imageUrl: imageUrl || '',
        authorId: authorId || (window.__mtCurrentUserId) || null,
        created_at: Date.now(), isPost: true
      };
      this._cache = this._cache || [];
      this._cache.push(rec);                              // 乐观更新，保持同步返回
      const d = db();
      if (d) {
        d.database.from('memory_posts').insert([toCloud(rec)])
          .then(() => {}).catch(() => { /* 云端失败不影响本地乐观展示，下次 refresh 拉真实数据 */ });
      }
      return { ok: true, post: rec };
    },
    remove(id) {
      this._cache = (this._cache || []).filter(p => p.id !== id);
      const d = db();
      if (d) d.database.from('memory_posts').delete().eq('id', id).then(() => {}).catch(() => {});
      return { ok: true };
    },
    markReviewed(id) { return { ok: true }; },            // 云端先发后审，无需审核
    // 云端已有种子（7 篇）。若云端为空则自动补种，使用真实 UUID，避免与频道/local 的 'seed_' 字符串冲突
    async ensureSeed(seedPosts) {
      try {
        await this.refresh();
        if (this._cache && this._cache.length > 0) return { ok: true, skipped: true };
        const toInsert = (seedPosts || []).map(sp => toCloud({
          id: uuid(),
          content: sp.content || sp.title || '校园记忆',
          authorName: sp.authorName || '管理员T0',
          anonymous: false,
          imageUrl: sp.imageUrl || sp.url || '',
          authorId: sp.authorId || null,
          created_at: sp.created_at || Date.now()
        }));
        const d = db();
        if (d && toInsert.length) {
          await d.database.from('memory_posts').insert(toInsert).then(() => {}).catch(() => {});
          await this.refresh(true);
        }
      } catch (e) { /* 种子失败不影响主流程 */ }
      return { ok: true };
    },
    async removeRemote(id) { return this.remove(id); }
  };

  const impl = BACKEND === 'insforge' ? cloud : local;
  return {
    backend: BACKEND,
    list: (...a) => impl.list(...a),
    submit: (...a) => impl.submit(...a),
    remove: (...a) => impl.remove(...a),
    markReviewed: (...a) => impl.markReviewed(...a),
    ensureSeed: (...a) => impl.ensureSeed(...a),
    removeRemote: (...a) => impl.removeRemote(...a),
    refresh: (...a) => impl.refresh ? impl.refresh(...a) : Promise.resolve(impl.list())
  };
})();
