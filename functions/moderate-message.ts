// @ts-nocheck
import { createClient } from 'npm:@insforge/sdk';

// ══════════════════════════════════════════════════
//  人设提示词：仿「寒塘审判」风格的校园小管家
//  核心特质：有梗、有情绪、用昵称、自嘲、反讽、emoji
//  严重度递进：轻微调侃 → 嘲讽警告 → 魔性警告
// ══════════════════════════════════════════════════

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
{"violation": true或false, "reason": "人设化回复文案", "severity": 1|2|3}`;

// ─── 词库分类映射（用于本地快筛命中时自动生成回复）───
const BLOCK_CATEGORIES: Record<string, { label: string; severity: number; templates: string[] }> = {
  abuse:     { label: '辱骂攻击', severity: 3, templates: [
    '哟{nick}，嘴这么脏是刚从下水道爬出来的吗？😏 咱频道文明用语了解一下？再骂我可要给你安排个"静音套餐"了哦~',
    '{nick}同学，你这话比我期末考卷还难看。骂人不能当饭吃，有话好好说行不？😊',
    '哈哈哈哈{nick}你这是在挑战我的审核底线啊！🤡 这么冲的脾气建议去操场跑两圈冷静一下~',
  ]},
  spam:      { label: '广告引流', severity: 2, templates: [
    '{nick}，咱校园频道不是你家广告牌哈。发广告去闲鱼，这里不兴这套 😊',
    '哟{nick}，你是来做生意的还是来聊天的？二维码贴得比食堂菜单还勤快，撤了吧~',
    '{nick}兄弟，广告发多了容易掉粉你知道吗？而且我这小管家看到一次删一次，别费劲了 🐱',
  ]},
  adult:     { label: '色情低俗', severity: 3, templates: [
    '{nick}！！你清醒一点！！这里是校园频道不是你家的私密空间！！这种内容发出来你班主任看到会哭的 💀',
    '{nick}同学，开车归去秋名山开，别在我这频道飙车好吗？😏 再来一次我可要给你贴罚单了。',
    '哎哟{nick}，你这话少儿不宜啊。咱们频道还有未成年人呢，注意影响~ 🤡',
  ]},
  political: { label: '政治敏感', severity: 3, templates: [
    '{nick}，这个话题太沉重了，咱频道承载不了这么大的宇宙真理。换个轻松的吧 😊',
    '停停停{nick}！这个话题在我的审核列表里属于"看了头秃"级别。咱聊聊今天食堂吃什么不好吗？🤡',
  ]},
  conflict:  { label: '恶意引战', severity: 2, templates: [
    '{nick}，你这是想搞事情啊？挑拨离间可不是什么好技能，不如把精力用在写作业上 😏',
    '哟{nick}，拱火达人是你吧？大家和和气气聊天不行非得加点料？收敛点哈~ 🐱',
  ]},
  flood:     { label: '刷屏灌水', severity: 1, templates: [
    '{nick}，你这是在测试我的耐心还是键盘粘住了？😂 少量多次，质量优先！',
    '{nick}兄弟，刷屏不可取啊。你这样发下去，别的同学的消息都要被你挤到外太空去了 🚀',
  ]},
};

function pickTemplate(templates: string[]): string {
  return templates[Math.floor(Math.random() * templates.length)];
}

function matchBlocklist(content: string, words: Array<{ word: string; category: string }>): { hit: boolean; category?: string; matched?: string } | null {
  const lower = content.toLowerCase();
  for (const w of words) {
    if (lower.includes(w.word.toLowerCase())) {
      return { hit: true, category: w.category, matched: w.word };
    }
  }
  return null;
}

export default async function (req: Request): Promise<Response> {
  const cors = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  };
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });

  const base = Deno.env.get('INSFORGE_BASE_URL') || 'https://r683ebwu.ap-southeast.insforge.app';
  const anon = Deno.env.get('ANON_KEY') || 'anon_a09338fe0bdb3e2a0797c92a73a8431ddae4b38f7b12333fe41ebbeccba6e2ea';
  const model = Deno.env.get('AI_MODEL') || 'openai/gpt-4o-mini';

  let body: Record<string, unknown>;
  try { body = await req.json(); }
  catch { return new Response(JSON.stringify({ error: 'bad json' }), { status: 400, headers: { ...cors, 'Content-Type': 'application/json' } }); }

  const messageId = body.messageId as string;
  const content = (body.content as string) || '';
  const authorId = body.authorId as string;
  const channelId = body.channelId as string;
  if (!messageId || !content || !authorId || !channelId) {
    return new Response(JSON.stringify({ error: 'missing params' }), { status: 400, headers: { ...cors, 'Content-Type': 'application/json' } });
  }

  let violation = false;
  let reason = '';
  let severity = 0;

  // ── Step 1: 从数据库加载启用中的词库（每次请求实时查，保证管理员改词立即生效）──
  let blockWords: Array<{ word: string; category: string }> = [];
  try {
    const client = createClient({ baseUrl: base, anonKey: anon });
    const { data, error } = await client.database
      .from('blocklist')
      .select('word, category')
      .eq('enabled', true);
    if (!error && data) blockWords = data;
  } catch (e) {
    console.error('[moderate] 加载词库失败', e);
  }

  // ── Step 2: 本地词库快筛（命中则直接出人设警告，省 AI 调用）──
  if (blockWords.length > 0) {
    const blMatch = matchBlocklist(content, blockWords);
    if (blMatch?.hit && blMatch.category) {
      const cat = BLOCK_CATEGORIES[blMatch.category];
      if (cat) {
        violation = true;
        severity = cat.severity;
        const nick = '同学'; // 后续可扩展为查用户昵称
        reason = pickTemplate(cat.templates).replace(/\{nick\}/g, nick);
        console.log(`[moderate] 词库命中: "${blMatch.matched}" → ${cat.label} (severity=${severity})`);
      }
    }
  }

  // ── Step 3: 词库未命中 → 送 AI 判定 ──
  if (!violation) {
    try {
      const aiRes = await fetch(`${base}/api/ai/chat/completion`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${anon}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model,
          temperature: 0.65, // 提高温度让回复更多样有趣
          messages: [
            { role: 'system', content: SYS_PROMPT },
            { role: 'user', content: `请审核这条校园发言：\n"""${content}"""` },
          ],
        }),
      });
      const aiJson = await aiRes.json();
      const text = aiJson?.text || aiJson?.choices?.[0]?.message?.content || '';
      const m = text.match(/\{[\s\S]*\}/);
      if (m) {
        try {
          const parsed = JSON.parse(m[0]);
          violation = !!parsed.violation;
          reason = parsed.reason || '';
          severity = parsed.severity || (violation ? 1 : 0);
        } catch {}
      }
    } catch (e) {
      console.error('[moderate] AI 调用失败', e);
    }
  }

  // ── Step 4: 违纪 → 落库（bot 警告评论 + 累计警告 + 满3禁言 + 通知）──
  if (violation && reason) {
    try {
      const client = createClient({ baseUrl: base, anonKey: anon });
      const { error } = await client.database
        .rpc('apply_moderation', {
          p_message_id: messageId,
          p_user_id: authorId,
          p_reason: reason,
          p_channel_id: channelId,
        });
      if (error) console.error('[moderate] apply_moderation 失败', error);
    } catch (e) {
      console.error('[moderate] apply_moderation 异常', e);
    }
  }

  return new Response(JSON.stringify({ violation, reason, severity }), {
    status: 200,
    headers: { ...cors, 'Content-Type': 'application/json' },
  });
}
