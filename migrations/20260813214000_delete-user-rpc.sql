-- ============================================================================
-- 管理员删除用户 RPC
-- ----------------------------------------------------------------------------
-- 用途：后台「删除用户」按钮调用。InsForge 的 PostgREST 只暴露 public schema，
--       auth.users 不在可访问列表（报错 "The schema must be one of the
--       following: public"），因此不能在 Edge Function 里直接
--       .schema('auth').from('users').delete()。
--
--       本函数放在 public schema（SECURITY DEFINER 以函数所有者身份执行），
--       内部 DELETE auth.users；外键 ON DELETE CASCADE / SET NULL 会自动级联
--       清理 profiles / messages / channel_members / notifications 等应用数据。
--
-- 调用方式（Edge Function / 任意服务端）：
--   POST {INSFORGE_BASE_URL}/api/database/rpc/delete_user
--   Headers: apikey: <serviceKey>, Authorization: Bearer <serviceKey>
--   Body:   { "p_user_id": "<uuid>" }
--
-- 部署：insforge db migrations up（按 <时间戳>_<名称>.sql 命名，幂等可重复）。
--       注意 InsForge 角色体系无 service_role/authenticated，service key 以
--       postgres / project_admin 身份执行，故 GRANT 给这两个角色。
-- ============================================================================

CREATE OR REPLACE FUNCTION public.delete_user(p_user_id UUID)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
BEGIN
  -- 删除 auth 用户；依赖 profiles/messages/... 的 FK 级联清理应用数据
  DELETE FROM auth.users WHERE id = p_user_id;
  RETURN jsonb_build_object('ok', true);
EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object('ok', false, 'error', SQLERRM);
END;
$$;

-- 授权：service key 以 postgres / project_admin 身份调用；函数内部仅删目标用户，无越权风险
GRANT EXECUTE ON FUNCTION public.delete_user(UUID) TO postgres, project_admin;
