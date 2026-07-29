// ===== 记忆树 · AI 摘要客户端 =====
// 优先调用同源 Pages Function /ai-summary（服务端持有密钥，前端不暴露）；
// 任何失败自动回退本地诗意生成，保证按钮永远可用。
// 挂载：window.MTAI

function localSummary(item) {
  const emoji = item.emoji || '✦';
  const summary = `关于《${item.title}》：那是定格在${item.location}的${item.year}年光景。${emoji} 这一刻被收进星海，成为记忆树上一颗温柔的星——它提醒我们，平凡的日子里也藏着值得反复回看的微光。`;
  const tags = [item.location, item.year, (item.title || '校园记忆')].filter(Boolean).slice(0, 3);
  return { summary, tags, local: true };
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
  }
};
