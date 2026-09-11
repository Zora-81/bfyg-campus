# Recon: 游客模式（只读浏览 + 发言弹注册）

> 侦察产出（只读）。证据来自本仓库 + 线上 InsForge 只读 REST 查询。
> 会话决定：**点赞已整体砍掉**；游客可读全站，发言（含评论/发帖）一律弹注册面板。
> 记忆树匿名写入：**保留开放**（用户选 b）。
> 游客点自己头像：改为弹注册面板。

## 0. 环境注记

- `.insforge/project.json` 指向 `r683ebwu`（项目 `baofeng-campus`）；`.env.local` 指向**另一个**项目 `4s5jyjbh`。前端硬编码 `INS_FORGE_URL='https://api.bfgzlt.cc.cd'`（Cloudflare Worker 反代），兜底 `r683ebwu`（`js/if-client.js:9-13`）。本报告实测针对 `r683ebwu`。

## 1. 认证门禁（高置信）

**没有 router，也没有 guard 函数。** 认证态是单个模块级变量推导出的布尔值；显示 app shell 由两个几乎重复的函数完成。

事实：

- **app shell 可见性**：`html/index.html:986` `<div id="view-login" class="view active">`；`html/index.html:1312` `<div id="view-main" class="view" aria-hidden="true">`。加载时 login 视图 active，main 不是。
- **`main-active` body class** 仅在 `showMain()`（`js/app.js:783`）与 `showMainWithTransition()`（`js/app.js:871`）添加；在 `showLogin()`（`js/app.js:910`）移除。它是 CSS 钩子，**不是**门禁本身。
- **唯一真值来源**：`js/app.js:46` `var currentUser = null;`；`js/app.js:766` `function isLoggedIn() { return !!currentUser; }`（注释：token 废弃，cookie 会话，仅检查 currentUser）。
- **唯一的门禁函数 `initAuth()`**（`js/app.js:5937`）：
  `IF.getCurrentUser().then(function(user){ if (user) { currentUser = user; showMain(); } })`
  接线于 `js/app.js:5946-5947`。**若 `user` 为 null，什么都不发生——用户停在 `view-login`/welcome。这就是那道门。**
- `IF.getCurrentUser`（`js/if-client.js:339-344`）：调 `insforge.auth.getCurrentUser()`；`error || !data || !data.user` 时返回 `null`；否则 `loadProfiles()` + `adaptUser()`。
- `IF_READY` 在 `js/if-client.js:1021` 派发；**没有 `IF.onAuthStateChange` 导出**——应用从不订阅 SDK 认证态变化。
- **两条登录路径**，都汇入 `onLoginSuccess` → `showMainWithTransition`：
  1. `html/index.html:2464-2620` 内联脚本（**当前生效**的手绘怪物登录 UI）：`frontForm` submit → `IF.signIn` → `enterMain(user)` → `window.__onLoginSuccess(user)`（`:2495-2505`，处理器 `2578-2596`）。
  2. 遗留 `#login-form`（`js/app.js:5337-5404`），经 `onLoginSuccess`（`js/app.js:5432-5450`）。
- `onLoginSuccess`（`js/app.js:5432`）设 `currentUser = u`，再 `hideLoginLoader(function(){ showMainWithTransition(); })`。
- **会话持久化**全在 SDK 内（注释 `js/app.js:939`：InsForge 会话由 cookie 管理，无需本地 token）；`js/if-client.js:30-31` 读 `insforge.auth.tokenManager.getAccessToken()`。
- **回主/守卫点**：`js/app.js:958` `if(!isLoggedIn()){ showLogin(); return; }`；`js/app.js:6825` `openChipCard` 同款；`js/app.js:6727` 登出清 `currentUser=null` 后 `showLogin()`。

**最小改动**：在 `initAuth()`（`js/app.js:5937-5945`）中，当 `user` 为 null 时不再空转，而是仍然揭示 app shell（`showMainWithTransition()`），并提供一个**游客哨兵** `currentUser`（或 `null` + 让 `showMain` 容忍）。因为 `showMain()`(`:785-804`) 与 `showMainWithTransition()`(`:873-890`) 都**无条件**解引用 `currentUser.nickname/.username/.avatar_url`，两条路：(a) 合成游客对象（如 `{id:null, role:'guest', nickname:'访客'}`），(b) 让两个函数 null-safe。**合成哨兵是最小 diff**，但每个用 `currentUser.id` 构造的后端调用都必须拦住（§3/§6）。

## 2. 客户端认证面 —— **匿名登录不存在**（高置信）

`IF` 导出（`js/if-client.js:1002-1018`）中的认证相关项：`signIn`(142-155)、`signUp`(157-263，主路径走**裸 REST** `POST /api/auth/users` :217)、`signOut`(280-283)、`getCurrentUser`(339-344)、`verifyEmail`(288-310)、`resendVerification`(312-316)、`sendResetPasswordEmail`(319-323)、`exchangeResetPasswordToken`(326-330)、`resetPassword`(333-337)、`getCurrentUserId`(565-573)、`updateMyProfile`(104-118)、`ensureProfile`/`completePendingProfile`/`loadProfiles`/`adaptUser`/`resolveAuthor`。

**`IF` 无 `onAuthStateChange`、无 `getSession`、无 token refresh、无任何 anonymous/guest 导出。**

**`@insforge/sdk` 1.4.4**（前端 `js/if-client.js:7` 从 jsDelivr 引 1.4.4；`functions/node_modules/@insforge/sdk` 也是 1.4.4）的 `Auth` 类完整方法（`dist/client-Dh7GOydb.d.ts:229-371`）：
`onAuthStateChange, signUp, signInWithPassword, signOut, signInWithOAuth, exchangeOAuthCode, signInWithIdToken, refreshSession, getCurrentUser, getProfile, setProfile, resendVerificationEmail, verifyEmail, sendResetPasswordEmail, exchangeResetPasswordToken, resetPassword, getPublicAuthConfig`。

对 `dist/` 全目录 grep `anonym|guest|deviceId|is_anonymous|isAnonymous` → **0 命中**（只有一处文档注释 "Anonymous API key (optional)"，指的是 **anonKey**，不是匿名用户）。

佐证：
- `SDK-REFERENCE.md:191-350` 的 Auth Methods 列表**无匿名方法**。
- `@insforge/shared-schemas/dist/auth-api.schema.d.ts` 的路由：`POST /api/auth/users`、`/sessions`、`/email/send-otp`、`/admin/sessions`、`/refresh`、`GET /api/auth/sessions/current`、`/profiles/:userId`、`PATCH /api/auth/profiles/current`、`/email/*`、`/oauth/*`、`/config`、`/public-config`。**无 `/api/auth/anonymous`**。
- 线上 `GET /api/auth/config` 仅返回 `requireEmailVerification, passwordMinLength, requireNumber/Lowercase/Uppercase/SpecialChar, verifyEmailMethod, resetPasswordMethod, allowedRedirectUrls, disableSignup` —— **无匿名开关**。
- `userSchema`（`auth.schema.d.ts:30`）**`email` 必填**，**无 `is_anonymous` 字段**。
- ⚠️ **陷阱**：JWT `tokenPayloadSchema.role` 枚举 = `["anon","authenticated","project_admin"]`。这里的 **"anon" 是 API key 角色（未登录 REST 调用者），不是匿名用户账号**。

**结论**：SDK 1.4.4 **没有**匿名/游客登录能力；REST **无**匿名端点；配置 schema **无**匿名开关；用户模型要求非空 `email`。（未确定：更新版本 InsForge 是否添加；无外网可查。）

## 3. 写入点 —— 弹注册面板的插入位置

**不存在共享的写入门禁。** 以下每处都独立可达。`isChannelLocked()`（`js/app.js:42-44`）只管**公告主贴**资格，不弹注册面板、也不管点赞/普通评论。

| # | 动作 | 处理器（file:line） | 后端调用 |
|---|---|---|---|
| 1 | 发频道消息/评论/reply | `sendMessage()` `js/app.js:3799`（守卫 `if(!msgInput||!currentUser||!currentChannel||!IF) return;` `:3800`） | `IF.sendMessage(channel.id, text, currentUser.id, parentId)` `:3847` → `if-client.js:465` |
| 2 | @提及通知 | `js/app.js:3863-3869` | `IF.notifyMentions` → `if-client.js:576` |
| 3 | AI 审核 | `js/app.js:3881` | `IF.moderateMessage` → `if-client.js:492` |
| 4 | 文件/图片消息 | `handleFileUpload()` `js/app.js:3970` | `IF.uploadFile` + `IF.sendFileMessage` `js/app.js:3990/:3993` → `if-client.js:773` |
| 5 | 消息点赞（**已砍**） | `js/app.js:3041` | `IF.toggleLike` → `if-client.js:792` |
| 6 | 评论点赞（**已砍**） | `js/app.js:3258` | `IF.toggleLike` `js/app.js:3268` |
| 7 | 转发消息 | `js/app.js:3455-3470` | `IF.forwardMessage` `js/app.js:3463` → `if-client.js:855` |
| 8 | 撤回消息 | `js/app.js:2630-2633` | `IF.recallMessage` `js/app.js:2719` |
| 9 | 资料编辑（昵称/称号/签名/cvv） | `chipSaveEdit()` `js/app.js:7007`、`chipSaveAndClose()` `:6987` | `IF.updateMyProfile` `js/app.js:7005/7021` → `if-client.js:104` |
| 10 | 头像上传 | `chipOnAvatarChange()` `js/app.js:7042`；另 `:1116-1127` | `IF.uploadFile` + `IF.updateMyProfile` `js/app.js:7054` |
| 11 | 卡面皮肤 | `js/app.js:6661-6664` | `api.updateMyProfile(currentUser.id,{card_skin})` |
| 12 | 记忆树发帖 | `submitPost()` `js/memory-tree.js:781` | `MTPosts.submit(..., authorId: currentUser.id)` `:816` → `js/memory-posts.js:112` `memory_posts.insert`(`:125`) |
| 13 | 记忆树评论 | `js/memory-tree.js:920` | `MTComments.submit({...,authorId:currentUser.id})` `:926-929` → `js/memory-comments.js:61` `memory_comments.insert`(`:72`) |
| 14 | 记忆树图片上传 | `js/memory-tree.js:807-809` | `IF.uploadFile` |
| 15 | 好友请求/处理（**将删**） | — | `friendRequest/friendRespond/friendRemove` `if-client.js:632-658` |
| 16 | DM 发送（**将删**） | `js/app.js:3855-3861` | `IF.notifyDm` `if-client.js:670` |
| 17 | 公告评论 | 同 #1 带 `parent_id`（`isChannelLocked()` 明确允许评论 `:3803`） | `messages.insert` |

**现状：无任何一处共享"需要登录"helper。** 两个临时守卫（`sendMessage` `:3800`、点赞 `:3041/:3258`）都是**静默 return**。`isChannelLocked()`(`:42`) 最接近共享谓词但仅针对公告。

→ 需在**每个存活处理器**（1-14，除去 5/6 已砍、15/16 将删）插入注册门禁；或引入一个共享 `requireAuth(action)` helper，在各处理器顶部调用。**推荐后者**。

## 4. 点赞系统（**本次已砍**，留档）

- 表 `public.message_likes`（`migrations/20260718221000_add_message_interactions.sql:15-20`）：`message_id UUID → messages(id) ON DELETE CASCADE`，`user_id UUID → auth.users(id) ON DELETE CASCADE`，`created_at`，**主键 `(message_id, user_id)`**。
- 去重 = 复合主键；无计数列、无触发器；计数客户端聚合。
- 前端 `toggleLike()`(`if-client.js:792-817`)、`getLikeAggregates()`(`:821-851`，按 48 分批)。
- RLS（本地迁移与线上一致）：
  - `likes readable` SELECT `TO authenticated USING (true)`
  - `likes insert self` INSERT `TO authenticated WITH CHECK (user_id = auth.uid())`
  - `likes delete self` DELETE `TO authenticated USING (user_id = auth.uid())`
  - `GRANT SELECT,INSERT,DELETE ON public.message_likes TO authenticated;`
- **因本次砍掉游客点赞，此项无需任何改动。**

## 5. RLS 策略（高置信，线上为准）

**线上 `GET /api/database/policies` 返回 36 条策略。** 相关项：

```
message_likes   | likes readable      | SELECT | {authenticated}  USING true
message_likes   | likes insert self   | INSERT | {authenticated}  CHECK user_id = auth.uid()
message_likes   | likes delete self   | DELETE | {authenticated}  USING user_id = auth.uid()

messages        | messages readable   | SELECT | {authenticated}  USING true
messages        | messages insert     | INSERT | {authenticated}  CHECK author_id=auth.uid() AND not muted
messages        | messages announcement admin only | INSERT RESTRICTIVE {authenticated}
                  CHECK (channel not announcement) OR is_admin() OR parent_id IS NOT NULL
messages        | messages update/delete/recall | {authenticated}（作者或 is_admin）

channels        | channels readable   | SELECT | {authenticated}  USING true
channels        | channels insert/update/delete | {authenticated}

profiles        | profiles readable by authenticated | SELECT {authenticated} USING true
profiles        | profiles insert self | INSERT {authenticated} CHECK id=auth.uid()
profiles        | profiles_update_self_or_admin | UPDATE {authenticated}

memory_posts    | memory_posts anon read   | SELECT | {anon,authenticated} USING true
memory_posts    | memory_posts anon insert | INSERT | {anon,authenticated} CHECK true
memory_posts    | memory_posts admin write | DELETE | {authenticated} USING is_admin()
memory_comments | memory_comments anon read   | SELECT | {anon,authenticated} USING status=1
memory_comments | memory_comments anon insert | INSERT | {anon,authenticated} CHECK true
notifications   | notifications all self | ALL | {authenticated} user_id=auth.uid()
```

关键：
- `is_admin()` = `EXISTS (SELECT 1 FROM profiles WHERE id=auth.uid() AND role='admin')`（SECURITY DEFINER）。
- `GRANT`（`init-campus-schema.sql:201-212`）对 profiles/channels/messages/channel_members/notifications **只授予 `authenticated`**。记忆树迁移授予 `anon,authenticated`，故那两个表是**唯二** anon 可碰的表。
- **实测**：用前端 anon key `GET /api/database/records/{message_likes|messages|channels|profiles}` 全部返回 **HTTP 200 但 body `[]`** —— anon 角色在 RLS 下看不到任何行（不报错，静默空）。

**回答**：
- **游客能否读频道/消息/资料？** **不能。** `channels readable`/`messages readable`/`profiles readable` 均为 `TO authenticated USING (true)`；`USING (true)` **不是**拦路石，**`TO authenticated` 这个角色限制 + 只给 `authenticated` 的 GRANT** 才是。→ 要"游客看全站"，**必须改策略（加 `anon`）并补 GRANT**，这是**后端迁移**。
- **游客能否写点赞？** 不能（角色 + GRANT + `auth.uid()` 三重阻断）。**已砍，不涉及。**
- **记忆树呢？** `memory_posts`/`memory_comments` 的 `anon insert CHECK true` **今天就是开着的** —— 即未登录者可直接发帖/评论（`js/memory-posts.js:118` 亦容忍 `authorId:null`）。**用户决定保留开放（选 b）**，故此处**不需要改策略**；但这是既有的"写入后门"，仅作知情记录。

## 6. 游客的破绽向量（具体 file:line）

若让 `initAuth` 以 `currentUser = null` 进入（或合成缺 `id`/`username` 的游客对象），以下会抛错或行为异常：

1. **`showMain()` 无条件解引用** `js/app.js:785-804`（`currentUser.nickname`/`.avatar_url`/`.username`）；`showMainWithTransition()` 重复于 `:873-890` → `TypeError`。
2. **`showProfile`/`renderProfile`** `js/app.js:5299-5305`：`currentUser.nickname || currentUser.username` 同样崩。
3. **实时 socket/房间认证**：`IF.connectRealtime`(`if-client.js:876-934`) → `subscribe('chat:'+id)`；线上订阅策略 `TO authenticated`，游客无认证 JWT → 订阅被拒（`connectRealtime` 仅 warn `:899-902`）。本地 Express（`server/index.js:107-116`）**硬要求 `socket.handshake.auth.token`** 并 `jwt.verify` → 游客无 token。
4. **通知订阅**：`subscribeNotifications()` `js/app.js:4628-4632` `if (!currentUser) return;` → 游客提前返回（安全）。`js/app.js:397` 用空 id 取消订阅。
5. **未读计数**：`fetchUnreadCount()` `js/app.js:4146-4167` → `IF.unreadCount()`；表策略 `user_id=auth.uid()` `TO authenticated` → 游客得 0/错误。
6. **点赞聚合（已砍）**：`js/app.js:2242-2244, 2293-2295, 3169-3170, 4944` 曾传 `currentUser.id`。现仅需**渲染只读计数**时避免解引用游客 id。⚠️ **注意**：`getLikeAggregates` 仍需 `currentUser.id` 判断 `mine`；游客下应跳过或传 `null`。
7. **管理员门禁**：`js/app.js:2379`、`:2519`/`:2653`（`canRecall`/`canDeleteComment` **无 null 检查**）、`:2597`、`:2748`、`:3458`、`:6489`、`:6727` 都假设 `currentUser` 非空。
8. **记忆树 currentUser**：`js/memory-tree.js:490-491`、`:746`、`:774,803`、`:816`、`:926-929` 均已用 `currentUser &&` 防护（**安全**）。⚠️ `handle_new_user` 触发器用 `NEW.email` 生成 nickname/username —— **仅在使用匿名用户时才是问题；本次不引入匿名用户，故无影响**。
9. **头像/资料渲染**：`js/app.js:1120-1131, 7042-7065` 解引用 `currentUser.avatar_url`/`.nickname`。
10. **`openChipCard`** `js/app.js:6825` `if(!isLoggedIn()){ showLogin(); return; }` → 游客点自己头像被踢回登录页。**用户已决定：改为弹注册面板。**
11. **`isLoggedIn()` 使用点**：`js/app.js:957, 6825`。
12. **`sendMessage`/点赞守卫静默 return**（`js/app.js:3800,3041,3258`）→ 游客下必须**弹注册面板**而非 no-op。

## 7. 结论与接下来要改的东西

1. **游客只读全站 = 后端 RLS 迁移**：给 `channels`(SELECT)、`messages`(SELECT)、`profiles`(SELECT) 三条策略加 `anon` 角色，并补 `GRANT SELECT` 给 `anon`。**这是硬前提**，前端改动再多也绕不过。
2. **前端门禁改造**：`initAuth()`(`js/app.js:5937`) 增加游客分支 + 合成哨兵；`showMain`/`showMainWithTransition`/`showProfile` 等解引用点需 null-safe（或以哨兵兜住）。
3. **统一注册门禁 helper**：新增 `requireAuth(action)`，插到 §3 表的 1-4、7-14 各处（推荐统一 helper 而非逐处判断）。
4. **游客下需降级而非崩溃**的功能：实时订阅（`chat:`/`notifications:` 均 `TO authenticated`，游客订阅必被拒）→ 游客应**跳过实时订阅**、改少量轮询或纯静态；未读角标应为 0/隐藏。
5. **记忆树匿名写入保持开放**（用户选 b），无需改策略；但记忆树 UI 内的游客写入入口**也要弹注册面板**（与全站一致），即"后端允许、前端引导注册"。
6. **游客点自己头像 → 弹注册面板**（替换 `app.js:6825` 的 `showLogin()`）。

**未确定项**：① 更新版 InsForge 是否支持匿名登录（本次不依赖）；② `profiles.username/nickname` 是否 NOT NULL（仅匿名用户方案才受影响，本次不采用）；③ InsForge Realtime 能否用 `anon` 角色订阅（策略文本显示不能，故游客应跳过实时）。
