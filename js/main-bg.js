// ============================================================
//  Main Chat Background — Subtle Floating Dots
//  极轻量，30颗微光点缓慢漂浮
// ============================================================
(function () {
  "use strict";
  var canvas = document.getElementById("main-dots");
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

  var dots = [];
  var COUNT = 30;
  for (var i = 0; i < COUNT; i++) {
    dots.push({
      x: rand(0, 3000),
      y: rand(0, 3000),
      r: rand(0.3, 1.2),
      speed: rand(0.08, 0.25),
      phase: rand(0, Math.PI * 2),
      alpha: rand(0.08, 0.25),
    });
  }

  function frame() {
    // 只在canvas可见时绘制（body.main-active时display:block）
    if (!canvas.offsetParent) { requestAnimationFrame(frame); return; }

    ctx.clearRect(0, 0, W, H);

    for (var i = 0; i < dots.length; i++) {
      var d = dots[i];
      d.y -= d.speed;
      if (d.y < -10) { d.y = H + 10; d.x = rand(0, W); }
      d.phase += 0.01;
      var a = d.alpha * (0.6 + 0.4 * Math.sin(d.phase));

      ctx.beginPath();
      ctx.arc(d.x, d.y, d.r, 0, Math.PI * 2);
      ctx.fillStyle = "rgba(180,200,255," + a.toFixed(3) + ")";
      ctx.fill();
    }
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
})();
