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
  { title: '尘风', artist: '王子阳', url: '/audio/memory-tree/track-1.mp3' },
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
  detailMeta: $('#mt-detail-meta'), summary: $('#mt-summary'), comments: $('#mt-comments'),
  commentsCount: $('#mt-comments-count'), pending: $('#mt-pending'),
  form: $('#mt-comment-form'), name: $('#mt-comment-name'), text: $('#mt-comment-text'),
  aiBtn: $('#mt-ai-summary'), back: $('#mt-back'),
  musicCard: $('#mt-music-card'), musicVisual: $('#mt-music-visual'),
  musicName: $('#mt-music-name'), musicArtist: $('#mt-music-artist'),
  musicToggle: $('#mt-music-toggle'), musicPrev: $('#mt-music-prev'), musicNext: $('#mt-music-next'),
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
      ? track.artist
      : track.artist + ' · 放置 MP3 可切真实音乐';
  }
  if (el.musicCard) el.musicCard.classList.toggle('no-audio', !memoryMusic.isAvailable());
  if (el.musicVisual) el.musicVisual.classList.toggle('playing', on);
  if (el.musicToggle) {
    el.musicToggle.classList.toggle('playing', on);
    const playIcon = el.musicToggle.querySelector('.mt-play-icon');
    const pauseIcon = el.musicToggle.querySelector('.mt-pause-icon');
    if (playIcon) playIcon.hidden = on;
    if (pauseIcon) pauseIcon.hidden = !on;
  }
}
function fmtTime(ts) {
  const d = new Date(ts);
  const p = (n) => (n < 10 ? '0' : '') + n;
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}
function genCardURL(item) {
  const cv = document.createElement('canvas'); cv.width = cv.height = 512;
  const ctx = cv.getContext('2d');
  const [c1, c2] = item.color || ['#6a8cff', '#c08bff'];
  const bg = ctx.createLinearGradient(0, 0, 512, 512); bg.addColorStop(0, c1); bg.addColorStop(1, c2);
  ctx.fillStyle = bg; ctx.fillRect(0, 0, 512, 512);
  const vg = ctx.createRadialGradient(256, 256, 100, 256, 256, 360);
  vg.addColorStop(0, 'rgba(0,0,0,0)'); vg.addColorStop(1, 'rgba(0,0,0,0.45)');
  ctx.fillStyle = vg; ctx.fillRect(0, 0, 512, 512);
  ctx.font = '180px serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText(item.emoji || '✦', 256, 226);
  ctx.font = 'bold 40px "Noto Sans SC", sans-serif'; ctx.fillStyle = 'rgba(255,255,255,0.95)';
  ctx.fillText(item.title || '', 256, 442);
  return cv.toDataURL('image/png');
}
function mediaURL(item) { return item.gen ? genCardURL(item) : item.url; }

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
    const runScene = function () {
      try {
        sceneApi = window.MTScene.create({
          canvas: el.canvas, config: CFG, data: DATA, reducedMotion: reduced,
          onNodeClick: openDetail,
          onReady: finishLoad
        });
      } catch (e) { console.error(e); showFallback(); return; }
      if (!sceneApi || sceneApi.fallback) { showFallback(); return; }

      bindUI();
      initMusicPlayer();
      buildFallbackGrid();
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
  const start = () => {
    try { currentUser = (window.IF && window.IF.getCurrentUser && window.IF.getCurrentUser()) || null; } catch (e) {}
  };
  if (window.IF) start();
  else window.addEventListener('IF_READY', start, { once: true });
}

// ---------- 详情 / 评论 ----------
async function openDetail(item) {
  currentItem = item;
  el.detailMedia.innerHTML = '';
  const img = document.createElement('img');
  img.src = mediaURL(item); img.alt = item.title || '';
  el.detailMedia.appendChild(img);
  el.detailTitle.textContent = item.title || '记忆';
  el.detailMeta.textContent = `${item.location || ''} · ${item.year || ''}`;
  el.summary.hidden = true; el.summary.innerHTML = '';
  el.detail.hidden = false;

  // 评论
  const list = await MTComments.list(item.id).catch(() => []);
  renderComments(list);
  const pending = await MTComments.pending().catch(() => []);
  renderPending(pending);
}

function renderComments(list) {
  el.commentsCount.textContent = list.length;
  if (!list.length) { el.comments.innerHTML = '<div class="mt-comments-empty">还没有留言，来做第一个点亮这段记忆的人</div>'; return; }
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
function renderPending(list) {
  if (!list.length) { el.pending.innerHTML = '<div class="mt-comments-empty">暂无待审</div>'; return; }
  el.pending.innerHTML = list.map(c => `
    <div class="mt-pending-item" data-id="${c.id}">
      <div class="mt-pending-body">${escapeHtml(c.content)}</div>
      <div class="mt-comment-time" style="margin-bottom:6px">${(c.authorName || '匿')} · ${fmtTime(c.created_at)}</div>
      <div class="mt-pending-actions">
        <button class="mt-btn mt-btn-approve" data-act="approve" data-id="${c.id}">通过</button>
        <button class="mt-btn mt-btn-reject" data-act="reject" data-id="${c.id}">拒绝</button>
      </div>
    </div>`).join('');
}
function escapeHtml(s) { return String(s).replace(/[&<>"']/g, m => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m])); }

// ---------- 音乐播放器初始化 ----------
function initMusicPlayer() {
  if (memoryMusic) return;
  memoryMusic = new MemoryMusic(sceneApi);
  updateMusicUI();
  memoryMusic.on('play', updateMusicUI);
  memoryMusic.on('pause', updateMusicUI);
  memoryMusic.on('next', updateMusicUI);
  memoryMusic.on('prev', updateMusicUI);
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
    let v = '1.4.20';
    try {
      v = localStorage.getItem('mt_v') || v;
      if (!v) {
        const m = document.querySelector('script') && document.querySelector('script').textContent.match(/var\s+v\s*=\s*['"]([^'"]+)['"]/);
        if (m) v = m[1];
      }
    } catch (e) {}
    location.href = 'index.html?v=' + v;
  });

  // 音乐卡片：播放/暂停、上一首、下一首
  if (el.musicVisual) {
    el.musicVisual.addEventListener('click', () => {
      if (!memoryMusic) initMusicPlayer();
      memoryMusic.toggle();
    });
  }
  if (el.musicToggle) {
    el.musicToggle.addEventListener('click', () => {
      if (!memoryMusic) initMusicPlayer();
      memoryMusic.toggle();
    });
  }
  if (el.musicPrev) {
    el.musicPrev.addEventListener('click', () => {
      if (!memoryMusic) initMusicPlayer();
      memoryMusic.prev();
    });
  }
  if (el.musicNext) {
    el.musicNext.addEventListener('click', () => {
      if (!memoryMusic) initMusicPlayer();
      memoryMusic.next();
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

  $('#mt-detail-close').addEventListener('click', () => { el.detail.hidden = true; });
  el.detail.addEventListener('click', (e) => { if (e.target === el.detail) el.detail.hidden = true; });

  el.form.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!currentItem) return;
    const content = el.text.value.trim();
    if (!content) return;
    const name = el.name.value.trim() || (currentUser && (currentUser.nickname || currentUser.email)) || '';
    const res = await MTComments.submit({
      itemId: currentItem.id, content, authorName: name,
      authorId: currentUser && currentUser.id
    }).catch(err => ({ ok: false, message: '提交失败' }));
    if (res && res.ok) {
      toast('已提交，等待审核通过后展示 ✦');
      el.text.value = '';
      const pending = await MTComments.pending().catch(() => []);
      renderPending(pending);
    } else {
      toast((res && res.message) || '提交失败，请重试');
    }
  });

  el.aiBtn.addEventListener('click', async () => {
    if (!currentItem) return;
    el.aiBtn.disabled = true; el.aiBtn.textContent = '✨ 生成中…';
    const r = await MTAI.summarize(currentItem).catch(() => null);
    el.aiBtn.disabled = false; el.aiBtn.textContent = '✨ AI 生成记忆摘要';
    if (r && r.summary) {
      const tags = (r.tags || []).map(t => `<span class="mt-tag">${escapeHtml(t)}</span>`).join('');
      el.summary.innerHTML = `<div>${escapeHtml(r.summary)}</div><div class="mt-tags">${tags}</div>` + (r.local ? '<div style="margin-top:8px;font-size:11px;color:rgba(180,195,230,.45)">（本地生成，部署后接真实 AI）</div>' : '');
      el.summary.hidden = false;
    } else {
      toast('摘要生成失败');
    }
  });

  el.pending.addEventListener('click', async (e) => {
    const btn = e.target.closest('button[data-act]');
    if (!btn) return;
    const id = btn.getAttribute('data-id');
    const act = btn.getAttribute('data-act');
    if (act === 'approve') { await MTComments.approve(id); toast('已通过，将展示在星海'); }
    else { await MTComments.reject(id); toast('已拒绝'); }
    const list = currentItem ? await MTComments.list(currentItem.id).catch(() => []) : [];
    renderComments(list);
    renderPending(await MTComments.pending().catch(() => []));
  });
}

// ---------- 兜底相册 ----------
function buildFallbackGrid() {
  el.fallbackGrid.innerHTML = DATA.map(it => `
    <div class="mt-fallback-item" data-id="${it.id}">
      <img src="${mediaURL(it)}" alt="${escapeHtml(it.title || '')}" loading="lazy" />
      <div class="mt-fallback-item-title">${escapeHtml(it.title || '')}</div>
    </div>`).join('');
  el.fallbackGrid.querySelectorAll('.mt-fallback-item').forEach(node => {
    node.addEventListener('click', () => {
      const it = DATA.find(d => d.id === node.getAttribute('data-id'));
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
