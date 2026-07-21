-- ============================================================================
-- 宝丰一高校园频道 — profiles 新增「称号」(title) 字段
-- 需求：称号可由用户自拟（自助编辑），管理员亦可修改/清除任意用户称号。
-- 展示：聊天消息作者名旁显示 ✦称号。
-- ----------------------------------------------------------------------------
-- 安全模型（复用 init schema 与 admin 策略，无需新增行策略）：
--   · "profiles update self"  → 用户可改自己行
--   · "profiles update admin" → is_admin() 可改任意行
--   下方仅补「列级」UPDATE 授权，让 title 列可被写入。
-- ============================================================================

ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS title TEXT DEFAULT '';

-- 列级授权：init schema 用了 REVOKE UPDATE + 逐列 GRANT 的模型，这里补上 title。
GRANT UPDATE (title) ON public.profiles TO authenticated;
