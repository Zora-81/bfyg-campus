// @ts-nocheck
import { createClient } from 'npm:@insforge/sdk';

// 管理员删除用户的 Edge Function
// 调用方（管理员浏览器）通过 IF.functions.invoke 传入：
//   { userId, adminId }
// 服务端校验 adminId 对应的 profiles.role === 'admin'，
// 再用 service key 删除 auth.users 记录。
// 由于 public.profiles/messages/channel_members/notifications 等表均对 auth.users(id)
// 声明了 ON DELETE CASCADE / SET NULL，删除 auth 用户会自动级联清理应用数据。

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

export default async function (req: Request): Promise<Response> {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'method not allowed' }), { status: 405, headers: { ...CORS, 'Content-Type': 'application/json' } });
  }

  const base = Deno.env.get('INSFORGE_BASE_URL') || 'https://r683ebwu.ap-southeast.insforge.app';
  const anon = Deno.env.get('ANON_KEY') || 'anon_a09338fe0bdb3e2a0797c92a73a8431ddae4b38f7b12333fe41ebbeccba6e2ea';
  const serviceKey = Deno.env.get('SERVICE_KEY') || 'ik_fa7b403d7e7eac279f0c2c681e32f69b';

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

  // ── 用 service key 删除 auth.users（级联删除依赖数据）──
  try {
    const admin = createClient({ apiKey: serviceKey });
    const { error } = await admin.database
      .schema('auth')
      .from('users')
      .delete()
      .eq('id', userId);

    if (error) {
      console.error('[admin-delete-user] 删除失败', error);
      return new Response(JSON.stringify({ error: '删除失败', detail: error.message || String(error) }), { status: 500, headers: { ...CORS, 'Content-Type': 'application/json' } });
    }

    console.log(`[admin-delete-user] 管理员 ${adminId} 删除了用户 ${userId}`);
    return new Response(JSON.stringify({ ok: true }), { status: 200, headers: { ...CORS, 'Content-Type': 'application/json' } });
  } catch (e) {
    console.error('[admin-delete-user] 异常', e);
    return new Response(JSON.stringify({ error: '服务器异常', detail: String(e) }), { status: 500, headers: { ...CORS, 'Content-Type': 'application/json' } });
  }
}
