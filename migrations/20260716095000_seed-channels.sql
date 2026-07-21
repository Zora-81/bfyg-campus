-- ============================================================================
-- 宝丰一高校园频道 — 默认频道种子数据
-- 幂等：name 唯一，重复执行不会报错或产生重复行。
-- created_by 为 NULL（系统级频道，非某用户创建）。
-- 说明：演示消息(public.messages)依赖真实 auth.users id，故不在此脚本内；
--       用户注册后由前端自然产生消息。如需演示消息，待有真实用户后再补。
-- ============================================================================

INSERT INTO public.channels (name, description, type, created_by) VALUES
  ('general',       '全频道大厅', 'public',       NULL),
  ('study',         '学习交流',   'public',       NULL),
  ('life',          '校园生活',   'public',       NULL),
  ('notice',        '公告栏',     'announcement', NULL),
  ('luntan',        '论坛广场',   'public',       NULL),
  ('bangbang',      '帮帮墙',     'public',       NULL)
ON CONFLICT (name) DO NOTHING;
