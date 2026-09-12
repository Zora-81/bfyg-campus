-- v1.8.7 游客可见真实点赞数
-- 问题：message_likes 的 SELECT 策略只授 authenticated，游客（anon）查询恒返回空数组，
--       手机端游客浏览时所有消息的 ♥ 计数都显示 0（实际库里有 3/2 赞）。
-- 修复：把 "likes readable" 放宽为 anon + authenticated 均可读（点赞是公开聚合数据，
--       与 messages/channels 的游客可读策略保持一致）。写策略（insert/delete self）不变。
DROP POLICY IF EXISTS "likes readable" ON public.message_likes;
CREATE POLICY "likes readable" ON public.message_likes
  FOR SELECT TO anon, authenticated
  USING (true);
