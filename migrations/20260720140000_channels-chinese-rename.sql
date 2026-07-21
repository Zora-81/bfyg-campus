-- 频道中文化 + 结构调整：删 luntan/bangbang、加二次元空间、改名全中文
-- 2026-07-20 v1.1.6

-- 1. 删除 luntan 和 bangbang（含关联消息）
DELETE FROM public.messages WHERE channel_id IN (SELECT id FROM public.channels WHERE name IN ('luntan', 'bangbang'));
DELETE FROM public.channel_members WHERE channel_id IN (SELECT id FROM public.channels WHERE name IN ('luntan', 'bangbang'));
DELETE FROM public.channels WHERE name IN ('luntan', 'bangbang');

-- 2. 现有频道改名中文
UPDATE public.channels SET name = '公告栏' WHERE name = 'notice';
UPDATE public.channels SET name = '综合大厅' WHERE name = 'general';
UPDATE public.channels SET name = '学习园地' WHERE name = 'study';
UPDATE public.channels SET name = '生活日常' WHERE name = 'life';

-- 3. 新增二次元频道
INSERT INTO public.channels (name, description, type, created_by)
VALUES ('二次元世界', 'ACG动漫游戏讨论', 'public', NULL);
