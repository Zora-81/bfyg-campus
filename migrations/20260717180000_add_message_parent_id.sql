-- ============================================================================
-- 消息回复 / 引用：messages 增加 parent_id
-- 自引用外键，被回复消息删除时子消息 parent_id 置 NULL（引用不丢失，仅断链）。
-- 同时更新 realtime 广播触发器，使 parent_id 进入 new_message payload。
-- ============================================================================

-- 1. 新增列
ALTER TABLE public.messages
  ADD COLUMN IF NOT EXISTS parent_id UUID
  REFERENCES public.messages(id) ON DELETE SET NULL;

-- 2. 索引（按父消息查子回复）
CREATE INDEX IF NOT EXISTS idx_messages_parent ON public.messages(parent_id);

-- 3. 更新 realtime 广播触发器，把 parent_id 带进 payload
CREATE OR REPLACE FUNCTION public.publish_message_realtime()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  raw_mention  text;
  mention      text;
  mentioned_id uuid;
  author_name  text;
BEGIN
  -- 2a) 广播到该频道的 realtime 通道
  PERFORM realtime.publish(
    'chat:' || NEW.channel_id::text,
    'new_message',
    jsonb_build_object(
      'id',           NEW.id,
      'channel_id',   NEW.channel_id,
      'author_id',    NEW.author_id,
      'content',      NEW.content,
      'content_type', NEW.content_type,
      'is_pinned',    NEW.is_pinned,
      'parent_id',    NEW.parent_id,
      'created_at',   NEW.created_at
    )
  );

  -- 2b) @提及 -> 通知（仅文本消息）
  IF NEW.content_type = 'text' THEN
    SELECT nickname INTO author_name FROM public.profiles WHERE id = NEW.author_id;
    FOR raw_mention IN
      SELECT DISTINCT (regexp_matches(NEW.content, '@(\S+)', 'g'))[1]
    LOOP
      mention := regexp_replace(raw_mention, '[^a-zA-Z0-9_]+$', '');
      IF mention <> '' THEN
        SELECT id INTO mentioned_id FROM public.profiles WHERE username = mention;
        IF mentioned_id IS NOT NULL AND mentioned_id <> NEW.author_id THEN
          INSERT INTO public.notifications (user_id, type, title, body, link)
          VALUES (
            mentioned_id,
            'mention',
            COALESCE(author_name, '有人') || ' 在频道中@了你',
            NEW.content,
            '/channel/' || NEW.channel_id::text
          );
        END IF;
      END IF;
    END LOOP;
  END IF;

  RETURN NEW;
END;
$$;
