// ============================================================
//  Shooting Stars — Starry Sky Meteor (星空主题同款)
//  发射方式：从左上区域向右下划过（常驻池，数量与旧版 v9 一致）
//  渲染风格：与 main-bg.js starry 模式 drawMeteor() 一致（白→蓝白→淡蓝渐变尾迹）
// ============================================================
(function () {
  "use strict";

  // 可访问性：尊重系统"减少动效"设置
  var rmQuery = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)');
  if (rmQuery && rmQuery.matches) return;

  var canvas = document.getElementById("stars-canvas");
  if (!canvas) return;
  var ctx = canvas.getContext("2d");

  var W, H;
  function resize() {
    W = window.innerWidth;
    H = window.innerHeight;
    canvas.width  = W;
    canvas.height = H;
  }
  resize();
  window.addEventListener("resize", resize);

  function rand(a, b) { return a + Math.random() * (b - a); }

  // ── 火流星概率 ──
  var BOLIDE_CHANCE = 0.27; // 27% 火流星

  // ── 重置一颗流星：从左上区域进入，向右下划过 ──
  function resetMeteor(m, initial) {
    // 起点在屏幕左上角外侧（真正的左上→右下对角线）
    m.x = rand(-W * 0.20, W * 0.08);
    m.y = rand(-H * 0.25, H * 0.08);
    m.ang = rand(0.12, 0.32) * Math.PI; // 约 22°–58°，宽屏下也明显从左上斜向右下

    m.bolide = Math.random() < BOLIDE_CHANCE; // 27% 火流星
    m.speed = m.bolide ? rand(18, 28) : rand(10, 18);
    m.len   = m.bolide ? rand(520, 900) : rand(360, 680);
    m.max   = rand(90, 160);
    m.life  = 0;
    m.alpha = rand(0.80, 1);
    m.w     = m.bolide ? 2.4 : 1.3;

    // 初始化时错开生命周期，避免齐发齐落
    if (initial) m.life = rand(0, m.max);
  }

  // ── 绘制单颗流星（与 main-bg.js drawMeteor 同逻辑）──
  function drawMeteor(m) {
    var t = m.life / m.max;
    // 淡入 → 保持 → 淡出
    var fade = (t < 0.12 ? t / 0.12 : (t > 0.58 ? (1 - t) / 0.42 : 1)) * m.alpha;
    if (fade <= 0) return;

    var tx = m.x - Math.cos(m.ang) * m.len;
    var ty = m.y - Math.sin(m.ang) * m.len;

    // 尾迹：白亮核心 → 蓝白 → 淡蓝透明
    var grad = ctx.createLinearGradient(m.x, m.y, tx, ty);
    grad.addColorStop(0,    'rgba(255,255,255,' + fade.toFixed(3) + ')');
    grad.addColorStop(0.10, 'rgba(210,235,255,' + (fade * 0.95).toFixed(3) + ')');
    grad.addColorStop(0.35, 'rgba(140,195,255,' + (fade * 0.55).toFixed(3) + ')');
    grad.addColorStop(1,    'rgba(100,170,255,0)');
    ctx.strokeStyle = grad;
    ctx.lineWidth = m.w;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(m.x, m.y);
    ctx.lineTo(tx, ty);
    ctx.stroke();

    // 头部光晕
    ctx.globalAlpha = fade * 0.85;
    ctx.beginPath();
    ctx.arc(m.x, m.y, (m.bolide ? 7 : 4), 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(200,235,255,0.65)';
    ctx.fill();
    ctx.globalAlpha = 1;

    // 头部亮核
    ctx.beginPath();
    ctx.arc(m.x, m.y, (m.bolide ? 2.6 : 1.8), 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(255,255,255,' + fade.toFixed(3) + ')';
    ctx.fill();
  }

  // ── 常驻池：数量与旧版 v9 一致（桌面 30 / 移动端 15）──
  var isMobile = window.matchMedia && window.matchMedia('(max-width:640px)').matches;
  var POOL_SIZE = isMobile ? 15 : 30;
  var meteors = [];
  for (var i = 0; i < POOL_SIZE; i++) {
    var m = {};
    resetMeteor(m, true);
    meteors.push(m);
  }

  // ── 动画循环 ──
  function frame() {
    ctx.clearRect(0, 0, W, H);
    for (var j = 0; j < meteors.length; j++) {
      var o = meteors[j];
      o.life++;
      o.x += Math.cos(o.ang) * o.speed;
      o.y += Math.sin(o.ang) * o.speed;
      // 走完生命周期或出界则重生（保持池中数量恒定）
      if (o.life >= o.max || o.x > W + 120 || o.y > H + 120) {
        resetMeteor(o, false);
        continue;
      }
      drawMeteor(o);
    }
    requestAnimationFrame(frame);
  }

  requestAnimationFrame(frame);
  console.log("Shooting Stars — Starry Sky Meteor ×" + POOL_SIZE + " (左上→右下, 火流星" + Math.round(BOLIDE_CHANCE*100) + "%)");
})();
