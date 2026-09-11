# 宝丰一高校园频道 — 五workstream 改造设计

- 日期：2026-09-11
- 状态：**待用户审批**（未批准前不动代码）
- 依据：`docs/plans/recon/` 下三份只读侦察报告

## 0. 需求与已定决策

| # | 需求 | 决策 |
|---|---|---|
| 1 | 游客无需注册可访问站内全部信息 | 游客可读全站；**发言一律弹注册面板**。**点赞功能整体砍掉**（用户决定） |
| 2 | 查看啵宝记忆机制与所用模型 | 用户选 (c)：**不做任何 UI**。已口头汇报，无需实现 |
| 3 | 通知改造为信箱 + 手绘信件 + 点击定位 | 铃铛换信箱图标；点击播弹性缩放动画；信件展开；每条通知手绘风格；仅保留 评论/@/系统 三类 |
| 4 | 全面删除好友系统 | **好友 + 私聊(DM) 一起删干净** |
| 5 | 记忆树头像面板改为与主聊天频道一致 | 对齐主频道的 `.profile-card` / `.user-card-modal`（`js/app.js:6295` 那套） |

已定细节：
- 通知点击定位失败（内容已删/撤回）：**(i)** 跳转到该频道 + toast「原内容已不存在」
- 游客点自己头像：弹注册面板（替换 `js/app.js:6825` 的 `showLogin()`）
- 记忆树匿名发帖/评论：**(b) 保持开放**（后端策略不动；但前端入口弹注册）

## A. 已确认事实（关键项，详见 recon 三份报告）

1. **认证门禁唯一入口**是 `initAuth()`（`js/app.js:5937`）：`IF.getCurrentUser().then(u => { if (u) { currentUser = u; showMain(); } })`。`u` 为 null 时**什么都不发生**，用户停在 `#view-login`。无 router、无 guard。
2. `showMain()`(`app.js:785-804`) 与 `showMainWithTransition()`(`:873-890`) **无条件**解引用 `currentUser.nickname/.username/.avatar_url`。
3. **游客"可读全站"需改 RLS**：线上 `channels readable`/`messages readable`/`profiles readable` 均为 `TO authenticated USING (true)`，且 GRANT 只给 `authenticated`。实测 anon key 查这三表返回 **200 但 `[]`**（静默空，不报错）。
4. `notifications` 表实际列：`id, user_id, type, title, body, link, is_read, created_at`。**无** `comment_id`/`message_id`/`target_id`/`channel_id`/`url`。**唯一定位载体是 `link`(TEXT)**。
5. **评论通知今天不存在**：客户端只调 `notifyMentions`/`notifyDm`；`publish_message_realtime` 触发器只解析 `@`，**完全不看 `parent_id`**。
6. `scrollToMessage(msgId)`(`app.js:4123-4138`) **已支持定位评论**：第二顺位选择器即 `.msg-comment-item[data-comment-id]`（评论节点见 `app.js:3228`），并有 50×80ms≈4s 重试。
7. 好友/DM：`server/`（Express）**完全无关**（无 friends 路由、无 DM 房间、无 friends/dm 表）；全部在 `js/app.js`、`html/index.html`、`css/style.css`、`js/if-client.js` + InsForge。
8. 线上 `friends` 表 **8 行**、`friend_request` 通知 **5 行**、`friend_accepted` **7 行**。DM **零数据**（无 dm 频道、`channel_members` 0 行、无 dm 通知）。
9. `friends` 的线上策略与 `migrations/2026-07-19-social.sql` **不一致**（线上 `cmd=ALL/roles={public}/qual=null`）→ 迁移文件不是线上忠实记录。
10. 记忆树 `memory_posts`/`memory_comments` 的 `anon insert CHECK true` **今天已开放**（既有写入后门，本次按决策保留）。
11. **可复用手绘资产已存在**：信封 SVG(`html/memory-tree.html:220-259`，`mt-r-env-*`)、开盖 `.mt-r-env-flap{rotateX(38deg)}`(`letter-reader.css:132-133`)、弹性展开 `cubic-bezier(.2,.9,.3,1.15)`(`:136-145`)、`--t-spring: 0.4s cubic-bezier(.34,1.56,.64,1)`、`ms-stamp-press`、`ms-panel-unfold`、`.notify-empty` 手绘空态(`style.css:4184-4193`)、手绘虚线圆角惯用法(`style.css:266`)。
12. `REDUCED_MOTION` 在 `js/app.js:34`（**仅加载时求值一次**）；CSS 减动效主块 `style.css:3737-3762`。

## B. 数据库改动清单（全部需新 migration）

新建 `migrations/20260911xxxxxx_guest_and_cleanup.sql`（建议拆两个文件，见下）。

### B1. 游客只读（**新增 migration**）— 必须

```sql
-- channels / messages / profiles: SELECT 增加 anon
DROP POLICY IF EXISTS "channels readable" ON public.channels;
CREATE POLICY "channels readable" ON public.channels FOR SELECT TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "messages readable" ON public.messages;
CREATE POLICY "messages readable" ON public.messages FOR SELECT TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "profiles readable by authenticated" ON public.profiles;
CREATE POLICY "profiles readable" ON public.profiles FOR SELECT TO anon, authenticated USING (true);

GRANT SELECT ON public.channels, public.messages, public.profiles TO anon;
```

⚠️ 注意：`messages` 的 SELECT 放开后，**撤回/软删消息的过滤必须在查询层保证**（复核 `is_recalled` 等字段是否影响可见性）。`profiles` 放开后需确认不泄露敏感列（已有 `20260717223500_tighten_profiles_column_grants.sql` 做过列收紧，需复核其是否对 anon 生效）。

**不新建 `guest_likes`**（点赞已砍）。**`message_likes` 策略不动**。

### B2. 评论提醒（**新增 migration**）— 必须

新增评论通知写入逻辑，复用现有 `link` 列（不改表结构）：

```sql
-- 在 publish_message_realtime 中增加分支：
-- 若 NEW.parent_id IS NOT NULL 且父评论/帖子的作者 != NEW.author_id，
-- 插入 notifications(type='comment', user_id=<父作者>, title=..., body=..., link='/channel/{channel_id}#msg-{NEW.id}')
```

要点：
- 新增 `type='comment'`（表无 CHECK 约束，可直接用）。
- `link` 写 `/channel/{channel_id}#msg-{NEW.id}`，其中 id 是**评论自身的 messages.id**，与 `scrollToMessage` 第二顺位选择器对齐。
- 需同时把该函数更新落在 migration 里（`CREATE OR REPLACE FUNCTION publish_message_realtime`）。
- 去重：同一条评论只通知一次（靠 `messages` INSERT 单次触发天然满足）。
- 不通知自己（`parent 作者 = 评论作者` 时跳过）。

### B3. 好友/DM 清理（**新增 migration**）— 必须

```sql
-- 函数
DROP FUNCTION IF EXISTS public.create_friend_request(uuid);
DROP FUNCTION IF EXISTS public.respond_friend_request(uuid, text);
DROP FUNCTION IF EXISTS public.remove_friend(uuid);
DROP FUNCTION IF EXISTS public.find_or_create_dm(uuid);
DROP FUNCTION IF EXISTS public.notify_dm(uuid, uuid, uuid, uuid, text);
DROP FUNCTION IF EXISTS public.search_users_safe(text, integer);

-- 表（级联带走 4 条策略 + 2 个索引）
DROP TABLE IF EXISTS public.friends;
```

**必须保留**：`notify_mentions`、`publish_message_realtime`、`publish_notification_realtime`、`apply_moderation`、`overturn_moderation`、`is_admin`、`is_channel_member`。
⚠️ `friends` 的线上策略是 `roles={public}/qual=null`（对所有人放行）—— 删表同时消除这个安全隐患。

### B4. 遗留数据清理（**独立、可选**）

```sql
DELETE FROM public.notifications WHERE type IN ('friend_request','friend_accepted');
```

15 行孤儿通知。**需 admin/service key**，不能用 anon。建议与本批一起执行，但单独成文件以便回滚。**不做也不影响功能**。

### B5. 啵宝记忆表补档（**建议，非阻塞**）

`bobo_memories` / `bobo_reply_log` / `bobo_config` 及 RPC `bobo_memory_match`/`bobo_memory_upsert`/`bobo_uid`/`bobo_send`/`bobo_claim`/`bobo_rate_check`/`bobo_log` **只存在于线上，无本地 migration**。建议补一份建表脚本入库，避免丢失。

## C. 五个 workstream

### WS1 — 游客只读 + 发言弹注册

**新增共享 helper**：`requireAuth(action)` — 已登录则返回 true；游客则打开注册面板并返回 false。

**改动点**：
- `js/app.js:5937` `initAuth()`：`user` 为 null 时不再空转，改为设置**游客哨兵** `currentUser = { id: null, role: 'guest', nickname: '访客', username: '', isGuest: true }` 并调用 `showMainWithTransition()`。
  - 或用 `null` + 让 `showMain`/`showMainWithTransition`/`showProfile` null-safe。**推荐哨兵**（最小 diff），但必须配合下面的降级项。
- **注册面板**：新增一个独立的注册/登录面板组件（复用现有登录 UI 的设计语言），由 `requireAuth()` 唤起。**发言时弹出**。
- 在各写入处理器顶部插入 `requireAuth()`（recon §3 表）：
  - `sendMessage()` `app.js:3799`（守卫 `:3800` 由静默 return 改为弹面板）
  - `handleFileUpload()` `app.js:3970`
  - 转发 `app.js:3455-3470`、撤回 `app.js:2630-2633`
  - 资料编辑 `app.js:6987/7007`、头像 `app.js:7042`、卡面 `app.js:6661`
  - 记忆树发帖 `js/memory-tree.js:781`、评论 `:920`、图片 `:807`
  - 公告评论（同 sendMessage 路径）
- `openChipCard` `app.js:6825`：`!isLoggedIn()` 分支由 `showLogin()` 改为弹注册面板（仅当点的是自己/需要资料卡时）。
- **降级项（游客下）**：
  - 实时订阅 `chat:` / `notifications:` 策略均为 `TO authenticated` → 游客**跳过订阅**，避免报错噪音。`subscribeNotifications()` `app.js:4628` 已有 `if(!currentUser) return` 需改为 `if(!currentUser || currentUser.isGuest) return`。
  - 未读角标：游客隐藏（`updateNotifBadge` 处理 0/guest）。
  - 点赞 UI：已砍，但**渲染只读计数**处若调 `getLikeAggregates(ids, currentUser.id)` 需容忍 `null`（`app.js:2242,2293,3169,4944`）。
  - 管理员相关 `currentUser.role` 解引用点（`app.js:2519,2653` 无 null 检查）需加防护。

**依赖**：B1 迁移必须先上，否则游客只读到空数据。

### WS2 — 啵宝记忆机制/模型展示

**不做任何实现**（用户选 c）。仅在 recon 归档中留存机制说明。→ **本批不含此 workstream 的代码改动。**

### WS3 — 通知改造为信箱

**HTML**（`html/index.html`）：
- `#btn-notify`(`:1367`) 的铃铛 SVG → **信箱图标**（复用 `mt-r-env-*` 信封 SVG，`html/memory-tree.html:220-259`）。
- `#notify-dropdown`(`:1375`) → **信件容器**：手绘纸质卡片，展开态承载通知列表。
- 删除 `#tab-friends`(`:1381`) 与 `#panel-friends`(`:1393-1414`)（随 WS4）。`.notify-tabs` 只剩一个 tab 时，简化为常显 `#panel-notif`。
- 补 `aria-label`（现状只有 `title`）、`#notify-badge` 加 `aria-live`。

**CSS**（`css/style.css`）：
- 新增 `.mailbox-*` 命名空间，**只使用语义变量**（`--bg-elevated`、`--border-active`、`--text`、`--red`、`--r-md`、`--sh-lg`、`--t-spring`、`--font-hand`）。
- 信封开盖：复用 `.mt-r-env-flap{transform-origin:50% 30%; transition: transform .5s cubic-bezier(.2,.8,.3,1.1)}` → `rotateX(38deg)`。
- 蜡封：复用 `.mt-r-env-seal`（`translateY(3px) scale(.9)`）。
- 信件展开：复用 `cubic-bezier(.2,.9,.3,1.15)`（对应 `.mt-r-polaroid`）。
- 手绘风：复用 `.notify-empty` 的 `var(--font-hand)` + `::before ✏️` 手法；每条通知做成便签/信纸条目，用虚线边 + 不规则圆角（`border-radius: 14px 16px 12px 18px`）+ 偏移纸质阴影 `2px 4px 0 rgba(31,27,22,.07)`；可用 `--tape` 贴一条胶带（**仅在 `[data-theme="light"]` 下**）。
- 主题适配：`[data-theme="light"]` / `[data-theme="starry"]` / `[data-theme="classroom"]` 各补一份覆盖（现有 `.notify-dropdown` 已有 light(`:261`)/starry(`:1000`) 变体可参照）。
- **减动效**：新增 `.mailbox-*` 的 `@media (prefers-reduced-motion:reduce)` 规则（现有 `:3752` 只匹配 `.notify-dropdown`）。

**JS**（`js/app.js`）：
- `openNotifDropdown()`(`:4183-4197`) / `hideNotifDropdown()`(`:4361-4370`) 改为信箱开合：采用房屋惯例 `gsap.killTweensOf(root)` + `fromTo(root,{scale:.85,opacity:0,transformOrigin:'50% 0%'},{scale:1,opacity:1,duration:0.32,ease:'back.out(1.7)',clearProps:'transform'})`（与 `app.js:2610` 同风格）；关合用 `power2.in`。**`REDUCED_MOTION` 为真时直接显示/隐藏**（与现状 `:4191`/`:4364` 一致）。
- `loadNotifications()`(`:4200-4266`)：
  - 移除 `dm` 过滤(`:4209`)、`isFriendReq`(`:4213`)、好友图标分支(`:4217`)、好友同意/拒绝按钮(`:4222-4236`)、`respondToFriendRequest`(`:4268-4354`)。
  - 图标简化为三类：`comment` → 💬、`mention` → 📣、`system`（含 `warning`）→ 🔔。
  - **通知排序/分组**：手写信件式呈现建议按日期分组（今天/更早）。
  - **分页**：`listNotifications()`(`if-client.js:534-539`) **当前无 limit**，需加 `.limit(N)` + 分页或"最多显示 N 条"。
- **点击定位**（`:4238-4262`）：
  - 解析 `link`：需**同时兼容** `/channel/{id}#msg-{mid}` 与遗留 `channel/{id}`（无前导斜杠）。
  - 有 `#msg-{id}` → `switchChannel(ch, cb)` 后 `scrollToMessage(mid)`（**评论自动命中第二顺位选择器**）。
  - 无锚点或定位失败 → **跳转到该频道** + toast「原内容已不存在」+ 信件内该条标记失效。
  - 修正 `switchChannel` 前置判断（`:4249-4252`）——link 指向未加载频道时当前会静默无动作。
- 实时处理器 `notifRtHandler`(`:4643-4670`)：删除 `dm` 分支(`:4648-4655`) 与好友刷新/toast(`:4662-4668`)，保留 `mention` + 计数 + `BoboFX` + 新 `comment` 类型。
- `fetchUnreadCount()`(`:4146-4169`)：删除 `renderFriends()`(`:4152`) 与好友 toast(`:4155-4163`)。

**依赖**：B2 迁移（评论通知）必须先上，否则"评论通知"永远不产生。WS4 必须先删好友，否则通知里仍有好友类型。

### WS4 — 删除好友系统 + 私聊

按 recon §9 的安全顺序（叶子→主干），**先删 DM 再删好友**：

**Phase A — `js/app.js`**
1. 删 DM 弹窗集群 **6375-6506**。
2. `:815-819`：`channels = filterDmChannels(list)` → `channels = list`（**保留 `loadChannels`**）。
3. `:3849-3870`：删 `if (currentChannel.type === 'dm')` 分支(`:3851-3860`)，`IF.notifyMentions` 提为无条件。
4. 删 `:5079` `loadFriendsToPopup();`（保留 `updatePopupUserCard()`）。
5. 删好友 Tab **4406-4611**；`switchNotifyTab` 删除后 `#panel-notif` 常显。
6. 删 `:4197`、`:4152` 的 `renderFriends()`，及 `:4158-4161` 好友 toast。
7. 删 `:4210`、`:4213`、`:4217` 好友图标条件、`:4229/4235` 按钮、`:4269-4322` `respondToFriendRequest`。
8. 删实时分支 `:4646-4652`(dm)、`:4661-4666`(好友)；保留 `:4653-4660`。
9. `js/if-client.js`：删 `friendsList/friendRequest/friendRespond/friendRemove/findOrCreateDm/notifyDm`（`:588-689` 中相应函数），更新导出 `:1009-1010`（保留 `getCurrentUserId`、`notifyMentions`）。`unreadCount()` 的 `.neq('type','dm')`(`:544`) 可留可删。

**Phase A2 — HTML**
- 删 `:1321-1325`(dm-back-btn)、`:1378`(tab-friends)、`:1390-1414`(panel-friends)、`:1684-1695`(头像弹窗好友区)。

**Phase A3 — CSS**（注意媒体查询包裹）
- 删 `:126` 的 `.friend-item` token、`:342-365`、`:391-393`（light 变体）、`:2336-2377`、`:3491-3506`、`:3906-3974`。
- **保留** `.notify-tabs`/`.notify-tab`/`.notify-tab-panel`(`:2321-2334`)。
- ⚠️ `:3906-3974` 位于 `@media (prefers-reduced-motion:reduce)`(起 `:3725`) 内；`:2336-2377` 位于 `@media (max-width:768px)`(起 `:2222`) 内；`:3491-3506` 位于 `@media (max-width:900px)`(起 `:2947`) 内 —— 删除时不可破坏外层 `@media` 括号结构。

**Phase B — DB**：见 B3。

**Phase C — 文档**：把 `docs/plans/2026-07-19-dm-private-chat-design.md` 与 `2026-07-19-social-center-design.md` 标记作废（移入 `docs/archive/` 或加作废头）。**社交中心里 @提及通知部分仍需保留**，作废说明要写清。

### WS5 — 记忆树头像面板对齐主频道

**目标**：`js/memory-tree.js` 的 `openUserProfile()`(`:662-733`，产出 `.mt-user-card-*`) 改为与主频道 `window.openUserProfile`(`js/app.js:6295-6370`，产出 `.user-card-modal` + `.profile-card`) **视觉一致**。

**做法**：
- 把主频道的 `.profile-card` / `.user-card-modal` / `.user-card-close` CSS 从 `css/style.css:3356-3380` 迁移/复制到 `css/memory-tree.css`（或抽成共享样式表，两边都引）。
- 记忆树侧 HTML 结构改为 `.user-card-modal` + `.profile-card`（含 `.profile-avatar`/`.profile-name`/`.profile-username`/`.profile-title-row`/`.profile-title-badge`/`.profile-bio`/`.profile-stats`/`.ps-num`/`.ps-label`）。
- 保留记忆树的 iframe 内直接 `document.body.appendChild` 方案（注释 `memory-tree.js:660` 说明这是为规避移动 WebView postMessage 失效）。
- 保留异步补消息数逻辑（两边都查 `messages.count` by `author_id`）。

**注意**：`memory-tree.html` 是否加载 `css/style.css` 需确认；若未加载，则必须把样式复制进 `css/memory-tree.css`（recon 未确定此项，实施时先查）。

## D. 跨 workstream 冲突与排序

**冲突**：WS3（重建通知）与 WS4（删通知类型）都改通知集群；WS1/WS3/WS4/WS5 都改 `js/app.js` 与 `css/style.css`（巨型单文件，343KB/195KB）。

**串行化规则**：这些改动**必须串行**，不可并行编辑同一文件。推荐顺序：

```
B5(啵宝表补档, 独立)
  → WS4 好友+DM 删除（先清干净，通知里不再有好友类型）
  → B3 迁移
  → WS3 通知信箱（在干净的通知面上重建）
  → B2 评论通知迁移
  → WS1 游客只读（前端 + B1 迁移）
  → WS5 记忆树面板对齐（纯 CSS/HTML，独立性强）
```

理由：WS4 先做能让 WS3 只面对 3 种类型；WS1 的 `requireAuth` 会插入 `sendMessage` 等，与 WS3/WS4 无交集但同在 `app.js`，放其后避免冲突。

**行号漂移警告**：所有引用行号来自**改动前**的当前 HEAD。串行执行时每步后行号会漂移，实施各步前必须重新定位（用函数名/选择器定位，而非硬编码行号）。

**共享文件改写风险**：`js/app.js` 是 343KB 单文件，且工作区当前已有未提交改动（`css/style.css`、`html/index.html`、`js/main-bg.js` 为 modified）。**实施前需先确认这些改动是否要一起提交**（见「待确认」）。

## E. 风险与未知

1. **`html/index.html` 有未提交改动**（`git status` 显示 modified），另有 `js/main-bg.js`、`css/style.css` 已改。实施前必须确认这些改动状态，否则会与本次改动混在一起。
2. **`friends` 线上策略是 `roles={public}/qual=null`** —— 删表顺带修掉；但需确认没有其他表存在同类问题（本次不扩大范围）。
3. **`profiles` SELECT 放开给 anon 的隐私风险**：需复核 `20260717223500_tighten_profiles_column_grants.sql` 的列级收紧是否对 anon 生效；否则可能暴露邮箱等字段。**这是 WS1 的头号风险**。
4. **`messages` SELECT 放开给 anon**：需确认撤回/软删消息不会因此泄露。
5. **游客实时能力缺失**：`chat:`/`notifications:` 策略均 `TO authenticated`，游客天然无实时。→ 游客页面为**静态读取**，不自动刷新。是否可接受？如需接近实时，需另开 anon 订阅策略（会扩大改动，**本设计不做**）。
6. **评论通知的 `link` 复用方案**未改表结构，但依赖 `scrollToMessage` 的第二顺位选择器长期存在。若将来重构该函数，评论定位会失效。
7. **`listNotifications()` 无 limit**：信箱展开式 UI 必须加分页，否则数据增长后一次拉全表。
8. **`memory-tree.html` 是否加载 `css/style.css`** 未确定（影响 WS5 实现方式）。
9. **减动效旗标只在加载时求值一次**（`app.js:34`），不响应系统设置变化。属既有问题，本次不修。
10. **`html/v52..v72.html` 等归档快照**会被 `_build.mjs:69` 一起拷贝，其中含旧的好友/DM 代码。本次**不清理**它们（体积与范围问题）。

## F. 实施顺序与可独立交付项

| 阶段 | 内容 | 可独立交付 | 依赖 |
|---|---|---|---|
| P0 | B5 啵宝记忆表补档 migration | ✅ 是 | 无 |
| P1 | WS4 好友+DM 前端删除（Phase A/A2/A3） | ✅ 是（功能净减少） | 无（但需先确认未提交改动） |
| P2 | B3 好友/DM DB 清理 migration | ✅ 是 | P1 已上（否则前端引用已删函数） |
| P3 | WS3 通知信箱（HTML/CSS/JS） | ✅ 是 | P1+P2 |
| P4 | B2 评论通知 migration | ✅ 是 | P3（UI 需能显示 comment 类型） |
| P5 | B1 游客只读 migration | ⚠️ 单独上会让 anon 可读但前端仍拦在登录页 → 无可见效果，**无害** | 无 |
| P6 | WS1 游客前端（initAuth + requireAuth + 降级） | ✅ 是 | P5 |
| P7 | WS5 记忆树面板对齐 | ✅ 是 | 无（纯样式） |
| P8 | B4 遗留通知数据清理 | ✅ 是 | P2 |

**建议首批交付**：P1+P2（删好友/DM）—— 独立、零风险、可立刻验证。
**第二批**：P3+P4（信箱）—— 用户最想要的可视化改造。
**第三批**：P5+P6（游客）—— 涉及 RLS 与隐私，风险最高，建议单独验证。
**收尾**：P0、P7、P8。

## G. 测试计划

- **现有回归**：`tests/comment-thread-regression.test.mjs` 必须继续通过（评论串逻辑被 WS3 的评论通知触及）。
- **WS4**：登录后确认无好友 Tab、无 DM 入口、无 `.friend-*` 残留；`grep -n "friend\|dm-"` 应为 0；WebSocket 无订阅错误。
- **WS3**：三种类型（comment/mention/system）各造一条，验证：信箱动画、信件展开、手绘样式、点击定位（含评论定位）、失效兜底 toast、`prefers-reduced-motion` 下无动画、三种主题下均正常、移动端 900px 以下正常。
- **WS1**（关键）：**用匿名 key（无 session）实际加载页面**，验证：能看到频道与消息（非空数组）、能点开发言触发注册面板、注册面板可完成注册并继承游客浏览位置、管理员按钮对此角色不可见、无 `TypeError` 控制台报错。⚠️ **必须实测 anon 读到的数据非空**，否则 B1 迁移没生效。
- **WS5**：记忆树点头像 → 面板与主频道资料卡**逐项比对**（头像/昵称/username/称号/身份/统计三项）。
- **构建**：`node _build.mjs` 输出 `web_build/` 无错。

## H. 待确认（实施前需用户答复）

1. **工作区现有未提交改动**（`css/style.css`、`html/index.html`、`js/main-bg.js`）—— 是本次一起做，还是先提交/暂存？
2. **游客实时缺失可接受吗**？（游客页面为静态读取，聊天不会自动刷新；发消息后也看不到实时推送。若要实时，需额外给 `chat:` 加 anon 订阅策略。）
3. **首批是否按建议从「删好友/DM」开始**？
4. **注册面板的形态**：复用现有手绘怪物登录 UI（`html/index.html:2464-2620`）作为弹层，还是新做一个更轻的注册卡？
