# Recon: 删除好友系统 + 私聊（DM）依赖图谱

> 侦察产出（只读调查）。证据来自本仓库 + 线上 InsForge 只读 REST 查询。
> 状态：**待 captain 复核**。原报告在 §9 第 9 步被截断，Phase B/C 需补全。

## 0. 证据基础

- 线上入口：`html/index.html` + `js/app.js` + `js/if-client.js` + `css/style.css`。`html/v52..v72.html` 是归档快照（`_build.mjs:69` 也会拷贝），**不是**线上页面。
- 远程项目 baofeng-campus，base `https://r683ebwu.ap-southeast.insforge.app`。只读端点：`GET /api/database/tables`、`/functions`、`/policies`、`/indexes`、`/triggers`、`/records/{table}`。

## 1. js/app.js — 好友/DM 集群（file:line）

共 158 处 friend/DM 匹配，收敛为 6 个真实集群（其余是 `admin`/`_dm` 误报）。

| 集群 | 行范围 | 内容 |
|---|---|---|
| 频道过滤（从公开列表隐藏 DM 房间） | 815-819（def 6383-6385） | `loadChannels()` 在 819 调 `filterDmChannels(list)`；`filterDmChannels` 过滤 `c.type === "dm"` |
| **发消息路由：DM vs @提及** | **3849-3870** | `if (currentChannel.type === "dm")`(3851) -> `dmFriend = dmChannelToFriend[...]`(3853) -> `IF.notifyDm(...)`(3854-3859)；`else if (IF.notifyMentions...)`(3861-3869)。**else 分支是非好友路径，必须保留**。 |
| 通知角标兜底（牵连好友） | 4152-4158 | `renderFriends()`(4152)；好友类 toast(4158-4161) |
| `respondToFriendRequest` + 通知列表 | 4197-4322 | 打开下拉时 `renderFriends()`(4197)；`if (n.type === "dm") return;`(4210)；`isFriendReq` 兼容遗留类型(4213)；好友图标(4217)；同意/拒绝按钮(4229,4235)；函数体(4269-4322) |
| **好友 Tab**（元素+渲染+搜索） | 4406-4611 | DOM 引用(4408-4415)；`switchNotifyTab`(4417-4427)；`friendAvatarHtml`(4429-4436)；`renderFriendList`(4438-4500)；`renderFriends`(4502-4514)；加好友与搜索块(4516-4611) |
| 实时通知处理（好友+DM 分支） | 4646-4666 | `if (rec.type === "dm")`(4646-4652)；`friend_accepted` / `friend_request`(4661-4666) |
| 头像弹窗挂钩 | 5079 | `openAvatarPopup()` 调 `loadFriendsToPopup()` |
| **DM 弹窗集群** | 6375-6506 | `dmUnread`/`dmChannelToFriend`/`dmReturnChannel`(6377-6379)；`dmBackBtn`(6380)；`filterDmChannels`(6383-6385)；`parseDmLink`(6387-6392)；`loadFriendsToPopup`(6396-6426)；`refreshFriendBadges`(6428-6439)；`openDm`(6441-6466)；`returnFromDm`(6468-6487)；`#dm-back-btn` GSAP 处理器(6489-6506) |

**不得删除的共享 helper**：`getAvatarColor`、`getInitial`、`escapeHtml`、`showToast`、`switchChannel`、`renderChannels`、`closeAvatarPopup`、`channels`、`currentChannel`。

**推论**：`notifyMentions`(3861-3869) 是 3849-3870 处 `else` 分支唯一的非好友消费者；最小手术 = 删掉 `if (type==="dm")` 分支，改为无条件调用 `notifyMentions`。

## 2. html/index.html — 好友/DM DOM

| 行 | 元素 | 归属 |
|---|---|---|
| 1321-1325 | `button.dm-back-btn#dm-back-btn` | **DM** |
| 1378 | `button#tab-friends`（好友） | **好友**（兄弟 `#tab-notif`(1376) 保留） |
| 1390-1414 | `div.notify-tab-panel#panel-friends` 含 `#friends-list`(1396)、`#friends-requests`(1400)、`#friend-add-input`(1408)、`#friend-add-btn`(1410)、`#friend-search-results`(1404) | **好友** |
| 1684-1695 | 头像弹窗「我的好友」区 `div.friend-list#panel-friends-list` | **好友**（DM 入口） |

## 3. css/style.css — `.friend-*` / `.dm-*`

| 行 | 块 | 备注 |
|---|---|---|
| 126 | `.friend-item` 在共享 `user-select:none` 列表中 | 仅从逗号列表移除该 token |
| 342-365 | `[data-theme="light"] .friend-item`（base/`:hover`/`.active`） | 主题变体 |
| 391-393 | `[data-theme="light"] .friend-avatar` | 主题变体 |
| 2321-2334 | `.notify-tabs` / `.notify-tab` / `.notify-tab-panel` | **共享，保留** |
| 2336-2377 | 好友 Tab 块（`.friends-box`/`.friend-item`/`.friend-avatar`/`.friend-btn`/`.friend-add-*`/`.friend-search-*` 等） | **好友，可全删** |
| 3491-3506 | 头像弹窗好友列表（`.friend-list`/`.friend-info`/`.friend-since`/`.add-friend-form` 等） | **好友**；`.friend-since` 无使用者（孤儿） |
| 3906-3949 | 头像弹窗好友列表真实样式 + 主题变体；`.friend-badge` 是 DM 未读角标 | **好友** |
| 3954-3974 | DM：`.dm-back-btn` 及 `hover`/`svg`；`body.dm-mode #dm-back-btn`；`body.dm-mode #hamburger-btn, body.dm-mode .nav-hash` | **DM**；3966-3967 在 dm-mode 下隐藏汉堡/nav-hash，必须一并删除 |

**媒体查询事实**：

- `@media (max-width:768px)` 块起于 **2222**，**包含整个好友 Tab CSS 2336-2377**。
- `@media (max-width: 900px)` 块起于 **2947**，包含 **3491-3506**。
- `@media (prefers-reduced-motion: reduce)` 块起于 **3725**，**包含 3906-3974 全部好友+DM 规则**。

其他 CSS 文件（admin/chip-card/manuscript-v2/memory-tree/letter-reader/welcome-intro）**无**好友/DM 规则。

## 4. js/if-client.js — 好友/DM 包装器与远程 RPC

| 包装器 | 行 | 远程调用 |
|---|---|---|
| `friendsList()` | 588-629 | 直查 `friends` 表两次，再查 `profiles.select("id,username,nickname,avatar_url").in(...)` |
| `friendRequest(friendId)` | 632-639 | RPC `create_friend_request` |
| `friendRespond(id, action)` | 643-648 | RPC `respond_friend_request` |
| `friendRemove(id)` | 652-656 | RPC `remove_friend` |
| `findOrCreateDm(friendId)` | 662-666 | RPC `find_or_create_dm` |
| `notifyDm({...})` | 670-676 | RPC `notify_dm` |
| `searchUsers(keyword, limit)` | 683-689 | RPC `search_users_safe` |

- `unreadCount()`(540-546) 用 `.neq("type","dm")` 排除 DM —— **唯一引用 DM 的非好友函数**。
- 导出(1007-1010)：`getCurrentUserId, notifyMentions, searchUsers, friendsList, friendRequest, friendRespond, friendRemove, findOrCreateDm, notifyDm`。
- `getCurrentUserId`(577-585) 也被导出，删前需查外部引用。

## 5. server/（Express + Socket.io）— 无任何好友/DM

**事实**：`server/**/*.js`（排除 node_modules）grep `friend|dm|private|私聊|好友` 仅得 admin 类误报。

- `server/index.js` socket 房间只有 `channel:${channelId}`(160-161,171)；`send-message`(151-228) 写 `messages`、emit `new-message`，**只做 @提及通知**(196-226)。无 DM 房间、无好友路由。
- `server/routes/`：`auth.js`、`channels.js`、`messages.js`、`notifications.js`、`admin.js`、`upload.js` —— **无 `friends.js`**（social-center 设计文档 4.2 曾提议，从未创建）。
- `server/db.js` SQLite schema(40-100)：仅 `users, channels, messages, channel_members, notifications`。**无 friends、无 dm 表**。
- 实际 `server/data.db` 表：`users(8), channels(6), messages(10), channel_members(42), notifications(0)`。

**推论**：Express 后端**完全不在**好友+DM 删除范围内，无可删。

## 6. migrations/2026-07-19-social.sql 与线上实况

**迁移创建**：

1. 表 `public.friends`（6-14）：`id uuid PK, user_id FK, friend_id FK, status text default pending, created_at, UNIQUE(user_id,friend_id)`
2. RLS + 4 策略：`friends_select`(14-17)、`friends_insert`(19-22)、`friends_update`(24-27)、`friends_delete`(29-32)
3. RPC `notify_mentions(...)`(35-63) —— **非好友**，写 `mention` 通知，**必须保留**
4. RPC `create_friend_request(p_friend_id)`(67-85)，插 `friends` pending + `friend_request` 通知
5. RPC `respond_friend_request(p_friendship_id,p_action)`(89-113)：accept -> `status=accepted` + `friend_accepted` 通知；reject -> DELETE
6. RPC `remove_friend(p_friend_id)`(117-128)：双向删除

**线上实况（只读）**：

| 对象 | 类型 | 存在？ | 行数 |
|---|---|---|---|
| `friends` | table | **是** | **8**（4 accepted / 4 pending） |
| `friends_select/insert/update/delete` | policy | 是，但 `cmd=ALL`, `roles={public}`, `qual=null` | n/a |
| `friends_user_id_friend_id_key`, `friends_pkey` | index | 是 | n/a |
| `notify_mentions` | function | 是 | - |
| `create_friend_request` / `respond_friend_request` / `remove_friend` | function | 是 | - |
| `find_or_create_dm` / `notify_dm` / `search_users_safe` | function | 是，**但不在任何 migration 中**（CLI import 导入） | - |
| `channels` `type=dm` | rows | **不存在** | **0** |
| `channel_members` | rows | 全表 **0 行** | 0 |
| `notifications` `type=dm` | rows | 不存在 | 0 |
| `messages` 在 DM 频道 | rows | 不存在（187 条全属 5 个公开/公告频道） | 0 |

**重要发现**：线上 `friends` 策略与迁移文件**不一致**（线上 `cmd=ALL/roles={public}/qual=null`）。推论：线上被更早/不同的 SQL 初始化过，**该迁移文件不是线上的忠实记录**。另外 `roles={public}` + `qual=null` 在启用 RLS 的表上实际等于「对所有人放行」——独立安全问题，超出本次范围。

**DM 从未在线上使用**：无 dm 频道、`channel_members` 0 行、无 dm 通知、无 DM 消息。**推论**：DM 数据清理是 no-op，**线上无 DM 数据需要迁移/删除**。

## 7. 通知 `type` 取值 — 代码 vs DB，以及删除后失效的类型

| 取值 | 代码/迁移中的定义 | 线上 DB |
|---|---|---|
| `mention` | `if-client.js:577`；`app.js:4217,4658`；`social.sql:52`；`init schema:63`（`DEFAULT mention`）；`realtime-chat.sql:55`；`add_message_parent_id.sql:55`（`publish_message_realtime` 触发器） | **2** 行 |
| `system` | `2026-07-22-overturn-moderation-rpc.sql:65`；init 注释 | **9** 行 |
| `warning` | 线上 `apply_moderation`（不在 migration） | **18** 行 |
| `friend_request` | `social.sql:79`；消费于 `app.js:4158,4213,4661,4666` | **5** 行 |
| `friend_accepted` | `social.sql:100`；消费于 `app.js:4158,4661` | **7** 行 |
| `dm` | 线上 `notify_dm`（不在 migration）；消费于 `app.js:4210,4646`、`if-client.js:544` | **0** 行 |
| `friend` / `friend_request_received` | 仅 `app.js:4213` 兼容检查，**无生产者** | 0 行 |

- **`notifications.type` 无 CHECK 约束**。
- **删除后失效**：`dm`、`friend_request`、`friend_accepted` 全死；`friend`/`friend_request_received` 今日已死。
- **必须保留**：`mention`、`system`、`warning`。注意 `mention` 有两条独立生产路径：`publish_message_realtime` 触发器（**每次 messages INSERT 都触发**）+ `notify_mentions` RPC，两者均非好友。触发器位于 `realtime-chat.sql`/`add_message_parent_id.sql`，**不在 social.sql**，故删 social.sql 不影响它。

## 8. 设计文档作废情况

- `docs/plans/2026-07-19-dm-private-chat-design.md`：整个 DM 设计（`find_or_create_dm`、`type=dm` 频道、`#dm-back-btn`、`.dm-mode`、`#panel-friends-list`、`openDm`/`loadFriendsToPopup`、`notifyDm`、未读角标、GSAP 过渡）**完全作废**。
- `docs/plans/2026-07-19-social-center-design.md`：好友半边作废；**非好友半边必须保留** —— @提及通知管线（`notify_mentions` / `publish_message_realtime` / mention 红点 / 跳转到消息），以及该文档 第1节「通知铃+下拉」、5.1/5.2 mention 特性。该文档提议的 `server/routes/friends.js` 与 SQLite friends 迁移从未落地。

## 9. 安全删除顺序

原则：叶子到主干；绝不触碰共享的通知/提及管线。

**Phase A — 前端 JS（先删 DM，它是最外层叶子）**

1. 删 `app.js` **6375-6506**（DM 弹窗集群）。
2. 改 `app.js` **815-819**：`channels = filterDmChannels(list)` 改为 `channels = list`。**不要删 `loadChannels`**。
3. 改 `app.js` **3849-3870**：删 `if (currentChannel.type === "dm")` 分支(3851-3860)，把 `IF.notifyMentions` 提为无条件。**保留** `notifyMentions`。
4. 删 `app.js` **5079** `loadFriendsToPopup();`（保留 `updatePopupUserCard()`）。
5. 删好友 Tab **4406-4611**。`switchNotifyTab` 删除后，`#panel-notif` 需常显（或保留极简 handler）。
6. 删 **4197**、**4152** 的 `renderFriends()`，及好友 toast **4158-4161**。
7. 删 **4210**（dm 过滤）、**4213**（`isFriendReq`）、**4217** 好友图标条件、**4229/4235** 操作按钮、`respondToFriendRequest` **4269-4322**。
8. 删实时分支 **4646-4652**（dm）、**4661-4666**（好友）。保留 4653-4660（角标 + BoboFX）与 mention 分支。
9. `js/if-client.js` 删包装器 **588-689**（`searchUsers` 见备注），移除导出 **1009-1010** 中 6 个名字（保留 `getCurrentUserId`、`notifyMentions`）。

**原报告在此处（Phase A 第 9 步）被截断。** 待补全：

- Phase A 剩余：HTML 删除（1321-1325、1378、1390-1414、1684-1695）、CSS 删除（126 token、342-365、391-393、2336-2377、3491-3506、3906-3974）
- Phase B：InsForge 删除 `create_friend_request`、`respond_friend_request`、`remove_friend`、`find_or_create_dm`、`notify_dm`、`search_users_safe`、`friends` 表 + 4 策略 + 2 索引（需新 migration）
- Phase C：遗留数据清理（8 行 `friends`、5 行 `friend_request`、7 行 `friend_accepted`）——需 admin 权限
- 构建验证（`_build.mjs` 到 `web_build/`）
