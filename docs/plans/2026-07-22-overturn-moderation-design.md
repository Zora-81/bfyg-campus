# 撤回审核（AI 误判纠错）设计 — 2026-07-22

## 背景
原「AI 待审」面板只有 `标记已审`（确认违规）和 `删除`（硬删消息）两态。
AI 误判时管理员无"纠错"入口：要么确认违规、要么销毁消息，无法恢复消息并通知用户。

## 决策（用户确认）
新增第三态 **撤回审核**：AI 判错但消息本身正常时的纠错操作。
- 用户确认：warning_count 自动回退（扣 1，不低于 0）
- 给用户发 system 通知「审核误判已撤销」

## 实现
- 前端：`html/admin.html` + `js/admin.js`
  - 单行：`[标记已审][撤回审核][删除]`（待审态）；已审态仅 `[删除]`
  - 批量：工具栏新增 `[批量撤回]` 按钮
  - 调用 `db().rpc('overturn_moderation', { p_message_id })`，成功后写 moderation_log(action='overturn') 并重载队列
- 后端：RPC `overturn_moderation(p_message_id UUID)`（SECURITY DEFINER）
  一次性完成：① reviewed=true + mod_overturned=true ② 删机器人警告评论(is_mod 子消息)
  ③ profiles.warning_count 扣回 ④ 给用户插 notifications(system)
- 新增列：`messages.mod_overturned BOOLEAN DEFAULT FALSE`（审计区分"确认违规" vs "撤销误判"）

## 为什么必须走 RPC（非客户端直写）
notifications / profiles 均有 RLS，客户端只能改自己的行（`notifications all self` 策略
`user_id = auth.uid()`）。替被误判用户写通知 / 扣 warning 会被 RLS 拦截，故复用
apply_moderation / notify_mentions 同模式，用服务端 SECURITY DEFINER 函数绕过 RLS。

## 部署
- 前端：`node _build.mjs` → `wrangler pages deploy`（已部署，版本 1.2.63，线上已验证）
- 后端 RPC：CLI 拒 CREATE FUNCTION → 需在 InsForge 网页控制台 SQL Editor 执行
  `migrations/2026-07-22-overturn-moderation-rpc.sql`（一次性）
