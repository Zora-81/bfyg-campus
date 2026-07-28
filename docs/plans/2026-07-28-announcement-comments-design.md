# 公告栏放开评论设计（2026-07-28）

## 需求
公告频道保持「仅管理员可发布主楼消息」，但放开为**全员可对公告进行评论/回复**（含图片、文件附件）。

## 后端（RLS，核心）
文件：`migrations/2026-07-28_announcement-allow-comments.sql`
- 修改 RESTRICTIVE 策略 `messages announcement admin only` 的 `WITH CHECK`：
  - 非 announcement 频道：不受限；
  - announcement + 管理员：可发布/评论任意；
  - **announcement + 非管理员 + `parent_id IS NOT NULL`（即评论/回复）：允许插入**；
  - announcement + 非管理员 + 主楼（`parent_id IS NULL`）：拒绝。
- 关键：RLS 的 `WITH CHECK` 可直接引用待插入行的列（`parent_id`），无需 `NEW`/`OLD`（InsForge 不支持 NEW/OLD 引用）。

## 前端（js/app.js）
- `isChannelLocked()` 语义不变：announcement 频道 + 非管理员 = 主楼发布锁定。
- 解锁评论/回复入口（不再被 `isChannelLocked` 拦截）：
  - 互动栏「评论」按钮（`act==='comment'`）；
  - 评论区「回复」按钮（`reply-comment`）；
  - `setReply()`、`showInputBar()`。
- `sendMessage()` / `handleFileUpload()`：仅拦截**主楼**——
  `if (isChannelLocked() && !getCommentTarget() && !(replyingTo && replyingTo.id))` 才 toast 拦截；
  带 `parent_id` 的评论/回复对所有用户放行。
- `updateInputRestriction()`：保留隐藏 compose(+) 与提示文案「仅管理员可发布 · 全员可评论」，
  但**不再给输入区加 `.locked-announcement` 灰态**（会阻断评论输入），也不再禁用 msgInput/附件/表情/发送按钮。

## 不动的部分
管理员体验不变；撤回、可见性、楼中楼逻辑不变；评论仍渲染在评论区内、不进主楼 feed。

## 部署
bump 1.2.94→1.2.95；`node _build.mjs`；`wrangler pages deploy` → https://24608756.baofeng-campus.pages.dev；
InsForge CLI 分两次执行 DROP / CREATE 应用迁移。
