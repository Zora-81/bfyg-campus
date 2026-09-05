/* ===== 读信页模块（ESM）=====
   从 letter-reader-demo.html 抽离，接入真实记忆树：
   - 数据源：MTPosts.list()（photoPosts = 有 imageUrl 的帖子）/ MTComments
   - 触发：memory-tree.js openDetail 分支 item.url → LetterReader.open(item)
   - 上一封/下一封：在 photoPosts 里移动，就地切换不退出
   - 返回：关闭读信页，露出下方 3D 场景（不做相机动画，覆盖式淡入淡出）
   - 音乐：复用记忆树顶部 mt-music-card，本模块不建播放器
   挂载：window.LetterReader
*/
import * as THREE from './vendor/three.module.js';
import { OrbitControls } from './vendor/OrbitControls.js';

const CONFIG = {
    sampleStep: 2, maxDim: 640,
    particleBase: 3.2, particleScale: 2.2,
    depthStrength: 14,
    driftAmp: 1.4,
    ampPhoto: 0.12, ampDrift: 1.0,
    gatherSpeed: 1.5, ampLerp: 3,
  };

  /* ---------- 模块状态 ---------- */
  let renderer = null, scene = null, camera = null, controls = null, system = null;
  let targetAmp = CONFIG.ampDrift;
  let curItem = null;          // 当前展示的帖子 item
  let curIdx = -1;             // 在 photoPosts 里的位置
  let photoPosts = [];         // 有照片的帖子列表（新→旧）
  let previewMode = false;
  let curMode = 'drift';
  let loading = false;
  let letterToken = 0;         // 打字机中断令牌
  let t = 0, lastFrame = 0, rafId = 0;
  let deleteHandler = null;    // 管理员删除回调（memory-tree.js 注入）
  let deleteVisible = false;   // 管理员才显示删除按钮

  const $ = (s) => document.querySelector(s);
  const el = (id) => document.getElementById(id);
  const esc = (s) => String(s).replace(/[&<>"']/g, m => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m]));

  /* ---------- 图片 → 画布（缩放到 maxDim 内，供粒子采样） ---------- */
  // 同域图片代理：生产域(bfgzlt.cc.cd)下把 api.bfgzlt.cc.cd 的反代图改写成
  // /img?u=... 同域加载，彻底绕开 canvas 读像素的 CORS 限制；同域/本地开发直连。
  function proxiedImgUrl(url) {
    if (!url) return url;
    try {
      const u = new URL(url);
      const host = location.hostname;
      if (u.hostname === host) return url;
      if (host === 'bfgzlt.cc.cd' && u.hostname === 'api.bfgzlt.cc.cd') return '/img?u=' + encodeURIComponent(url);
      return url;
    } catch (e) { return url; }
  }

  function loadPhotoCanvas(url) {
    return new Promise((resolve, reject) => {
      if (!url) { reject(new Error('url 为空')); return; }
      let attempt = 0;
      const next = (prevErr) => {
        attempt++;
        if (attempt === 1) tryLoad(proxiedImgUrl(url), 'proxy');
        else if (attempt === 2) tryLoad(url, 'direct');
        else reject(prevErr || new Error('未知加载错误'));
      };
      const tryLoad = (src, label) => {
        const img = new Image();
        img.crossOrigin = 'anonymous';
        img.onload = () => {
          try {
            let w = img.naturalWidth || img.width, h = img.naturalHeight || img.height;
            if (!w || !h) throw new Error('图片尺寸为0');
            const s = Math.min(1, CONFIG.maxDim / Math.max(w, h));
            w = Math.round(w * s); h = Math.round(h * s);
            const cv = document.createElement('canvas');
            cv.width = w; cv.height = h;
            const ctx = cv.getContext('2d');
            ctx.drawImage(img, 0, 0, w, h);
            // 验证可读（CORS 干净才不抛错）
            ctx.getImageData(0, 0, Math.min(w, 4), Math.min(h, 4));
            resolve(cv);
          } catch (e) { next(new Error('[' + label + '] ' + (e.message || e))); }
        };
        img.onerror = () => next(new Error('[' + label + '] 图片加载失败(可能404/跨域被拦)'));
        img.src = src;
      };
      next(null);
    });
  }

  /* ---------- 深度图（多线索加权，粒子 Z 轴纵深） ---------- */
  function buildDepthMap(ctx, iw, ih) {
    const imgData = ctx.getImageData(0, 0, iw, ih).data;
    const blurred = new Float32Array(iw * ih * 3);
    const lums = new Float32Array(iw * ih);
    for (let y = 0; y < ih; y++) {
      for (let x = 0; x < iw; x++) {
        let r = 0, g = 0, b = 0, count = 0;
        for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
          const xx = Math.min(iw - 1, Math.max(0, x + dx)), yy = Math.min(ih - 1, Math.max(0, y + dy));
          const i = (yy * iw + xx) * 4; r += imgData[i]; g += imgData[i + 1]; b += imgData[i + 2]; count++;
        }
        r /= count * 255; g /= count * 255; b /= count * 255;
        const base = (y * iw + x) * 3;
        blurred[base] = r; blurred[base + 1] = g; blurred[base + 2] = b;
        lums[y * iw + x] = 0.299 * r + 0.587 * g + 0.114 * b;
      }
    }
    const depth = new Float32Array(iw * ih);
    for (let y = 0; y < ih; y++) for (let x = 0; x < iw; x++) {
      const i = y * iw + x, base = i * 3;
      const r = blurred[base], g = blurred[base + 1], b = blurred[base + 2];
      const lum = 0.299 * r + 0.587 * g + 0.114 * b;
      const sat = Math.max(r, g, b) - Math.min(r, g, b);
      const vGrad = y / ih;                 // 下近上远
      const cent = 1 - Math.max(Math.abs(x / iw - .5), Math.abs(y / ih - .5)) * 1.6;
      const cDist = Math.min(1, Math.abs(x / iw - .5) * 2 + Math.abs(y / ih - .5) * 2) * 0.5;
      depth[i] = lum * 0.35 + sat * 0.30 + vGrad * 0.25 + cent * 0.10 - cDist * 0.18;
      depth[i] = Math.min(1, Math.max(0, depth[i]));
    }
    return depth;
  }

  /* ---------- 粒子系统（GPU 引擎，原版：无4角消散） ---------- */
  function initScene() {
    if (renderer) return;
    const cvs = el('mt-reader-canvas');
    renderer = new THREE.WebGLRenderer({ canvas: cvs, antialias: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
    renderer.setClearColor(0x05060a, 1);
    renderer.setSize(window.innerWidth, window.innerHeight);
    scene = new THREE.Scene();
    camera = new THREE.PerspectiveCamera(55, window.innerWidth / window.innerHeight, 0.1, 2000);
    camera.position.set(0, 0, 110);
    controls = new OrbitControls(camera, cvs);
    controls.enableDamping = true; controls.dampingFactor = 0.06;
    controls.enablePan = false; controls.minDistance = 30; controls.maxDistance = 250;
    controls.autoRotate = false;
    controls.enableZoom = true;
    controls.target.set(0, 7, 0);   // 视线略上移 → 照片显示在屏幕中心偏下，视觉居中
    window.addEventListener('resize', () => {
      if (!camera) return;
      camera.aspect = window.innerWidth / window.innerHeight; camera.updateProjectionMatrix();
      renderer.setSize(window.innerWidth, window.innerHeight);
    });
  }

  function buildSystem(canvas) {
    if (system) { disposeSystem(); }
    const iw = canvas.width, ih = canvas.height;
    const ctx = canvas.getContext('2d');
    const depth = buildDepthMap(ctx, iw, ih);
    const imgData = ctx.getImageData(0, 0, iw, ih).data;

    const imgScale = 0.13;
    const halfW = iw * imgScale / 2, halfH = ih * imgScale / 2;
    const particles = [];
    const maxCount = 60000;

    for (let y = 0; y < ih; y += CONFIG.sampleStep) {
      for (let x = 0; x < iw; x += CONFIG.sampleStep) {
        if (particles.length >= maxCount) break;
        const i = (y * iw + x) * 4;
        const a = imgData[i + 3] / 255;
        if (a < 0.08) continue;
        const r = imgData[i] / 255, g = imgData[i + 1] / 255, b = imgData[i + 2] / 255;
        const lum = 0.299 * r + 0.587 * g + 0.114 * b;
        if (lum < 0.06) continue;
        const tx = (x - iw / 2) * imgScale;
        const ty = -(y - ih / 2) * imgScale;
        const tz = (depth[y * iw + x] - 0.5) * CONFIG.depthStrength;
        const ang = Math.random() * Math.PI * 2, rad = 26 + Math.random() * 40;
        const sx = tx + Math.cos(ang) * rad;
        const sy = ty + Math.sin(ang) * rad * 0.8;
        const sz = tz + (Math.random() - 0.5) * 30;
        const size = CONFIG.particleBase + lum * CONFIG.particleScale;
        const phase = Math.random() * Math.PI * 2;
        const speed = 0.4 + Math.random() * 0.6;
        const far = Math.random() < 0.08 ? 2.2 + Math.random() * 1.5 : 1;
        particles.push({ tx, ty, tz, sx, sy, sz, r, g, b, size, phase, speed, far });
      }
    }

    const count = particles.length;
    const positions = new Float32Array(count * 3);
    const scatters = new Float32Array(count * 3);
    const colors = new Float32Array(count * 3);
    const sizes = new Float32Array(count);
    const phases = new Float32Array(count);
    const speeds = new Float32Array(count);
    const fars = new Float32Array(count);
    for (let i = 0; i < count; i++) {
      const p = particles[i];
      positions[i * 3] = p.tx; positions[i * 3 + 1] = p.ty; positions[i * 3 + 2] = p.tz;
      scatters[i * 3] = p.sx; scatters[i * 3 + 1] = p.sy; scatters[i * 3 + 2] = p.sz;
      colors[i * 3] = p.r; colors[i * 3 + 1] = p.g; colors[i * 3 + 2] = p.b;
      sizes[i] = p.size; phases[i] = p.phase; speeds[i] = p.speed; fars[i] = p.far;
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute('aScatter', new THREE.BufferAttribute(scatters, 3));
    geometry.setAttribute('aColor', new THREE.BufferAttribute(colors, 3));
    geometry.setAttribute('aSize', new THREE.BufferAttribute(sizes, 1));
    geometry.setAttribute('aPhase', new THREE.BufferAttribute(phases, 1));
    geometry.setAttribute('aSpeed', new THREE.BufferAttribute(speeds, 1));
    geometry.setAttribute('aFar', new THREE.BufferAttribute(fars, 1));

    const material = new THREE.ShaderMaterial({
      uniforms: {
        uTime: { value: 0 },
        uPR: { value: renderer.getPixelRatio() },
        uGather: { value: 0 },
        uAmpScale: { value: CONFIG.ampDrift },
        uDriftAmp: { value: CONFIG.driftAmp },
        uMusic: { value: 0 },
      },
      vertexShader: `
        attribute vec3 aScatter;
        attribute vec3 aColor;
        attribute float aSize;
        attribute float aPhase;
        attribute float aSpeed;
        attribute float aFar;

        uniform float uTime;
        uniform float uPR;
        uniform float uGather;
        uniform float uAmpScale;
        uniform float uDriftAmp;
        uniform float uMusic;

        varying vec3 vColor;

        void main() {
          vColor = aColor;

          // 1. 聚合：scatter → origin（缓出）
          float g = uGather;
          float easeG = 1.0 - (1.0 - g) * (1.0 - g);
          vec3 base = mix(aScatter, position, easeG);

          // 2. 飘散：多频正弦 + 波浪脉冲 + 音乐联动
          float pulse = 0.62 + 0.38 * sin(uTime * 0.5);
          float w = uTime * aSpeed + aPhase;
          float music = uMusic;
          float amp = uDriftAmp * (1.0 + music * 2.6) * pulse * uAmpScale;
          vec3 drift;
          drift.x = (sin(w*0.8) * 0.5 + sin(w*1.7 + aPhase*2.0) * 0.3) * amp * aFar;
          drift.y = (cos(w*0.6 + aPhase) * 0.45 + sin(w*1.3) * 0.25) * amp * aFar;
          drift.z = (sin(w*0.9 + aPhase) * 0.25 + sin(w*2.1 + aPhase*1.5) * 0.15) * amp * 0.6 * aFar;

          vec3 final = base + drift;

          // 3. 投影 + 分层呼吸
          vec4 mv = modelViewMatrix * vec4(final, 1.0);
          float layer = 0.85 + position.z * 0.015;
          float sz = aSize * (380.0 / -mv.z) * uPR * layer;
          gl_PointSize = clamp(sz, 0.8, 16.0);
          gl_PointSize *= 0.96 + 0.04 * sin(uTime*1.5 + final.x*0.05);

          gl_Position = projectionMatrix * mv;
        }
      `,
      fragmentShader: `
        varying vec3 vColor;

        void main() {
          vec2 c = gl_PointCoord - 0.5;
          float d = length(c);
          if (d > 0.5) discard;
          float core = 1.0 - smoothstep(0.0, 0.35, d);
          float halo = 1.0 - smoothstep(0.0, 0.5, d);
          float alpha = halo * 0.55 + core * 0.45;
          gl_FragColor = vec4(vColor, alpha);
        }
      `,
      transparent: true,
      blending: THREE.NormalBlending,
      depthWrite: false,
    });

    const points = new THREE.Points(geometry, material);
    scene.add(points);
    system = { points, count, _timers: [] };
  }

  function disposeSystem() {
    if (!system) return;
    clearTimers();
    try { scene.remove(system.points); } catch (e) {}
    try { system.points.geometry.dispose(); } catch (e) {}
    try { system.points.material.dispose(); } catch (e) {}
    system = null;
  }

  function clearTimers() {
    if (system && system._timers) { system._timers.forEach(t => clearTimeout(t)); system._timers = []; }
  }
  function later(fn, ms) { const id = setTimeout(fn, ms); if (system) system._timers.push(id); return id; }

  /* ---------- 打字机（中断令牌：切信后旧打字立即停） ---------- */
  function typeText(container, paragraphs, token, speed = 40) {
    container.innerHTML = '';
    const cursor = document.createElement('span');
    cursor.className = 'mt-r-type-cursor';
    let pi = 0, ci = 0;
    let p = document.createElement('p');
    container.appendChild(p); p.appendChild(cursor);
    const PUNCT = '，。！？；：、…—';
    function tick() {
      if (token !== letterToken) return;                  // 已切信 → 停止
      if (pi >= paragraphs.length) { cursor.remove(); return; }
      const text = paragraphs[pi];
      if (ci < text.length) {
        const ch = text[ci];
        p.insertBefore(document.createTextNode(ch), cursor);
        ci++;
        setTimeout(tick, PUNCT.includes(ch) ? speed + 90 : speed);
      } else {
        p.removeChild(cursor); pi++; ci = 0;
        if (pi < paragraphs.length) {
          p = document.createElement('p');
          container.appendChild(p); p.appendChild(cursor);
          setTimeout(tick, 320);
        } else { cursor.remove(); }
      }
    }
    tick();
  }
  function typeTitle(el2, text, token, speed = 55) {
    el2.textContent = '';
    const cursor = document.createElement('span');
    cursor.className = 'mt-r-type-cursor';
    el2.appendChild(cursor);
    let i = 0;
    function tick() {
      if (token !== letterToken) return;
      if (i < text.length) { el2.insertBefore(document.createTextNode(text[i]), cursor); i++; setTimeout(tick, speed); }
      else cursor.remove();
    }
    tick();
  }

  /* ---------- 评论 ---------- */
  async function renderComments() {
    const listEl = el('mt-r-comment-list');
    if (!curItem) return;
    listEl.innerHTML = '';
    const list = await window.MTComments.list(curItem.id).catch(() => []);
    if (!list || !list.length) {
      listEl.innerHTML = '<div class="mt-r-comment-item"><span class="mt-r-c-avatar" style="background:#3a3f5c">✦</span><span class="mt-r-c-body"><span class="mt-r-c-name">记忆树</span>还没有留言，来抢沙发~</div>';
      return;
    }
    const colors = ['#7c8cf5', '#5ab5a8', '#e08a5a', '#b58ce0', '#6f83e8'];
    let hi = 0;
    list.forEach(c => {
      const name = c.author_name || '匿名同学';
      const item = document.createElement('div');
      item.className = 'mt-r-comment-item';
      const col = colors[Math.abs(hashStr(name)) % colors.length];
      item.innerHTML = `<span class="mt-r-c-avatar" style="background:${col}">${esc(name[0])}</span><span class="mt-r-c-body"><span class="mt-r-c-name">${esc(name)}</span>${esc(c.content)}</span>`;
      listEl.appendChild(item);
    });
    function hashStr(s) { let h = 0; for (let i = 0; i < s.length; i++) h = s.charCodeAt(i) + ((h << 5) - h); return h; }
  }

  async function sendComment() {
    const input = el('mt-r-comment-input');
    const txt = input.value.trim();
    if (!txt || !curItem) return;
    const name = (window.currentUser && (window.currentUser.nickname || window.currentUser.email)) || '';
    const res = await window.MTComments.submit({
      itemId: curItem.id, content: txt, authorName: name,
      authorId: window.currentUser && window.currentUser.id
    }).catch(err => ({ ok: false }));
    if (res && res.ok) {
      input.value = '';
      await renderComments();
    }
  }

  /* ---------- 打开一封（open 首封 / prev / next 切换共用） ---------- */
  async function openItem(item, fade) {
    if (loading) return;
    loading = true;
    letterToken++;
    const token = letterToken;
    // 归一化图片字段：回退网格/原始 post 只有 imageUrl 没有 url
    if (!item.url && item.imageUrl) item = Object.assign({}, item, { url: item.imageUrl });
    curItem = item;
    // 先填文字内容（标题/正文/作者/时间）—— 与照片加载解耦，即使照片失败也能看到文字
    el('mt-r-title').textContent = '';
    el('mt-r-body').innerHTML = '';
    el('mt-r-meta').innerHTML = `<span>${esc(item.authorName || '匿名同学')}</span><span class="mt-r-dot">·</span><span>${esc(item.year || '—')}</span>`;
    el('mt-r-polaroid-user').textContent = item.authorName || '匿名同学';
    el('mt-r-comment-flow').hidden = true;
    el('mt-r-comment').classList.remove('active');
    el('mt-r-comment-list').innerHTML = '';
    el('mt-r-comment-input').value = '';
    const pol = el('mt-r-polaroid'); pol.classList.remove('open');
    el('mt-r-env-btn').classList.remove('active');

    const fadeEl = el('mt-r-fade');
    if (fade) {
      fadeEl.classList.add('show');
      await new Promise(r => setTimeout(r, 260));
    }
    const loadingEl = el('mt-r-loading');
    loadingEl.classList.add('show');

    try {
      const cv = await loadPhotoCanvas(item.url);
      if (token !== letterToken) return;               // 已切信 → 丢弃
      buildSystem(cv);
      el('mt-r-polaroid-img').src = item.url; // 拍立得直接显示原始地址，避免 /img 代理 403 导致破图
      // 聚合动画
      targetAmp = CONFIG.ampPhoto;
      let g = 0;
      const gatherInt = setInterval(() => {
        if (!system) { clearInterval(gatherInt); return; }
        g = Math.min(1, g + 1 / 30);
        system.points.material.uniforms.uGather.value = g;
        if (g >= 1) clearInterval(gatherInt);
      }, 33);
      if (!previewMode) {
        later(() => { if (curItem && curItem.id === item.id) targetAmp = CONFIG.ampDrift; }, 1500);
      } else {
        setDemoMode(curMode);
      }
    } catch (e) {
      // 照片加载失败 → 不再回退旧弹层！保留读信页框架，显示文字 + 照片加载失败提示
      console.warn('[LetterReader] 照片粒子化失败（仍显示文字内容）:', e && e.message);
      disposeSystem();
      // 显示照片加载失败占位：左侧信息区保持可见，canvas 区域显示提示
      const cvs = el('mt-reader-canvas');
      if (cvs) {
        const ctx = cvs.getContext('2d');
        if (ctx) { cvs.width = window.innerWidth; cvs.height = window.innerHeight; ctx.clearRect(0, 0, cvs.width, cvs.height); }
      }
      // 标记照片不可用状态（CSS 可据此隐藏 canvas / 显示 fallback 图标）
      el('mt-reader').classList.add('photo-failed');
    }

    loadingEl.classList.remove('show');
    if (fadeEl) fadeEl.classList.remove('show');
    loading = false;

    // 文字内容在此填充（无论照片成功与否都执行）
    const eyebrow = item.location ? ('精神印记 · ' + item.location) : '';
    // 标题兜底：title 为空时回退到正文截断，保证始终有标题显示（兼容修复前写入的旧帖）
    const explicitTitle = (item.title && item.title.trim()) || '';
    const bodyText = (item.content || '').trim();
    const dispTitle = explicitTitle || bodyText.slice(0, 30) || '记忆';
    // 正文与标题相同时不再重复显示一行（例如旧帖没有独立标题时，标题就是从正文截断来的）
    const bodyToShow = bodyText && (explicitTitle ? bodyText !== explicitTitle : bodyText !== dispTitle) ? item.content : '';
    typeTitle(el('mt-r-eyebrow'), eyebrow, token, 30);
    typeTitle(el('mt-r-title'), dispTitle, token);
    if (bodyToShow) {
      typeText(el('mt-r-body'), [bodyToShow], token);
    } else {
      el('mt-r-body').innerHTML = '';
    }

    // 🔧 临时诊断：当标题和正文都为空时，在控制台输出完整数据便于排查
    if ((!item.title || !item.title.trim()) && (!item.content || !item.content.trim())) {
      console.warn('[LetterReader] 帖子缺少标题和正文，原始数据:', JSON.stringify(item));
      // 同时在正文区域显示诊断提示（方便用户看到）
      if (!el('mt-r-body').innerHTML.trim()) {
        el('mt-r-body').innerHTML = '<div style="padding:12px;background:rgba(255,200,0,0.15);border-left:3px solid #c90;border-radius:6px;font-size:13px;color:#f0e6d2;">⚠️ 该帖标题和正文为空（可能是旧帖，发布时未保存标题字段）<br><span style="opacity:0.6;font-size:11px;">postId: ' + (item.id||'?') + ' | 发布时可重新输入标题文字</span></div>';
      }
    }
  }

  /* ---------- 打开读信页（memory-tree.js 调用） ---------- */
  async function open(item, origin) {
    // 构建 photoPosts（有照片的帖子，新→旧）
    try { if (window.MTPosts && window.MTPosts.refresh) await window.MTPosts.refresh(); } catch (e) {}
    const all = (window.MTPosts && window.MTPosts.list()) || [];
    photoPosts = all.filter(p => !!(p.imageUrl && /^https?:\/\/|\/|images\//.test(p.imageUrl)));
    if (!photoPosts.length) return;
    curIdx = photoPosts.findIndex(p => p.id === item.id);
    if (curIdx < 0) curIdx = 0;
    initScene();
    const delBtn = el('mt-r-delete');
    if (delBtn) delBtn.hidden = !deleteVisible;
    el('mt-reader').classList.add('open');
    await openItem(photoPosts[curIdx], false);
  }

  function setDemoMode(m) {
    curMode = m;
    targetAmp = m === 'photo' ? CONFIG.ampPhoto : CONFIG.ampDrift;
    document.querySelectorAll('.mt-r-demo-btn').forEach(b => b.classList.remove('active'));
    const btn = el(m === 'photo' ? 'mt-r-demo-photo' : 'mt-r-demo-drift');
    if (btn) btn.classList.add('active');
  }

  function togglePreview() {
    previewMode = !previewMode;
    el('mt-reader').classList.toggle('preview-mode', previewMode);
    el('mt-r-demo-bar').hidden = !previewMode;
    const btn = el('mt-r-preview');
    btn.querySelector('span').textContent = previewMode ? '退出' : '预览';
    btn.title = previewMode ? '退出预览' : '粒子预览';
    if (previewMode && system) setDemoMode('drift');
  }

  function closeReader() {
    letterToken++;
    disposeSystem();
    el('mt-reader').classList.remove('open');
    // 返回记忆树时重置相机到正视位置
    try {
      const api = window.__mtSceneApi;
      if (api && api.resetCamera) api.resetCamera();
    } catch (e) {}
  }

  /* ---------- 动画循环 ---------- */
  function animate() {
    rafId = requestAnimationFrame(animate);
    const now = performance.now();
    const dt = Math.min(0.05, (now - lastFrame) / 1000);
    lastFrame = now; t += dt;
    if (!renderer || !controls || !scene) return;  // 读信页未 open 时(initScene 未跑)安全跳过
    controls.update();
    if (system) {
      const u = system.points.material.uniforms;
      u.uTime.value = t;
      u.uAmpScale.value += (targetAmp - u.uAmpScale.value) * Math.min(1, dt * CONFIG.ampLerp);
    }
    renderer.render(scene, camera);
  }

  /* ---------- 初始化 + 事件绑定 ---------- */
  function init() {
    if (init._done) return; init._done = true;
    const prev = el('mt-r-prev'), next = el('mt-r-next'), home = el('mt-r-home');
    const envBtn = el('mt-r-env-btn'), pol = el('mt-r-polaroid'), polImg = el('mt-r-polaroid-img');

    prev.addEventListener('click', () => {
      if (!photoPosts.length || loading) return;
      curIdx = (curIdx - 1 + photoPosts.length) % photoPosts.length;
      openItem(photoPosts[curIdx], true);
    });
    next.addEventListener('click', () => {
      if (!photoPosts.length || loading) return;
      curIdx = (curIdx + 1) % photoPosts.length;
      openItem(photoPosts[curIdx], true);
    });
    home.addEventListener('click', closeReader);
    el('mt-r-preview').addEventListener('click', togglePreview);
    el('mt-r-demo-photo').addEventListener('click', () => setDemoMode('photo'));
    el('mt-r-demo-drift').addEventListener('click', () => setDemoMode('drift'));

    envBtn.addEventListener('click', () => {
      const open2 = pol.classList.toggle('open');
      envBtn.classList.toggle('active', open2);
    });
    polImg.addEventListener('click', (e) => {
      e.stopPropagation();
      if (!polImg.src || !curItem) return;
      // 复用记忆树现有 lightbox
      const lb = document.getElementById('mt-lightbox');
      const img = document.getElementById('mt-lightbox-img');
      if (lb && img) {
        img.classList.remove('loaded');
        img.onload = () => img.classList.add('loaded');
        img.src = polImg.src;
        lb.hidden = false;
      }
    });

    el('mt-r-comment').addEventListener('click', () => {
      const flow = el('mt-r-comment-flow');
      const show = flow.hidden;
      flow.hidden = !show;
      el('mt-r-comment').classList.toggle('active', show);
      if (show) { renderComments(); el('mt-r-comment-input').focus(); }
    });
    el('mt-r-comment-send').addEventListener('click', sendComment);
    el('mt-r-comment-input').addEventListener('keydown', (e) => { if (e.key === 'Enter') sendComment(); });

    const delBtn = el('mt-r-delete');
    if (delBtn) delBtn.addEventListener('click', () => {
      if (!curItem || !deleteHandler) return;
      if (!window.confirm('确定删除这条记忆树帖子？此操作不可撤销。')) return;
      deleteHandler(curItem.id);
    });

    lastFrame = performance.now();
    animate();
  }

  /* ---------- 对外 API ---------- */
  window.LetterReader = {
    open,
    close: closeReader,
    setDeleteHandler(fn) { deleteHandler = fn; },
    setDeleteVisible(v) { deleteVisible = !!v; },
    isOpen() { return el('mt-reader') ? el('mt-reader').classList.contains('open') : false; }
  };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
