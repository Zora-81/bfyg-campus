# Recon: 通知 → 信箱改造（含可复用资产）

> 侦察产出（只读）。证据来自本仓库 + 线上 InsForge 只读 REST 查询。
> 结论：**这是"重做 + 补后端"**，不只是换皮。三项关键发现见 §8。

## 1. 现状实现

### 1a. html/index.html — 标记

- `#notify-wrap` 容器：`:1365`（注释 `<!-- Notification bell -->` 在 `:1363`）。
- `#btn-notify`：`:1367`；内联图标是 **SVG 铃铛**，`title="通知"`：`:1368`。**这就是要换成信箱图标的节点**。
- `#notify-badge`：`:1373`（内联 `display:none`，默认文本 `0`）。
- `#notify-dropdown`：`:1375`（内联 `display:none`）。
- `.notify-tabs` 包装：`:1377`；`#tab-notif`（默认 active）`:1379`；`#tab-friends` `:1381`。
- `#panel-notif`：`:1385`；`.notify-header`（含 `#notify-mark-all` "全部已读"）`:1387`；`#notify-list`（初始 `.notify-empty` "暂无通知"）`:1389`。
- `#panel-friends`（内联 `display:none`）`:1393`；含 `#friends-list`(`:1399`)、`#friends-requests`(`:1403`)、`#friend-search-results`(`:1405`)、`#friend-add-input`(`:1409`)、`#friend-add-btn`(`:1413`)。
  → **好友 Tab 与通知下拉同体**，删好友后需一并处理。
- index.html 内**没有**信封 SVG；铃铛 SVG 是唯一图标。
- `#notify-time` 元素在 HTML/JS 中**不存在**（`css/style.css:4268` 的 `.notify-time` 是死代码）。

### 1b. js/app.js — 通知集群

DOM 引用：`:102-106`（`btnNotify`/`notifyBadge`/`notifyDropdown`/`notifyList`/`notifyMarkAll`）。

| 函数 | 行 | 说明 |
|---|---|---|
| `highlightMessageNode(node)` | **4115-4121** | 移除 `.msg-highlight`、强制回流、重加；2400ms 后移除 |
| `scrollToMessage(msgId)` | **4123-4138** | 见 §3 |
| `unreadNotifCount` | 4144 | 状态 |
| `fetchUnreadCount()` | **4146-4169** | 调 `IF.unreadCount()`；计数上升时 `renderFriends()` + 刷新开着的下拉 + `friend_request`/`friend_accepted` toast（`:4155-4163`）——该分支随好友删除 |
| `updateNotifBadge()` | **4171-4180** | `display:flex/none`，上限 `99+` |
| `notifyOpen` | 4182 | 开关标志 |
| `openNotifDropdown()` | **4183-4197** | 开则关；设 `display:block`；**GSAP `from{opacity:0,y:-8,duration:0.24,ease:'power2.out'}`**，受 `!REDUCED_MOTION && gsap` 保护（`:4191`）；随后 `loadNotifications()` + `renderFriends()` |
| `loadNotifications()` | **4200-4266** | `IF.listNotifications()`；**跳过 `type==='dm'`**（`:4209`）；图标 `💬`(mention) / `👋`(friend-*) / `🔔`(`:4217`)；好友行带同意/拒绝按钮（`:4222-4236`） |
| 单项点击 | **4238-4262** | `markNotifRead(n.id)`；解析 `n.link` → `/channel/{id}#msg-{id}`；`switchChannel(ch, cb)` 后 `scrollToMessage(msgId)`；再 `hideNotifDropdown()`。**无评论 id 处理，`n.link` 是唯一定位载体** |
| `respondToFriendRequest()` | 4268-4354 | 仅好友请求 |
| `markNotifRead(id)` | **4356-4359** | `IF.markRead(id)` + 计数减一 |
| `hideNotifDropdown()` | **4361-4370** | GSAP `to{opacity:0,y:-8,duration:0.16,ease:'power2.in'}`；减动效直接隐藏（`:4364`） |
| `markAllRead()` | **4372-4378** | `IF.markAllRead()` |
| 事件绑定 | **4380-4381** | `btnNotify` click → `openNotifDropdown()`；`notifyMarkAll` → `markAllRead` |
| 外点关闭 | **4391-4395** | 忽略 `#notify-wrap` 内点击 |
| Esc 处理 | 4398-4402 | 只关输入条，**不关下拉** |
| `switchNotifyTab(tab)` | **4417-4425** | 切 tab/panel；调 `renderFriends()` |
| **实时订阅** | **4615-4679** | `subscribeNotifications()`；频道 `'notifications:'+uid`(`:4634`)；失败时 4s 轮询兜底 `startNotifFallbackPoll()`(`:4619-4628`)；处理器 `notifRtHandler`(`:4643-4670`)：忽略他人记录；`dm` → 好友角标并提前 return(`:4648-4655`)；否则计数自增、`updateNotifBadge()`、`BoboFX.mention()/message()`、刷新下拉、好友刷新+toast(`:4662-4668`) |
| **轮询兜底** | **4682-4686** | `setInterval(15000)` → `fetchUnreadCount()`（页面可见时） |

退出登录时清理实时订阅：`js/app.js:394-401`。

### 1c. js/if-client.js — 4 个数据接口

- `listNotifications()` `:534-539` — `.select('*').order('created_at',{ascending:false})`，**无 limit、无 type 过滤**。
- `unreadCount()` `:541-548` — `count exact, head:true`，`.eq('is_read',false).neq('type','dm')`。
- `markRead(id)` `:550-552`；`markAllRead()` `:554-556`。
- `notifyMentions()` `:576-583` → RPC `notify_mentions`；`notifyDm()` `:670-677` → RPC `notify_dm`。
- 导出 `:1009-1010`。

### 1d. css/style.css — `.notify-*` 规则位置

| 选择器 | 行 |
|---|---|
| `.notify-wrap` | **2288** |
| `.notify-badge` | **2289-2295**（后被 4205-4212 覆盖为"红印章"） |
| `.notify-dropdown` | **2296-2301**（`absolute; top:calc(100%+8px); right:0; width:320px; max-height:400px; z-index:100`） |
| `.notify-header` | 2302-2306 |
| `.notify-mark-all` | 2307-2310 |
| `.notify-list` | 2311 |
| `.notify-item` / `:hover` / `.unread` | 2312-2317 |
| `.notify-icon` / `-body` / `-title` / `-preview` | 2318-2321 |
| `.notify-empty` | 2322（手绘空态在 **4184-4193**：`var(--font-hand)` + `::before "✏️"` 旋转 -8°） |
| `.notify-actions` / `-btn` / `-accept` / `-reject` / `-status` | 2323-2330 |
| `.notify-tabs` / `.notify-tab` / `.notify-tab-panel` | 2333-2345 |
| **主题变体** | `[data-theme="light"] .notify-dropdown` → **261**（虚线边、不规则圆角 `14px 16px 12px 18px`、纸质阴影）；`[data-theme="starry"]` → **1000**（玻璃 `backdrop-filter: blur(18px) saturate(1.3)`） |
| **移动端 MQ** | `@media (max-width:900px)` 起 **3556**；`.notify-dropdown` 在 **3723** |
| **减动效 MQ** | `@media (prefers-reduced-motion: reduce)` 起 **3737**；`.notify-dropdown` 在 **3752**、**3758** |

## 2. 数据模型（线上实测为准）

### 2a. 列探测（权威，优先于迁移文件）

`GET /api/database/records/notifications?select=<col>&limit=1`：

| 列 | HTTP | 结论 |
|---|---|---|
| `link` | **200** | ✅ 存在 |
| `url` | **400** | ❌ 不存在 |
| `target_id` | **400** | ❌ |
| `message_id` | **400** | ❌ |
| `comment_id` | **400** | ❌ |
| `channel_id` | **400** | ❌ |

实际列：`id, user_id, type, title, body, link, is_read, created_at`。**全表 41 行**。
线上 `type` 分布（30 行样本）：`warning` 14、`friend_accepted` 6、`system` 5、`friend_request` 4、`mention` 1。

DDL（与线上一致）：`migrations/20260716081609_init-campus-schema.sql:60-69`：
`id UUID PK, user_id UUID → auth.users, type TEXT NOT NULL DEFAULT 'mention', title TEXT NOT NULL, body TEXT DEFAULT '', link TEXT DEFAULT '', is_read BOOLEAN DEFAULT false, created_at TIMESTAMPTZ DEFAULT NOW()`
索引 `idx_notifications_user(user_id,is_read)`（`:76`）；RLS "notifications all self"（`:193-196`）；`GRANT ALL TO authenticated`（`:212`）。

### 2b. 线上 `link` 格式实测

- mention：`/channel/{channelId}#msg-{messageId}`（**唯一带消息锚点的行**）
- warning/moderation：`/channel/{channelId}`（无 `#`）
- friend_request：`/friends/request?id={uuid}`
- friend_accepted / system：`link = ''`（空）
- 另有遗留格式 `channel/{uuid}`（**无前导斜杠**，由 `publish_message_realtime` 产生）

### 2c. 结论

**唯一取址载体是 `link`（TEXT）**，无 `target_id`/`message_id`/`comment_id`/`channel_id`。
- `mention` 已有精确 `#msg-` 锚点 → 可直接跳。
- `system`/公告类常为**空 link** → 无跳转目标（走兜底 (i)：跳频道 + toast）。
- **评论/reply 类通知无处存放定位信息** → 见 §3、§4。

## 3. 点击定位现状

`highlightMessageNode` `:4115-4121`；`scrollToMessage(msgId)` `:4123-4138` 依序尝试选择器：

1. `messagesArea.querySelector('.msg-group[data-msg-id="'+msgId+'"]')`（`:4126`）
2. `document.querySelector('.msg-comment-item[data-comment-id="'+msgId+'"]')`（`:4128`）← **评论选择器已存在**
3. `document.querySelector('[data-id="'+msgId+'"]')`（`:4129`）

然后 `scrollIntoView({behavior: REDUCED_MOTION?'auto':'smooth', block:'center'})` + 高亮（`:4131-4134`）。重试最多 **50 次 × 80ms（约 4s）**（`:4136-4137`），等待频道渲染/网络。

评论节点确实带该属性：`js/app.js:3228` `'<div class="msg-comment-item" data-comment-id="'+comment.id+'" data-depth="'+depth+'">'`。评论本身是 `messages` 行（`parent_id` 非空）。

**判定**：
- 客户端**已能**定位评论——只要把评论的 message id 交给它。
- 但**通知行无法携带该 id**：无 `comment_id`/`message_id` 列，且**评论通知根本不存在**（§4）。
- **结论（明确陈述）**：评论类点击定位**需要后端改动**。方案 (a)：新增写入路径，把 `link` 写成 `/channel/{channelId}#msg-{commentId}`——**复用现有 text 列，无需改表结构**，只需一个新增 INSERT 路径的迁移；方案 (b)：新增 `target_id UUID` 列（改表结构）。**方案 (a) 已足够**，因为 `scrollToMessage` 本来就会尝试 `.msg-comment-item[data-comment-id]`。
- 注意：跳转前必须先 `switchChannel(ch, cb)`（`:2182`）；而现有点击处理只在 `channels.find(...)` 命中**已知频道**时才进频道（`:4249-4252`）——指向未加载频道的 link 今天会静默无动作。

## 4. 通知创建点 —— 以及**评论通知的缺口**

### 4a. 线上写入者

线上 `/api/database/functions` 共 28 个函数，**仅 6 个**触碰 `notifications`：`apply_moderation`、`create_friend_request`、`notify_dm`、`notify_mentions`、`overturn_moderation`、`publish_notification_realtime`（后者只广播）。

线上仅 **3 个触发器**：

```
messages       message_published       AFTER INSERT ROW -> publish_message_realtime()
notifications  notification_published  AFTER INSERT ROW -> publish_notification_realtime()
profiles       trg_block_privileged_role_change BEFORE UPDATE ROW -> block_privileged_role_change()
```

- `publish_message_realtime()`（线上实现）：发布 `chat:{channel}`，然后**仅对 `content_type='text'`** 用 `@(\S+)` 正则匹配 `profiles.username`，插入 `type='mention'`，`link = 'channel/' || NEW.channel_id` —— **无前导斜杠、无 `#msg-` 锚点**（遗留路径）。**完全不看 `NEW.parent_id`**。
- `notify_mentions(p_message_id,p_author_id,p_channel_id,p_content)`（线上）：较新的客户端调用 RPC，插 `type='mention'`，`link = '/channel/{channel_id}#msg-{p_message_id}'`（锚点正确）。由 `js/app.js:3863-3869` 在 `IF.sendMessage` 成功后调用。
- `notify_dm(...)`：写 `dm` 行；由 `js/app.js:3854-3861` 在 DM 频道调用。
- `apply_moderation`/`overturn_moderation` 写 `warning`/`system`（`apply_moderation` 插 `type='warning'`，`title` 如 `你已被禁言1天`，`link='/channel/'||channel_id`）。
- `create_friend_request`/`respond_friend_request` 写 `friend_request`/`friend_accepted`。

### 4b. **缺口：评论你的帖子，今天不发通知**

- 客户端：`sendMessage()`（`js/app.js:3799-3890`）通过 `IF.sendMessage(channelId, text, uid, parentId)` 发评论（`:3847`）；成功后**只**调 `IF.notifyMentions(...)`(`:3863`) 或 `IF.notifyDm(...)`(`:3854`) —— **没有"通知帖子作者"的调用**。
- 服务端：`messages` 上唯一触发器 `message_published → publish_message_realtime()`，其通知分支**只解析 @**，从不看 `NEW.parent_id`（§4a）。
- `migrations/*.sql` 中 grep 评论/reply + notifications 插入 → **无结果**；`20260717180000_add_message_parent_id.sql:38-70` 与 `20260716082010_realtime-chat.sql:40-70` 是**同一个只处理 mention 的触发器体**，它给实时负载加了 `parent_id`，**但没有新增 reply 通知分支**。
- `js/memory-comments.js:63-74`（记忆树评论）插入时**完全没有任何通知**。

**结论**：把"评论/reply"作为信箱一类，**需要新增后端逻辑**（在 `publish_message_realtime` 加 `parent_id IS NOT NULL` 分支，或新增专用触发器），不是纯 UI 工作。

## 5. 可复用的手绘资产（关键发现）

### 5a. 信封 SVG + 开盖动效（**已有，直接复用**）

结构：`.mt-r-reader` 全屏层（`position:fixed;inset:0;z-index:50;opacity:0;transition:opacity .5s`，`.open{opacity:1}`，`css/letter-reader.css:10-17`）；`.mt-r-envelope`（右下绝对定位）→ `.mt-r-env-btn` → SVG（`:125-135`）；`.mt-r-polaroid`（照片展开卡，`:136-153`）。

**信封 SVG**：`html/memory-tree.html:220-259`，`viewBox="0 0 100 72"`，`<defs>` 渐变 `#mt-r-paper`（米色）、`#mt-r-flap`、`#mt-r-wax`（红色径向蜡）；主体 `<rect>` + 信封盖 `<g class="mt-r-env-flap">` + 蜡封 `<g class="mt-r-env-seal">`（椭圆 + 3 个溅点 + 2 个环）。

**关键动效（`css/letter-reader.css`）**：

- `@keyframes mt-r-envfloat {0%,100%{translateY(0)} 50%{translateY(-3px)}}`，4.5s 悬浮（`:130`），hover 暂停（`:131`）。
- `.mt-r-env-flap { transition: transform .5s cubic-bezier(.2,.8,.3,1.1); transform-origin:50% 30% }`，`.active` 时 `rotateX(38deg)` —— **开盖动效**（`:132-133`）。
- `.mt-r-env-seal { transition: transform .4s ease, opacity .3s; transform-origin:50% 50% }`，`.active` → `translateY(3px) scale(.9); opacity:.85`（`:134-135`）。
- `.mt-r-polaroid` 展开：`translateY(14px) scale(.55) rotate(-3deg)` → `.open` `translateY(0) scale(1) rotate(-2deg)`，`transition: all .45s cubic-bezier(.2,.9,.3,1.15)`（`:136-145`）—— **正是要求的"缩放展开 + 弹性"手感**。
- 另有 `@keyframes mt-r-typeblink`(`:100`)、`mt-r-envshake`(`:181`)、`mt-r-loadbar`(`:193`)。
- 开合逻辑是普通 `classList.toggle`：`js/letter-reader.js:437-441`。

**复用判定**：
- ✅ **高度可复用**：信封 SVG + `.mt-r-env-flap`/`.mt-r-env-seal` 过渡 + `.mt-r-polaroid` 弹性展开，可直接移植为新的 `.mailbox-*` 组件（拷贝 SVG、改类名、保留 `cubic-bezier(.2,.9,.3,1.15)`）。
- ❌ **应丢弃**：底下的 three.js 粒子画布（`.mt-r-canvas`，`initScene`/`requestAnimationFrame` 循环 `:516-528`）——对信箱完全冗余且重。
- ⚠️ `letter-reader.css` / `memory-tree.html` 属于 `memory-tree.html` 页面；主页面 `index.html` 要用需拷贝 CSS/SVG 或显式引入样式表。

### 5b. `css/manuscript-v2.css` — 「校园手稿」sketch 语言

全部规则作用域为 `[data-theme="light"]`。可复用 token（`:7-17`）：

```
--font-hand: "LXGW WenKai","Kaiti SC","STKaiti","KaiTi","DFKai-SB",cursive
--ink-red:#D9573F  --ink-blue:#2E5EAA  --highlighter:#FFD65A
--tape: rgba(255,214,90,0.45)  --paper-hole: rgba(31,27,22,0.14)
--note-a:#FFFDF7 --note-b:#FDF6EC --note-c:#F4F7F2 --note-d:#F2F6FD
--stamp-a:#F26B4C --stamp-b:#C93A1D
```

具体手绘惯用法：
- **纸张纹理/横线/红边线**：`[data-theme="light"] #main-bg` repeating-gradient 横线 + `::after` SVG 噪点（`:21-47`）。
- **笔记本封面抽屉 + 打孔**：`.channel-drawer`（`:49-57`）。
- **手写体 + 荧光笔划线**：`font-family: var(--font-hand)`（`:58-66`）、`linear-gradient(104deg,…)` 荧光笔（`:69-87`）。
- **便签频道项**：`.ch-list .ch-item` `border:1.5px dashed` + `nth-child(4n+1..4)` 微旋转（`-0.55deg/0.45deg/-0.25deg/0.35deg`）（`:221-241`），hover `translateY(-2px) rotate(0)`。
- **胶带 `--tape`**：用于 `:127, 250, 392, 435, 467, 567, 950`（含 `rotate(-2.5deg)` `:950`）。
- **关键帧**：`@keyframes ms-stamp-press` 配 `animation: ms-stamp-press 0.28s cubic-bezier(0.34,1.56,0.64,1)`（`:311-319`，**弹性按压**）；`@keyframes ms-panel-unfold`（`:491`，**面板展开**）；`msCurBlink`(`:900`)；`onPulse`(`:911`)。
- **不规则手绘圆角惯用法**（`css/style.css:266`，通知下拉也用了）：`border: 1.5px dashed var(--border-active); border-radius: 14px 16px 12px 18px; box-shadow: 2px 4px 0 rgba(31,27,22,0.07)`。

### 5c. 现有 GSAP 惯例（house style）

- 全局旗标 `js/app.js:34`；始终 `typeof gsap !== 'undefined' && !REDUCED_MOTION` 保护。
- 标准弹层开关：`gsap.killTweensOf(el)` → `from/fromTo` 进入 → `to(..., onComplete: hide)` 退出。通知下拉即范例：开 `{opacity:0,y:-8,duration:0.24,ease:'power2.out'}`(`:4193`)，关 `{opacity:0,y:-8,duration:0.16,ease:'power2.in'}`(`:4369`)。
- `killTweensOf` 共 23 处使用。
- 缓动分布：`power2.out` ×35、`power2.in` ×7、`power3.out` ×4、`back.out(2)` ×5、`back.out(1.4)` ×3、`elastic.out` ×2。时长集中在 `0.16–0.55`（众数 `0.3/0.4`）。**弹性弹层用 `back.out(1.4–2)` + 时长 `0.22–0.4`**（例 `:2610` `fromTo(pop,{opacity:0,x:12,scale:.9},{…,duration:0.22,ease:'back.out(2)'})`）。
- 进屋习惯：进场动画后 `clearProps`（`:1254,1264,1425,1648`），避免残留 transform。

## 6. 设计 token（跨主题契约）

`:root`：`css/style.css:4-98`（基线为深色）。关键变量：

- 表面：`--bg-base #161830`、`--bg-surface #1e2140`、**`--bg-elevated #282c4a`**、`--bg-hover`、`--bg-input`、`--bg-card`
- 文本：`--text #eef0f6`、`--text-sec`、`--text-dim`、`--text-muted`、`--text-link #a78bfa`
- 强调：`--accent #7c5cfc`、`--accent-hover/active/light`、**`--accent-soft`**
- 语义：`--red`、`--red-bg`、`--green`、`--yellow`、`--orange`、`--warning`、`--blue`、`--cyan`
- 边框/圆角：`--border`、`--border-light`、**`--border-active`**、`--border-focus`、`--r-xs 4/--r 8/--r-md 12/--r-lg 16/--r-xl 24`
- 阴影：`--sh-sm`、`--sh`、`--sh-lg`、`--sh-card`
- 动效：`--t: 0.18s ease`、**`--t-spring: 0.4s cubic-bezier(.34,1.56,.64,1)`**、`--t-smooth`

主题覆盖块：`[data-theme="light"]` **:178-249**（纸质调色板 `--paper/--paper-card/--ink/--pencil/--line`，重映射全部表面/文本/强调变量，阴影换成偏移手绘阴影 `--sh-sm: 2px 3px 0 rgba(31,27,22,.04)`）；`[data-theme="classroom"]` **:861**；`[data-theme="starry"]` **:919**（加玻璃 `backdrop-filter`）。

**约束**：新信箱 UI 必须**只用语义变量**，不得硬编码颜色；`--tape`/`--ink-red`/`--highlighter` 只能在 `[data-theme="light"]` 保护下使用。任何硬编码 `rgba(255,255,255,…)` 在浅色纸主题下会坏——现有 `.notify-badge` 就因此需要在 `:4205-4212` 覆盖一次。

## 7. 动效 / 可访问性

- JS 旗标 `var REDUCED_MOTION = !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);` 在 **`js/app.js:34`**，**仅加载时求值一次，不监听变化**。另有一份局部 `_reduceMotion`(`:1333`)。
- CSS：`@media (prefers-reduced-motion: reduce)` 块位于 `1268, 1640, 2656, 2705, 3737, 4436`；主块 `:3737-3762` 全局把动画/过渡压到 `0.01ms !important`、`scroll-behavior:auto`，并针对 `.notify-dropdown` 设 `animation:none !important` 与 `[style*="block"]{opacity:1!important;transform:none!important}`。
- `letter-reader.css` **自身没有** reduced-motion 保护。
- `html/index.html` 两个图标按钮只有 `title`，**无 `aria-label`**；`#notify-badge` 无 `aria-live`/`role`。

**要求**：新信箱动效必须在 `REDUCED_MOTION` 为真时直接跳过（与现有 `openNotifDropdown`/`hideNotifDropdown` 一致）；**并额外**为新 `.mailbox-*` 元素补一条 CSS `@media (prefers-reduced-motion:reduce)` 规则（现有 `:3752` 只匹配 `.notify-dropdown`）；采用 `killTweensOf` + `back.out` + `clearProps` 惯例。

## 8. 三项关键结论（决定工作量）

1. **通知表只有 `link` 一个定位载体**，无 `comment_id`/`message_id`/`target_id` 列 → 评论类定位走"复用 `link` 写 `#msg-{commentId}`"，**无需改表结构，但需新增写入路径的迁移**。
2. **评论通知今天完全不存在**——服务端触发器只看 `@`，客户端只调 `notifyMentions`/`notifyDm`。所以"评论通知"是**新增后端逻辑**。
3. **信箱的手绘视觉 + 弹性开合动画已有现成资产可复用**（信封 SVG、`mt-r-env-flap`、`mt-r-polaroid` 的 `cubic-bezier(.2,.9,.3,1.15)`、`--t-spring`、`ms-stamp-press`、`ms-panel-unfold`），不必从零发明。

**风险**：① 好友 Tab 与通知下拉同体（`html/index.html:1393`），删好友后会残留孤儿；② `listNotifications()` **无 limit**（`if-client.js:536`），信箱展开式信件需要分页；③ 线上遗留 `link = 'channel/{id}'`（无前导斜杠），现有解析器会误处理。
