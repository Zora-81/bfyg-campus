// @ts-nocheck
import { createClient, createAdminClient } from 'npm:@insforge/sdk';
import bcrypt from 'npm:bcryptjs@2.4.3';

// 管理员重置用户密码的 Edge Function
// 调用方（管理员浏览器）通过 IF.functions.invoke 传入：
//   { userId, newPassword, adminId }
// 服务端校验 adminId 对应的 profiles.role === 'admin'，
// 再用 service key 把 bcrypt 哈希直写 auth.users.password（绕过 API 强度校验，
// 因为这里是受信任的服务端直接写库，给予管理员设定任意密码的能力）。

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
  // service key 拥有 auth schema 写入权限（服务端保密，不进浏览器）
  const serviceKey = Deno.env.get('SERVICE_KEY') || 'ik_fa7b403d7e7eac279f0c2c681e32f69b';

  let body: Record<string, unknown>;
  try { body = await req.json(); } catch {
    return new Response(JSON.stringify({ error: 'bad json' }), { status: 400, headers: { ...CORS, 'Content-Type': 'application/json' } });
  }

  const userId = body.userId as string;
  const newPassword = (body.newPassword as string) || '';
  const adminId = body.adminId as string;

  if (!userId || !adminId) {
    return new Response(JSON.stringify({ error: 'missing params' }), { status: 400, headers: { ...CORS, 'Content-Type': 'application/json' } });
  }
  if (newPassword.length < 6) {
    return new Response(JSON.stringify({ error: '密码至少 6 位' }), { status: 400, headers: { ...CORS, 'Content-Type': 'application/json' } });
  }

  // ── 校验调用者确为管理员（原生 fetch + service key 双 header，与实测成功的 API 一致）──
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

  // ── 生成 bcrypt 哈希并直写 auth.users ──
  try {
    const hash = bcrypt.hashSync(newPassword, 10);
    const admin = createAdminClient({ apiKey: serviceKey });
    const { error } = await admin.database
      .schema('auth')
      .from('users')
      .update({ password: hash })
      .eq('id', userId);
    if (error) {
      console.error('[admin-reset-password] 写库失败', error);
      return new Response(JSON.stringify({ error: '重置失败', detail: error.message || String(error) }), { status: 500, headers: { ...CORS, 'Content-Type': 'application/json' } });
    }
    return new Response(JSON.stringify({ ok: true }), { status: 200, headers: { ...CORS, 'Content-Type': 'application/json' } });
  } catch (e) {
    console.error('[admin-reset-password] 异常', e);
    return new Response(JSON.stringify({ error: '服务器异常', detail: String(e) }), { status: 500, headers: { ...CORS, 'Content-Type': 'application/json' } });
  }
}
