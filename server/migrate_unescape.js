// 一次性迁移：将历史「已 HTML 转义」的文本消息还原为原始文本。
//
// 背景：修复前服务端在 send-message 时对文本消息做了 escapeHtml 后入库，
//       导致数据层存储的是 HTML 实体（双重转义隐患、且破坏搜索/编辑/通知引用）。
//       修复后改为「数据层存原始文本，转义责任统一交给前端 formatMsgText」。
//       本脚本把存量数据对齐到新格式，避免旧消息被新逻辑二次转义而显示成 &lt;b&gt;。
//
// 运行：node server/migrate_unescape.js   （建议在 docker 部署更新前执行一次）
const db = require('./db');

function unescapeHtml(s) {
  if (typeof s !== 'string') return s;
  return s
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#x27;/g, "'")
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, '&'); // 最后还原 & ，避免破坏其它实体
}

const ENTITY_RE = /&(?:lt|gt|quot|amp|#x27|#39|#0?39);/;

(async () => {
  await db.initDatabase();
  const target = process.env.PERSIST_DIR
    ? require('path').join(process.env.PERSIST_DIR, 'data.db')
    : require('path').join(__dirname, 'data.db');

  const rows = db.all("SELECT id, content FROM messages WHERE content_type='text'");
  let changed = 0;
  for (const r of rows) {
    if (typeof r.content === 'string' && ENTITY_RE.test(r.content)) {
      const raw = unescapeHtml(r.content);
      if (raw !== r.content) {
        db.run('UPDATE messages SET content=? WHERE id=?', [raw, r.id]);
        changed++;
      }
    }
  }
  db.saveDatabase();
  console.log(`[migrate] 扫描 ${rows.length} 条文本消息，还原 ${changed} 条历史转义数据 → ${target}`);
  // 让事件循环自然退出，避免 sql.js WASM 句柄在 process.exit 时的 UV 句柄断言（Windows）
  process.exitCode = 0;
})().catch(e => { console.error(e); process.exitCode = 1; });
