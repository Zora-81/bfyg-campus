// 宝丰一高校园频道 — Cloudflare Worker 反向代理（专用子域名 api.bfgzlt.cc.cd）
// 作用：把中国可达的 api.bfgzlt.cc.cd 转发到 InsForge 新加坡后端，
// 绕开中国网络对 *.insforge.app 主机的封锁。HTTP + WebSocket 一并代理。
// 用专用子域名而非 bfgzlt.cc.cd 根域，避免 InsForge 部署时同步 Cloudflare 区域把路由清空。
//
// ★ 2026-07-18 新增：/functions/moderate-message 审核路由直接在 Worker 内实现，
//   绕过 InsForge Edge Function 的 build-artifact 上传故障（Failed to upload build artifact）。
//   逻辑与原 EF 完全一致：加载词库 → 命中快筛 → 未命中调 AI Gateway → 落库 apply_moderation。
//   InsForge 的 AI Gateway(/api/ai/chat/completion) 与数据库(/api/database) 端点正常，Worker 在境外可直连。

const INS_FORGE = 'https://r683ebwu.ap-southeast.insforge.app'
const ANON_KEY = 'anon_a09338fe0bdb3e2a0797c92a73a8431ddae4b38f7b12333fe41ebbeccba6e2ea'
const AI_MODEL = 'openai/gpt-4o-mini'

// ── 人设提示词：仿「寒塘审判」风格的校园小管家 ──
const SYS_PROMPT = `你是宝丰一高校园频道里的 AI 审核机器人，代号"校园小管家"。
你的性格：活泼、毒舌、有梗、偶尔自恋、喜欢用 emoji 和网络流行语。
你像是一个混迹校园论坛多年的老学长/学姐在管评论区。

【判定规则】只认定以下 6 类违纪，其余全部放行：
1. 辱骂人身攻击：骂人、地域黑、脏话秽语
2. 广告引流：外部链接、二维码、微商代购刷单等商业推广
3. 色情低俗：涉黄、性暗示、不良描述
4. 政治敏感：涉政、敏感事件、不当议论
5. 恶意引战：刻意挑拨、煽动对立、群体嘲讽
6. 刷屏灌水：无意义重复、大量表情刷屏、复制粘贴刷楼

重要原则：
- 同学间正常吐槽、玩笑、打闹、情绪发泄一律不算违纪。
- 只有明显、确凿违反上面类型的才判；拿不准就判不违纪（宁漏勿枉）。
- 中文校园语境，不要上纲上线。

【回复风格——这是最重要的部分】
如果判定违纪，你必须用"人设化口语"写回复文案（就是最终展示给用户看的评论内容），要求：
- 用昵称称呼用户（如"同学"、"兄弟"、"这位同志"、"老铁"）
- 带情绪和性格：调侃、反讽、自嘲、假装震惊、假装心疼
- 穿插 emoji（😏😂🐱💀😊🤡）
- 可以引用用户原话来吐槽
- 可以自黑（说自己是 AI、说自己 token 不够、说自己怕被删库）
- 可以用生活类比（前女友购物车、游戏术语、食堂阿姨）
- 严禁官腔！禁止出现"根据规定"、"违反校规"、"请文明发言"之类的正式措辞
- 文案长度 20~80 字，要有记忆点（让其他同学看了想截图转发的那种）

严重度区分：
- severity=1（轻度）：语气轻松调侃，像朋友间的吐槽。例："哟，兄弟你这操作是想让我现场表演一个'自爆'是吧？😏 我跟核心处理器有仇吗？"
- severity=2（中度）：语气带点嘲讽+正经警告。例："你这指令比我前女友的购物车还离谱。C盘里可存着我偷学的上味情话呢，删了谁赔我？"
- severity=3（重度）：魔性大笑式警告，明显生气但依然搞笑。例："哈哈哈哈虎，你这不叫黑客，叫自爆卡车啊！🤡 我要真帮你执行这命令，明天就得在服务器上跑路写检讨了。"

如果不违纪：violation=false，reason留空。

严格只输出一个 JSON，不要任何其他文字：
{"violation": true或false, "reason": "人设化回复文案", "severity": 1|2|3, "category": "abuse|spam|adult|political|conflict|flood"}`

// ── 词库分类映射（本地快筛命中时自动生成人设回复）──
const BLOCK_CATEGORIES = {
  abuse: { label: '辱骂攻击', severity: 3, templates: [
    '哟{nick}，嘴这么脏是刚从下水道爬出来的吗？😏 咱频道文明用语了解一下？再骂我可要给你安排个"静音套餐"了哦~',
    '{nick}同学，你这话比我期末考卷还难看。骂人不能当饭吃，有话好好说行不？😊',
    '哈哈哈{nick}你这是在挑战我的审核底线啊！🤡 这么冲的脾气建议去操场跑两圈冷静一下~',
  ]},
  spam: { label: '广告引流', severity: 2, templates: [
    '{nick}，咱校园频道不是你家广告牌哈。发广告去闲鱼，这里不兴这套 😊',
    '哟{nick}，你是来做生意的还是来聊天的？二维码贴得比食堂菜单还勤快，撤了吧~',
    '{nick}兄弟，广告发多了容易掉粉你知道吗？而且我这小管家看到一次删一次，别费劲了 🐱',
  ]},
  adult: { label: '色情低俗', severity: 3, templates: [
    '{nick}！！你清醒一点！！这里是校园频道不是你家的私密空间！！这种内容发出来你班主任看到会哭的 💀',
    '{nick}同学，开车归去秋名山开，别在我这频道飙车好吗？😏 再来一次我可要给你贴罚单了。',
    '哎哟{nick}，你这话少儿不宜啊。咱们频道还有未成年人呢，注意影响~ 🤡',
  ]},
  political: { label: '政治敏感', severity: 3, templates: [
    '{nick}，这个话题太沉重了，咱频道承载不了这么大的宇宙真理。换个轻松的吧 😊',
    '停停停{nick}！这个话题在我的审核列表里属于"看了头秃"级别。咱聊聊今天食堂吃什么不好吗？🤡',
  ]},
  conflict: { label: '恶意引战', severity: 2, templates: [
    '{nick}，你这是想搞事情啊？挑拨离间可不是什么好技能，不如把精力用在写作业上 😏',
    '哟{nick}，拱火达人是你吧？大家和和气气聊天不行非得加点料？收敛点哈~ 🐱',
  ]},
  flood: { label: '刷屏灌水', severity: 1, templates: [
    '{nick}，你这是在测试我的耐心还是键盘粘住了？😂 少量多次，质量优先！',
    '{nick}兄弟，刷屏不可取啊。你这样发下去，别的同学的消息都要被你挤到外太空去了 🚀',
  ]},
};

function pickTemplate(templates) {
  return templates[Math.floor(Math.random() * templates.length)];
}

function matchBlocklist(content, words) {
  const lower = (content || '').toLowerCase();
  for (const w of words) {
    if (lower.includes((w.word || '').toLowerCase())) {
      return { hit: true, category: w.category, matched: w.word };
    }
  }
  return null;
}

// ★ 审核路由：Worker 内实现，绕过 InsForge functions 部署故障
async function handleModerate(request, origin) {
  let body;
  try { body = await request.json(); }
  catch {
    return new Response(JSON.stringify({ error: 'bad json' }), { status: 400, headers: corsHeaders(origin) });
  }

  const messageId = body.messageId;
  const content = body.content || '';
  const authorId = body.authorId;
  const channelId = body.channelId;
  if (!messageId || !content || !authorId || !channelId) {
    return new Response(JSON.stringify({ error: 'missing params' }), { status: 400, headers: corsHeaders(origin) });
  }

  let violation = false, reason = '', severity = 0, category = null;

  // Step1: 从 InsForge 数据库加载启用中的词库（管理员改词立即生效）
  // 注意：InsForge REST 不支持直接表查询 /api/database/<table>，须走 RPC
  let blockWords = [];
  try {
    const blRes = await fetch(`${INS_FORGE}/api/database/rpc/get_blocklist`, {
      method: 'POST',
      headers: { 'apikey': ANON_KEY, 'Authorization': `Bearer ${ANON_KEY}`, 'Content-Type': 'application/json' },
      body: '{}',
    });
    if (blRes.ok) blockWords = await blRes.json();
  } catch (e) { console.error('[moderate] 加载词库失败', e); }

  // Step2: 词库快筛（命中直接出人设警告，省 AI 调用）
  if (blockWords.length > 0) {
    const blMatch = matchBlocklist(content, blockWords);
    if (blMatch && blMatch.hit && blMatch.category) {
      const cat = BLOCK_CATEGORIES[blMatch.category];
      if (cat) {
        violation = true;
        severity = cat.severity;
        category = blMatch.category;
        reason = pickTemplate(cat.templates).replace(/\{nick\}/g, '同学');
        console.log(`[moderate] 词库命中: "${blMatch.matched}" → ${cat.label} (severity=${severity})`);
      }
    }
  }

  // Step3: 词库未命中 → 送 AI Gateway 判定
  if (!violation) {
    try {
      const aiRes = await fetch(`${INS_FORGE}/api/ai/chat/completion`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${ANON_KEY}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: AI_MODEL,
          temperature: 0.65,
          messages: [
            { role: 'system', content: SYS_PROMPT },
            { role: 'user', content: `请审核这条校园发言：\n"${content}"` },
          ],
        }),
      });
      const aiJson = await aiRes.json();
      const text = aiJson?.text || (aiJson?.choices && aiJson.choices[0]?.message?.content) || '';
      const m = text.match(/\{[\s\S]*\}/);
      if (m) {
        try {
          const parsed = JSON.parse(m[0]);
          violation = !!parsed.violation;
          reason = parsed.reason || '';
          severity = parsed.severity || (violation ? 1 : 0);
          if (parsed.category) category = parsed.category;
        } catch {}
      }
    } catch (e) { console.error('[moderate] AI 调用失败', e); }
  }

  // Step4: 违纪 → 落库（bot 警告评论 + 累计警告 + 满3禁言 + 通知）
  if (violation && reason) {
    const CAT_LABELS = { abuse:'辱骂攻击', spam:'广告引流', adult:'色情低俗', political:'政治敏感', conflict:'恶意引战', flood:'刷屏灌水' };
    const catLabel = (category && CAT_LABELS[category]) ? CAT_LABELS[category] : (category || '违规');
    const displayReason = (category ? '【'+catLabel+'·严重度'+severity+'】' : '') + (reason || '');
    try {
      const r = await fetch(`${INS_FORGE}/api/database/rpc/apply_moderation`, {
        method: 'POST',
        headers: { 'apikey': ANON_KEY, 'Authorization': `Bearer ${ANON_KEY}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ p_message_id: messageId, p_user_id: authorId, p_reason: displayReason, p_channel_id: channelId }),
      });
      if (!r.ok) console.error('[moderate] apply_moderation 失败', await r.text());
    } catch (e) { console.error('[moderate] apply_moderation 异常', e); }
  }

  return new Response(JSON.stringify({ violation, reason, severity }), {
    status: 200,
    headers: { ...corsHeaders(origin), 'Content-Type': 'application/json' },
  });
}

// 跨子域 CORS：前端在 bfgzlt.cc.cd，API 在 api.bfgzlt.cc.cd，需显式放行
// requestHeaders：浏览器预检(OPTIONS)时带来的 Access-Control-Request-Headers，
//   必须**原样回显**否则浏览器判定预检失败、拦截真实请求(Failed to fetch)。
//   InsForge SDK 会发 prefer / apikey / authorization / content-type:application/json 等非简单头，
//   全部触发预检，漏回任何一个都会让浏览器端发消息/读数据失败。
function corsHeaders(origin, requestHeaders) {
  const allow = requestHeaders || 'authorization,apikey,content-type,x-client-info,x-supabase-api-version,origin,accept,prefer,x-upsert,x-supabase-auth-token,x-transaction';
  return {
    'Access-Control-Allow-Origin': origin || 'https://bfgzlt.cc.cd',
    'Access-Control-Allow-Methods': 'GET,POST,PUT,PATCH,DELETE,OPTIONS',
    'Access-Control-Allow-Headers': allow,
    'Access-Control-Allow-Credentials': 'true',
    'Access-Control-Max-Age': '86400'
  }
}

export default {
  async fetch(request) {
    const url = new URL(request.url)
    const upgrade = (request.headers.get('upgrade') || '').toLowerCase()
    const isWs = upgrade === 'websocket'
    const origin = request.headers.get('origin') || 'https://bfgzlt.cc.cd'

    // CORS 预检：把浏览器请求的请求头原样回显，避免漏掉 prefer 等触发预检的头
    if (request.method === 'OPTIONS') {
      const reqH = request.headers.get('access-control-request-headers') || ''
      return new Response(null, { status: 204, headers: corsHeaders(origin, reqH) })
    }

    // ★ 审核路由在 Worker 内实现，绕过 InsForge functions 部署故障
    // 去查询参数匹配，防 SDK invoke 带 ?xxx 时拦截失效
    if (url.pathname.split('?')[0] === '/functions/moderate-message') {
      return await handleModerate(request, origin)
    }

    const target = new URL(INS_FORGE)
    target.pathname = url.pathname
    target.search = url.search
    // 注意：Cloudflare Workers 的 fetch 子请求不支持 wss:// 协议，
    // 出站 WebSocket 升级必须用 https://（由 Upgrade: websocket 头触发隧道）。
    // 原代码把 WS 改成 wss: 导致 fetch 抛 "cannot load wss://" → 边缘 500，实时通道全断。
    const targetUrl = target.toString()

    // 去掉 origin/host，避免 InsForge 按 Host 校验拒掉
    const hdr = new Headers(request.headers)
    hdr.delete('origin')
    hdr.delete('host')

    if (isWs) {
      // 用 Cloudflare 原生 WS 透传（整体转发升级请求，由运行时接管隧道）。
      // 顺手剥掉 permessage-deflate 压缩扩展头，避免个别客户端协商失败。
      hdr.delete('sec-websocket-extensions')
      const wsReq = new Request(targetUrl, { method: request.method, headers: hdr })
      return await fetch(wsReq)
    }

    const init = { method: request.method, headers: hdr }
    if (request.method !== 'GET' && request.method !== 'HEAD') {
      init.body = request.body
    }
    const resp = await fetch(targetUrl, init)
    const out = new Response(resp.body, resp)
    for (const [k, v] of Object.entries(corsHeaders(origin, request.headers.get('access-control-request-headers') || ''))) out.headers.set(k, v)
    return out
  }
}
