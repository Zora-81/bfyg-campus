// ============================================================================
// 宝丰一高校园频道 — InsForge 前端客户端封装（ESM）
// 经 esm.sh CDN 直接 import @insforge/sdk（前端无构建链）。
// anon key 是公开密钥，前端安全由 RLS 保障，可直接放前端。
// InsForge 项目: baofeng-campus  (API base 见下)
// ============================================================================
import { createClient } from 'https://cdn.jsdelivr.net/npm/@insforge/sdk@1.4.4/+esm'

const INS_FORGE_URL = 'https://api.bfgzlt.cc.cd'
const ANON_KEY = 'anon_a09338fe0bdb3e2a0797c92a73a8431ddae4b38f7b12333fe41ebbeccba6e2ea'

const insforge = createClient({ baseUrl: INS_FORGE_URL, anonKey: ANON_KEY, debug: true })

// ---- 超时包装：DB 请求最多等 ms 毫秒，超时则 resolve(null) 不抛错，避免整条链 hang ----
function withTimeout(promise, ms) {
  return Promise.race([
    promise,
    new Promise(function (resolve) { setTimeout(function () { resolve(null) }, ms) })
  ])
}

// ---- profiles 缓存（小表，会话内全量加载，用于解析消息作者）----
const profileCache = {}            // id -> { id, username, nickname, avatar_url, role, title, status }
let newMessageHandler = null       // 当前频道的 realtime 监听器（切换时移除）
let newDeleteHandler = null        // 当前频道的 realtime 删除监听器（切换时移除）
let newRecallHandler = null        // 当前频道的 realtime 撤回监听器（切换时移除）

// ---------------------------------------------------------------------------
// profiles
// ---------------------------------------------------------------------------
async function loadProfiles() {
  try {
    const { data, error } = await insforge.database
      .from('profiles').select('id, username, nickname, avatar_url, role, title, status, created_at')
    if (!error && data) data.forEach(p => { profileCache[p.id] = p })
  } catch (e) { /* 忽略 */ }
  return profileCache
}

function resolveAuthor(authorId) {
  const p = profileCache[authorId]
  if (p) return p
  return { id: authorId, username: '未知', nickname: '未知用户', avatar_url: '', title: '' }
}

function adaptUser(user) {
  const p = profileCache[user.id] || {}
  const base = (user.email || '').split('@')[0] || 'user'
  return {
    id: user.id,
    email: user.email,
    username: p.username || base,
    nickname: p.nickname || p.username || base,
    role: p.role || 'student',
    avatar_url: p.avatar_url || '',
    title: p.title || '',
    status: p.status || 'active'
  }
}

// 自助更新当前用户资料（昵称 / 称号）。列级 GRANT 限定只能改 nickname/avatar_url/title，
// 行策略 "profiles update self" 限定只能改自己那一行。更新成功后同步本地缓存。
async function updateMyProfile(userId, fields) {
  const patch = {}
  if (typeof fields.nickname === 'string') patch.nickname = fields.nickname.trim()
  if (typeof fields.title === 'string')    patch.title = fields.title.trim().slice(0, 12)
  if (typeof fields.avatar_url === 'string') patch.avatar_url = fields.avatar_url
  if (Object.keys(patch).length === 0) return profileCache[userId]
  const { error } = await insforge.database
    .from('profiles').update(patch).eq('id', userId).select()
  if (error) throw error
  profileCache[userId] = Object.assign({}, profileCache[userId], patch)
  return profileCache[userId]
}

// 注册/登录后确保 profiles 行存在（signUp 可能因邮箱验证而延后建档）
async function ensureProfile(user, desiredUsername, desiredNickname) {
  await withTimeout(loadProfiles(), 6000)
  if (profileCache[user.id]) return adaptUser(user)
  const base = (user.email || '').split('@')[0] || 'user'
  const username = desiredUsername || base
  const nickname = desiredNickname || username
  const { error } = await withTimeout(
    insforge.database.from('profiles').insert([{
      id: user.id, username, nickname, email: user.email || null, role: 'student', status: 'active'
    }]).select(),
    6000
  )
  if (!error) {
    profileCache[user.id] = { id: user.id, username, nickname, email: user.email || null, avatar_url: '', role: 'student', title: '', status: 'active' }
  }
  return adaptUser(user)
}

// ---------------------------------------------------------------------------
// auth
// ---------------------------------------------------------------------------
async function signIn(email, password) {
  // 关键：auth 请求本身也加 10s 超时，避免后端无响应时整条链无限 hang。
  const res = await withTimeout(
    insforge.auth.signInWithPassword({ email, password }),
    10000
  )
  if (!res || res.error || !res.data || !res.data.user) {
    throw new Error('登录超时或失败：后端响应缓慢，请稍后重试')
  }
  // 不在登录主链上阻塞 profile 建档。auth 一成功立即返回 user，
  // profile 补全（loadProfiles / insert）改为后台尽力而为，避免后端慢导致整条登录 hang。
  ensureProfile(res.data.user).catch(function () {})
  return res.data.user
}

async function signUp(email, password, username, nickname) {
  // ★ 直连 REST（已验证返回 {accessToken, requireEmailVerification}），
  //   绕过 SDK 的 auth.signUp 在浏览器跨域/CORS 边缘情况下把网络错误包成
  //   {error} 返回而非抛错、导致前端注册流程中断、验证面板弹不出来的问题。
  function stashPending() {
    try {
      localStorage.setItem('bfyg_pending_username', username || '')
      localStorage.setItem('bfyg_pending_nickname', nickname || username || '')
    } catch (e) {}
  }
  async function afterMaybeSession() {
    // 极少情况：注册即自动登录（含 accessToken）
    let cur = null
    try { cur = await insforge.auth.getCurrentUser() } catch (e) {}
    if (cur && cur.user) return { user: await ensureProfile(cur.user, username, nickname) }
    stashPending()
    return { requireEmailVerification: true, email }
  }
  let body = null, ok = false
  try {
    const resp = await fetch(`${INS_FORGE_URL}/api/auth/users`, {
      method: 'POST',
      headers: {
        'apikey': ANON_KEY,
        'Authorization': `Bearer ${ANON_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ email, password, name: nickname || username })
    })
    ok = resp.ok
    try { body = await resp.json() } catch (e) { body = null }
  } catch (e) {
    // 网络层失败 → 回退到 SDK 实现
    const { data, error } = await insforge.auth.signUp({
      email, password, name: nickname || username
    })
    if (error) throw error
    return await afterMaybeSession()
  }
  if (!ok) {
    const msg = (body && (body.message || body.error || body.error_description || JSON.stringify(body))) || '注册失败'
    const m = (msg + '').toLowerCase()
    // 已存在 / 需验证 → 都视为「账号已建、待验证」，弹验证面板
    if (/already|exists|registered|已注册|已存在|占用|in use|verif|confirm|not confirmed|email/i.test(m)) {
      stashPending()
      return { requireEmailVerification: true, email }
    }
    throw new Error(msg)
  }
  if (body && body.accessToken) return await afterMaybeSession()
  stashPending()
  return { requireEmailVerification: true, email }
}

// 邮箱验证后首次登录时，补全之前暂存的 profile
async function completePendingProfile(user) {
  let u = null, n = null
  try {
    u = localStorage.getItem('bfyg_pending_username')
    n = localStorage.getItem('bfyg_pending_nickname')
  } catch (e) {}
  const adapted = await ensureProfile(user, u, n)
  try {
    localStorage.removeItem('bfyg_pending_username')
    localStorage.removeItem('bfyg_pending_nickname')
  } catch (e) {}
  return adapted
}

async function signOut() {
  const { error } = await insforge.auth.signOut()
  if (error) throw error
}

// 邮箱验证码登录：验证成功后 SDK 自动建立会话
// 邮箱验证码登录：验证成功后 SDK 自动建立会话。
// 若后端验证通过却未返回 session（边缘情况），用 password 兜底登录一次。
async function verifyEmail(email, otp, password) {
  const { data, error } = await insforge.auth.verifyEmail({ email, otp })
  if (error) throw error

  // 正常路径：SDK 已从响应保存 session
  let cur = null
  try { cur = await insforge.auth.getCurrentUser() } catch (e) {}
  if (cur && cur.user) return await ensureProfile(cur.user, null, null)

  // 兜底：验证通过但无 session（如响应结构缺失 accessToken），用密码直接登录
  if (password) {
    try {
      const signInRes = await insforge.auth.signInWithPassword({ email, password })
      if (signInRes && signInRes.data && signInRes.data.user) {
        return await ensureProfile(signInRes.data.user, null, null)
      }
    } catch (e) {
      console.warn('[verifyEmail] 兜底登录失败:', e)
    }
  }

  throw new Error('验证成功但未获取到用户，请直接返回登录页用邮箱密码登录')
}

async function resendVerification(email) {
  const { data, error } = await insforge.auth.resendVerificationEmail({ email })
  if (error) throw error
  return data
}

// ---- 重置密码（code 模式）：发送验证码 → 校验验证码换 token → 用 token 设新密码 ----
async function sendResetPasswordEmail(email) {
  const { data, error } = await insforge.auth.sendResetPasswordEmail({ email })
  if (error) throw error
  return data
}

// 用 6 位邮箱验证码换取一次性重置 token（{ token, expiresAt }）
async function exchangeResetPasswordToken(email, code) {
  const { data, error } = await insforge.auth.exchangeResetPasswordToken({ email, code })
  if (error) throw error
  return data
}

// 用重置 token 设置新密码（otp 字段即 exchange 返回的 token）
async function resetPassword(newPassword, token) {
  const { data, error } = await insforge.auth.resetPassword({ newPassword, otp: token })
  if (error) throw error
  return data
}

async function getCurrentUser() {
  const { data, error } = await insforge.auth.getCurrentUser()
  if (error || !data || !data.user) return null
  await loadProfiles()
  return adaptUser(data.user)
}

// ---------------------------------------------------------------------------
// data
// ---------------------------------------------------------------------------
async function listChannels() {
  const { data, error } = await insforge.database
    .from('channels').select('*').order('created_at', { ascending: true })
  if (error) throw error
  return data
}

async function getMessages(channelId, opts) {
  opts = opts || {}
  const offset = opts.offset || 0
  const limit = opts.limit || 15
  const { data, error } = await insforge.database
    .from('messages').select('*')
    .eq('channel_id', channelId)
    .is('parent_id', null) // 只拉顶层消息；回复/评论在各自评论区展开，避免 15 条限额被回复挤占
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1)
  if (error) throw error
  return data || []
}

async function sendMessage(channelId, content, authorId, parentId) {
  // 跨国链路（Cloudflare→新加坡 InsForge）偶发抖动，客户端加重试兜底
  let lastErr = null
  const MAX = 3
  for (let attempt = 0; attempt < MAX; attempt++) {
    const t0 = Date.now()
    try {
      const { data, error } = await insforge.database
        .from('messages')
        .insert([{ channel_id: channelId, author_id: authorId, content, content_type: 'text', parent_id: parentId || null }])
        .select()
      if (error) throw error
      if (attempt > 0) console.warn(`[sendMessage] 第${attempt + 1}次成功，耗时${Date.now() - t0}ms`)
      return data && data[0]
    } catch (e) {
      lastErr = e
      const ms = Date.now() - t0
      console.warn(`[sendMessage] 第${attempt + 1}次失败(${ms}ms):`, e && (e.message || e.name || e))
      // 最后一次不重试
      if (attempt < MAX - 1) {
        await new Promise(r => setTimeout(r, 600 * (attempt + 1))) // 600/1200ms 退避
      }
    }
  }
  throw lastErr
}

// AI 自动审核：发帖成功后异步调用 Edge Function，不阻塞 UI
async function moderateMessage(msg) {
  try {
    const { data, error } = await insforge.functions.invoke('moderate-message', {
      body: {
        messageId: msg.id,
        content: msg.content,
        authorId: msg.author_id,
        channelId: msg.channel_id,
      },
    });
    if (error) console.warn('[moderate] 调用失败', error);
    else if (data && data.violation) console.log('[moderate] 命中违纪:', data.reason);
    return data;
  } catch (e) {
    console.warn('[moderate] 异常', e);
    return null;
  }
}

async function listNotifications() {
  const { data, error } = await insforge.database
    .from('notifications').select('*').order('created_at', { ascending: false })
  if (error) throw error
  return data
}

async function unreadCount() {
  // 私信(dm)未读只在好友列表显示，不计入顶部铃红点
  const { count, error } = await insforge.database
    .from('notifications').select('*', { count: 'exact', head: true }).eq('is_read', false).neq('type', 'dm')
  if (error) return 0
  return count || 0
}

async function markRead(id) {
  await insforge.database.from('notifications').update({ is_read: true }).eq('id', id)
}

async function markAllRead() {
  await insforge.database.from('notifications').update({ is_read: true }).eq('is_read', false)
}

// ---------------------------------------------------------------------------
// 社交：好友关系 / @提及提醒
//   friends 表 RLS 已限定用户只能读写涉及自己的行（user_id/friend_id = auth.uid()）。
//   3 个写 RPC（create/respond/remove）为 SECURITY DEFINER，当前用户身份由后端
//   auth.uid() 取得，前端无需传 uid；friendsList 仅按 RLS 可见范围过滤即可。
// ---------------------------------------------------------------------------

// 取当前登录用户 id（复用 SDK 会话，与 getCurrentUser 同一来源）
async function getCurrentUserId() {
  try {
    const { data, error } = await insforge.auth.getCurrentUser()
    if (error || !data || !data.user) return null
    return data.user.id
  } catch (e) {
    return null
  }
}

// 发消息时解析 @ 并写入 mention 通知（后端 RPC 负责解析与落库，RETURNS void）
async function notifyMentions({ messageId, authorId, channelId, content }) {
  const { error } = await insforge.database.rpc('notify_mentions', {
    p_message_id: messageId,
    p_author_id: authorId,
    p_channel_id: channelId,
    p_content: content
  })
  if (error) throw error
}

// 好友列表：区分「我的好友(accepted)」与「待处理(pending)」。
// 每条附带对方 profile（nickname/username/avatar_url）与 direction（in=别人加我 / out=我加别人）。
async function friendsList() {
  const me = await getCurrentUserId()
  if (!me) return { friends: [], pending: [] }
  // InsForge SDK 对 OR 条件支持不稳定，拆成两次 eq 查询再合并更可靠
  const [outgoing, incoming] = await Promise.all([
    insforge.database.from('friends').select('*').eq('user_id', me),
    insforge.database.from('friends').select('*').eq('friend_id', me)
  ]);
  const rows = [...(outgoing.data || []), ...(incoming.data || [])]

  // 关联 profiles 取对方资料（与现有 loadProfiles/getLikeAggregates 的 JS 侧 join 风格一致）
  const otherIds = rows.map(function (r) { return r.user_id === me ? r.friend_id : r.user_id })
  let profiles = {}
  if (otherIds.length) {
    const { data: pd, error: pe } = await insforge.database
      .from('profiles').select('id, username, nickname, avatar_url')
      .in('id', otherIds)
    if (!pe && pd) pd.forEach(function (p) { profiles[p.id] = p })
  }

  const friends = []
  const pending = []
  rows.forEach(function (r) {
    const direction = (r.friend_id === me) ? 'in' : 'out'
    const otherId = (r.user_id === me) ? r.friend_id : r.user_id
    const p = profiles[otherId] || { id: otherId, username: '未知', nickname: '未知用户', avatar_url: '' }
    const entry = {
      id: r.id,
      status: r.status,
      direction: direction,
      other: {
        id: p.id,
        username: p.username || '',
        nickname: p.nickname || p.username || '未知用户',
        avatar_url: p.avatar_url || ''
      }
    }
    if (r.status === 'accepted') friends.push(entry)
    else pending.push(entry)
  })
  return { friends: friends, pending: pending }
}

// 发起好友申请（后端用 auth.uid() 作为发起方，RETURNS jsonb）
async function friendRequest(friendId) {
  const { data, error } = await insforge.database
    .rpc('create_friend_request', { p_friend_id: friendId })
  if (error) throw error
  // 业务层可能返回 {ok:false,...}（重复申请/加自己/noauth），PostgREST 仍视为 200，
  // 必须显式检查，否则前端会误判成功假弹“已发送”。
  if (data && data.ok === false) throw new Error('好友申请失败：' + (data.error || 'unknown'))
  return data
}

// 接受 / 拒绝好友申请（id 为 friends 行 id；action: 'accept' | 'reject'，RETURNS jsonb）
async function friendRespond(id, action) {
  const { data, error } = await insforge.database
    .rpc('respond_friend_request', { p_friendship_id: id, p_action: action })
  if (error) throw error
  if (data && data.ok === false) throw new Error('操作失败：' + (data.error || 'unknown'))
  return data
}

// 移除好友（双向删除，RETURNS jsonb）
async function friendRemove(id) {
  const { data, error } = await insforge.database
    .rpc('remove_friend', { p_friend_id: id })
  if (error) throw error
  if (data && data.ok === false) throw new Error('移除失败：' + (data.error || 'unknown'))
  return data
}

// ============ 私聊 DM ============
// 开/取与某好友的私聊房间（前端只传好友 id，身份由后端 auth.uid() 取得；RETURNS jsonb）
async function findOrCreateDm(friendId) {
  const { data, error } = await insforge.database
    .rpc('find_or_create_dm', { p_friend_id: friendId })
  if (error) throw error
  return data
}

// 私信到达时给对方写 dm 类型通知（顶部铃不冒红点，仅好友列表显示未读；RETURNS void）
async function notifyDm({ messageId, authorId, channelId, friendId, content }) {
  const { error } = await insforge.database.rpc('notify_dm', {
    p_message_id: messageId,
    p_author_id: authorId,
    p_channel_id: channelId,
    p_friend_id: friendId,
    p_content: content
  })
  if (error) throw error
}

// 按昵称搜索用户（authenticated 用户可读 profiles，RLS 允许）
// 安全：所有用户输入在后端 SQL 函数中做 LIKE 元字符转义，前端不再拼 % 到查询条件里
async function searchUsers(keyword, limit) {
  const k = (keyword || '').trim()
  if (!k || k.length > 30) return []
  const { data, error } = await insforge.database.rpc('search_users_safe', { p_keyword: k, p_limit: limit || 5 })
  if (error) throw error
  return data || []
}

// ---------------------------------------------------------------------------
// storage
// ---------------------------------------------------------------------------
async function uploadFile(file) {
  const { data, error } = await insforge.storage.from('uploads').uploadAuto(file)
  if (error) throw error
  // ⚠️ InsForge 返回的 url 指向新加坡直连主机（*.insforge.app 国内不可达），
  // 必须改写为 Worker 反代域名 api.bfgzlt.cc.cd，否则 <img> 在大陆加载失败（破损图标）。
  let url = (data && data.url) || ''
  try {
    const u = new URL(url)
    const proxy = new URL(INS_FORGE_URL)
    u.protocol = proxy.protocol
    u.hostname = proxy.hostname
    url = u.toString()
  } catch (_) {}
  return { key: data.key, url }
}

async function sendFileMessage(channelId, authorId, fileMeta) {
  // fileMeta: { url, name, size, isImage }
  const content = JSON.stringify({ url: fileMeta.url, name: fileMeta.name, size: fileMeta.size })
  const { data, error } = await insforge.database
    .from('messages')
    .insert([{
      channel_id: channelId, author_id: authorId, content,
      content_type: fileMeta.isImage ? 'image' : 'file'
    }]).select()
  if (error) throw error
  return data && data[0]
}

// ---------------------------------------------------------------------------
// 消息互动：点赞 / 聚合 / 转发
//   点赞走独立关联表 message_likes（Flarum 范式），计数前端聚合，规避触发器/RLS 冲突。
// ---------------------------------------------------------------------------

// 切换点赞：未赞→插入，已赞→删除。返回最新 { liked, total }。
async function toggleLike(messageId, userId) {
  const { data: existing } = await insforge.database
    .from('message_likes').select('message_id')
    .eq('message_id', messageId).eq('user_id', userId)
  let liked
  if (existing && existing.length) {
    const { error } = await insforge.database
      .from('message_likes').delete()
      .eq('message_id', messageId).eq('user_id', userId)
    if (error) throw error
    liked = false
  } else {
    const { error } = await insforge.database
      .from('message_likes').insert([{ message_id: messageId, user_id: userId }])
    if (error) throw error
    liked = true
  }
  // 聚合最新总数（前端计数来源，无计数列）
  const { count, error: cErr } = await insforge.database
    .from('message_likes').select('*', { count: 'exact', head: true })
    .eq('message_id', messageId)
  const total = cErr ? 0 : (count || 0)
  // 一致性兜底：刚插入成功但 count 读到 0 时，至少把自己算上
  if (liked && total <= 0) return { liked, total: 1 }
  return { liked, total }
}

// 批量聚合某频道所有消息的点赞：{ [messageId]: { total, mine } }
// InsForge 对超长 IN 查询会 502，这里按 CHUNK 分批拉取。
async function getLikeAggregates(messageIds, userId) {
  const agg = {}
  if (!messageIds || !messageIds.length) return agg
  // 先建占位，保证 0 赞的消息也显示总数
  for (var i = 0; i < messageIds.length; i++) {
    agg[messageIds[i]] = { total: 0, mine: false }
  }
  var CHUNK = 48 // PostgREST IN 上限建议 50 以内，留余量
  for (var i = 0; i < messageIds.length; i += CHUNK) {
    var slice = messageIds.slice(i, Math.min(i + CHUNK, messageIds.length))
    try {
      const { data, error } = await insforge.database
        .from('message_likes').select('message_id, user_id')
        .in('message_id', slice)
      if (!error && data) {
        data.forEach(function (r) {
          if (!agg[r.message_id]) agg[r.message_id] = { total: 0, mine: false }
          agg[r.message_id].total++
          if (r.user_id === userId) agg[r.message_id].mine = true
        })
      }
    } catch (e) { /* 单批失败不影响其他批次 */ }
  }
  // 一致性兜底：mine=true 但 total=0 时修正为 1
  for (const mid in agg) {
    if (agg.hasOwnProperty(mid) && agg[mid].mine && agg[mid].total <= 0) {
      agg[mid].total = 1
    }
  }
  return agg
}

// 转发：插入一条带 forward_from 引用的新消息（HuLa 范式）。
// 走 messages INSERT → 现有 publish_message_realtime 广播 new_message → 天然实时。
async function forwardMessage(channelId, authorId, payload) {
  // payload: { forwardFrom, forwardAuthor, forwardPreview, content }
  const { data, error } = await insforge.database
    .from('messages').insert([{
      channel_id: channelId,
      author_id: authorId,
      content: payload.content || (payload.forwardPreview || ''),
      content_type: 'text',
      forward_from: payload.forwardFrom || null,
      forward_author: payload.forwardAuthor || '',
      forward_preview: payload.forwardPreview || ''
    }]).select()
  if (error) throw error
  return data && data[0]
}

// ---------------------------------------------------------------------------
// realtime
// ---------------------------------------------------------------------------
let rtConnected = false

async function connectRealtime(channelId, handlers) {
  // handlers: { onMessage(msg), onPresence(members) }
  if (!rtConnected) {
    await insforge.realtime.connect()
    rtConnected = true
  }

  // 清掉上一个频道的监听器，避免重复
  if (newMessageHandler) {
    insforge.realtime.off('new_message', newMessageHandler)
    newMessageHandler = null
  }
  if (newDeleteHandler) {
    insforge.realtime.off('delete_message', newDeleteHandler)
    newDeleteHandler = null
  }
  if (newRecallHandler) {
    insforge.realtime.off('recall_message', newRecallHandler)
    newRecallHandler = null
  }

  const channel = 'chat:' + channelId
  const resp = await insforge.realtime.subscribe(channel)
  if (!resp.ok) {
    console.warn('[rt] 订阅失败', channel, resp.error)
    return resp
  }
  if (handlers.onPresence && resp.presence) handlers.onPresence(resp.presence.members)

  newMessageHandler = function (payload) {
    if (payload && payload.channel_id === channelId && handlers.onMessage) {
      handlers.onMessage(payload)
    }
  }
  insforge.realtime.on('new_message', newMessageHandler)

  // 删除事件：后端无 DELETE 触发器，由删除发起方（如后台）实时广播 delete_message
  // { id, channel_id }，所有订阅该频道的客户端据此即时移除 DOM 与内存数组。
  if (handlers.onDelete) {
    newDeleteHandler = function (payload) {
      if (payload && payload.channel_id === channelId && handlers.onDelete) {
        handlers.onDelete(payload)
      }
    }
    insforge.realtime.on('delete_message', newDeleteHandler)
  }

  // 撤回事件：由撤回发起方实时广播 recall_message { id, channel_id, recalled_by }，
  // 所有订阅该频道的客户端据此即时隐藏（普通成员）或转「已撤回」占位（管理员）。
  if (handlers.onRecall) {
    newRecallHandler = function (payload) {
      if (payload && payload.channel_id === channelId && handlers.onRecall) {
        handlers.onRecall(payload)
      }
    }
    insforge.realtime.on('recall_message', newRecallHandler)
  }
  return resp
}

function unsubscribeChannel(channelId) {
  try { insforge.realtime.unsubscribe('chat:' + channelId) } catch (e) {}
  try { if (newDeleteHandler) insforge.realtime.off('delete_message', newDeleteHandler) } catch (e) {}
  try { if (newRecallHandler) insforge.realtime.off('recall_message', newRecallHandler) } catch (e) {}
}

function disconnectRealtime() {
  if (newMessageHandler) {
    try { insforge.realtime.off('new_message', newMessageHandler) } catch (e) {}
    newMessageHandler = null
  }
  if (newDeleteHandler) {
    try { insforge.realtime.off('delete_message', newDeleteHandler) } catch (e) {}
    newDeleteHandler = null
  }
  if (newRecallHandler) {
    try { insforge.realtime.off('recall_message', newRecallHandler) } catch (e) {}
    newRecallHandler = null
  }
  try { insforge.realtime.disconnect() } catch (e) {}
  rtConnected = false
}

// 删除广播：由删除发起方（后台）调用，向该频道实时推送 delete_message 事件。
// 后端无 DELETE 触发器（CLI 拒绝 CREATE FUNCTION），故用客户端 publish 补足实时删除能力。
async function publishDelete(channelId, id) {
  try {
    if (!rtConnected) await insforge.realtime.connect()
    insforge.realtime.publish('chat:' + channelId, 'delete_message', { id: id, channel_id: channelId })
  } catch (e) {
    console.warn('[rt] publishDelete failed', e)
  }
}

// ---------------------------------------------------------------------------
// 撤回：软删除（标记 is_recalled）+ 实时广播 recall_message
// ---------------------------------------------------------------------------

// 标记消息已撤回：UPDATE is_recalled=true（RLS 会校验「作者1分钟内」或「管理员」）。
async function recallMessage(channelId, msgId, recalledBy) {
  const patch = {
    is_recalled: true,
    recalled_at: new Date().toISOString(),
    recalled_by: recalledBy
  }
  const { data, error } = await insforge.database
    .from('messages').update(patch).eq('id', msgId).select()
  if (error) throw error
  return data && data[0]
}

// 实时广播：向该频道推送 recall_message 事件，其他在线客户端据此立即隐藏/占位。
async function publishRecall(channelId, id, recalledBy) {
  try {
    if (!rtConnected) await insforge.realtime.connect()
    insforge.realtime.publish('chat:' + channelId, 'recall_message', {
      id: id, channel_id: channelId, recalled_by: recalledBy
    })
  } catch (e) {
    console.warn('[rt] publishRecall failed', e)
  }
}

// ---------------------------------------------------------------------------
// 导出到全局（app.js 是普通脚本，通过 window.IF 调用）
// ---------------------------------------------------------------------------
const IF = {
  insforge,
  loadProfiles, resolveAuthor, adaptUser, ensureProfile, completePendingProfile, updateMyProfile,
  signIn, signUp, signOut, getCurrentUser, verifyEmail, resendVerification,
  sendResetPasswordEmail, exchangeResetPasswordToken, resetPassword,
  listChannels, getMessages, sendMessage, moderateMessage,
  listNotifications, unreadCount, markRead, markAllRead,
  getCurrentUserId, notifyMentions, searchUsers, friendsList, friendRequest, friendRespond, friendRemove,
  findOrCreateDm, notifyDm,
  uploadFile, sendFileMessage,
  toggleLike, getLikeAggregates, forwardMessage,
  connectRealtime, unsubscribeChannel, disconnectRealtime, publishDelete,
  recallMessage, publishRecall,
  get isRealtimeConnected() { return rtConnected },
  get INS_FORGE_URL() { return 'https://api.bfgzlt.cc.cd' },
  get ANON_KEY() { return ANON_KEY }
}

window.IF = IF
window.dispatchEvent(new Event('IF_READY'))
