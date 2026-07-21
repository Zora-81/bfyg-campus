-- ============================================================================
-- 宝丰一高校园频道 — 放开 admin 对 profiles 的更新权限
-- 目的：让"应用内管理后台"（admin.html）的管理员能用 InsForge 前端
--       SDK（anonKey + 登录态）直接修改任意用户的 role / status（封禁）。
-- 安全：USING / WITH CHECK 均调用已有的 public.is_admin() SECURITY DEFINER
--       函数（服务端查 profiles.role='admin'），客户端无法伪造身份越权。
--       普通用户（role<>'admin'）仍只能改自己的 nickname / avatar_url
--       （见 init schema 的 "profiles update self" 策略与列级 GRANT）。
-- ============================================================================

-- 1) admin 可更新任意 profiles 行（含 role / status 列）
DROP POLICY IF EXISTS "profiles update admin" ON public.profiles;

CREATE POLICY "profiles update admin" ON public.profiles
  FOR UPDATE TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

-- 2) 补列级 UPDATE 权限（init schema 仅 GRANT 了 nickname/avatar_url）
GRANT UPDATE (role, status) ON public.profiles TO authenticated;
