// ============================================================
//  Main Chat Background — Starfield (starry) + Aurora dots
//  纯 Canvas，无依赖；尊重 prefers-reduced-motion
//  starry 模式：真实星点 + 视差层 + 流星
//  其余模式：彩色漂浮光点（light / classroom / custom）
// ============================================================
(function () {
  "use strict";

  var canvas = document.getElementById("main-dots");
  if (!canvas) return;
  var ctx = canvas.getContext("2d");

  // 可访问性：尊重系统"减少动效"
  var rmQuery = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)');
  var REDUCED = rmQuery && rmQuery.matches;

  var W, H, cx, cy;
  function resize() {
    W = window.innerWidth; H = window.innerHeight;
    canvas.width  = W; canvas.height = H;
    cx = W / 2; cy = H / 2;
  }
  resize();
  window.addEventListener("resize", resize);

  function rand(a, b) { return a + Math.random() * (b - a); }
  function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }

  // ─────────────────────────────────────────────
  //  光点模式（light / classroom / custom  fallback 到深色）
  // ─────────────────────────────────────────────
  var PALETTE_AURORA = [
    { r: 139, g: 92,  b: 246 }, { r: 124, g: 92,  b: 252 }, { r: 167, g: 139, b: 250 },
    { r: 0,   g: 210, b: 255 }, { r: 88,  g: 101, b: 242 }, { r: 236, g: 72,  b: 153 },
    { r: 200, g: 205, b: 255 }
  ];
  var PALETTE_FOREST = [
    { r: 22,  g: 138, b: 84  }, { r: 13,  g: 148, b: 136 }, { r: 28,  g: 174, b: 107 },
    { r: 20,  g: 110, b: 74  }, { r: 60,  g: 130, b: 100 }, { r: 96,  g: 160, b: 120 }
  ];
  var PALETTE_LIGHT = [
    { r: 124, g: 92,  b: 252 }, { r: 88,  g: 101, b: 242 }, { r: 0,   g: 150, b: 200 },
    { r: 167, g: 139, b: 250 }, { r: 96,  g: 110, b: 150 }, { r: 180, g: 150, b: 230 }
  ];

  var dots = [];
  function buildDots(theme) {
    var isLightish = (theme === 'light' || theme === 'classroom');
    var palette = theme === 'classroom' ? PALETTE_FOREST
                : theme === 'light'     ? PALETTE_LIGHT
                : PALETTE_AURORA;
    dots = [];
    for (var i = 0; i < 55; i++) {
      var c = palette[Math.floor(rand(0, palette.length))];
      dots.push({
        x: rand(0, 3000), y: rand(0, 3000), r: rand(0.6, 2.2),
        speed: rand(0.05, 0.18), phase: rand(0, Math.PI * 2),
        alpha: isLightish ? rand(0.08, 0.22) : rand(0.12, 0.38),
        color: c, glow: Math.random() > 0.75
      });
    }
  }
  function drawDots() {
    if (getComputedStyle(canvas).display === 'none') return; // 登录页隐藏时跳过
    ctx.clearRect(0, 0, W, H);
    for (var i = 0; i < dots.length; i++) {
      var d = dots[i];
      d.y -= d.speed;
      if (d.y < -10) { d.y = H + 10; d.x = rand(0, W); }
      d.phase += 0.008;
      var a = d.alpha * (0.5 + 0.5 * Math.sin(d.phase));
      if (d.glow) {
        ctx.beginPath();
        ctx.arc(d.x, d.y, d.r * 4, 0, Math.PI * 2);
        var g = ctx.createRadialGradient(d.x, d.y, 0, d.x, d.y, d.r * 4);
        g.addColorStop(0, 'rgba(' + d.color.r + ',' + d.color.g + ',' + d.color.b + ',' + (a * 0.5).toFixed(3) + ')');
        g.addColorStop(1, 'rgba(' + d.color.r + ',' + d.color.g + ',' + d.color.b + ',0)');
        ctx.fillStyle = g; ctx.fill();
      }
      ctx.beginPath();
      ctx.arc(d.x, d.y, d.r, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(' + d.color.r + ',' + d.color.g + ',' + d.color.b + ',' + a.toFixed(3) + ')';
      ctx.fill();
    }
  }

  // ─────────────────────────────────────────────
  //  星空模式（starry）— 真实星点 + 视差层 + 流星
  //  背景底图由 images/starry-nebula.png 提供，这里只叠加动态层
  // ─────────────────────────────────────────────
  var stars = [];
  var meteors = [];
  var rotation = 0;
  var meteorTimer = 0, meteorNext = rand(240, 600); // v1.5.100：8~20s 一颗，流星是惊喜不是背景音乐

  var STAR_COLORS = [
    { rgb: '190,220,255', chance: 0.26 }, // 蓝白
    { rgb: '220,230,255', chance: 0.24 }, // 冷白
    { rgb: '255,255,255', chance: 0.22 }, // 纯白
    { rgb: '255,245,220', chance: 0.14 }, // 暖白
    { rgb: '180,200,255', chance: 0.09 }, // 淡紫蓝
    { rgb: '255,214,170', chance: 0.05 }  // 暖橙（K/M 型星，冷暖对比）
  ];
  // 银河带距离（v1.5.100）：与 CSS 115deg 银河带同轴，让 canvas 星点密度和底图长在同一条天上
  function milkyWayDist(x, y) {
    var nx = x / W, ny = y / H;             // 归一化
    // 115deg 渐变的等值线法向 ≈ (cos25°, -sin25°)；轴过屏幕中心
    var axis = Math.abs((nx - 0.5) * 0.906 + (ny - 0.5) * -0.423);
    return Math.min(1, axis * 2.2);         // 0.45 屏宽内算"带区"
  }

  function pickStarColor() {
    var r = Math.random();
    var c = 0;
    for (var i = 0; i < STAR_COLORS.length; i++) {
      c += STAR_COLORS[i].chance;
      if (r < c) return STAR_COLORS[i].rgb;
    }
    return STAR_COLORS[STAR_COLORS.length - 1].rgb;
  }

  // 鼠标视差目标（由 app.js 或自身监听更新）
  var parallax = { tx: 0, ty: 0, x: 0, y: 0 };
  function buildStars() {
    stars = [];
    // 背景底图已有很多静态星，这里只叠加动态层：数量克制、质量更高
    var total = Math.round(Math.min(420, Math.max(220, (W * H) / 4800)));
    var maxR = Math.hypot(W, H) / 2 + 60;

    // 三层：远（数量多、极小、极慢）/ 中 / 近（数量少、亮、可带光晕）
    var layers = [
      { name: 'far',   pct: 0.55, size: [0.30, 0.70], base: [0.35, 0.60], tw: [0.010, 0.022], parallax: 0.15, count: 0 },
      { name: 'mid',   pct: 0.36, size: [0.70, 1.20], base: [0.65, 0.95], tw: [0.018, 0.040], parallax: 0.38, count: 0 },
      { name: 'near',  pct: 0.09, size: [1.10, 2.00], base: [0.85, 1.00], tw: [0.028, 0.055], parallax: 0.70, count: 0 }
    ];
    layers[0].count = Math.round(total * layers[0].pct);
    layers[1].count = Math.round(total * layers[1].pct);
    layers[2].count = total - layers[0].count - layers[1].count;

    for (var L = 0; L < layers.length; L++) {
      var layer = layers[L];
      for (var i = 0; i < layer.count; i++) {
        var r = Math.pow(Math.random(), 0.75) * maxR;
        var ang = rand(0, Math.PI * 2);
        // 银河带密度加权：带内(d<0.45)概率提升，带外 rejection 重采样
        var gx = cx + r * Math.cos(ang), gy = cy + r * Math.sin(ang);
        var mw = 1 - milkyWayDist(gx, gy); // 1=带心 0=带外
        if (Math.random() > 0.35 + mw * 0.65) { i--; continue; }
        stars.push({
          x: cx + r * Math.cos(ang),
          y: cy + r * Math.sin(ang),
          r: r, ang: ang,
          layer: layer,
          size:  rand(layer.size[0],  layer.size[1]) * (mw > 0.5 ? 1.12 : 1),
          base:  Math.min(1, rand(layer.base[0],  layer.base[1]) * (mw > 0.5 ? 1.15 : 1)),
          phase: rand(0, Math.PI * 2),
          tw:    rand(layer.tw[0],    layer.tw[1]),
          col:   pickStarColor()
        });
      }
    }
  }

  function drawSpikeStar(s, rot, px, py) {
    // 视差：按层移动
    var p = s.layer.parallax;
    var dx = px * p;
    var dy = py * p;
    var a = s.ang + rot * (1 + p * 0.35);
    var x = cx + s.r * Math.cos(a) + dx;
    var y = cy + s.r * Math.sin(a) + dy;
    if (x < -30 || x > W + 30 || y < -30 || y > H + 30) return;

    var tw = s.base * (0.62 + 0.38 * Math.sin(s.phase));
    var alpha = clamp(tw, 0.12, 1);
    var sz = s.size;

    // 近星：柔和的柔光晕
    if (s.layer.name === 'near' && alpha > 0.40) {
      ctx.globalAlpha = alpha * 0.22;
      ctx.fillStyle = 'rgb(' + s.col + ')';
      ctx.beginPath(); ctx.arc(x, y, sz * 3.5, 0, Math.PI * 2); ctx.fill();
      ctx.globalAlpha = 1;
    }

    // 中星：微弱光斑（v1.5.100：更小更淡，把"亮"让给近层）
    if (s.layer.name === 'mid' && alpha > 0.72) {
      ctx.globalAlpha = alpha * 0.07;
      ctx.fillStyle = 'rgb(' + s.col + ')';
      ctx.beginPath(); ctx.arc(x, y, sz * 1.8, 0, Math.PI * 2); ctx.fill();
      ctx.globalAlpha = 1;
    }

    // 星芒：细线十字——只给近层亮星（v1.5.100：35%→9%，满屏加号消失）
    if (s.layer.name === 'near' && alpha > 0.55) {
      ctx.globalAlpha = alpha * 0.85;
      ctx.strokeStyle = 'rgba(' + s.col + ',' + (alpha * 0.95).toFixed(3) + ')';
      ctx.lineWidth = Math.max(0.45, sz * 0.38);
      ctx.lineCap = 'round';
      var spike = sz * (s.layer.name === 'near' ? 3.6 : 2.4);
      ctx.beginPath();
      ctx.moveTo(x - spike, y); ctx.lineTo(x + spike, y);
      ctx.moveTo(x, y - spike); ctx.lineTo(x, y + spike);
      ctx.stroke();
    }

    // 中心亮核
    ctx.globalAlpha = alpha;
    ctx.fillStyle = 'rgba(' + s.col + ',' + alpha.toFixed(3) + ')';
    ctx.beginPath(); ctx.arc(x, y, sz * 0.5, 0, Math.PI * 2); ctx.fill();
    ctx.globalAlpha = 1;
  }

  function spawnMeteor() {
    // 从屏幕上方或左侧边缘刷新，向右下划过
    var fromTop = Math.random() > 0.35;
    var x, y;
    if (fromTop) {
      x = rand(-W * 0.15, W * 1.05); y = rand(-H * 0.08, H * 0.12);
    } else {
      x = rand(-W * 0.15, W * 0.08); y = rand(-H * 0.05, H * 0.45);
    }
    var ang = rand(0.28, 0.55) * Math.PI; // 约 50°–100°
    var isBolide = Math.random() > 0.92;    // 偶发火流星
    meteors.push({
      x: x, y: y, ang: ang,
      speed: isBolide ? rand(18, 28) : rand(10, 18),
      len:   isBolide ? rand(520, 900) : rand(240, 420), // 普通流星更短更含蓄
      life: 0, max: rand(90, 160),
      alpha: rand(0.55, 0.80),                            // 整体压暗一档
      bolide: isBolide,
      w: isBolide ? 2.4 : 1.1
    });
  }

  function drawMeteor(m) {
    var t = m.life / m.max;
    var fade = (t < 0.12 ? t / 0.12 : (t > 0.58 ? (1 - t) / 0.42 : 1)) * m.alpha;
    if (fade <= 0) return;
    var tx = m.x - Math.cos(m.ang) * m.len;
    var ty = m.y - Math.sin(m.ang) * m.len;

    // 尾迹：白亮核心 → 蓝白 → 透明
    var grad = ctx.createLinearGradient(m.x, m.y, tx, ty);
    grad.addColorStop(0,    'rgba(255,255,255,' + fade.toFixed(3) + ')');
    grad.addColorStop(0.10, 'rgba(210,235,255,' + (fade * 0.95).toFixed(3) + ')');
    grad.addColorStop(0.35, 'rgba(140,195,255,' + (fade * 0.55).toFixed(3) + ')');
    grad.addColorStop(1,    'rgba(100,170,255,0)');
    ctx.strokeStyle = grad;
    ctx.lineWidth = m.w; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(m.x, m.y); ctx.lineTo(tx, ty); ctx.stroke();

    // 头部光晕
    ctx.globalAlpha = fade * 0.85;
    ctx.beginPath(); ctx.arc(m.x, m.y, (m.bolide ? 7 : 4), 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(200,235,255,0.65)'; ctx.fill();
    ctx.globalAlpha = 1;

    // 头部亮核
    ctx.beginPath();
    ctx.arc(m.x, m.y, (m.bolide ? 2.6 : 1.8), 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(255,255,255,' + fade.toFixed(3) + ')';
    ctx.fill();
  }

  function drawStars() {
    if (getComputedStyle(canvas).display === 'none') return;
    ctx.clearRect(0, 0, W, H);

    // 平滑视差插值
    parallax.x += (parallax.tx - parallax.x) * 0.06;
    parallax.y += (parallax.ty - parallax.y) * 0.06;
    var px = parallax.x, py = parallax.y;

    // 极慢整体旋转（不同层带轻微差异由视差体现）
    rotation += 0.000045;
    for (var i = 0; i < stars.length; i++) {
      stars[i].phase += stars[i].tw;
      drawSpikeStar(stars[i], rotation, px, py);
    }
    meteorTimer++;
    if (meteorTimer >= meteorNext) { meteorTimer = 0; meteorNext = rand(60, 150); spawnMeteor(); }
    for (var j = meteors.length - 1; j >= 0; j--) {
      var m = meteors[j];
      m.life++;
      m.x += Math.cos(m.ang) * m.speed;
      m.y += Math.sin(m.ang) * m.speed;
      if (m.life >= m.max || m.x > W + 120 || m.y > H + 120) { meteors.splice(j, 1); continue; }
      drawMeteor(m);
    }
  }

  // 鼠标/指针视差输入（app.js 也可能通过 GSAP 设置容器）
  if (!REDUCED) {
    var lastMove = 0;
    window.addEventListener('mousemove', function (e) {
      var now = Date.now();
      if (now - lastMove < 33) return; // 30fps input
      lastMove = now;
      var nx = (e.clientX / W - 0.5) * 2; // -1..1
      var ny = (e.clientY / H - 0.5) * 2;
      parallax.tx = -nx * 24; // 最大 ±24px
      parallax.ty = -ny * 16;
    }, { passive: true });
  }

  // ── 模式切换 ──
  var mode = 'dots';
  function currentTheme() { return document.body.dataset.theme || 'starry'; }
  function setMode(theme) {
    mode = (theme === 'starry') ? 'starry' : 'dots';
    if (mode === 'starry') { buildStars(); meteors = []; }
    else buildDots(theme === 'custom' ? 'starry' : theme);
  }
  // 供主题切换时调用，重建背景
  window.__rebuildMainDots = function (theme) {
    setMode(theme);
    if (REDUCED) drawStaticOnce();
  };

  function drawStaticOnce() {
    ctx.clearRect(0, 0, W, H);
    if (mode === 'starry') {
      for (var i = 0; i < stars.length; i++) drawSpikeStar(stars[i], 0, 0, 0);
    } else {
      drawDots();
    }
  }

  setMode(currentTheme());

  if (REDUCED) {
    // 减少动效：仅画一帧静态星空 / 光点
    drawStaticOnce();
  } else {
    // 性能优化：限 30fps + 后台标签页暂停（主频道内照常动，零视觉损失）
    var bgRunning = true, bgRaf = null, bgLast = 0, BG_FRAME = 1000 / 30;
    function bgLoop(ts) {
      if (!bgRunning) { bgRaf = null; return; }
      if (ts - bgLast >= BG_FRAME) {
        bgLast = ts;
        if (mode === 'starry') drawStars(); else drawDots();
      }
      bgRaf = requestAnimationFrame(bgLoop);
    }
    bgRaf = requestAnimationFrame(bgLoop);
    document.addEventListener('visibilitychange', function () {
      bgRunning = !document.hidden;
      if (bgRunning && !bgRaf) { bgLast = 0; bgRaf = requestAnimationFrame(bgLoop); }
    });
  }
})();

// ============================================================
//  LikeMeteor — 点赞流星 v2（主题感知，v1.5.94 回炉版）
//    starry/custom → 白→蓝白长尾流星（真正划过天空，尾迹更长）
//    light(校园手稿) → 紫墨彗星：一笔甩墨，墨点会下坠
//    classroom(自然森绿) → 萤火虫：不再是一条绿线，而是
//       慢速飘忽绕行 + 呼吸脉冲发光 + 磷光尾迹点点散落
//  实现：独立全屏 overlay canvas（pointer-events:none, z-index 10000），
//  按需启动 rAF：无特效飞行时零开销；尊重 prefers-reduced-motion。
// ============================================================
(function () {
  "use strict";

  // 可访问性：系统开启"减少动效"则整个特效不可用
  var rmq = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)');
  if (rmq && rmq.matches) return;
  if (window.LikeMeteor) return; // 防重复注入

  var canvas = null, ctx = null, rafId = null;
  var meteors = [];
  var W = 0, H = 0, dpr = 1;
  var MAX_LIVE = 12; // 连点保护：同屏最多 12 个
  var TAU = Math.PI * 2;

  function ensureCanvas() {
    if (canvas) return true;
    if (!document.body) return false;
    canvas = document.createElement('canvas');
    canvas.id = 'like-meteor-canvas';
    // 与 canvas-confetti 同一庆祝层（10000），不挡任何点击
    canvas.style.cssText = 'position:fixed;inset:0;pointer-events:none;z-index:10000;';
    document.body.appendChild(canvas);
    ctx = canvas.getContext('2d');
    resize();
    window.addEventListener('resize', resize);
    return true;
  }

  function resize() {
    if (!canvas) return;
    dpr = Math.min(window.devicePixelRatio || 1, 2); // retina 下清晰，且限制填充率
    W = window.innerWidth; H = window.innerHeight;
    canvas.width = Math.round(W * dpr);
    canvas.height = Math.round(H * dpr);
    canvas.style.width = W + 'px';
    canvas.style.height = H + 'px';
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  // 每主题一套"服装"：读取 body[data-theme]，每次发射时实时读取（主题热切换即生效）
  function costume() {
    var t = (document.body && document.body.dataset.theme) || 'starry';
    if (t === 'light') {
      // 校园手稿：紫墨彗星 — 短促上挑的一笔，墨点缓缓下坠
      return {
        flight: 'streak',
        trail: [[167,139,250,1], [124,92,252,0.55], [124,92,252,0]],
        head: 'rgba(124,92,252,0.95)', headR: 2.4,
        glow: 'rgba(167,139,250,0.32)', glowR: 6,
        sparkle: '124,92,252',
        ang: [-1.05, -0.75], speed: [4.5, 6.5], len: [80, 150], w: [1.8, 2.8],
        life: [44, 62], sparkleRate: 0.42, gravity: 0.07 // 墨点下坠
      };
    }
    if (t === 'classroom') {
      // 自然森绿：萤火虫 — 慢速飘忽绕行 + 呼吸脉冲 + 磷光尾迹
      return {
        flight: 'firefly',
        trail: [[190,242,100,1], [134,239,172,0.5], [74,222,128,0]],
        head: 'rgba(220,255,160,0.95)',
        glow: 'rgba(190,242,100,0.55)',
        sparkle: '190,242,100',
        ang: [-1.0, -0.6], speed: [1.1, 2.0], // 慢速飘
        life: [110, 170],                      // 活得久，慢慢飞
        wander: [0.10, 0.20], freq: [0.08, 0.16], pulse: [0.15, 1.0],
        sparkleRate: 0.25, gravity: 0
      };
    }
    // starry / custom：白→蓝白流星，长尾掠过天空（与星空模式 ambient 流星同配色，更长更亮）
    return {
      flight: 'streak',
      trail: [[255,255,255,1], [210,235,255,0.95], [140,195,255,0.5], [100,170,255,0]],
      head: 'rgba(255,255,255,0.95)', headR: 2.2,
      glow: 'rgba(200,235,255,0.6)', glowR: 9,
      sparkle: '210,235,255',
      ang: [-0.62, -0.38], speed: [7, 10.5], len: [200, 360], w: [1.3, 2.3],
      life: [60, 85], sparkleRate: 0.55, gravity: 0
    };
  }

  function fadeOf(m) {
    var t = m.life / m.max;
    // 淡入(前15%) → 全亮 → 淡出(后45%)
    return t < 0.15 ? t / 0.15 : (t > 0.55 ? Math.max(0, (1 - t) / 0.45) : 1);
  }

  function launch(x, y, opts) {
    if (!ensureCanvas()) return;
    if (meteors.length >= MAX_LIVE) return;
    opts = opts || {};
    var c = costume();
    var ang = (typeof opts.ang === 'number')
      ? opts.ang + (Math.random() - 0.5) * 0.08 // 指定方向 + 微抖动（星雨用）
      : c.ang[0] + Math.random() * (c.ang[1] - c.ang[0]);
    var m = {
      x: x, y: y,
      vx: Math.cos(ang), vy: Math.sin(ang),
      life: 0,
      max: Math.round(c.life[0] + Math.random() * (c.life[1] - c.life[0])),
      delay: opts.delay || 0, // 帧延迟：星雨错落出場
      c: c, sparkles: []
    };
    if (c.flight === 'firefly') {
      // 萤火虫逐步更新 m.x/m.y，heading 飘忽绕行
      m.heading = ang;
      m.speed = c.speed[0] + Math.random() * (c.speed[1] - c.speed[0]);
      m.wander = c.wander[0] + Math.random() * (c.wander[1] - c.wander[0]);
      m.phase = Math.random() * TAU;
      m.freq = c.freq[0] + Math.random() * (c.freq[1] - c.freq[0]);
      m.ghost = []; // 磷光尾迹点
    } else {
      m.speed = c.speed[0] + Math.random() * (c.speed[1] - c.speed[0]);
      m.len = c.len[0] + Math.random() * (c.len[1] - c.len[0]);
      m.w = c.w[0] + Math.random() * (c.w[1] - c.w[0]);
    }
    meteors.push(m);
    if (!rafId) rafId = requestAnimationFrame(frame);
  }

  // 星雨入场：n 颗从天顶错落划下（星空主题切换仪式，v1.5.94）
  function shower(n) {
    if (!ensureCanvas()) return;
    n = Math.max(4, Math.min(10, n || 5));
    for (var i = 0; i < n; i++) {
      launch(
        W * (0.12 + Math.random() * 0.8),
        -20 - Math.random() * 50,
        { ang: 0.38 + Math.random() * 0.22, delay: i * 8 }
      );
    }
  }

  function spawnSparkle(m, x, y) {
    m.sparkles.push({
      x: x + (Math.random() - 0.5) * 12,
      y: y + (Math.random() - 0.5) * 12,
      r: 0.5 + Math.random() * 1.4,
      a: 1,
      vx: (Math.random() - 0.5) * 0.6,
      vy: (Math.random() - 0.5) * 0.6,
      g: m.c.gravity || 0
    });
    if (m.sparkles.length > 40) m.sparkles.shift();
  }

  function drawStreak(m, fade, x, y) {
    // 尾迹：头亮尾透的渐变线
    var tx = x - m.vx * m.len, ty = y - m.vy * m.len;
    var grad = ctx.createLinearGradient(x, y, tx, ty);
    var stops = m.c.trail, n = stops.length;
    for (var s = 0; s < n; s++) {
      var st = stops[s];
      grad.addColorStop(n === 1 ? 0 : s / (n - 1),
        'rgba(' + st[0] + ',' + st[1] + ',' + st[2] + ',' + (st[3] * fade).toFixed(3) + ')');
    }
    ctx.strokeStyle = grad;
    ctx.lineWidth = m.w;
    ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(tx, ty); ctx.stroke();

    // 头部柔光 + 亮核
    ctx.globalAlpha = fade;
    ctx.beginPath(); ctx.arc(x, y, m.c.glowR, 0, TAU);
    ctx.fillStyle = m.c.glow; ctx.fill();
    ctx.beginPath(); ctx.arc(x, y, m.c.headR, 0, TAU);
    ctx.fillStyle = m.c.head; ctx.fill();
    ctx.globalAlpha = 1;
  }

  function drawFirefly(m, fade) {
    // 飘忽绕行：heading 持续微转，像虫子在找路
    m.heading += Math.sin(m.life * m.freq + m.phase) * m.wander;
    m.vx = Math.cos(m.heading); m.vy = Math.sin(m.heading);
    m.x += m.vx * m.speed;
    m.y += m.vy * m.speed;

    // 磷光尾迹：每 2 帧留一个点，最多 8 个，逐渐散掉
    if (m.life % 2 === 0) {
      m.ghost.push({ x: m.x + (Math.random() - 0.5) * 2.2, y: m.y + (Math.random() - 0.5) * 2.2, l: 1 });
      if (m.ghost.length > 8) m.ghost.shift();
    }
    for (var g = 0; g < m.ghost.length; g++) {
      var gp = m.ghost[g];
      gp.l -= 0.08;
      if (gp.l <= 0.02) continue;
      ctx.beginPath(); ctx.arc(gp.x, gp.y, 1.8, 0, TAU);
      ctx.fillStyle = 'rgba(190,242,100,' + (gp.l * 0.22 * fade).toFixed(3) + ')';
      ctx.fill();
    }

    // 呼吸脉冲：0.15~1.0 之间忽明忽暗，但不会彻底消失
    var pulse = m.c.pulse[0] + (m.c.pulse[1] - m.c.pulse[0]) * (0.5 + 0.5 * Math.sin(m.life * 0.30 + m.phase));
    var a = Math.min(1, fade * pulse);
    if (a <= 0.01) return;

    // 外层柔光（呼吸大小）
    var grd = ctx.createRadialGradient(m.x, m.y, 0, m.x, m.y, 10);
    grd.addColorStop(0, 'rgba(220,255,160,' + (a * 0.9).toFixed(3) + ')');
    grd.addColorStop(1, 'rgba(74,222,128,0)');
    ctx.fillStyle = grd;
    ctx.beginPath(); ctx.arc(m.x, m.y, 10, 0, TAU); ctx.fill();

    // 亮点核心
    ctx.beginPath(); ctx.arc(m.x, m.y, 1.8 + pulse * 0.9, 0, TAU);
    ctx.fillStyle = 'rgba(240,255,200,' + a.toFixed(3) + ')';
    ctx.fill();
  }

  function frame() {
    ctx.clearRect(0, 0, W, H);
    for (var i = meteors.length - 1; i >= 0; i--) {
      var m = meteors[i];
      if (m.delay > 0) { m.delay--; continue; } // 还没出场
      m.life++;
      if (m.life >= m.max) { meteors.splice(i, 1); continue; }
      var fade = fadeOf(m);

      if (m.c.flight === 'firefly') {
        drawFirefly(m, fade);
        // 沿途偶尔落一粒萤屑
        if (Math.random() < m.c.sparkleRate) spawnSparkle(m, m.x, m.y);
      } else {
        var x = m.x + m.vx * m.speed * m.life;
        var y = m.y + m.vy * m.speed * m.life;
        drawStreak(m, fade, x, y);
        // 沿途撒星屑/墨点
        if (Math.random() < m.c.sparkleRate) spawnSparkle(m, x, y);
      }

      // 更新所有星屑/墨点（带重力下坠）
      for (var k = m.sparkles.length - 1; k >= 0; k--) {
        var sp = m.sparkles[k];
        sp.a -= 0.035; sp.x += sp.vx; sp.y += sp.vy; sp.vy += sp.g;
        if (sp.a <= 0) { m.sparkles.splice(k, 1); continue; }
        ctx.beginPath(); ctx.arc(sp.x, sp.y, sp.r, 0, TAU);
        ctx.fillStyle = 'rgba(' + m.c.sparkle + ',' + (sp.a * fade).toFixed(3) + ')';
        ctx.fill();
      }
    }
    if (meteors.length) {
      rafId = requestAnimationFrame(frame);
    } else {
      // 全部飞完：清屏 + 停帧（回到零开销）
      rafId = null;
      ctx.clearRect(0, 0, W, H);
    }
  }

  window.LikeMeteor = { launch: launch, shower: shower };
  console.log('LikeMeteor v2 — 主题感知点赞流星（星空=长尾流星 / 手稿=紫墨彗星 / 森绿=萤火虫）');
})();

// ============================================================
//  BgDrift — 星云漂移 + 鼠标视差（v1.5.93，星空主题专属）
//  #main-bg 以 scale(1.05) 兜底，叠加：
//    · 双正弦慢漂移（周期 ~2 分钟，天空是"活的"但不干扰阅读）
//    · 鼠标视差 ±6px（lerp 平滑，无突跳）
//  细节：
//    · 仅 starry/custom（深色）生效；切到 light/classroom 自动复位 transform
//    · gsap 主题入场动画期间（__bgHoldUntil）暂停写 transform，结束后 0.9s
//      smoothstep 从 scale 1 缓升回 1.05，避免跳变
//    · 30fps 节流 + transform 合成器通道 + reduced-motion 直接不启用
// ============================================================
(function () {
  "use strict";
  var rmq = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)');
  if (rmq && rmq.matches) return;

  var el = document.getElementById('main-bg');
  if (!el) return;

  var mx = 0, my = 0;   // 鼠标目标（-1 ~ 1）
  var px = 0, py = 0;   // 视差当前值（lerp）
  var last = 0;
  var wasHeld = false;
  var releaseTs = 0;

  window.addEventListener('mousemove', function (e) {
    mx = (e.clientX / window.innerWidth) * 2 - 1;
    my = (e.clientY / window.innerHeight) * 2 - 1;
  }, { passive: true });

  // smoothstep：0→1 的缓入缓出
  function smooth(t) { t = Math.max(0, Math.min(1, t)); return t * t * (3 - 2 * t); }

  function loop(ts) {
    requestAnimationFrame(loop);
    if (ts - last < 33) return; // 30fps 节流
    last = ts;
    if (document.hidden) return;

    var theme = (document.body && document.body.dataset.theme) || 'starry';
    if (theme !== 'starry' && theme !== 'custom') {
      if (el.style.transform) el.style.transform = ''; // 纸面/教室主题不复位会露边
      wasHeld = false;
      return;
    }

    // gsap 入场动画期间让位（applyTheme 会设 __bgHoldUntil）
    var held = !!(window.__bgHoldUntil && Date.now() < window.__bgHoldUntil);
    if (held) { wasHeld = true; return; }
    if (wasHeld) { releaseTs = ts; wasHeld = false; } // 刚放行：记录时刻做 scale 缓升

    // scale 缓升：放行/加载后 0.9s 内从 1.0 → 1.05，避免与 gsap 终态(1.0)跳变
    var ramp = releaseTs ? smooth((ts - releaseTs) / 900) : smooth(ts / 900);
    var scale = 1 + 0.05 * ramp;

    var t = ts / 1000;
    var dx = Math.sin(t * 0.05) * 10 + Math.sin(t * 0.021) * 6; // ~2min 双正弦漫游
    var dy = Math.cos(t * 0.041) * 8;
    px += (mx * 6 - px) * 0.04; // 视差 ±6px，lerp 平滑
    py += (my * 4 - py) * 0.04;

    el.style.transform = 'translate3d(' + (dx + px).toFixed(2) + 'px,' + (dy + py).toFixed(2) + 'px,0) scale(' + scale.toFixed(4) + ')';
  }
  requestAnimationFrame(loop);
  console.log('BgDrift — 星云漂移+鼠标视差已启用 (starry/custom, 30fps, scale 1.05 兜底)');
})();
