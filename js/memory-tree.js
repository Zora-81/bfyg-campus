// ===== 记忆树 · 引导模块（ESM）=====
// 等待依赖 → 创建场景 → 绑定 UI → 评论/详情/AI 交互。
// 不依赖 React；通过 window.MT_* 全局与场景/评论/AI 模块协作。

const CFG = window.MT_CONFIG;
const DATA = window.MT_DATA;
const $ = (s) => document.querySelector(s);

let sceneApi = null;
let memoryMusic = null;
let currentItem = null;
let currentUser = null;

// ---------- 播放列表（BobZhang 同款多曲目） ----------
// 把 MP3 文件放到项目根目录 audio/memory-tree/ 下即可自动播放；
// 无文件时会自动回退到 three-scene.js 的合成环境音。
const MUSIC_PLAYLIST = [
  { title: '尘风', artist: '', url: '/audio/memory-tree/track-1.mp3' },
  { title: 'Angel', artist: '尹美莱', url: '/audio/memory-tree/track-3.mp3' }
];

class MemoryMusic {
  constructor(sceneApiRef) {
    this.sceneApi = sceneApiRef;
    this.index = 0;
    this.audio = new Audio();
    this.audio.loop = true;
    this.audio.volume = 0.55;
    this.playing = false;
    this.available = false;
    this.everPlayed = false;
    this.gaveUp = false; // 任一曲目加载失败即回退到合成 BGM
    this.listeners = {};
    this._bindAudioEvents();
  }

  _bindAudioEvents() {
    const a = this.audio;
    a.addEventListener('play', () => { this.playing = true; this._pauseSynth(); this._emit('play'); });
    a.addEventListener('pause', () => { this.playing = false; this._emit('pause'); });
    a.addEventListener('canplaythrough', () => {
      if (!this.available) { this.available = true; this._emit('load', { available: true }); }
    });
    a.addEventListener('error', () => {
      this.available = false;
      if (!this.gaveUp) {
        this.gaveUp = true;
        try { this.audio.src = ''; } catch (e) {}
      }
      this._emit('error', { track: this.currentTrack() });
    });
  }

  currentTrack() { return MUSIC_PLAYLIST[this.index] || MUSIC_PLAYLIST[0]; }

  _load(idx) {
    const len = MUSIC_PLAYLIST.length;
    this.index = ((idx % len) + len) % len;
    if (this.gaveUp) return;
    this.available = false;
    this.audio.src = this.currentTrack().url;
    this.audio.load();
  }

  play() {
    this.everPlayed = true;
    if (this.gaveUp) {
      // 已回退到合成 BGM：切换为播放状态
      if (this.sceneApi) { this.sceneApi.initAudio(); this.sceneApi.setMusic(true); this._emit('play'); }
      return;
    }
    if (!this.audio.src) this._load(this.index);
    const p = this.audio.play();
    if (p && p.catch) p.catch(() => {
      this.playing = false;
      this._emit('pause');
    });
  }

  pause() {
    if (this.gaveUp) {
      if (this.sceneApi) { this.sceneApi.setMusic(false); this._emit('pause'); }
      return;
    }
    this.audio.pause();
  }

  toggle() {
    if (this.available) {
      this.playing ? this.pause() : this.play();
    } else {
      // 无真实音乐时控制合成 BGM
      if (this.sceneApi) {
        this.sceneApi.initAudio();
        const on = !this.sceneApi.isMusicOn();
        this.sceneApi.setMusic(on);
        this._emit(on ? 'play' : 'pause');
      }
    }
  }

  next() {
    const wasPlaying = this.isEffectivelyPlaying();
    this._load(this.index + 1);
    if (wasPlaying) this.play();
    this._emit('next');
  }

  prev() {
    const wasPlaying = this.isEffectivelyPlaying();
    this._load(this.index - 1);
    if (wasPlaying) this.play();
    this._emit('prev');
  }

  isPlaying() {
    if (this.available) return this.playing;
    return this.sceneApi ? this.sceneApi.isMusicOn() : false;
  }

  isAvailable() { return this.available; }

  isEffectivelyPlaying() {
    if (this.available) return !this.audio.paused;
    return this.sceneApi ? this.sceneApi.isMusicOn() : false;
  }

  _pauseSynth() {
    if (this.sceneApi && this.sceneApi.isMusicOn()) this.sceneApi.setMusic(false);
  }

  on(event, cb) {
    if (!this.listeners[event]) this.listeners[event] = [];
    this.listeners[event].push(cb);
  }

  _emit(event, data) {
    (this.listeners[event] || []).forEach(cb => cb(data));
  }
}

// ---------- 元素 ----------
const el = {
  loader: $('#mt-loader'), loaderCanvas: $('#mt-loader-canvas'),
  canvas: $('#mt-canvas'), hud: $('#mt-hud'), toast: $('#mt-toast'),
  detail: $('#mt-detail'), detailMedia: $('#mt-detail-media'), detailTitle: $('#mt-detail-title'),
  detailMeta: $('#mt-detail-meta'), detailDelete: $('#mt-detail-delete'),
  summary: $('#mt-summary'), comments: $('#mt-comments'),
  commentsCount: $('#mt-comments-count'),
  form: $('#mt-comment-form'), text: $('#mt-comment-text'),
  postModal: $('#mt-post-modal'), postTrigger: $('#mt-post-trigger'), postClose: $('#mt-post-close'),
  postCancel: $('#mt-post-cancel'), postForm: $('#mt-post-form'), postText: $('#mt-post-text'),
  postAnon: $('#mt-post-anon'),
  postImageBtn: $('#mt-post-image-btn'), postImageInput: $('#mt-post-image-input'),
  postImageRow: $('#mt-post-image-row'), postImagePreview: $('#mt-post-image-preview'),
  postImageRemove: $('#mt-post-image-remove'), postAuthorHint: $('#mt-post-author-hint'),
  postSendBtn: $('#mt-post-send'),
  back: $('#mt-back'),
  musicCard: $('#mt-music-card'), musicDisc: $('#mt-music-disc'),
  musicName: $('#mt-music-name'), musicArtist: $('#mt-music-artist'),
  fallback: $('#mt-fallback'), fallbackGrid: $('#mt-fallback-grid')
};

// ---------- 工具 ----------
function toast(msg) {
  el.toast.textContent = msg; el.toast.hidden = false;
  requestAnimationFrame(() => el.toast.classList.add('show'));
  clearTimeout(toast._t);
  toast._t = setTimeout(() => { el.toast.classList.remove('show'); setTimeout(() => el.toast.hidden = true, 250); }, 2200);
}
function updateMusicUI() {
  if (!memoryMusic) return;
  const on = memoryMusic.isPlaying();
  const track = memoryMusic.currentTrack();
  if (el.musicName) el.musicName.textContent = track.title;
  if (el.musicArtist) {
    el.musicArtist.textContent = memoryMusic.isAvailable()
      ? (track.artist || '记忆树原声')
      : '放置 MP3 可切真实音乐';
  }
  if (el.musicCard) el.musicCard.classList.toggle('no-audio', !memoryMusic.isAvailable());
  if (el.musicDisc) el.musicDisc.classList.toggle('playing', on);
}
function fmtTime(ts) {
  const d = new Date(ts);
  const p = (n) => (n < 10 ? '0' : '') + n;
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}
function mediaURL(item) { return item.url || ''; }

// ---------- 加载动画：E · 星海隧道（canvas 粒子 + GSAP 收束） ----------
let loaderCanvas, lctx, lraf = 0, lW = 0, lH = 0, lDPR = 1, lcx = 0, lcy = 0;
let lStars = [], lNeb = [], lPts = [];
const loadState = { p: 0, done: false, conv: 0, rot: 0 };
let lLast = 0;
let loadStartTs = 0;
let lReduced = false;

function loaderResize() {
  if (!loaderCanvas) return;
  lDPR = Math.min(window.devicePixelRatio || 1, 2);
  lW = loaderCanvas.clientWidth || window.innerWidth;
  lH = loaderCanvas.clientHeight || window.innerHeight;
  loaderCanvas.width = Math.floor(lW * lDPR);
  loaderCanvas.height = Math.floor(lH * lDPR);
  lctx.setTransform(lDPR, 0, 0, lDPR, 0, 0);
  lcx = lW / 2; lcy = lH / 2;
}
function loaderSpawnStar() {
  return {
    a: Math.random() * Math.PI * 2,
    rad: Math.sqrt(Math.random()) * 0.92,
    z: 0.05 + Math.random() * 0.98,
    spd: 0.5 + Math.random() * 1.4,
    sz: 0.6 + Math.random() * 1.8,
    hue: 205 + Math.random() * 75,
    tw: Math.random() * Math.PI * 2
  };
}
function loaderSpawnNeb() {
  return { x: Math.random(), y: Math.random(), r: 0.35 + Math.random() * 0.5, hue: 225 + Math.random() * 55, a: 0.10 + Math.random() * 0.09 };
}
function loaderInit() {
  loaderCanvas = el.loaderCanvas;
  if (!loaderCanvas) return;
  lctx = loaderCanvas.getContext('2d');
  lReduced = !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  loaderResize();
  lStars = Array.from({ length: 130 }, loaderSpawnStar);
  lNeb = Array.from({ length: 2 }, loaderSpawnNeb);
  lPts = Array.from({ length: 600 }, () => {
    const p = loaderSpawnStar();
    // 隧道粒子初始更靠屏幕中央（z 小=近=大），分布 0.05~0.78，
    // 第一帧就有一大片粒子在视野内流动，杜绝「显示出来愣一下才动」。
    p.z = 0.05 + Math.random() * 0.73;
    return p;
  });
  window.addEventListener('resize', loaderResize);
}
function loaderSetProgress(p) { loadState.p = Math.max(0, Math.min(1, p)); }
function loaderTick(now) {
  if (!lctx) return;
  const dt = Math.min(40, now - lLast) / 16.67; lLast = now;
  const focal = lW * 0.46 * (1 + loadState.conv * 0.85);
  // 拖尾：半透明黑覆盖，形成星轨
  lctx.globalCompositeOperation = 'source-over';
  lctx.fillStyle = lReduced ? 'rgba(3,3,12,0.55)' : 'rgba(3,3,12,0.18)';
  lctx.fillRect(0, 0, lW, lH);
  // 星云
  for (const n of lNeb) {
    const nx = n.x * lW, ny = n.y * lH, nr = n.r * Math.min(lW, lH);
    const g = lctx.createRadialGradient(nx, ny, 0, nx, ny, nr);
    const col = 'hsla(' + n.hue + ',80%,65%,';
    g.addColorStop(0, col + n.a + ')');
    g.addColorStop(1, col + '0)');
    lctx.fillStyle = g; lctx.fillRect(nx - nr, ny - nr, nr * 2, nr * 2);
  }
  // 背景星点（呼吸）
  lctx.globalCompositeOperation = 'lighter';
  const tsec = now * 0.001;
  for (const s of lStars) {
    const fl = 0.5 + 0.5 * Math.sin(tsec * 1.6 + s.tw);
    const sx = lcx + Math.cos(s.a) * s.rad * lW * 0.5;
    const sy = lcy + Math.sin(s.a) * s.rad * lH * 0.5;
    lctx.fillStyle = 'hsla(' + s.hue + ',90%,' + (70 + fl * 20) + '%,' + (0.35 + fl * 0.4) + ')';
    lctx.beginPath(); lctx.arc(sx, sy, s.sz * (0.7 + fl * 0.5), 0, 6.283); lctx.fill();
  }
  // 星海隧道
  loadState.rot += 0.0014 * (1 + loadState.p * 1.5) * dt * (lReduced ? 0.4 : 1);
  // 基础速度提高（0.45→0.95），让 loadState.p 还很低时隧道也已明显流动，
  // 避免「显示出来后愣一下才动」；p 升高后系数降到 1.4，避免过快失控。
  const speedMul = (0.95 + loadState.p * 1.4) * (1 - loadState.conv * 0.97) * (lReduced ? 0.5 : 1);
  for (const p of lPts) {
    const prevZ = p.z;
    p.z -= (0.006 + 0.012 * loadState.p) * p.spd * speedMul * dt;
    if (p.z <= 0.04) { Object.assign(p, loaderSpawnStar()); p.z = 1.0; }
    const k = 1 / p.z, kPrev = 1 / prevZ, ang = p.a + loadState.rot;
    const px = lcx + Math.cos(ang) * p.rad * k * focal;
    const py = lcy + Math.sin(ang) * p.rad * k * focal;
    const pxp = lcx + Math.cos(ang) * p.rad * kPrev * focal;
    const pyp = lcy + Math.sin(ang) * p.rad * kPrev * focal;
    const screenR = Math.hypot(px - lcx, py - lcy);
    const alpha = Math.min(1, (1 - p.z) * 1.1) * (0.5 + 0.5 * Math.min(1, screenR / (lW * 0.5)));
    const size = Math.min(p.sz * k * 0.5, 6);
    lctx.strokeStyle = 'hsla(' + p.hue + ',95%,72%,' + (alpha * 0.8) + ')';
    lctx.lineWidth = Math.max(0.5, Math.min(size, 4));
    lctx.beginPath(); lctx.moveTo(pxp, pyp); lctx.lineTo(px, py); lctx.stroke();
    lctx.fillStyle = 'hsla(' + p.hue + ',100%,85%,' + alpha + ')';
    lctx.beginPath(); lctx.arc(px, py, Math.max(0.4, size), 0, 6.283); lctx.fill();
  }
  lraf = requestAnimationFrame(loaderTick);
}
function loaderStart() {
  if (!el.loaderCanvas) return;
  loaderInit();
  lLast = performance.now();
  loadStartTs = performance.now();
  cancelAnimationFrame(lraf);
  lraf = requestAnimationFrame(loaderTick);
}
function loaderFinish() {
  loadState.done = true;
  const hide = () => {
    cancelAnimationFrame(lraf);
    const reveal = () => { el.loader.style.display = 'none'; el.hud.classList.add('show'); };
    // loader 淡出 -> 露出底层 Three.js 场景，形成交叉淡入（不再硬切）
    if (window.gsap) gsap.to(el.loader, { opacity: 0, duration: 0.6, ease: 'power2.out', onComplete: reveal });
    else reveal();
  };
  if (window.gsap) gsap.to(loadState, { conv: 1, duration: 0.95, ease: 'power2.in', onComplete: hide });
  else hide();
}
// ---------- 加载进度（平滑假进度 + 真实就绪，驱动隧道速度） ----------
function startProgress() {
  let p = 28;
  const tick = () => {
    p += (92 - p) * 0.07 + 1.0;
    if (p > 92) p = 92;
    loaderSetProgress(p / 100);
    if (p < 92) progressTimer = requestAnimationFrame(tick);
  };
  progressTimer = requestAnimationFrame(tick);
}
let progressTimer = 0;
function finishLoad() {
  // 最短展示时长：避免 3D 场景编译过快时，星海隧道一闪即逝。
  // 预热(WARM_MS)已提供充足展示，此处仅保底，缩短到 400ms 防拖沓。
  const elapsed = performance.now() - loadStartTs;
  const MIN_SHOW = 400;
  if (elapsed < MIN_SHOW) { setTimeout(finishLoad, MIN_SHOW - elapsed); return; }
  cancelAnimationFrame(progressTimer);
  loaderSetProgress(1);
  loaderFinish();
}

// ---------- 记忆种子（把预设照片变成真实帖子：发布人 管理员T0 + AI 记忆档案员评语）----------
const SEED_AI_CAPTIONS = [
  '哇！这张航拍也太有感觉了吧！新校区刚醒过来的样子，香山路的风一吹，整个人都被拽回早读偷瞄窗外的日子了～ ✨',
  '晨光洒在教学楼上的瞬间，连粉笔灰都在发光诶！这就是青春自带的滤镜吧，谁懂啊！ 🌅',
  '林荫道上的读书声真的绝了……每次走过都觉得，这大概就是学校最温柔的背景音吧！ 🍃',
  '实验室的午后永远yyds！试管里晃来晃去的光，跟那时候偷偷憧憬的未来一模一样～ 🔬',
  '操场晚风我真的会哭！那些年跑过的圈、喊过的口号，全被这阵风记住了吧…… 🏃',
  '夜色里的校园也太像一封情书了，还是写给每一个舍不得毕业的我们的！ 💌',
  '星河下的校园美得不真实……所有瞬间都被收进同一片光里，像梦一样！ 🌌'
];
const ADMIN_USER_ID = '176a6707-9234-4e1c-bda6-42f8d5231bc1';
const SEED_POSTS = (window.MT_DATA || []).map((d, i) => ({
  id: 'seed_' + d.id,
  content: d.title || '校园记忆',
  authorName: '管理员T0',
  anonymous: false,
  imageUrl: d.url,
  authorId: ADMIN_USER_ID,
  created_at: Date.now() - (window.MT_DATA.length - i) * 86400000,
  isPost: true,
  seeded: true,
  reviewed: true
}));
const SEED_COMMENTS = SEED_POSTS.map((p, i) => ({
  id: 'seed_c_' + p.id,
  itemId: p.id,
  content: SEED_AI_CAPTIONS[i] || '这张照片记录了一段珍贵的校园时光。',
  authorName: 'AI 记忆档案员',
  authorId: null,
  status: 1,
  is_ai: true,
  created_at: p.created_at + 60000
}));
async function seedMemoryData() {
  try {
    // 帖子：云端模式会异步确保云端已种子（缺失自动补种）；本地模式同步落地
    if (window.MTPosts && window.MTPosts.ensureSeed) await window.MTPosts.ensureSeed(SEED_POSTS);

    // 评论：仅本地模式需要把 AI 评语写入 localStorage；云端模式评语已在云端（记忆树与频道同款）
    const cb = (window.MT_CONFIG && window.MT_CONFIG.commentsBackend) || 'insforge';
    if (cb === 'local') {
      const ckey = (window.MT_CONFIG && window.MT_CONFIG.commentsStorageKey) || 'mt_comments_v1';
      let cs = [];
      try { cs = JSON.parse(localStorage.getItem(ckey) || '[]'); } catch (e) {}
      SEED_COMMENTS.forEach(sc => {
        const i = cs.findIndex(c => c.id === sc.id);
        if (i >= 0) cs[i] = { ...cs[i], ...sc };
        else cs.push(sc);
      });
      localStorage.setItem(ckey, JSON.stringify(cs));
    }
    localStorage.setItem('mt_seeded_v1', '1');
  } catch (e) { /* 种子失败不影响主流程 */ }
}

// ---------- 场景初始化 ----------
function init() {
  if (!CFG || !DATA) { toast('配置未加载'); return; }
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  loaderStart();
  startProgress();
  // 关键修复：先让 loader 动画流畅展示 850ms，再初始化 Three.js 场景。
  // MTScene.create 会同步阻塞主线程数百毫秒~1.5s（编译着色器/建几何体），
  // 若过早执行，隧道 rAF 被卡死 -> 用户看到「显示出来愣一下才流动」。
  // 延到隧道已明显流动之后，阻塞发生时用户早已看到动画在播，不再有迟滞感。
  const WARM_MS = 850;
  requestAnimationFrame(function () {
    const warmStart = performance.now();
    const runScene = async function () {
      try {
        sceneApi = window.MTScene.create({
          canvas: el.canvas, config: CFG, data: [], reducedMotion: reduced,
          onNodeClick: openDetail,
          onReady: finishLoad
        });
      } catch (e) { console.error(e); showFallback(); return; }
      if (!sceneApi || sceneApi.fallback) { showFallback(); return; }

      bindUI();
      initMusicPlayer();
      // 云端模式：先把云端帖子/评论拉到内存缓存，再渲染场景与相册（与频道消息一致）
      try { if (window.MTPosts && window.MTPosts.refresh) await window.MTPosts.refresh(); } catch (e) {}
      try { if (window.MTComments && window.MTComments.refresh) await window.MTComments.refresh(); } catch (e) {}
      await seedMemoryData();
      // 种子可能补充了云端空库，再拉一次确保缓存最新
      try { if (window.MTPosts && window.MTPosts.refresh) await window.MTPosts.refresh(); } catch (e) {}
      buildFallbackGrid();
      loadPosts();
      tryAuth();
      // 延迟尝试自动播放（与 BobZhang 同款 800ms 延迟），
      // 浏览器策略可能阻止，失败时仍可点击播放。
      setTimeout(() => {
        if (memoryMusic && !memoryMusic.everPlayed) {
          memoryMusic.play();
        }
      }, 800);
    };
    const tryRun = function () {
      const elapsed = performance.now() - warmStart;
      if (elapsed >= WARM_MS) {
        requestAnimationFrame(runScene);
      } else {
        setTimeout(tryRun, WARM_MS - elapsed);
      }
    };
    tryRun();
  });
}

function tryAuth() {
  const start = async () => {
    try { currentUser = await window.IF.getCurrentUser(); } catch (e) { currentUser = null; }
    if (currentUser && currentUser.id) window.__mtCurrentUserId = currentUser.id;  // 供云端写入归属
    updatePostAuthorHint();
  };
  if (window.IF) start();
  else window.addEventListener('IF_READY', start, { once: true });
}

// ---------- 详情 / 评论 ----------
async function openDetail(item, origin) {
  currentItem = item;
  const isPost = item.isPost || (!item.url && item.content);
  const title = isPost ? (item.content.length > 22 ? item.content.slice(0, 22) + '…' : item.content) : (item.title || '记忆');
  el.detailMedia.innerHTML = '';
  const url = mediaURL(item);
  if (url) {
    const img = document.createElement('img');
    img.className = 'mt-detail-img';
    img.src = url; img.alt = item.title || '';
    img.title = '点击放大查看';
    // 渐进式：先透明，加载完淡入；加载中由 CSS 骨架微光占位，消除"白等后啪一下出现"
    img.addEventListener('load', () => img.classList.add('loaded'));
    img.addEventListener('error', () => img.classList.add('mt-img-error'));
    img.addEventListener('click', (e) => { e.stopPropagation(); openLightbox(url); });
    el.detailMedia.appendChild(img);
  } else {
    const ph = document.createElement('div');
    ph.className = 'mt-detail-media-placeholder';
    ph.innerHTML = `<span>${item.emoji || '✦'}</span><div>${escapeHtml(title)}</div>`;
    el.detailMedia.appendChild(ph);
  }
  el.detailTitle.textContent = title;
  // 发布人：直接移植频道消息风格——头像+昵称+角色徽章+时间，点击打开用户资料卡
  const authorName = item.location || item.authorName || '匿名同学';
  const timePart = item.year || '—';
  if (isPost && item.authorId && !item.anonymous) {
    const author = (window.IF && window.IF.resolveAuthor)
      ? window.IF.resolveAuthor(item.authorId)
      : { id: item.authorId, nickname: authorName, username: authorName, avatar_url: '', role: 'student' };
    const nickname = author.nickname || author.username || authorName || '未知用户';
    const username = author.username || nickname;
    const avatarInner = author.avatar_url
      ? `<img src="${escapeHtml(author.avatar_url)}" alt="" onerror="this.style.display='none'">`
      : getInitial(nickname);
    const titleHtml = author.title
      ? `<span class="msg-feed-title" title="${escapeHtml(author.title)}">✦ ${escapeHtml(author.title)}</span>`
      : '';
    // 完全复刻频道消息的左列结构：头像 + 昵称/角色/称号/时间
    el.detailMeta.innerHTML = `
      <div class="msg-feed-left mt-author-click" data-author-id="${escapeHtml(item.authorId)}" title="查看资料">
        <div class="msg-feed-avatar" style="background:${getAvatarColor(username)}">${avatarInner}</div>
        <div class="msg-feed-meta">
          <span class="msg-feed-name">${escapeHtml(nickname)}</span>
          <span class="msg-feed-role">${roleBadge(author.role)}</span>
          ${titleHtml}
          <span class="msg-feed-time">${escapeHtml(timePart)}</span>
        </div>
      </div>`;
    const card = el.detailMeta.querySelector('.mt-author-click');
    if (card) card.addEventListener('click', (e) => { e.stopPropagation(); openUserProfileBridge(item.authorId); });
  } else {
    el.detailMeta.textContent = [authorName, timePart].filter(Boolean).join(' · ') || '—';
  }
  // 仅管理员在详情右上角看到删除按钮
  if (el.detailDelete) {
    const admin = isAdmin();
    el.detailDelete.hidden = !admin;
    el.detailDelete.classList.toggle('mt-hidden-force', !admin);
  }
  // 无图（文字星帖子）：隐藏左侧媒体区，内容全宽
  if (url) el.detail.classList.remove('no-image');
  else el.detail.classList.add('no-image');
  // 文字星点击：让详情卡从那颗星的屏幕落点绽放，而非从屏幕正中凭空出现
  const card = el.detail.querySelector('.mt-detail-card');
  if (origin && card) {
    el.detail.classList.add('mt-detail-anchored');
    card.style.setProperty('--ox', origin.x + 'px');
    card.style.setProperty('--oy', origin.y + 'px');
  } else {
    el.detail.classList.remove('mt-detail-anchored');
  }
  el.summary.hidden = true; el.summary.innerHTML = '';
  el.detail.hidden = false;
  // 触发淡入+绽放（与相机落位重叠，形成顺滑衔接）
  requestAnimationFrame(() => { el.detail.classList.add('mt-detail-open'); });

  // 评论
  const list = await MTComments.list(item.id).catch(() => []);
  renderComments(list);
}

// 图片放大预览：点击详情图打开全屏 lightbox，显示原图（不裁剪）
function openLightbox(src) {
  const lb = document.getElementById('mt-lightbox');
  const img = document.getElementById('mt-lightbox-img');
  if (!lb || !img || !src) return;
  img.classList.remove('loaded');
  img.onload = () => img.classList.add('loaded');
  img.src = src;
  lb.hidden = false;
}
function closeLightbox() {
  const lb = document.getElementById('mt-lightbox');
  const img = document.getElementById('mt-lightbox-img');
  if (lb) lb.hidden = true;
  if (img) img.src = '';
}

function renderComments(list) {
  el.commentsCount.textContent = list.length;
  if (!list.length) { el.comments.innerHTML = '<div class="mt-comments-empty">暂无评论，快来抢沙发~</div>'; return; }
  el.comments.innerHTML = list.map(c => `
    <div class="mt-comment">
      <div class="mt-comment-top">
        <div class="mt-comment-avatar">${(c.author_name || '匿')[0]}</div>
        <div class="mt-comment-name">${escapeHtml(c.author_name || '匿名同学')}</div>
        <div class="mt-comment-time">${fmtTime(c.created_at)}</div>
      </div>
      <div class="mt-comment-body">${escapeHtml(c.content)}</div>
    </div>`).join('');
}
function escapeHtml(s) { return String(s).replace(/[&<>"']/g, m => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m])); }
function getInitial(n) { return n ? n.charAt(0).toUpperCase() : '?'; }
const AVATAR_COLORS = [
  'linear-gradient(135deg,#6366f1,#818cf8)','linear-gradient(135deg,#8b5cf6,#c084fc)',
  'linear-gradient(135deg,#ef4444,#f87171)','linear-gradient(135deg,#14b8a6,#2dd4bf)',
];
function getAvatarColor(name) { let h=0; const s=String(name||'?'); for(let i=0;i<s.length;i++) h=s.charCodeAt(i)+((h<<5)-h); return AVATAR_COLORS[Math.abs(h)%AVATAR_COLORS.length]; }
// 完全复刻频道消息的角色标签（admin=管理员，moderator=版主，其余=成员）
function roleBadge(role) {
  const label = role === 'admin' ? '管理员' : role === 'moderator' ? '版主' : '成员';
  const cls = role === 'admin' ? 'admin' : role === 'moderator' ? 'moderator' : 'member';
  return `<span class="role-badge ${cls}">${label}</span>`;
}
// 在 iframe 内直接弹出用户资料卡（不依赖父窗口，避免移动 WebView postMessage 失效）
function openUserProfile(userId) {
  if (!userId) return;
  const api = window.IF;
  function render(user) {
    user = user || {};
    const uid = user.id || userId;
    const role = user.role || 'student';
    const ROLE = {
      admin: { label: '系统管理员', icon: '🔧' },
      teacher: { label: '教师', icon: '👩‍🏫' },
      student: { label: '在校学生', icon: '📚' },
      moderator: { label: '版主', icon: '🛡️' }
    };
    const rm = ROLE[role] || ROLE.student;
    const av = user.avatar_url
      ? `<img src="${escapeHtml(user.avatar_url)}" alt="" onerror="this.style.display='none'">`
      : getInitial(user.nickname || user.username || '?');
    const isSelf = !!(currentUser && currentUser.id === uid);
    const joinedDays = user.created_at
      ? Math.max(0, Math.floor((Date.now() - new Date(user.created_at).getTime()) / 86400000))
      : '—';
    const titleBadge = user.title
      ? `<span class="mt-user-card-title">✦ ${escapeHtml(user.title)}</span>`
      : '<span class="mt-user-card-title mt-user-card-title-empty">未设置称号</span>';
    const html =
      '<div class="mt-user-card-bg"></div>'+
      '<button class="mt-user-card-close" aria-label="关闭">&times;</button>'+
      '<div class="mt-user-card">'+
        `<div class="mt-user-card-avatar" style="background:${getAvatarColor(user.username || uid)}">${av}</div>`+
        `<h2 class="mt-user-card-name">${escapeHtml(user.nickname || user.username || '未知用户')}</h2>`+
        `<p class="mt-user-card-username">@${escapeHtml(user.username || '')}${isSelf ? '（我）' : ''}</p>`+
        `<div class="mt-user-card-title-row">${titleBadge}</div>`+
        `<p class="mt-user-card-role">${rm.icon} ${rm.label}</p>`+
        '<div class="mt-user-card-stats">'+
          `<div class="mt-user-card-stat"><span class="mt-user-card-stat-num">${rm.label.slice(0,3)}</span><span class="mt-user-card-stat-label">身份</span></div>`+
          `<div class="mt-user-card-stat"><span class="mt-user-card-stat-num" id="uc-msg">…</span><span class="mt-user-card-stat-label">消息</span></div>`+
          `<div class="mt-user-card-stat"><span class="mt-user-card-stat-num">${joinedDays}</span><span class="mt-user-card-stat-label">加入天数</span></div>`+
        '</div>'+
      '</div>';
    const overlay = document.createElement('div');
    overlay.className = 'mt-user-card-overlay';
    overlay.innerHTML = html;
    const close = () => { overlay.remove(); document.removeEventListener('keydown', onKey); };
    const onKey = (e) => { if (e.key === 'Escape') close(); };
    overlay.querySelector('.mt-user-card-bg').onclick = close;
    overlay.querySelector('.mt-user-card-close').onclick = close;
    overlay.onclick = (e) => { if (e.target === overlay) close(); };
    document.addEventListener('keydown', onKey);
    document.body.appendChild(overlay);
    // 异步补消息数
    const msgEl = overlay.querySelector('#uc-msg');
    if (msgEl && api && api.insforge) {
      api.insforge.database.from('messages')
        .select('*', { count: 'exact', head: true }).eq('author_id', uid)
        .then(r => { msgEl.textContent = (r && typeof r.count === 'number') ? r.count : '—'; })
        .catch(() => { msgEl.textContent = '—'; });
    }
  }
  const cached = (api && api.resolveAuthor) ? api.resolveAuthor(userId) : null;
  if (cached && cached.id && cached.username) {
    render(cached);
  } else if (api && api.insforge) {
    api.insforge.database.from('profiles')
      .select('id,username,nickname,avatar_url,role,title,status,created_at')
      .eq('id', userId).single()
      .then(r => render(r && !r.error ? r : null))
      .catch(() => render(null));
  } else {
    render(null);
  }
}
function openUserProfileBridge(userId) { openUserProfile(userId); }

// ---------- 用户留言（记忆树留言） ----------
let postIds = new Set();           // 当前已挂到场景的帖子 id（用于管理员删除叉识别）
function loadPosts() {
  if (!window.MTPosts || !sceneApi || !sceneApi.addPostNode) return;
  const posts = window.MTPosts.list();
  postIds = new Set(posts.map(p => p.id));
  posts.forEach(p => sceneApi.addPostNode(p));
}

// ---------- 管理员判定 ----------
function isAdmin() {
  return !!(currentUser && (currentUser.role === 'admin' || currentUser.is_project_admin));
}

// ---------- 删除当前详情帖子（仅管理员从详情弹窗右上角触发） ----------
async function deleteCurrentPost() {
  if (!currentItem) return;
  const id = currentItem.id;
  try { if (window.MTPosts && window.MTPosts.remove) window.MTPosts.remove(id); } catch (e) {}
  try { if (window.MTPosts && window.MTPosts.removeRemote) await window.MTPosts.removeRemote(id); } catch (e) {}
  // 热移除 3D 节点 + 更新本地索引与兜底相册，无需刷新页面
  if (sceneApi && sceneApi.removeNode) sceneApi.removeNode(id);
  if (postIds) postIds.delete(id);
  el.detail.classList.remove('mt-detail-open');
  el.detail.classList.remove('mt-detail-anchored');
  el.detail.hidden = true; currentItem = null;
  buildFallbackGrid();
  toast('已删除该帖子');
}
function resetPostImage() {
  if (el.postImageInput) el.postImageInput.value = '';
  if (el.postImagePreview) el.postImagePreview.src = '';
  if (el.postImageRow) el.postImageRow.hidden = true;
}
function updatePostAuthorHint() {
  if (!el.postAuthorHint) return;
  if (el.postAnon.checked) {
    el.postAuthorHint.textContent = '匿名发布';
  } else {
    const name = (currentUser && (currentUser.nickname || currentUser.email)) || '你的账号';
    el.postAuthorHint.textContent = '将以「' + name + '」身份发布';
  }
}

let isSubmitting = false;

async function submitPost() {
  if (isSubmitting) return;
  const content = el.postText.value.trim();
  if (!content) return;
  // 不能只发 emoji / 空白 / 标点，必须包含至少一个真实文字或数字
  if (!/[\p{L}\p{N}]/u.test(content)) {
    toast('请至少输入一些文字，不能只发表情 ✦');
    return;
  }

  const sendBtn = el.postSendBtn || el.postForm.querySelector('.mt-post-btn-send');
  const originalText = sendBtn ? sendBtn.textContent : '发布';
  isSubmitting = true;
  if (sendBtn) {
    sendBtn.disabled = true;
    sendBtn.innerHTML = '<span class="mt-spinner"></span> 上传中…';
  }

  try {
    const anonymous = el.postAnon.checked;
    // 匿名直接匿名；非匿名自动用当前登录用户名，不读手动昵称输入框
    let authorName = anonymous ? '匿名同学' : (currentUser && (currentUser.nickname || currentUser.email)) || '';
    // 上传图片（若有）
    let imageUrl = '';
    const file = el.postImageInput && el.postImageInput.files && el.postImageInput.files[0];
    if (file && window.IF && window.IF.uploadFile) {
      try {
        const data = await window.IF.uploadFile(file);
        imageUrl = data && data.url ? data.url : '';
      } catch (e) {
        toast('图片上传失败，请重试或移除图片后发布');
        return;
      }
    }
    const res = window.MTPosts.submit({ content, authorName, anonymous, imageUrl, authorId: (currentUser && currentUser.id) || null });
    if (!res || !res.ok) { toast('发布失败，请重试'); return; }

    toast('留言已挂上记忆树 ✦');
    el.postText.value = '';
    resetPostImage();
    el.postModal.hidden = true;

    if (sceneApi && sceneApi.addPostNode) sceneApi.addPostNode(res.post);
    postIds.add(res.post.id);
    buildFallbackGrid();

    // 自动生成一条 AI 评语（仅发帖时触发一次，杜绝刷屏）
    const aiItem = { title: res.post.content.slice(0, 40), location: res.post.authorName || '记忆树', year: '' };
    MTAI.generateComment(aiItem, res.post.content).then(async ai => {
      if (!ai || !ai.comment) return;
      await MTComments.submit({ itemId: res.post.id, content: ai.comment, authorName: 'AI 记忆档案员', authorId: null }).catch(() => null);
    }).catch(() => {});

    // 打开刚发布的留言详情
    const postItem = { ...res.post, title: res.post.content.length > 18 ? res.post.content.slice(0, 18) + '…' : res.post.content, location: res.post.authorName || '匿名同学', year: fmtTime(res.post.created_at), url: res.post.imageUrl || '', emoji: '✦', isPost: true };
    openDetail(postItem);
  } finally {
    isSubmitting = false;
    if (sendBtn) {
      sendBtn.disabled = false;
      sendBtn.textContent = originalText;
    }
  }
}

// ---------- 音乐播放器初始化 ----------
function initMusicPlayer() {
  if (memoryMusic) return;
  memoryMusic = new MemoryMusic(sceneApi);
  updateMusicUI();
  memoryMusic.on('play', updateMusicUI);
  memoryMusic.on('pause', updateMusicUI);
  memoryMusic.on('load', updateMusicUI);
  memoryMusic.on('error', () => {
    updateMusicUI();
  });
}

// ---------- UI 绑定 ----------
function bindUI() {
  // 返回频道：记忆树现在由主频道以 iframe 覆盖层方式打开，主频道 SPA 从未卸载。
  // 在 iframe 内直接通知父页面关闭覆盖层，主频道的登录态/聊天状态原样保留，绝不会重载登录页。
  el.back.addEventListener('click', () => {
    if (window.self !== window.top) {
      try { window.parent.postMessage({ type: 'mt-close' }, '*'); } catch (e) {}
      return;
    }
    // 兜底：直接打开记忆树（无父页面，如书签/新标签）时，带版本号跳回主频道
    let v = '1.4.57';
    try {
      v = localStorage.getItem('mt_v') || v;
      if (!v) {
        const m = document.querySelector('script') && document.querySelector('script').textContent.match(/var\s+v\s*=\s*['"]([^'"]+)['"]/);
        if (m) v = m[1];
      }
    } catch (e) {}
    location.href = 'index.html?v=' + v;
  });

  // 音乐卡片：圆形唱片点击播放 / 暂停（单曲目，无上一首 / 下一首）
  if (el.musicDisc) {
    el.musicDisc.addEventListener('click', () => {
      if (!memoryMusic) initMusicPlayer();
      memoryMusic.toggle();
    });
  }

  // 首次交互解锁音频上下文（满足浏览器自动播放策略）
  document.addEventListener('pointerdown', () => {
    if (sceneApi) sceneApi.initAudio();
    if (memoryMusic && memoryMusic.audio) {
      const a = memoryMusic.audio;
      if (a.paused && memoryMusic.playing) a.play().catch(() => {});
    }
  }, { once: true });

  // 详情弹窗：管理员右上角 ✕ 用于删除帖子；普通用户通过点空白处 / ESC 关闭
  if (el.detailDelete) {
    el.detailDelete.addEventListener('click', () => {
      if (!currentItem) return;
      if (!window.confirm('确定删除这条记忆树帖子？此操作不可撤销。')) return;
      deleteCurrentPost();
    });
  }
  el.detail.addEventListener('click', (e) => { if (e.target === el.detail) { el.detail.classList.remove('mt-detail-open'); el.detail.classList.remove('mt-detail-anchored'); el.detail.hidden = true; } });
  // ESC 关闭：lightbox 优先（避免关放大图时把详情也一起关掉）
  const lightbox = document.getElementById('mt-lightbox');
  const lightboxClose = document.getElementById('mt-lightbox-close');
  if (lightboxClose) lightboxClose.addEventListener('click', (e) => { e.stopPropagation(); closeLightbox(); });
  if (lightbox) lightbox.addEventListener('click', (e) => { if (e.target === lightbox) closeLightbox(); });
  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape') return;
    if (lightbox && !lightbox.hidden) { closeLightbox(); return; }
    if (!el.detail.hidden) { el.detail.classList.remove('mt-detail-open'); el.detail.classList.remove('mt-detail-anchored'); el.detail.hidden = true; }
  });

  el.form.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!currentItem) return;
    const content = el.text.value.trim();
    if (!content) return;
    const name = (currentUser && (currentUser.nickname || currentUser.email)) || '';
    const res = await MTComments.submit({
      itemId: currentItem.id, content, authorName: name,
      authorId: currentUser && currentUser.id
    }).catch(err => ({ ok: false, message: '提交失败' }));
    if (res && res.ok) {
      toast('评论已发布 ✦');
      el.text.value = '';
      const updated = await MTComments.list(currentItem.id).catch(() => []);
      renderComments(updated);
    } else {
      toast((res && res.message) || '提交失败，请重试');
    }
  });

  // 在记忆树留言弹窗
  if (el.postTrigger) {
    el.postTrigger.addEventListener('click', () => {
      el.postAnon.checked = true;
      updatePostAuthorHint();
      resetPostImage();
      el.postModal.hidden = false;
      setTimeout(() => el.postText.focus(), 50);
    });
  }
  if (el.postClose) el.postClose.addEventListener('click', () => { el.postModal.hidden = true; });
  if (el.postCancel) el.postCancel.addEventListener('click', () => { el.postModal.hidden = true; });
  if (el.postModal) {
    el.postModal.addEventListener('click', (e) => { if (e.target === el.postModal) el.postModal.hidden = true; });
  }
  if (el.postAnon) {
    el.postAnon.addEventListener('change', updatePostAuthorHint);
  }
  // 发帖图片：选择 / 预览 / 移除
  if (el.postImageBtn) {
    el.postImageBtn.addEventListener('click', () => { if (el.postImageInput) el.postImageInput.click(); });
  }
  if (el.postImageInput) {
    el.postImageInput.addEventListener('change', () => {
      const f = el.postImageInput.files && el.postImageInput.files[0];
      if (!f) return;
      if (!/^image\//.test(f.type)) { toast('请选择图片文件'); el.postImageInput.value = ''; return; }
      if (f.size > 8 * 1024 * 1024) { toast('图片不能超过 8MB'); el.postImageInput.value = ''; return; }
      const reader = new FileReader();
      reader.onload = (ev) => {
        if (el.postImagePreview) el.postImagePreview.src = ev.target.result;
        if (el.postImageRow) el.postImageRow.hidden = false;
      };
      reader.readAsDataURL(f);
    });
  }
  if (el.postImageRemove) {
    el.postImageRemove.addEventListener('click', resetPostImage);
  }
  if (el.postForm) {
    el.postForm.addEventListener('submit', (e) => { e.preventDefault(); submitPost(); });
  }
}

// ---------- 兜底相册 ----------
function buildFallbackGrid() {
  const posts = (window.MTPosts && window.MTPosts.list()) || [];
  const allItems = [
    ...posts.map(p => ({ ...p, title: p.content.length > 18 ? p.content.slice(0, 18) + '…' : p.content, location: p.authorName || '匿名同学', year: fmtTime(p.created_at), url: p.imageUrl || '', emoji: '✦', isPost: true, _kind: 'post' }))
  ];
  el.fallbackGrid.innerHTML = allItems.map(it => {
    const url = mediaURL(it);
    const media = url
      ? `<img src="${url}" alt="${escapeHtml(it.title || '')}" loading="lazy" />`
      : `<div class="mt-fallback-placeholder"><span>${it.emoji || '✦'}</span></div>`;
    return `<div class="mt-fallback-item" data-id="${it.id}" data-kind="${it._kind}">
      ${media}
      <div class="mt-fallback-item-title">${escapeHtml(it.title || '')}</div>
    </div>`;
  }).join('');
  el.fallbackGrid.querySelectorAll('.mt-fallback-item').forEach(node => {
    node.addEventListener('click', () => {
      const id = node.getAttribute('data-id');
      const kind = node.getAttribute('data-kind');
      const it = kind === 'post'
        ? posts.find(p => p.id === id)
        : DATA.find(d => d.id === id);
      if (it) openDetail(it);
    });
  });
}
function showFallback() {
  cancelAnimationFrame(progressTimer);
  cancelAnimationFrame(lraf);
  el.loader.style.display = 'none';
  el.hud.classList.add('show');
  el.canvas.style.display = 'none';
  buildFallbackGrid();
  el.fallback.hidden = false;
  toast('当前设备不支持 3D，已切换到相册模式');
}

// 启动
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
else init();
