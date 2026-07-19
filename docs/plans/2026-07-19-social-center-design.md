# 好友 & @消息社交中心 — 设计文档

> 日期：2026-07-19
> 背景：左侧栏（公告+极光+每日箴言）已定稿但暂缓——因为其通知铃依赖「好友+@消息」数据，而该数据当前不存在。本设计先打地基。

## 一、现状盘点（已存在，复用不重建）

| 能力 | 位置 | 状态 |
|------|------|------|
| 顶部通知铃 + 下拉 | `html/index.html:244-252` `#btn-notify`/`#notify-dropdown`/`#notify-list`/`#notify-badge` | ✅ 完整 |
| 通知路由 | `server/routes/notifications.js`：`/unread-count`、`/`、`/:id/read`、`/read-all` | ✅ 完整 |
| 通知渲染 + 点击跳频道 | `js/app.js:2107-2140` `loadNotifications()`，按 `type` 显图标，点击 `switchChannel` | ✅ 完整 |
| `@昵称` 消息内高亮 | `js/app.js:125-126` | ✅ 完整 |
| `@` 输入自动补全 | `js/app.js:2178-2307`（成员/在线/历史消息来源） | ✅ 完整 |
| WebSocket 在线状态 | `server/index.js` `onlineUsers` Map | ✅ 完整 |
| InsForge API 封装 | `IF.listNotifications/unreadCount/markRead/markAllRead` | ✅ 完整 |

## 二、缺口（本次要建）

1. **@ → 通知**：`server/routes/messages.js:65` send 路由只 `INSERT messages`，**不解析 @、不写 notifications、不发 WS**。→ 补这段。
2. **好友系统**：无任何表/路由/UI。→ 新建。
3. **通知实时推送**：当前红点只在加载/AI审核后刷新；需 WS `notification` 事件让红点实时 +1。

## 三、数据模型

### 新增表 `friends`（迁移写入 `server/db.js` MIGRATIONS）
```
CREATE TABLE IF NOT EXISTS friends (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id    INTEGER REFERENCES users(id) NOT NULL,
  friend_id  INTEGER REFERENCES users(id) NOT NULL,
  status     TEXT DEFAULT 'pending',   -- pending | accepted
  created_at DATETIME DEFAULT (datetime('now','localtime'))
);
CREATE INDEX IF NOT EXISTS idx_friends_user ON friends(user_id, status);
```
- 关系用单行表示：pending 由 `user_id`(发起人)→`friend_id`(目标)；accepted 双向查询 `(user_id=? OR friend_id=?) AND status='accepted'`。
- 去重约束：`UNIQUE(user_id, friend_id)`。

### `notifications` 表扩展 `type` 取值
现有 `type` 默认 `'mention'`。本次新增：`'friend_request'`、`'friend_accepted'`。表结构无需改。

## 四、后端改动

### 4.1 `messages.js` send 路由（补 @ 通知）
在 `db.run(INSERT messages...)` 之后、`res.json` 之前插入：
```
// 解析 @昵称 → 写 mention 通知 + WS 推送
const mentions = [...new Set((safe.match(/@([^\s@]+)/g) || []).map(s => s.slice(1)))];
if (mentions.length) {
  const ch = db.get('SELECT name FROM channels WHERE id=?', [channelId]);
  const chName = ch ? ch.name : '频道';
  mentions.forEach(name => {
    const u = db.get('SELECT id FROM users WHERE nickname=? OR username=?', [name, name]);
    if (!u || u.id === req.user.id) return;
    const title = req.user.nickname + ' 在 #' + chName + ' 提到了你';
    const body = safe.length > 60 ? safe.slice(0,60) + '…' : safe;
    db.run("INSERT INTO notifications (user_id, type, title, body, link) VALUES (?, 'mention', ?, ?, ?)",
           [u.id, title, body, '/channel/' + channelId + '#msg-' + msgId]);
    emitNotificationToUser(u.id, { type:'mention', title, body });
  });
}
```
> 注：`@` 解析用 `nickname` 或 `username` 匹配；消息内高亮用 `@(\S+)`，二者一致。

### 4.2 新增 `server/routes/friends.js`
- `POST /request` `{friend_username}`：校验非空/非自己/非重复/非已是好友 → 建 `pending` + 写 `notifications(type='friend_request', title='XXX 想加你为好友', link='')` + `emitNotificationToUser`。
- `POST /:id/respond` `{action:'accept'|'reject'}`：仅目标可操作；accept→`status='accepted'` + 写 `friend_accepted` 通知回发起人 + emit；reject→删行。
- `GET /`：返回 `{ friends:[accepted 列表(含对方资料)], requests:[incoming pending] }`。
- `DELETE /:id`：删双向好友关系。
- 在 `server/index.js` 注册 `app.use('/api/friends', friendsRouter)`（需 `authRequired`）。

### 4.3 `server/index.js` WS 推送助手
现有 `onlineUsers: Map<socketId,{userId,username}>`。新增反向索引 `userSockets: Map<userId, Set<socketId>>`，在 `connection`/`disconnect` 维护。
```
function emitNotificationToUser(userId, payload) {
  const socks = userSockets.get(userId);
  if (socks) socks.forEach(sid => io.to(sid).emit('notification', payload));
}
```
（Friends/Mentions 路由 require 后调用此函数；需在 index.js 中定义并在路由模块内可访问——通过 `req.app.locals` 或模块导出共享。）

## 五、前端改动

### 5.1 通知点击跳转增强（`js/app.js:2127-2134`）
当前 `n.link.replace('/channel/','')` 取到频道 ID。改为支持 `#msg-ID` 锚点：
```
const [chId, anchor] = n.link.replace('/channel/','').split('#');
const ch = channels.find(c => c.id == chId);
if (ch) { switchChannel(ch); if (anchor) scrollToMessage(anchor.replace('msg-','')); }
```
新增 `scrollToMessage(id)`：在 `renderMessages` 后定位 `#msg-ID` 并 `scrollIntoView`。

### 5.2 WS 实时红点（`js/app.js` 通知区）
socket 监听 `notification` 事件：
```
socket.on('notification', () => { unreadNotifCount++; updateNotifBadge(); if (dropdownOpen) loadNotifications(); });
```

### 5.3 通知下拉新增「好友」Tab（`html/index.html:250` `#notify-dropdown`）
在 `.notify-header` 下加 Tab 条：`通知 | 好友`。
- **通知 Tab**：现有 `loadNotifications()` 不变。
- **好友 Tab**：
  - `好友请求` 区：incoming `requests` 列表，每条 `接受`/`拒绝` 按钮。
  - `我的好友` 区：accepted 列表（头像+昵称+`移除`）。
  - `加好友`：输入框 + 发送按钮（调 `/api/friends/request`）。
- 切 Tab 时分别调 `loadNotifications()` / `loadFriends()`。
- `loadFriends()` 走 `IF` 封装或 `fetch('/api/friends')`；操作用 `fetch` POST/DELETE。

### 5.4 `IF` 封装（可选）
在 InsForge 封装层加 `friends()`, `friendRequest()`, `friendRespond()`, `friendRemove()`；或直接用 `fetch`。二选一，优先复用 `IF` 风格。

## 六、数据流

```
发消息含 @B
  → messages.js 解析 → notifications(mention→B) + WS emit('notification'→B)
  → B 红点实时 +1；B 开下拉见「@你」→ 点跳转频道并滚到该消息

A 发好友申请给 B
  → friends.js 建 pending + notifications(friend_request→B) + WS emit
  → B 红点 +1；B 好友 Tab 见请求 → 接受
  → friends 置 accepted + notifications(friend_accepted→A) + WS emit
  → A、B 互相出现在「我的好友」列表
```

## 七、容错

- @ 不存在的昵称 → 跳过，不写通知。
- 好友申请：自己/重复/已好友 → 400 友好提示。
- 通知拉取失败 → 红点不更新，下拉显示「加载失败」。
- WS 断开 → `onlineUsers`/`userSockets` 清理；红点靠 reload 时 `/unread-count` 校正。
- `prefers-reduced-motion` → 下拉动画降级（已有 `REDUCED_MOTION` 判定）。

## 八、响应式

下拉与 Tab 结构在移动端沿用现有 `.notify-dropdown` 样式；好友 Tab 列表单列，无需额外适配。

## 九、验证（本地 8787）

1. 用户 A 在 #综合交流 发 `@B 你好` → 以 B 登录，铃红点=1，下拉「通知」见「A 在 #综合交流 提到了你」，点击跳到该消息。
2. A 在「好友」Tab 搜 B 用户名发申请 → B 登录见红点+请求，接受 → 双方「我的好友」互见；A 收到「B 已接受」通知。
3. 不刷新页面，B 收到的 @/好友请求红点实时 +1（WS 验证）。
4. 窄屏下拉 + 好友 Tab 正常。

## 十、后续（本设计外）

- 左侧栏（公告卡 + 极光 + 每日箴言）在其通知铃有真实数据后实现。
- 私聊（好友间 1v1 频道）可作为好友系统的延伸。
