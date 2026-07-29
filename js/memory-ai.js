// ===== 记忆树 · AI 客户端 =====
// 优先调用 InsForge AI Gateway（匿名 key，浏览器端可直接访问）或同源 Pages Function；
// 任何失败自动回退本地诗意生成，保证功能永远可用。
// 挂载：window.MTAI

const IF_BASE = 'https://r683ebwu.ap-southeast.insforge.app';
const IF_ANON = 'anon_a09338fe0bdb3e2a0797c92a73a8431ddae4b38f7b12333fe41ebbeccba6e2ea';
const IF_MODEL = 'openai/gpt-4o-mini';

function localSummary(item) {
  const emoji = item.emoji || '✦';
  const summary = `关于《${item.title}》：那是定格在${item.location}的${item.year}年光景。${emoji} 这一刻被收进星海，成为记忆树上一颗温柔的星——它提醒我们，平凡的日子里也藏着值得反复回看的微光。`;
  const tags = [item.location, item.year, (item.title || '校园记忆')].filter(Boolean).slice(0, 3);
  return { summary, tags, local: true };
}

const LOCAL_COMMENTS = [
  '哇！这张真的把我拉回高三那年了，连空气里的粉笔灰味道都快闻到了hhh ✨',
  '救命，这也太有感觉了……你就是会抓这些神仙瞬间！',
  '看到这张突然有点想哭是怎么回事，青春果然是用来怀念的呜呜呜 😭',
  '这种画面真的只有亲身经历才懂，别人看是普通日常，我们看是闪闪发光的回忆呀！',
  '啊啊啊这个角度！这个光！我要把它设成壁纸了别拦我 🙌',
  '说真的，毕业之后才发现，当初嫌无聊的校园角落，现在看都是限量版风景。',
  '这张照片里的风，吹过来的好像不只是树叶，还有一整个夏天的我们。',
  '老规矩：先点赞，再转发，最后偷偷保存当壁纸 ✌️',
  '你怎么这么会拍！每张都像青春电影截图，导演什么时候开机？',
  '看到这张图我DNA动了……懂的都懂，不懂的以后也会懂。'
];
function localComment() {
  return { comment: LOCAL_COMMENTS[Math.floor(Math.random() * LOCAL_COMMENTS.length)], local: true };
}

function jsonFrom(text) {
  const m = String(text).match(/\{[\s\S]*\}/);
  if (!m) return null;
  try { return JSON.parse(m[0]); } catch { return null; }
}

async function callInsForge(system, user) {
  const r = await fetch(`${IF_BASE}/api/ai/chat/completion`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${IF_ANON}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: IF_MODEL, messages: [{ role: 'system', content: system }, { role: 'user', content: user }] })
  });
  if (!r.ok) throw new Error('IF AI ' + r.status);
  const j = await r.json();
  const text = j?.text || j?.choices?.[0]?.message?.content || '';
  const parsed = jsonFrom(text);
  if (!parsed) throw new Error('parse');
  return parsed;
}

window.MTAI = {
  async summarize(item) {
    try {
      const r = await fetch('/ai-summary', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: item.title, location: item.location, year: item.year })
      });
      if (r.ok) {
        const d = await r.json();
        if (d && d.summary) return { summary: d.summary, tags: d.tags || [], local: false };
      }
    } catch (e) { /* 走本地兜底 */ }
    return localSummary(item);
  },

  async generateComment(item, userComment) {
    const title = (item && item.title) || '这段记忆';
    const location = (item && item.location) || '校园';
    const year = (item && item.year) || '那年';
    const sys = `你是宝丰一高校园频道里一个活生生的老同学，不是AI，说话要有生活气息、真人味，像跟好朋友在微信上聊天。
请根据校园记忆信息，生成一条 25-150 字左右的回复：
- 要像好朋友一样自然接话，可以惊讶、共鸣、调侃、感慨，别像档案员做总结；
- 必须带上 emoji 表情；
- 多用感叹号、省略号、语气词，让回复有呼吸感；
- 不要正式、不要冷冰冰、不要排比句；
- 如果用户留了言，优先回应用户的情绪或画面；
- 严格只输出一个 JSON，不要任何额外文字：
{"comment":"回复文字"}`;
    const user = `记忆标题：${title}\n地点：${location}\n年份：${year}\n用户留言：${userComment || '（暂无留言）'}\n像好朋友一样回一句：`;
    try {
      const parsed = await callInsForge(sys, user);
      if (parsed && parsed.comment) return { comment: parsed.comment, local: false };
    } catch (e) { /* 走本地兜底 */ }
    return localComment();
  }
};
