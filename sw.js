// 校园频道 Service Worker — 本地缓存，二次打开零网络
// 策略：
//  - 同源静态资源（带哈希的 js/css/images/lib/audio）：cache-first，离线也能开首屏
//  - 跨域图片（api.bfgzlt.cc.cd，Worker 代理）：cache-first（内容不变，Worker 已加 immutable）
//    <img> 请求为 no-cors，响应在 SW 内是 opaque，Cache API 可存（仅大小惩罚，可接受）
//  - 不缓存 HTML 文档（交给 var v 反缓存机制）与 POST/API 请求

const APP_CACHE = 'campus-app-v5';
const IMG_CACHE = 'campus-img-v5';
const IMG_HOST = 'api.bfgzlt.cc.cd';
const IMG_RE = /\.(jpg|jpeg|png|webp|gif|avif)(\?|$)/i;

self.addEventListener('install', () => self.skipWaiting());

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(
      keys.filter((k) => k !== APP_CACHE && k !== IMG_CACHE).map((k) => caches.delete(k))
    );
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);

  // 跨域图片：cache-first（图片内容不变，缓存一次后二次打开零网络）
  if (url.host === IMG_HOST && IMG_RE.test(url.pathname)) {
    event.respondWith((async () => {
      const cache = await caches.open(IMG_CACHE);
      const cached = await cache.match(req);
      if (cached) return cached;
      try {
        const resp = await fetch(req);
        // opaque 响应（no-cors 图片）也缓存；配额超限静默失败，不阻断加载
        if (resp && (resp.ok || resp.type === 'opaque')) {
          try { await cache.put(req, resp.clone()); } catch (e) {}
        }
        return resp;
      } catch (e) {
        return cached || Response.error();
      }
    })());
    return;
  }

  // 不缓存 SW 自身，否则旧 SW 会拦截新版 sw.js 导致永远更新失败（含带 query 的注册 URL）
  if (url.pathname === '/sw.js') return;

  // 同源静态资源：network-first（排除 HTML 文档）。
  // 每次都先取最新 js/css，网络失败才回退缓存 —— 保证改动能立即生效，同时保留离线兜底。
  if (url.origin === self.location.origin) {
    const accept = req.headers.get('accept') || '';
    if (accept.includes('text/html')) return;
    event.respondWith((async () => {
      const cache = await caches.open(APP_CACHE);
      try {
        const resp = await fetch(req);
        if (resp && resp.ok) { try { await cache.put(req, resp.clone()); } catch (e) {} }
        return resp;
      } catch (e) {
        const cached = await cache.match(req);
        return cached || Response.error();
      }
    })());
  }
});
