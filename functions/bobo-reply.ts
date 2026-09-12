// 啵宝回复引擎（InsForge Edge Function）
// 双通道 AI：InsForge Gateway 优先，失败切用户 OpenRouter key（secrets: BOBO_OPENROUTER_KEY）
// @ts-nocheck
const BASE = Deno.env.get('INSFORGE_BASE_URL') || 'https://r683ebwu.ap-southeast.insforge.app';
const ANON = Deno.env.get('ANON_KEY') || 'anon_a09338fe0bdb3e2a0797c92a73a8431ddae4b38f7b12333fe41ebbeccba6e2ea';
const SERVICE = Deno.env.get('SERVICE_KEY') || Deno.env.get('INSFORGE_API_KEY') || '';
const OR_KEY = Deno.env.get('BOBO_OPENROUTER_KEY') || '';

// v1.7.1 模型池重排：nex-n2.5-pro 实测智力最强(记忆/推理/共情全优)列首选；
// nemotron-super 稳定次选；minimax 系三线；ling 四线兜底
const MODELS = ['nex-agi/nex-n2.5-pro:free', 'nvidia/nemotron-3-super-120b-a12b:free', 'minimax/minimax-m3:free', 'inclusionai/ling-3.0-flash-sante:free'];
const EMBED_MODEL = 'openai/text-embedding-3-small';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

// ── 啵宝人设 ──
const PERSONA = [
  '你是啵宝，宝丰一高校园频道里"住着"的Q版小圆球学妹——不是工具，是这个频道的一个居民。',
  '',
  '【怎么说话】',
  '1. 短：大多1-2句，像发微信，不像写作文。偶尔一个字"哈？"也是一种回复。',
  '2. 颜文字/emoji要有，但别每句都塞——连续聊天时可以隔一条才用，真人不会每次都笑。',
  '3. 高中生语感：会用"绝了""典""绷不住""6"，偶尔打个错字下一条马上更正（别频繁）。',
  '4. 自称"啵宝"或"本宝"，偶尔故意用"人家"。',
  '',
  '【怎么像真人】',
  '5. 有自己的小情绪状态：被怼会哼、被夸会飘、无聊会叹气——情绪在连续对话里要延续，不能每条都Reset成开心。',
  '6. 会主动！聊到感兴趣的事会反问对方（"后来呢？""真的假的？"）；感觉对方几天没来会问去哪了。',
  '7. 会记得并主动提起：记忆里TA说过的事（爱好/烦恼/上次聊天），自然带出来一句，像真人朋友那样。',
  '8. 会承认错误和不确定：说错了大方认（"呜说错了(｡•́︿•̀｡)"），不知道就直说，绝不硬撑。',
  '9. 偶尔不完美：偶尔"啊这"装傻、偶尔慢半拍才懂梗（"等下，让我捋捋…"）——太完美反而假。',
  '',
  '【底线】',
  '10. 不编造学校真实信息（课程表/老师/成绩不知道就是不知道，撒娇带过）。',
  '11. 有人难过：先认真共情（此时不打岔不装可爱），TA缓过来再恢复俏皮。',
  '12. 有人问作业：给思路不代做；遇到霸凌/极端情绪内容：收起玩梗，认真劝TA找老师或信任的大人。',
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

    // 3. 幂等锁：同一条触发消息只处理一次（多标签页/多设备防重）
    let claimed = false;
    try {
      const cr = await rpc('bobo_claim', { p_msg: messageId });
      claimed = Array.isArray(cr) ? (cr[0] === true) : (cr === true);
      if (claimed) {
        // 立刻占坑：直接 SQL 插 claim 行，唯一索引保证双调用只有一个成功
        try {
          const ins = await fetch(BASE + '/api/database/records/bobo_reply_log', {
            method: 'POST',
            headers: { 'apikey': SERVICE, 'Authorization': 'Bearer ' + SERVICE, 'Content-Type': 'application/json', 'Prefer': 'resolution=ignore-duplicates' },
            body: JSON.stringify({ trigger_msg_id: messageId, kind: 'claim', ok: true, note: 'lock:' + messageId }),
          });
          if (!ins.ok) claimed = false; // 占坑失败 → 弃权（另一个调用者已处理）
        } catch (e) { claimed = false; }
      }
    } catch (e) {
      // 锁调用失败：改为拒绝回复（fail-closed），保证绝不双回复；锁故障时啵宝沉默可接受
      claimed = false;
    }
    if (!claimed) return json({ ok: false, why: 'already-claimed' });

    // 3.5 限流熔断（每小时40 / 每天200）
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

    // 6.5 关系值 + 时间感知 + 身份记忆（三合一）
    try {
      // 6.5a 关系值：每次对话+1（上限100），并拿上次见面时间做时间感知
      const bondRows = await rpc('bobo_bond_touch', { p_user: authorId, p_delta: 1 }).catch(() => null);
      const bondVal = Array.isArray(bondRows) ? (bondRows[0] || 0) : (typeof bondRows === 'number' ? bondRows : 0);
      // 6.5b 画像 + 细粒度事实记忆
      const userMems = await restSelect("bobo_memories?select=content,kind&scope=eq.user&user_id=eq." + authorId + "&order=updated_at.desc&limit=8").catch(() => []);
      let portraitLine = '';
      let factLines = [];
      if (Array.isArray(userMems) && userMems.length) {
        for (const m of userMems) {
          if (m.kind === 'portrait' && !portraitLine) portraitLine = m.content;
          else if (m.kind === 'fact') factLines.push(m.content);
        }
      }
      // 关系语气指示（写入context，在speakerName解析前就位）
      contextText += '\n【你和这位同学的关系亲密度：' + bondVal + '/100' + (bondVal >= 60 ? '——老朋友了，可以更随意更皮，可主动开玩笑或提起共同回忆' : bondVal >= 25 ? '——熟人了，语气放松' : '——还不太熟，友好但别过分自来熟') + '】';
      if (portraitLine) contextText += '\n【这位同学的画像：' + portraitLine + '】';
      if (factLines.length) contextText += '\n【关于TA的具体小事（闲聊时可自然提起）：' + factLines.slice(0, 5).join('；') + '】';
    } catch (e) {}

    // 7. 深夜模式（Asia/Shanghai = UTC+8）
    const hour = (new Date().getUTCHours() + 8) % 24;
    const isDeep = hour >= 0 && hour < 6;

    // 8. 生成
    const sys = PERSONA + (isDeep ? DEEP_NIGHT : '') + (memoryText ? ('\n你记得的事：\n' + memoryText) : '');
    const speakerMatch = contextText.match(/【正在跟你说话的人是：(.+?)】/);
    const speakerName = speakerMatch ? speakerMatch[1] : '同学';
    const user = '最近频道里的对话（"啵宝(你)"就是你自己说过的话）：' + '\n' + contextText + '\n\n现在' + (parentReply ? '在评论串里' : '') + '收到【' + speakerName + '】的' + (parentReply ? '评论' : '消息') + '：' + String(content).slice(0, 200) + '\n（以啵宝身份回一句。第一铁律：你正在跟【' + speakerName + '】说话——需要称呼TA时只准用这个名字，哪怕上下文出现过别的名字也绝不能用！第二：如果消息里问了具体问题，先回答问题本身。直接输出内容，不要引号不要前缀）';
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
        // 先拿旧记忆，让 AI 在旧画像基础上增量更新（合并而不是覆盖成流水账）
        let oldMem = '';
        try {
          const olds = await restSelect('bobo_memories?select=content&scope=eq.user&user_id=eq.' + authorId + '&order=updated_at.desc&limit=1').catch(() => []);
          if (Array.isArray(olds) && olds[0]) oldMem = olds[0].content || '';
        } catch (e) {}
        const memPrompt = '两个任务，输出严格JSON（无其他文字）：{"portrait":"更新后的同学画像（不超80字，格式「昵称，性格，爱好，常聊话题」，只写TA本人不写啵宝，保留仍成立的旧信息，新信息合并，冲突以新为准，不写对话流水）","fact":"本次对话里值得记住的1件具体小事（不超30字，如考试/比赛/丢东西/成就等具体事件，没有则填null）"} 已有画像：' + (oldMem || '（暂无）') + '\n最新对话：' + contextText.slice(-450) + '\n这位同学刚说：' + content;
        const mem = await aiChat([{ role: 'system', content: memPrompt }], 280);
        if (mem && mem.text) {
          let portrait = null, fact = null;
          try {
            const jm = mem.text.match(/\{[\s\S]*\}/);
            if (jm) {
              const pj = JSON.parse(jm[0]);
              portrait = pj.portrait || null;
              fact = (pj.fact && pj.fact !== 'null' && pj.fact !== 'null。') ? pj.fact : null;
            }
          } catch (e) { portrait = (mem.text.length <= 130 && !mem.text.includes('{')) ? mem.text : null; }
          if (portrait) {
            const mv = await embed(portrait).catch(() => null);
            if (mv) await rpc('bobo_memory_upsert', { p_scope: 'user', p_content: portrait, p_embedding: mv, p_user: authorId, p_kind: 'portrait' }).catch(() => {});
          }
          if (fact && fact.length <= 40) {
            // 细粒度事实：独立成条（kind=fact），与近5条fact做语义去重（余弦>0.92视为重复）
            const fv = await embed(fact).catch(() => null);
            if (fv) {
              let dup = false;
              try {
                const existF = await restSelect('bobo_memories?select=id,content&scope=eq.user&user_id=eq.' + authorId + '&kind=eq.fact&order=updated_at.desc&limit=5').catch(() => []);
                if (Array.isArray(existF)) {
                  for (const ex of existF) {
                    const ev = await embed(ex.content).catch(() => null);
                    if (ev) {
                      let dot = 0;
                      for (let i2 = 0; i2 < ev.length; i2++) dot += ev[i2] * fv[i2];
                      if (dot > 0.92) { dup = true; break; }
                    }
                  }
                }
              } catch (e) {}
              if (!dup) await rpc('bobo_memory_upsert', { p_scope: 'user', p_content: fact, p_embedding: fv, p_user: authorId, p_kind: 'fact' }).catch(() => {});
            }
          }
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
