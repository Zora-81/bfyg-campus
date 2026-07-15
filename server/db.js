// 数据库层 — sql.js WASM 封装
const initSqlJs = require('sql.js');
const path = require('path');
const fs = require('fs');

const PERSIST_DIR = process.env.PERSIST_DIR || __dirname;
const DB_PATH = path.join(PERSIST_DIR, 'data.db');
let db = null;

// 工具函数: 将 sql.js 预处理语句结果转为对象数组
function all(sql, params = []) {
  const stmt = db.prepare(sql);
  if (params.length > 0) stmt.bind(params);
  const rows = [];
  while (stmt.step()) {
    rows.push(stmt.getAsObject());
  }
  stmt.free();
  return rows;
}

function get(sql, params = []) {
  const rows = all(sql, params);
  return rows.length > 0 ? rows[0] : null;
}

function run(sql, params = []) {
  db.run(sql, params);
  return { changes: db.getRowsModified(), lastInsertRowid: lastId() };
}

function exec(sql) {
  db.exec(sql);
}

function lastId() {
  const row = get('SELECT last_insert_rowid() as id');
  return row ? row.id : 0;
}

// 初始化表结构
const SCHEMA = `
CREATE TABLE IF NOT EXISTS users (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  username      TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  nickname      TEXT NOT NULL,
  avatar_url    TEXT DEFAULT '',
  role          TEXT DEFAULT 'student',
  status        TEXT DEFAULT 'active',
  created_at    DATETIME DEFAULT (datetime('now','localtime'))
);

CREATE TABLE IF NOT EXISTS channels (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  name          TEXT UNIQUE NOT NULL,
  description   TEXT DEFAULT '',
  type          TEXT DEFAULT 'public',
  created_by    INTEGER REFERENCES users(id),
  created_at    DATETIME DEFAULT (datetime('now','localtime'))
);

CREATE TABLE IF NOT EXISTS messages (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  channel_id    INTEGER REFERENCES channels(id) NOT NULL,
  author_id     INTEGER REFERENCES users(id) NOT NULL,
  content       TEXT NOT NULL,
  content_type  TEXT DEFAULT 'text',
  is_pinned     INTEGER DEFAULT 0,
  created_at    DATETIME DEFAULT (datetime('now','localtime'))
);

CREATE TABLE IF NOT EXISTS channel_members (
  user_id       INTEGER REFERENCES users(id),
  channel_id    INTEGER REFERENCES channels(id),
  joined_at     DATETIME DEFAULT (datetime('now','localtime')),
  PRIMARY KEY (user_id, channel_id)
);

CREATE INDEX IF NOT EXISTS idx_messages_channel ON messages(channel_id, created_at);
CREATE INDEX IF NOT EXISTS idx_messages_author ON messages(author_id);

-- 短信迁移：为旧数据库添加 content_type 列
`;

// 数据库升级迁移
const MIGRATIONS = [
  // v1: 添加 content_type
  `ALTER TABLE messages ADD COLUMN content_type TEXT DEFAULT 'text'`,
  // v2: 添加通知表
  `CREATE TABLE IF NOT EXISTS notifications (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id       INTEGER REFERENCES users(id) NOT NULL,
    type          TEXT NOT NULL DEFAULT 'mention',
    title         TEXT NOT NULL,
    body          TEXT DEFAULT '',
    link          TEXT DEFAULT '',
    is_read       INTEGER DEFAULT 0,
    created_at    DATETIME DEFAULT (datetime('now','localtime'))
  )`,
  `CREATE INDEX IF NOT EXISTS idx_notifications_user ON notifications(user_id, is_read)`,
];

async function initDatabase() {
  const SQL = await initSqlJs();
  if (fs.existsSync(DB_PATH)) {
    const buffer = fs.readFileSync(DB_PATH);
    db = new SQL.Database(buffer);
  } else {
    db = new SQL.Database();
  }
  db.run('PRAGMA journal_mode=WAL');
  db.run('PRAGMA foreign_keys=ON');
  exec(SCHEMA);
  // 运行迁移（静默忽略已存在的列/表）
  MIGRATIONS.forEach(sql => {
    try { exec(sql); } catch (e) { /* 列/表已存在 */ }
  });
  console.log('[DB] SQLite 初始化完成');
}

function saveDatabase() {
  if (!db) return;
  const data = db.export();
  const buffer = Buffer.from(data);
  fs.writeFileSync(DB_PATH, buffer);
}

// 自动保存（每 5 秒 + 进程退出时）
let saveTimer = null;
function startAutoSave() {
  saveTimer = setInterval(saveDatabase, 5000);
}
function stopAutoSave() {
  if (saveTimer) clearInterval(saveTimer);
  saveDatabase();
}

module.exports = {
  initDatabase,
  saveDatabase,
  startAutoSave,
  stopAutoSave,
  all,
  get,
  run,
  exec,
  lastId
};
