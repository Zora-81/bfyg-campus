// @ts-nocheck
// 同域图片代理（根治 canvas 读像素的 CORS 问题）
// 调用方（浏览器）通过同域命中本函数：
//   GET https://bfgzlt.cc.cd/img?u=<encodeURIComponent(图片URL)>
// 服务端拉取上游图片（api.bfgzlt.cc.cd 反代 / 同域静态资源），
// 再同域回传。这样 <img>/<canvas> 从「同域」加载，无需 CORS 即可 getImageData，
// 粒子读信页和记忆树照片节点都能正常采样像素。
//
// 仅放行本项目域名（api.bfgzlt.cc.cd / bfgzlt.cc.cd），避免成为开放代理。
// 对 api.bfgzlt.cc.cd 的存储请求先不携带鉴权；若被 401/402/403 拒绝，再依次尝试 anon / service key。

const ALLOWED_HOSTS = ['api.bfgzlt.cc.cd', 'bfgzlt.cc.cd', 'localhost', '127.0.0.1'];
const INSFORGE_ANON_KEY = 'anon_a09338fe0bdb3e2a0797c92a73a8431ddae4b38f7b12333fe41ebbeccba6e2ea';
// 存储桶部分文件需要 service_role 权限（anon 返回 402），用 service key 代理拉取
const INSFORGE_SERVICE_KEY = 'ik_fa7b403d7e7eac279f0c2c681e32f69b';

export async function onRequest(context: any): Promise<Response> {
  const req = context.request;
  const url = new URL(req.url);
  const target = url.searchParams.get('u');
  if (!target) return new Response('missing u', { status: 400 });

  let t: URL;
  try { t = new URL(target); } catch (e) { return new Response('bad url', { status: 400 }); }
  if (!/^https?:$/.test(t.protocol) || ALLOWED_HOSTS.indexOf(t.hostname) < 0) {
    return new Response('forbidden host', { status: 403 });
  }

  // 上游（api.bfgzlt.cc.cd）实际位于 AWS CloudFront 之后，其 WAF 会拦截来自
  // Cloudflare Worker 的默认 UA（无浏览器标识）。补齐浏览器级请求头，避免 403。
  function baseHeaders(key?: string | null): Record<string, string> {
    const headers: Record<string, string> = {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x 64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
      'Accept': 'image/avif,image/webp,image/*,*/*;q=0.8',
      'Referer': 'https://bfgzlt.cc.cd/'
    };
    if (key) {
      headers['Authorization'] = `Bearer ${key}`;
      headers['apikey'] = key;
    }
    return headers;
  }

  // 存储桶公开时不需要 Authorization；误带 service/anon key 反而可能被上游拒绝(403)。
  // 因此先以无鉴权 + anon + service 依次尝试，只有 401/402/403 才继续换 key。
  const keyCandidates = t.hostname === 'api.bfgzlt.cc.cd'
    ? [null, INSFORGE_ANON_KEY, INSFORGE_SERVICE_KEY]
    : [null];

  async function fetchUpstream() {
    let lastRes: Response | null = null;
    for (const key of keyCandidates) {
      const r = await fetch(t.toString(), { redirect: 'follow', headers: baseHeaders(key) });
      if (r.ok) return r;
      lastRes = r;
      // 非鉴权类错误直接透传，不要再换 key
      if (r.status !== 401 && r.status !== 402 && r.status !== 403) return r;
      // 释放失败响应体，继续尝试下一个 key
      try { await r.body?.cancel(); } catch (e) {}
    }
    return lastRes as Response;
  }

  try {
    const r = await fetchUpstream();
    const respHeaders = new Headers();
    const ct = r.headers.get('content-type');
    if (ct) respHeaders.set('content-type', ct);
    // 关键：前端 three-scene.js 用 crossOrigin='anonymous' 加载图片以便 Canvas 读像素，
    // 浏览器在 CORS 模式下要求响应带 Access-Control-Allow-Origin，否则图片加载失败 → onerror。
    // 本项目图片来自同域 /img，补 CORS 头让 crossOrigin 模式顺利通过。
    respHeaders.set('access-control-allow-origin', '*');
    respHeaders.set('access-control-allow-methods', 'GET, HEAD, OPTIONS');
    respHeaders.set('access-control-allow-headers', 'authorization, apikey, content-type');
    respHeaders.set('cross-origin-resource-policy', 'cross-origin');
    // 图片长期缓存（内容不变）
    respHeaders.set('cache-control', 'public, max-age=86400, immutable');
    return new Response(r.body, { status: r.status, headers: respHeaders });
  } catch (e) {
    return new Response('fetch failed', { status: 502 });
  }
}
