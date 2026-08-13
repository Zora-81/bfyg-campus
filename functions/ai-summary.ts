// @ts-nocheck
// 记忆树 · AI 摘要代理（Pages Function）
// 服务端持有 ANON_KEY，前端不暴露。优先尝试 Agnes AI（环境变量），兜底 InsForge AI Gateway。
// 前端：POST /ai-summary { title, location, year } -> { summary, tags[] }

// 环境变量改在 onRequest 内从 context.env 读取（Workers 运行时无 Deno）

const SYS = `你是宝丰一高校园频道的「记忆档案员」。
用户会给你一段校园记忆的标题、地点、年份。请你：
1. 写一段 2-4 句、温暖有画面感的记忆摘要，像在翻开一本青春相册。
2. 给出 2-4 个标签（短词，如「毕业」「晚自习」「操场」）。
严格只输出一个 JSON，不要任何额外文字：
{"summary": "摘要文字", "tags": ["标签1","标签2"]}`;

function jsonFrom(text) {
  const m = text.match(/\{[\s\S]*\}/);
  if (!m) return null;
  try { return JSON.parse(m[0]); } catch { return null; }
}

export async function onRequest(context: any): Promise<Response> {
  const env = context.env || {};
  const req = context.request;
  const AGNES_BASE = env.AGNES_BASE_URL || '';
  const AGNES_KEY = env.AGNES_API_KEY || '';
  const BASE = env.INSFORGE_BASE_URL || 'https://r683ebwu.ap-southeast.insforge.app';
  const ANON = env.ANON_KEY || 'anon_a09338fe0bdb3e2a0797c92a73a8431ddae4b38f7b12333fe41ebbeccba6e2ea';
  const MODEL = env.AI_MODEL || 'openai/gpt-4o-mini';
  const cors = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  };
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
  if (req.method !== 'POST') return new Response(JSON.stringify({ error: 'method' }), { status: 405, headers: cors });

  let body: Record<string, unknown> = {};
  try { body = await req.json(); } catch {}
  const title = (body.title as string) || '';
  const location = (body.location as string) || '';
  const year = (body.year as string) || '';
  if (!title) return new Response(JSON.stringify({ error: 'missing title' }), { status: 400, headers: cors });

  const user = `请为这段校园记忆生成摘要与标签：\n标题：${title}\n地点：${location}\n年份：${year}`;

  // 优先 Agnes AI
  if (AGNES_BASE && AGNES_KEY) {
    try {
      const r = await fetch(`${AGNES_BASE}/chat/completions`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${AGNES_KEY}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: env.AGNES_MODEL || 'agnes-2.0-flash',
          messages: [{ role: 'system', content: SYS }, { role: 'user', content: user }],
        }),
      });
      const j = await r.json();
      const text = j?.choices?.[0]?.message?.content || '';
      const parsed = jsonFrom(text);
      if (parsed?.summary) return new Response(JSON.stringify(parsed), { status: 200, headers: { ...cors, 'Content-Type': 'application/json' } });
    } catch (e) { console.error('[ai-summary] Agnes 失败，兜底', e); }
  }

  // 兜底 InsForge AI Gateway
  try {
    const r = await fetch(`${BASE}/api/ai/chat/completion`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${ANON}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: MODEL, messages: [{ role: 'system', content: SYS }, { role: 'user', content: user }] }),
    });
    const j = await r.json();
    const text = j?.text || j?.choices?.[0]?.message?.content || '';
    const parsed = jsonFrom(text);
    if (parsed?.summary) return new Response(JSON.stringify(parsed), { status: 200, headers: { ...cors, 'Content-Type': 'application/json' } });
  } catch (e) { console.error('[ai-summary] InsForge 失败', e); }

  return new Response(JSON.stringify({ error: 'ai failed' }), { status: 502, headers: cors });
}
