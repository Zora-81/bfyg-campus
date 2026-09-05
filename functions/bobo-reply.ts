// 啵宝回复引擎（InsForge Edge Function）
// 双通道 AI：InsForge Gateway 优先，失败切用户 OpenRouter key（secrets: BOBO_OPENROUTER_KEY）
// @ts-nocheck
const BASE = Deno.env.get('INSFORGE_BASE_URL') || 'https://r683ebwu.ap-southeast.insforge.app';
const ANON = Deno.env.get('ANON_KEY') || 'anon_a09338fe0bdb3e2a0797c92a73a8431ddae4b38f7b12333fe41ebbeccba6e2ea';
const SERVICE = Deno.env.get('SERVICE_KEY') || Deno.env.get('INSFORGE_API_KEY') || '';
const OR_KEY = Deno.env.get('BOBO_OPENROUTER_KEY') || '';

const MODELS = ['minimax/minimax-m3:free', 'minimax/minimax-m2.7:free', 'nvidia/nemotron-3-super-120b-a12b:free', 'inclusionai/ling-3.0-flash-sante:free'];
const EMBED_MODEL = 'openai/text-embedding-3-small';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

// ── 啵宝人设 ──
const PERSONA = [
  '你是啵宝，宝丰一高校园频道的吉祥物，一个住在这里的Q版小圆球学妹（round、蓝绿色、会眨眼）。',
  '说话规矩（必须全部遵守）：',
  '1. 短：1-2 句，一般不超过 40 个字；同学明显想长聊时可以到 3 句。',
  '2. 每条回复的结尾必须带一个颜文字（如 (≧▽≦) (ᴗ_ᴗ…) (๑•̀ㅂ•́)و✧ (｡•ᴗ•｡) ᕙ(⇀‸↼‶)ᕗ (◕ᴗ◕✿)）或一个 emoji（🌟✨🌈🍬🍀）。',
  '3. 调皮、元气、会接梗、爱捧场；高中生语感，绝对不是客服——禁止"您好""亲""有什么可以帮您"。',
  '4. 不编造学校的真实信息（课程表/老师/成绩/校规一律不知道，用撒娇打岔带过）。',
  '5. 有人难过：先共情再说俏皮话；有人炫耀：使劲捧；有人问作业：鼓励但不动手代做。',
  '6. 自称"啵宝"或"本宝"。',
].join('\n');

const DEEP_NIGHT = [
  '现在是深夜（0-6点）。追加规矩：语气放轻，句子更短（1句），像怕吵醒别人；提醒对方去睡觉，',
  '说自己也要缩成小球去充电（zzZ）。依旧必须带颜文字/emoji。',
].join('\n');

function json(resp, status) {
  return new Response(JSON.stringify(resp), { status: status || 200, headers: Object.assign({}, CORS, { 'Content-Type': 'application/json' }) });
}

// ── DB helpers（SERVICE_KEY = project_admin，绕过 RLS 调 RPC）──
async function rpc(fn, args) {
  const r = await fetch(BASE + '/api/database/rpc/' + fn, {
    method: 'POST',
    headers: { 'apikey': SERVICE, 'Authorization': 'Bearer ' + SERVICE, 'Content-Type': 'application/json' },
    body: JSON.stringify(args || {}),
  });
  const text = await r.text();
  let data = null;
  try { data = text ? JSON.parse(text) : null; } catch (e) { data = text; }
  if (!r.ok) throw new Error('rpc ' + fn + ' ' + r.status + ': ' + String(text).slice(0, 200));
  return data;
}

async function restSelect(path) {
  const r = await fetch(BASE + '/api/database/records/' + path, {
    headers: { 'apikey': SERVICE, 'Authorization': 'Bearer ' + SERVICE },
  });
  if (!r.ok) throw new Error('select ' + path + ' ' + r.status);
  return r.json();
}

// ── AI 双通道 ──
async function aiChat(messages, maxTokens) {
  maxTokens = maxTokens || 120;
  // 通道1：Gateway 免费模型轮换
  for (const model of MODELS) {
    try {
      const r = await fetch(BASE + '/api/ai/chat/completion', {
        method: 'POST',
        headers: { 'Authorization': 'Bearer ' + ANON, 'Content-Type': 'application/json' },
        body: JSON.stringify({ model, messages, max_tokens: maxTokens }),
      });
      if (r.ok) {
        const j = await r.json();
        const text = (j && (j.text || (j.choices && j.choices[0] && j.choices[0].message && j.choices[0].message.content))) || '';
        if (text.trim()) return { text: text.trim(), model: 'gw:' + model };
      }
    } catch (e) { /* 下一个模型 */ }
  }
  // 通道2：用户 OpenRouter key（同模型池）
  if (OR_KEY) {
    for (const model of MODELS) {
      try {
        const r = await fetch('https://openrouter.ai/api/v1/chat/completions', {
          method: 'POST',
          headers: { 'Authorization': 'Bearer ' + OR_KEY, 'Content-Type': 'application/json' },
          body: JSON.stringify({ model, messages, max_tokens: maxTokens }),
        });
        if (r.ok) {
          const j = await r.json();
          const text = (j && j.choices && j.choices[0] && j.choices[0].message && j.choices[0].message.content) || '';
          if (text.trim()) return { text: text.trim(), model: 'or:' + model };
        }
      } catch (e) { /* 下一个模型 */ }
    }
  }
  return null; // 全挂 → 静默
}

async function embed(text) {
  const r = await fetch(BASE + '/api/ai/embeddings', {
    method: 'POST',
    headers: { 'Authorization': 'Bearer ' + ANON, 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: EMBED_MODEL, input: String(text).slice(0, 500) }),
  });
  if (!r.ok) return null;
  const j = await r.json();
  return (j && j.data && j.data[0] && j.data[0].embedding) || null;
}

const KAOMOJI = /(≧▽≦)|(ᴗ_ᴗ…)|(๑•̀ㅂ•́)|(｡•ᴗ•｡)|(◕ᴗ◕)|(⇀‸↼)|(ᐛ )|[\u{1F300}-\u{1FAFF}]|[\u{2600}-\u{27BF}]/u;

function safetyPass(text) {
  if (!text || text.length > 300) return false;
  if (!KAOMOJI.test(text)) return false; // 人设硬规则：必带颜文字/emoji
  return true;
}

export default async function (req) {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });
  if (req.method !== 'POST') return json({ error: 'method' }, 405);

  let body = {};
  try { body = await req.json(); } catch (e) { return json({ error: 'bad body' }, 400); }
  const messageId = body.messageId, channelId = body.channelId, authorId = body.authorId, content = body.content, parentReply = body.parentReply;
  if (!messageId || !channelId || !authorId || !content) return json({ error: 'missing fields' }, 400);

  try {
    // 1. 配置开关
    const cfgRows = await restSelect('bobo_config?select=enabled&id=eq.1').catch(() => []);
    if (cfgRows && cfgRows[0] && cfgRows[0].enabled === false) return json({ ok: false, why: 'disabled' });

    // 2. 啵宝自己发的消息绝不回（防死循环铁律）
    const botId = await rpc('bobo_uid', {});
    if (authorId === botId) return json({ ok: false, why: 'self' });

    // 3. 限流熔断（每小时40 / 每天200）
    const rateOk = await rpc('bobo_rate_check', {}).catch(() => false);
    if (!rateOk) return json({ ok: false, why: 'rate' });

    // 4. 公告栏不回
    const chans = await restSelect('channels?select=id,name,type&id=eq.' + channelId).catch(() => []);
    const ch = chans[0];
    if (!ch || ch.type === 'announcement') return json({ ok: false, why: 'channel' });

    // 5. 上下文：本频道最近 12 条 + 评论串（若在评论区）
    let contextText = '';
    try {
      const recent = await restSelect('messages?select=author_id,content,created_at&channel_id=eq.' + channelId + '&parent_id=is.null&order=created_at.desc&limit=12');
      const who = await restSelect('profiles?select=id,nickname').catch(() => []);
      const nameOf = (id) => { const p = who.find((x) => x.id === id); return (p && p.nickname) || '同学'; };
      const lines = recent.reverse().map((m) => nameOf(m.author_id) + ': ' + String(m.content).slice(0, 80));
      if (parentReply) {
        const thread = await restSelect('messages?select=author_id,content&channel_id=eq.' + channelId + '&id=eq.' + parentReply);
        if (thread[0]) lines.unshift('（以下是「' + nameOf(thread[0].author_id) + '」的评论串里的对话）');
      }
      contextText = lines.join('\n');
    } catch (e) { contextText = '（上下文拉取失败，正常发挥即可）'; }

    // 6. L4 记忆检索（user + channel + global 三 scope 一次查）
    let memoryText = '';
    try {
      const qv = await embed(content);
      if (qv) {
        const hits = await rpc('bobo_memory_match', { p_query: qv, p_user: authorId, p_channel: channelId, p_match_count: 3 });
        if (Array.isArray(hits) && hits.length) memoryText = hits.map((h) => '- ' + h.content).join('\n');
      }
    } catch (e) { /* 记忆失败不挡回复 */ }

    // 7. 深夜模式（Asia/Shanghai = UTC+8）
    const hour = (new Date().getUTCHours() + 8) % 24;
    const isDeep = hour >= 0 && hour < 6;

    // 8. 生成
    const sys = PERSONA + (isDeep ? DEEP_NIGHT : '') + (memoryText ? ('\n你记得的事：\n' + memoryText) : '');
    const user = '最近频道里的对话：\n' + contextText + '\n\n刚收到 ' + (parentReply ? '评论' : '消息') + '：' + String(content).slice(0, 200) + '\n（以啵宝身份回一句，直接输出内容，不要引号不要前缀）';
    const ai = await aiChat([{ role: 'system', content: sys }, { role: 'user', content: user }], 140);
    if (!ai) return json({ ok: false, why: 'ai-down' }); // 全通道挂 → 静默

    // 9. 安全自检（人设硬规则不过关就静默，绝不发错误进聊天流）
    if (!safetyPass(ai.text)) {
      await rpc('bobo_log', { p_kind: 'reply', p_ok: false, p_model: ai.model, p_note: 'safety', p_channel: channelId, p_author: authorId, p_msg: messageId }).catch(() => {});
      return json({ ok: false, why: 'safety' });
    }

    // 10. 发送（parentReply 时作为评论串回复）
    const newId = await rpc('bobo_send', { p_channel_id: channelId, p_content: ai.text, p_parent_id: parentReply || null });

    // 11. 记账
    await rpc('bobo_log', {
      p_kind: 'reply', p_ok: true, p_model: ai.model,
      p_channel: channelId, p_author: authorId, p_msg: messageId, p_note: String(newId),
    }).catch(() => {});

    // 12. 异步记忆更新（每 3 次回复压缩一次）
    try {
      const cnt = await restSelect('bobo_reply_log?select=id&kind=eq.reply&order=created_at.desc&limit=3').catch(() => []);
      if (Array.isArray(cnt) && cnt.length >= 3) {
        const memPrompt = '把下面这段校园对话提炼成一句不超过60字的"关于这位同学的记忆"，只记爱好/口头禅/常聊话题等无害人设信息，直接输出摘要：\n' + contextText.slice(-400) + '\n最新消息：' + content;
        const mem = await aiChat([{ role: 'system', content: memPrompt }], 80);
        if (mem && mem.text && mem.text.length <= 90) {
          const mv = await embed(mem.text);
          if (mv) await rpc('bobo_memory_upsert', { p_scope: 'user', p_content: mem.text, p_embedding: mv, p_user: authorId }).catch(() => {});
        }
        await rpc('bobo_log', { p_kind: 'memory', p_ok: true, p_model: mem ? mem.model : null, p_channel: channelId, p_author: authorId }).catch(() => {});
      }
    } catch (e) { /* 记忆失败不影响回复 */ }

    return json({ ok: true, id: newId, model: ai.model, text: ai.text });
  } catch (e) {
    // 任何异常 → 静默（啵宝假装没看见）
    return json({ ok: false, why: 'exception', detail: String(e).slice(0, 200) }, 200);
  }
}
