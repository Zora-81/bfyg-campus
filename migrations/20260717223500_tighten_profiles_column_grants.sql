-- ============================================================================
-- 宝丰一高校园频道 — 收紧 profiles 列级 UPDATE 授权（消除历史漂移）
-- ----------------------------------------------------------------------------
-- 背景：init schema 第 204 行 `GRANT INSERT, UPDATE ON public.profiles TO
--       authenticated;`（表级 UPDATE）覆盖了同文件前面的 REVOKE + 逐列 GRANT，
--       导致 authenticated 拿到「全列」UPDATE，且此后新增的列（muted_until /
--       warning_count）也自动继承。结果：普通用户可越权改自己的
--       id / username / created_at。
--
-- 修复：撤销表级 UPDATE，仅按白名单逐列重授。id / username / created_at 三列
--       任何客户端角色都不应写入（PK/唯一登录标识/审计时间）。
--
-- 白名单说明（保持既有业务不变）：
--   · nickname / avatar_url / title       —— 用户自助编辑资料
--   · role / status / muted_until / warning_count —— 管理台（admin.js 客户端 SDK）
--     封禁/改角色/解禁使用；warning_count/muted_until 亦由 apply_moderation RPC 写入
-- ----------------------------------------------------------------------------
-- 注意：本迁移只改「列级 GRANT」，不改行级 RLS。role/status 是否应允许「本人」
--       修改自己的行，属另一层问题（见收尾说明），本迁移不涉及。
-- ============================================================================

REVOKE UPDATE ON public.profiles FROM authenticated;

GRANT UPDATE (
  nickname,
  avatar_url,
  title,
  role,
  status,
  muted_until,
  warning_count
) ON public.profiles TO authenticated;
