-- ============================================================================
-- 2026-09-11  新增「评论/回复」通知
-- ----------------------------------------------------------------------------
-- 问题：截至改前，**评论你的帖子不会产生任何通知**。
--   · 客户端 sendMessage() 只调用 notify_mentions / notify_dm；
--   · 服务端 messages 上唯一的触发器 publish_message_realtime()
--     其通知分支只解析 @提及，完全不看 NEW.parent_id。
--
-- 本迁移在保留原有行为（实时广播 + @提及）的前提下，**追加**一个分支：
--   当 NEW.parent_id IS NOT NULL（即这是一条评论/回复）时，
--   通知父内容的作者，type='comment'。
--
-- 设计要点：
--   1. 复用现有 link 文本列，不新增列、不改表结构。
--      link 格式写为 /channel/{channel_id}#msg-{NEW.id}，
--      其中 NEW.id 是**评论自身的 messages.id**。
--      前端 scrollToMessage() 的第二顺位选择器
--      `.msg-comment-item[data-comment-id]` 恰好按此 id 定位，
--      因此点击通知可直接跳到该条评论并高亮。
--   2. 不通知自己：父作者 = 评论作者时跳过。
--   3. 一个 @ 提及 + 一条评论通知可以同时产生（不同诉求，互不冲突）。
--   4. notifications.type 无 CHECK 约束，新增 'comment' 取值安全。
--
-- 保留：@提及分支、realtime.publish 广播，逐字不变。
-- 幂等：CREATE OR REPLACE；重复执行安全。
-- ============================================================================

CREATE OR REPLACE FUNCTION public.publish_message_realtime()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'pg_temp'
AS $function$
DECLARE
  raw_mention text; mention text; mentioned_id uuid; author_name text;
  parent_author uuid; parent_snippet text;
BEGIN
  -- ── 原有：向频道广播新消息（保持不变）──
  PERFORM realtime.publish('chat:' || NEW.channel_id::text, 'new_message', jsonb_build_object(
    'id', NEW.id, 'channel_id', NEW.channel_id, 'author_id', NEW.author_id,
    'content', NEW.content, 'content_type', NEW.content_type, 'is_pinned', NEW.is_pinned,
    'parent_id', NEW.parent_id, 'created_at', NEW.created_at));

  -- ── 新增：评论/回复通知（仅一层父级，安静跳过自己）──
  IF NEW.parent_id IS NOT NULL AND COALESCE(NEW.is_mod, false) = false THEN
    SELECT author_id INTO parent_author FROM public.messages WHERE id = NEW.parent_id;
    IF parent_author IS NOT NULL AND parent_author <> NEW.author_id THEN
      SELECT nickname INTO author_name FROM public.profiles WHERE id = NEW.author_id;
      SELECT left(content, 60) INTO parent_snippet FROM public.messages WHERE id = NEW.parent_id;
      INSERT INTO public.notifications (user_id, type, title, body, link)
      VALUES (
        parent_author,
        'comment',
        COALESCE(author_name, '有人') || ' 评论了你的内容',
        CASE WHEN length(NEW.content) > 60 THEN left(NEW.content, 60) || '…' ELSE NEW.content END,
        '/channel/' || NEW.channel_id::text || '#msg-' || NEW.id::text
      );
    END IF;
  END IF;

  -- ── 原有：@提及（保持不变）──
  IF NEW.content_type = 'text' THEN
    SELECT nickname INTO author_name FROM public.profiles WHERE id = NEW.author_id;
    FOR raw_mention IN SELECT DISTINCT (regexp_matches(NEW.content, '@(\S+)', 'g'))[1] LOOP
      mention := regexp_replace(raw_mention, '[^a-zA-Z0-9_]+$', '');
      IF mention <> '' THEN
        SELECT id INTO mentioned_id FROM public.profiles WHERE username = mention;
        IF mentioned_id IS NOT NULL AND mentioned_id <> NEW.author_id THEN
          INSERT INTO public.notifications (user_id, type, title, body, link)
          VALUES (mentioned_id, 'mention', COALESCE(author_name, '有人') || ' 在频道中@了你', NEW.content, 'channel/' || NEW.channel_id::text);
        END IF;
      END IF;
    END LOOP;
  END IF;

  RETURN NEW;
END;
$function$;

-- 回滚：重新执行 migrations/20260717180000_add_message_parent_id.sql
--       （其中定义了本函数的原始版本，仅含广播 + @提及）。
