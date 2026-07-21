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
  var meteorTimer = 0, meteorNext = rand(60, 150);

  var STAR_COLORS = [
    { rgb: '190,220,255', chance: 0.28 }, // 蓝白
    { rgb: '220,230,255', chance: 0.25 }, // 冷白
    { rgb: '255,255,255', chance: 0.22 }, // 纯白
    { rgb: '255,245,220', chance: 0.15 }, // 暖白
    { rgb: '180,200,255', chance: 0.10 }  // 淡紫蓝
  ];
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
      { name: 'far',   pct: 0.50, size: [0.30, 0.70], base: [0.35, 0.60], tw: [0.010, 0.022], parallax: 0.15, count: 0 },
      { name: 'mid',   pct: 0.35, size: [0.70, 1.20], base: [0.65, 0.95], tw: [0.018, 0.040], parallax: 0.38, count: 0 },
      { name: 'near',  pct: 0.15, size: [1.10, 2.00], base: [0.85, 1.00], tw: [0.028, 0.055], parallax: 0.70, count: 0 }
    ];
    layers[0].count = Math.round(total * layers[0].pct);
    layers[1].count = Math.round(total * layers[1].pct);
    layers[2].count = total - layers[0].count - layers[1].count;

    for (var L = 0; L < layers.length; L++) {
      var layer = layers[L];
      for (var i = 0; i < layer.count; i++) {
        var r = Math.pow(Math.random(), 0.75) * maxR;
        var ang = rand(0, Math.PI * 2);
        stars.push({
          x: cx + r * Math.cos(ang),
          y: cy + r * Math.sin(ang),
          r: r, ang: ang,
          layer: layer,
          size:  rand(layer.size[0],  layer.size[1]),
          base:  rand(layer.base[0],  layer.base[1]),
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

    // 中星：小光晕
    if (s.layer.name === 'mid' && alpha > 0.60) {
      ctx.globalAlpha = alpha * 0.10;
      ctx.fillStyle = 'rgb(' + s.col + ')';
      ctx.beginPath(); ctx.arc(x, y, sz * 2.2, 0, Math.PI * 2); ctx.fill();
      ctx.globalAlpha = 1;
    }

    // 星芒：细线十字，只在中/近星上画，避免远星成糊点
    if (s.layer.name !== 'far' || alpha > 0.60) {
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
      len:   isBolide ? rand(520, 900) : rand(360, 680),
      life: 0, max: rand(90, 160),
      alpha: rand(0.80, 1),
      bolide: isBolide,
      w: isBolide ? 2.4 : 1.3
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
    (function loop() {
      if (mode === 'starry') drawStars();
      else drawDots();
      requestAnimationFrame(loop);
    })();
  }
})();
