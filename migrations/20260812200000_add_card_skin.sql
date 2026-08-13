-- 20260812200000_add_card_skin.sql
-- 卡面皮肤按用户存储：让每个人拥有自己的卡片配色，而非共用浏览器 localStorage。
--
-- 背景：
--   原实现把选中的卡面皮肤只存在浏览器 localStorage('chip-skin')，
--   导致"我换颜色，别人/我看的任何人也是同样的颜色"——所有账号共用一份本地皮肤。
--   改为：皮肤存入 profiles.card_skin，查看他人时读取对方自己的选择。
--
-- 注意：列级 UPDATE 授权在 Postgres 中是累积的，单独 GRANT UPDATE (card_skin)
--       不会撤销已有的 nickname/avatar_url/title 授权，可安全重复执行。

-- 1) 加列（带默认值，旧行自动为 'blue'）
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS card_skin text NOT NULL DEFAULT 'blue';

-- 2) 列级 UPDATE 权限：累加到 authenticated 现有更新列集合（幂等）
GRANT UPDATE (card_skin) ON public.profiles TO authenticated;

-- 3) 只读查看他人卡片时，客户端用 anon key 读取 card_skin。
--    若已有整表 SELECT 授权则为 no-op 的累积，安全。
GRANT SELECT (card_skin) ON public.profiles TO anon;
GRANT SELECT (card_skin) ON public.profiles TO authenticated;
