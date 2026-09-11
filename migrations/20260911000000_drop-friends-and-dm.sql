-- ============================================================================
-- 2026-09-11  删除好友系统与私聊（DM）后端对象
-- ----------------------------------------------------------------------------
-- 背景：产品决定「好友 + 私聊一起删干净」。
--   前端已在同一批次移除全部调用（js/app.js / js/if-client.js / index.html / style.css）。
--
-- 删除内容：
--   函数 create_friend_request / respond_friend_request / remove_friend
--   函数 find_or_create_dm / notify_dm
--   函数 search_users_safe        （唯一调用方是好友搜索）
--   表   public.friends           （级联带走其 4 条策略 + 2 个索引）
--
-- 明确保留（非好友，仍在使用）：
--   notify_mentions             @提及通知
--   publish_message_realtime    messages 实时广播 + @提及
--   publish_notification_realtime
--   apply_moderation / overturn_moderation
--   is_admin / is_channel_member
--
-- 线上实测（改前）：friends 表 8 行；friend 类通知 12 行；DM 零数据。
--   ⚠️ 线上 friends 的 4 条策略为 cmd=ALL / roles={public} / qual=null，
--      即对所有人放行（越权隐患）。DROP TABLE 一并消除。
--
-- 幂等：全部使用 IF EXISTS，重复执行安全。
-- 回滚：见文件末尾注释。
-- ============================================================================

BEGIN;

-- ── 1. 好友关系 RPC ─────────────────────────────────────────────────────────
DROP FUNCTION IF EXISTS public.create_friend_request(uuid);
DROP FUNCTION IF EXISTS public.respond_friend_request(uuid, text);
DROP FUNCTION IF EXISTS public.remove_friend(uuid);

-- ── 2. 私聊 DM RPC ──────────────────────────────────────────────────────────
DROP FUNCTION IF EXISTS public.find_or_create_dm(uuid);
DROP FUNCTION IF EXISTS public.notify_dm(uuid, uuid, uuid, uuid, text);

-- ── 3. 用户搜索（仅好友搜索使用）────────────────────────────────────────────
DROP FUNCTION IF EXISTS public.search_users_safe(text, integer);

-- ── 4. friends 表（级联删除策略与索引）──────────────────────────────────────
DROP TABLE IF EXISTS public.friends CASCADE;

COMMIT;

-- ============================================================================
-- 回滚说明（如需恢复）：
--   1) 重新执行 migrations/2026-07-19-social.sql 可重建 friends 表、
--      4 条 RLS 策略与 create_friend_request / respond_friend_request / remove_friend。
--   2) search_users_safe / find_or_create_dm / notify_dm 三个函数**不在任何本地
--      migration 中**（当初由 CLI db import 导入）。回滚前请先从
--      docs/plans/recon/2026-09-11-recon-friend-dm-removal.md 或线上备份取回定义。
--   3) 数据（8 行 friends）不可恢复 —— 执行前请确认已备份：
--      SELECT * FROM public.friends;   -- 结果为 4 accepted / 4 pending
-- ============================================================================
