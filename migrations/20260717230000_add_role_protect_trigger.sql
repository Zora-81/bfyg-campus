-- 20260717230000_add_role_protect_trigger.sql
-- 封堵 profiles 自提权 + 修复管理台封禁/改角色
--
-- 背景：
--   1) 线上缺 "profiles update admin" 策略，且 update self 仅校验 id=auth.uid()，
--      普通用户改自己行时可把 role 直接设成 admin -> 自提权。
--   2) 管理台（deploy_fe/js/admin.js）封禁/改角色走前端管理员 JWT 直接
--      update 别人行，因缺 admin 策略实际被 update self 的 WITH CHECK 拦死，
--      功能处于坏状态。
--   3) 审核 RPC apply_moderation 经 anon key 调用，会改 warning_count/status/
--      muted_until，但绝不碰 role。因此触发器只锁 role 列，避免误伤审核。
--
-- 方案：
--   A) 扩展 update 策略：普通用户只能改自己行；管理员(is_admin())可改任意行。
--      单个策略用 OR 表达，规避多策略 WITH CHECK 的 AND 组合陷阱。
--   B) BEFORE UPDATE 触发器：非管理员(且非 service_role)禁止修改 role 列。
--      service_role 分支放行边缘函数/系统任务。

-- A) 扩展 update 策略（替换原 "profiles update self"）
DROP POLICY IF EXISTS "profiles update self" ON public.profiles;
CREATE POLICY profiles_update_self_or_admin ON public.profiles
  FOR UPDATE TO authenticated
  USING (id = (SELECT auth.uid()) OR public.is_admin())
  WITH CHECK (id = (SELECT auth.uid()) OR public.is_admin());

-- B) 触发器函数：仅保护 role 列
CREATE OR REPLACE FUNCTION public.block_privileged_role_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
BEGIN
  -- 服务端 service_role（边缘函数/系统任务）直接放行
  IF (current_setting('request.jwt.claims', true)::json->>'role') = 'service_role' THEN
    RETURN NEW;
  END IF;

  -- 仅保护 role 列：非管理员禁止改动
  IF (OLD.role IS DISTINCT FROM NEW.role) THEN
    IF NOT public.is_admin() THEN
      RAISE EXCEPTION 'permission denied: only an administrator may change profile role'
        USING ERRCODE = '42501';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_block_privileged_role_change ON public.profiles;
CREATE TRIGGER trg_block_privileged_role_change
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.block_privileged_role_change();
