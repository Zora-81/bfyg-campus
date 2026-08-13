-- 为 profiles 增加 signature（个签）与 cvv（安全码）两列，使资料卡背面信息对所有用户可见。
-- 与 card_skin 同理：列级 GRANT 限定 authenticated 可改自己、anon/authenticated 可读。
-- 幂等：使用 IF NOT EXISTS，重复执行安全。

ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS signature text NOT NULL DEFAULT '';
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS cvv text NOT NULL DEFAULT '';

-- 旧数据：把历史默认值 019 重置为空，避免显示占位的假安全码
UPDATE public.profiles SET cvv = '' WHERE cvv = '019';

GRANT UPDATE (signature, cvv) ON public.profiles TO authenticated;
GRANT SELECT (signature, cvv) ON public.profiles TO anon;
GRANT SELECT (signature, cvv) ON public.profiles TO authenticated;
