-- ============================================================================
-- 宝丰一高校园频道 — Realtime + @提及通知
-- 替代原 Socket.io 的广播与 @提醒服务端逻辑：
--   · messages 插入后通过 realtime.publish 推到 chat:<channel_id>
--   · 文本消息解析 @username，给被提及用户写 notifications
-- 触发器为 SECURITY DEFINER，绕过被查表的 RLS（profiles/notifications）。
-- ============================================================================

-- 1. Realtime 频道模式：每个频道一个 chat:<channel_id> 通道
INSERT INTO realtime.channels (pattern, description, enabled)
VALUES ('chat:%', 'Per-channel campus chat', true)
ON CONFLICT (pattern) DO UPDATE
  SET description = EXCLUDED.description,
      enabled     = EXCLUDED.enabled;

-- 2. 插入消息后的服务端处理：广播 + @提及通知
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

CREATE TRIGGER message_published
AFTER INSERT ON public.messages
FOR EACH ROW EXECUTE FUNCTION public.publish_message_realtime();

-- 3. Realtime 访问控制（与 messages 校园内全员可见保持一致）
ALTER TABLE realtime.channels ENABLE ROW LEVEL SECURITY;
CREATE POLICY "authenticated subscribe chat"
  ON realtime.channels FOR SELECT TO authenticated
  USING (pattern LIKE 'chat:%');

ALTER TABLE realtime.messages ENABLE ROW LEVEL SECURITY;
CREATE POLICY "authenticated publish chat"
  ON realtime.messages FOR INSERT TO authenticated
  WITH CHECK (channel_name LIKE 'chat:%');
