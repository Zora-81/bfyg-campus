# 好友私聊（DM）设计文档

日期：2026-07-19
关联：宝丰一高校园频道
承接：校园频道好友社交中心建设（好友系统已实现，v=mg 上线）

## 一、目标

让加过好友的两个用户能单独聊天。入口在头像弹窗里——把原来死掉的「快捷操作」区域改成「好友列表」，点好友整行进入与他的私聊窗口。

设计原则：**零新建消息体系**。私聊就是「只有两个人的频道」，完全复用现有群聊的房间、消息存储、输入框、渲染、滚动逻辑。

## 二、数据架构

- 现有「校园频道」是一个频道房间，消息存 `messages` 表，按 `channel_id` 归类。
- 私聊 = 一个 `type='dm'` 的频道房间，消息同样存 `messages` 表，用这个小房间编号归类。
- 复用现有 `switchChannel(ch)`（app.js:996）、`sendMessage()`（app.js:1782）等全部逻辑。

### 后端新增 1 个 RPC：`find_or_create_dm(p_friend_id)`

- 若两人私聊房间已存在，直接返回旧房间（幂等）。
- 不存在则：在 `channels` 建一条 `type='dm'`、`name='与 {对方昵称} 的私聊'`；往 `channel_members` 插双方成员；返回新房间。
- SECURITY DEFINER（参照 apply_moderation），客户端不能直接建房间/插成员，避免 RLS 拦截。
- 用 `insforge db import` 导入（CLI 的 `db query` 不支持 CREATE FUNCTION，踩过坑）。

## 三、前端改动清单

### 1. html/index.html
- 头像弹窗「快捷操作」section（461-467 行）→ 改为「好友列表」section，id=`#panel-friends-list` 容器，标题「👥 我的好友」。
- 中间聊天区顶部：现有 `#channel-welcome` 旁新增返回箭头 `#dm-back-btn`（默认隐藏，进私聊才显示）。

### 2. css/style.css
- `.friend-list` / `.friend-item` / `.friend-avatar` / `.friend-name` / `.friend-badge`（红点+数字，未读>0 才显示）。
- `#dm-back-btn` 样式（箭头 + hover 态）。
- 私聊态：`.dm-mode` 时顶部显示对方昵称 + 返回箭头。

### 3. js/if-client.js
- 新增 `findOrCreateDm(friendId)` → 调 `find_or_create_dm` RPC，返回 dmChannel。
- 新增 `dmUnreadCount(friendId)` 或后端 `getDmUnread` 返回未读数（也可本地按 lastReadTimestamps 算，见第四节）。
- `friendsList()` 已有，复用。

### 4. js/app.js
- `loadFriendsToPopup()`：弹窗打开时拉好友列表渲染进 `#panel-friends-list`，每行头像+昵称+未读 badge，整行 click → `openDm(friend)`。
- `openDm(friend)`：`findOrCreateDm` 拿房间 → `switchChannel(dmChannel)` → 关闭头像弹窗 → 顶部切「私聊」态（显示对方名 + 返回箭头）→ 清该好友未读。
- `sendMessage()` 微调：`currentChannel.type==='dm'` 时，发完不调 `notifyMentions`（@提醒），改调 `notifyDm`（type='dm' 私信通知给对方）。
- 顶部返回箭头 `#dm-back-btn` click / GSAP 动画 → 回到上一个公共频道（记住进入私聊前的 channel）。
- 收到私信（Realtime/轮询）：对应好友行 badge +1。

## 四、未读数逻辑

- 进入私聊：记录 `lastReadTimestamps[dmChannel.id] = Date.now()`，清 badge。
- 收到新私信：若当前不在该 dm 房间，对应好友 badge +1。
- 顶部通知铃**不**冒红点（用户确认：未读只在好友列表显示）。

## 五、GSAP 动画设计（返回箭头 + 切换过渡）

- **返回箭头 hover**：箭头 `x` 微左移（-4px）+ 透明度 0.6→1，ease `power2.out`，离开回弹。
- **进入私聊**：当前公共频道内容 `gsap.to(..., {autoAlpha:0, x:20})` 淡出右移 → 私聊内容 `fromTo(..., {autoAlpha:0, x:-20},{autoAlpha:1,x:0})` 淡入左移，`expo.out`，duration 0.3。
- **点返回**：箭头快速左滑 `-24px` + 淡出，同时私聊内容左移淡出，公共频道内容右移淡入。
- 全程 fail-open：GSAP 未加载时直接显示，不依赖动画。
- 显隐用 CSS class 做 source of truth，GSAP 只做增强（踩过 3 次「动画库盖过 CSS 致隐形」的坑）。

## 六、实现步骤

1. 写 `find_or_create_dm` SQL → `insforge db import` 执行 → SELECT 验证。
2. if-client.js 加 `findOrCreateDm` + `notifyDm`。
3. html 改「快捷操作」→「好友列表」+ 返回箭头。
4. css 加好友列表/返回箭头样式。
5. app.js 加 `loadFriendsToPopup` / `openDm` / 返回逻辑 / sendMessage dm 分支 / Realtime 未读。
6. `node _build.mjs` 重建 → 本地 8787 预览（不部署）。
7. 用户确认后 wrangler 部署。

## 七、验证

- 两个账号互加好友 → 头像弹窗好友列表显示双方。
- 点好友整行 → 进私聊，顶显对方名 + 返回箭头。
- A 给 B 发私信 → B 好友列表该行红点+1；B 点开清零。
- B 点返回箭头 → 带 GSAP 动画回公共频道。
- 顶部通知铃不冒红点。
