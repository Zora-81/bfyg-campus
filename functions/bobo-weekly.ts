// 啵宝周报（InsForge Edge Function，由 schedules 每周日 18:00 触发，也可手动 POST）
// 流程：7天统计 → TOP3热评+话痨频道+新人 → AI 啵宝口吻长文 → bobo_send 到综合大厅 → 自评论1条
// 防重：bobo_reply_log 里 kind='weekly' 按自然周唯一
// @ts-nocheck
const BASE = Deno.env.get('INSFORGE_BASE_URL') || 'https://r683ebwu.ap-southeast.insforge.app';
const ANON = Deno.env.get('ANON_KEY') || 'anon_a09338fe0bdb3e2a0797c92a73a8431ddae4b38f7b12333fe41ebbeccba6e2ea';
const SERVICE = Deno.env.get('SERVICE_KEY') || Deno.env.get('INSFORGE_API_KEY') || '';
const OR_KEY = Deno.env.get('BOBO_OPENROUTER_KEY') || '';
const GENERAL_HALL = '839fc0d0-3641-49ea-9702-f2570fd34e31'; // 综合大厅
const MODELS = ['minimax/minimax-m3:free', 'minimax/minimax-m2.7:free', 'nvidia/nemotron-3-super-120b-a12b:free', 'inclusionai/ling-3.0-flash-sante:free'];

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

const PERSONA = [
  '你是啵宝，宝丰一高校园频道的吉祥物，住在这里的Q版小圆球学妹。现在要写每周日的「啵宝周报」。',
  '要求：',
  '1. 长文（300-500字），分小节，用 🌟🔥👑💬😴 等emoji做小标题。',
  '2. 语气调皮可爱元气，每节都要有颜文字或emoji，高中生语感，不是客服。',
  '3. 数据少就卖萌圆场（"这周大家比较安静，啵宝数了三遍才数完 (｡•́︿•̀｡)"）。',
  '4. 点名热评时引用原话+作者昵称+赞数，语气是捧场不是评判。',
  '5. 结尾号召大家下周多交流（啵宝会看着大家的！）。',
  '6. 直接输出周报正文，不要前后缀引号说明。',
].join('\n');

function json(resp, status) {
  return new Response(JSON.stringify(resp), { status: status || 200, headers: Object.assign({}, CORS, { 'Content-Type': 'application/json' }) });
}

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

async function aiChat(messages, maxTokens) {
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
        if (text.trim()) return text.trim();
      }
    } catch (e) { /* 下一个 */ }
  }
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
          if (text.trim()) return text.trim();
        }
      } catch (e) { /* 下一个 */ }
    }
  }
  return null;
}

function weekKey(d) {
  const dt = new Date(d);
  const jan1 = new Date(dt.getFullYear(), 0, 1);
  const week = Math.ceil((((dt - jan1) / 86400000) + jan1.getDay() + 1) / 7);
  return dt.getFullYear() + '-W' + week;
}

export default async function (req) {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });
  if (req.method !== 'POST') return json({ error: 'method' }, 405);

  try {
    // 0. 开关
    const cfgRows = await restSelect('bobo_config?select=enabled&id=eq.1').catch(() => []);
    if (cfgRows && cfgRows[0] && cfgRows[0].enabled === false) return json({ ok: false, why: 'disabled' });

    // 1. 防重：本周已发过就跳过
    const wk = weekKey(new Date());
    const recent = await restSelect('bobo_reply_log?select=note&kind=eq.weekly&order=created_at.desc&limit=4').catch(() => []);
    if (Array.isArray(recent) && recent.some((r) => r.note === wk)) {
      return json({ ok: false, why: 'already-sent', week: wk });
    }

    // 2. 统计过去7天
    const since = new Date(Date.now() - 7 * 86400000).toISOString();
    let stats = { total: 0, channels: [], top: [], newbies: [], quietest: '—' };
    try {
      const msgs = await restSelect('messages?select=id,channel_id,author_id,content,created_at&parent_id=is.null&created_at=gte.' + since + '&order=created_at.asc&limit=2000');
      if (Array.isArray(msgs)) {
        stats.total = msgs.length;
        const chans = await restSelect('channels?select=id,name').catch(() => []);
        const chName = (id) => { const c = chans.find((x) => x.id === id); return (c && c.name) || '未知频道'; };
        const byCh = {};
        const byDay = {};
        for (const m of msgs) {
          byCh[m.channel_id] = (byCh[m.channel_id] || 0) + 1;
          const d = new Date(m.created_at);
          const day = String(d.getMonth() + 1) + '/' + String(d.getDate());
          byDay[day] = (byDay[day] || 0) + 1;
        }
        stats.channels = Object.entries(byCh).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([id, n]) => chName(id) + '（' + n + '句）');
        const quiet = Object.entries(byDay).sort((a, b) => a[1] - b[1])[0];
        if (quiet) stats.quietest = quiet[0] + '（只有' + quiet[1] + '句）';
        // TOP3 热评（点赞聚合；表不存在则跳过）
        try {
          const likes = await restSelect('message_interactions?select=message_id&kind=eq.like&created_at=gte.' + since + '&limit=1000').catch(() => []);
          if (Array.isArray(likes) && likes.length) {
            const cnt = {};
            for (const l of likes) cnt[l.message_id] = (cnt[l.message_id] || 0) + 1;
            const topIds = Object.entries(cnt).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([id]) => id);
            const who = await restSelect('profiles?select=id,nickname').catch(() => []);
            stats.top = topIds.map((id) => {
              const m = msgs.find((x) => x.id === id);
              if (!m) return null;
              const p = who.find((x) => x.id === m.author_id);
              return { nick: (p && p.nickname) || '同学', content: String(m.content).slice(0, 60), likes: cnt[id] };
            }).filter(Boolean);
          }
        } catch (e) { /* 点赞表不可用 */ }
        // 本周新人
        try {
          const who = await restSelect('profiles?select=id,nickname,created_at,role&role=neq.ai').catch(() => []);
          stats.newbies = who.filter((p) => p.created_at && p.created_at >= since).slice(0, 3).map((p) => p.nickname || '新同学');
        } catch (e) {}
      }
    } catch (e) { /* 统计失败也照发，卖萌圆场 */ }

    // 3. AI 生成周报
    const dataBrief = JSON.stringify(stats);
    const weekly = await aiChat([
      { role: 'system', content: PERSONA },
      { role: 'user', content: '这是过去7天的频道数据（JSON）：\n' + dataBrief + '\n\n请生成本周「啵宝周报」长文。' },
    ], 900);
    if (!weekly || weekly.length < 80) return json({ ok: false, why: 'ai-down' });

    // 4. 发到综合大厅
    const msgId = await rpc('bobo_send', { p_channel_id: GENERAL_HALL, p_content: weekly });

    // 5. 自评论 1 条号召交流
    let commentId = null;
    try {
      const selfC = '看完记得冒个泡呀！你本周最难忘的一句话是什么？评论区交给你们啦，啵宝搬好小板凳等着 (๑•̀ㅂ•́)و✧🍿';
      commentId = await rpc('bobo_send', { p_channel_id: GENERAL_HALL, p_content: selfC, p_parent_id: String(msgId) });
    } catch (e) { /* 自评论失败不影响周报 */ }

    // 6. 记账 + 记忆衰减
    await rpc('bobo_log', { p_kind: 'weekly', p_ok: true, p_model: 'weekly', p_channel: GENERAL_HALL, p_note: wk }).catch(() => {});
    await rpc('bobo_memory_decay', {}).catch(() => {});

    return json({ ok: true, week: wk, messageId: msgId, commentId, preview: weekly.slice(0, 120) });
  } catch (e) {
    return json({ ok: false, why: 'exception', detail: String(e).slice(0, 200) }, 200);
  }
}
