// @ts-nocheck
// 管理员删除用户的 Edge Function
// 调用方（管理员浏览器）通过 fetch 直接命中本函数：
//   POST https://bfgzlt.cc.cd/admin-delete-user  body: { userId, adminId }
// 服务端校验 adminId 对应的 profiles.role === 'admin'，
// 再用 service key 调 public.delete_user RPC 删除 auth.users（级联清理应用数据）。
//
// 为什么走 RPC：InsForge 的 PostgREST 只暴露 public schema，直接用
// .schema('auth').from('users').delete() 会报
// "The schema must be one of the following: public"。
// 故改为在 public.delete_user（SECURITY DEFINER）内 DELETE auth.users，
// 这跟项目里 apply_moderation / overturn_moderation 是同一套成熟模式。
// 依赖：需先在 InsForge 执行 migrations/2026-08-13-delete-user-rpc.sql 部署该函数。

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

export async function onRequest(context: any): Promise<Response> {
  const req = context.request;
  const env = context.env || {};
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'method not allowed' }), { status: 405, headers: { ...CORS, 'Content-Type': 'application/json' } });
  }

  const base = env.INSFORGE_BASE_URL || 'https://r683ebwu.ap-southeast.insforge.app';
  const anon = env.ANON_KEY || 'anon_a09338fe0bdb3e2a0797c92a73a8431ddae4b38f7b12333fe41ebbeccba6e2ea';
  const serviceKey = env.SERVICE_KEY || 'ik_fa7b403d7e7eac279f0c2c681e32f69b';

  let body: Record<string, unknown>;
  try { body = await req.json(); } catch {
    return new Response(JSON.stringify({ error: 'bad json' }), { status: 400, headers: { ...CORS, 'Content-Type': 'application/json' } });
  }

  const userId = body.userId as string;
  const adminId = body.adminId as string;

  if (!userId || !adminId) {
    return new Response(JSON.stringify({ error: 'missing params' }), { status: 400, headers: { ...CORS, 'Content-Type': 'application/json' } });
  }

  // 禁止管理员删除自己，避免误操作把自己锁在门外
  if (userId === adminId) {
    return new Response(JSON.stringify({ error: '不能删除当前登录的管理员账号' }), { status: 400, headers: { ...CORS, 'Content-Type': 'application/json' } });
  }

  // ── 校验调用者确为管理员 ──
  try {
    const verUrl = `${base}/api/database/records/profiles?select=role&id=eq.${encodeURIComponent(adminId)}&limit=1`;
    const vRes = await fetch(verUrl, {
      headers: { 'apikey': serviceKey, 'Authorization': `Bearer ${serviceKey}`, 'Content-Type': 'application/json' },
    });
    const vJson = await vRes.json();
    const prof = Array.isArray(vJson) ? vJson[0] : (vJson && vJson.data && vJson.data[0]);
    if (!prof || prof.role !== 'admin') {
      return new Response(JSON.stringify({ error: '无管理员权限', debug: prof }), { status: 403, headers: { ...CORS, 'Content-Type': 'application/json' } });
    }
  } catch (e) {
    return new Response(JSON.stringify({ error: '鉴权失败', detail: String(e) }), { status: 403, headers: { ...CORS, 'Content-Type': 'application/json' } });
  }

  // ── 用 service key 调 public.delete_user RPC 删除 auth.users（级联清理依赖数据）──
  // RPC 在 public schema，绕开 "schema must be one of the following: public" 限制。
  try {
    const delUrl = `${base}/api/database/rpc/delete_user`;
    const delRes = await fetch(delUrl, {
      method: 'POST',
      headers: {
        'apikey': serviceKey,
        'Authorization': `Bearer ${serviceKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ p_user_id: userId }),
    });
    const delText = await delRes.text();
    let delJson = null;
    try { delJson = JSON.parse(delText); } catch { /* 非 JSON 响应 */ }

    if (!delRes.ok) {
      // 404 / function does not exist = RPC 尚未部署
      if (delRes.status === 404 || /delete_user.*does not exist/i.test(delText)) {
        return new Response(JSON.stringify({
          error: '删除函数未部署',
          detail: '请在 InsForge 项目执行：insforge db migrations up（或 db query 应用 migrations/20260813214000_delete-user-rpc.sql）',
        }), { status: 500, headers: { ...CORS, 'Content-Type': 'application/json' } });
      }
      return new Response(JSON.stringify({ error: '删除失败', detail: delText || ('HTTP ' + delRes.status) }), { status: 500, headers: { ...CORS, 'Content-Type': 'application/json' } });
    }

    const ok = !!(delJson && (delJson.ok === true || (delJson.data && delJson.data.ok === true)));
    if (!ok) {
      return new Response(JSON.stringify({ error: '删除失败', detail: JSON.stringify(delJson) }), { status: 500, headers: { ...CORS, 'Content-Type': 'application/json' } });
    }

    console.log(`[admin-delete-user] 管理员 ${adminId} 删除了用户 ${userId}`);
    return new Response(JSON.stringify({ ok: true }), { status: 200, headers: { ...CORS, 'Content-Type': 'application/json' } });
  } catch (e) {
    console.error('[admin-delete-user] 异常', e);
    return new Response(JSON.stringify({ error: '服务器异常', detail: String(e) }), { status: 500, headers: { ...CORS, 'Content-Type': 'application/json' } });
  }
}
