import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const utilsPath = path.join(root, 'js', 'message-thread.js');
const appSource = fs.readFileSync(path.join(root, 'js', 'app.js'), 'utf8');
const clientSource = fs.readFileSync(path.join(root, 'js', 'if-client.js'), 'utf8');
const require = createRequire(import.meta.url);
const Thread = fs.existsSync(utilsPath) ? require(utilsPath) : {};

test('parent_id message is classified as thread content, not feed content', () => {
  assert.equal(typeof Thread.isThreadMessage, 'function');
  assert.equal(Thread.isThreadMessage({ id: 'c1', parent_id: 'root-1' }), true);
  assert.equal(Thread.isThreadMessage({ id: 'root-1', parent_id: null }), false);
});

test('pending matching includes parent_id so equal text in two threads cannot cross-match', () => {
  assert.equal(typeof Thread.findPendingIndex, 'function');
  const messages = [
    { id: 'p1', isPending: true, author_id: 'u1', content: 'same', parent_id: 'root-1' },
    { id: 'p2', isPending: true, author_id: 'u1', content: 'same', parent_id: 'root-2' }
  ];
  assert.equal(Thread.findPendingIndex(messages, {
    id: 'real-2', author_id: 'u1', content: 'same', parent_id: 'root-2'
  }), 1);
});

test('top-level pages and reply snapshot merge without duplicates in chronological order', () => {
  assert.equal(typeof Thread.mergeMessages, 'function');
  const merged = Thread.mergeMessages(
    [{ id: 'root', parent_id: null, created_at: '2026-07-28T01:00:00.000Z' }],
    [
      { id: 'reply', parent_id: 'root', created_at: '2026-07-28T01:01:00.000Z' },
      { id: 'root', parent_id: null, created_at: '2026-07-28T01:00:00.000Z' }
    ]
  );
  assert.deepEqual(merged.map((m) => m.id), ['root', 'reply']);
});

test('thread count includes nested replies and ignores unrelated threads', () => {
  assert.equal(typeof Thread.countThreadReplies, 'function');
  const messages = [
    { id: 'root', parent_id: null },
    { id: 'c1', parent_id: 'root' },
    { id: 'c2', parent_id: 'c1' },
    { id: 'other', parent_id: null },
    { id: 'other-c', parent_id: 'other' }
  ];
  assert.equal(Thread.countThreadReplies(messages, 'root'), 2);
});

test('app refuses to append thread messages into the main feed', () => {
  assert.match(appSource, /function appendMessageNode\(msg, animate\) \{[\s\S]{0,240}MessageThread\.isThreadMessage\(msg\)[\s\S]{0,80}return/);
  assert.match(appSource, /function handleIncomingMessage\(msg\) \{[\s\S]{0,1800}MessageThread\.isThreadMessage\(msg\)[\s\S]{0,500}return/);
});

test('empty comment section keeps a comment-list insertion target for the first comment', () => {
  assert.match(appSource, /if \(!flat\.length\) \{[\s\S]{0,700}class="comment-list"/);
});

test('initial channel load hydrates reply messages separately from top-level pagination', () => {
  assert.match(clientSource, /async function getReplyMessages\(channelId/);
  assert.match(appSource, /IF\.getReplyMessages\(ch\.id/);
  assert.match(appSource, /MessageThread\.mergeMessages/);
});

test('hot topics exclude recalled messages', () => {
  // computeHotItems 遍历时必须在计入热度前跳过 is_recalled 的消息（话题与子评论均不计）
  assert.match(appSource, /function computeHotItems\(\) \{[\s\S]{0,400}if \(m\.is_recalled\) return/);
});
