// ============================================================
//  Shooting Stars v9 — Radiant Shower (集中流星雨)
//  所有流星从画面右上天空辐射而出，划过学校上方
// ============================================================
(function () {
  "use strict";

  var canvas = document.getElementById("stars-canvas");
  if (!canvas) return;
  var ctx = canvas.getContext("2d");

  var W, H;
  function resize() {
    W = window.innerWidth;
    H = window.innerHeight;
    canvas.width  = W;
    canvas.height = H;
    radX = W * 0.65;   // 辐射点: 画面右侧天空
    radY = H * 0.08;   // 顶部
  }
  var radX, radY;  // radiant point
  resize();
  window.addEventListener("resize", resize);

  function rand(a, b) { return a + Math.random() * (b - a); }

  var COLORS = [
    [220,240,255], [200,230,255], [180,220,255],
    [255,230,170], [255,240,190],
    [220,180,255], [200,160,255],
    [140,240,240],
  ];

  function Meteor(layer) {
    this.layer = layer;
    this.color = COLORS[Math.floor(rand(0, COLORS.length))];
    this.reset(true);
  }

  Meteor.prototype.reset = function (initial) {
    var c;
    if      (this.layer === 0) c = { s:[350,550],  lw:[0.25,0.50], tr:[400,800],  a:[0.18,0.38], hr:[1.2,2.5] };
    else if (this.layer === 1) c = { s:[550,1000], lw:[0.40,0.85], tr:[550,1100], a:[0.28,0.52], hr:[2.0,4.0] };
    else                       c = { s:[900,1800], lw:[0.55,1.20], tr:[700,1500], a:[0.38,0.65], hr:[2.5,5.5] };

    // 辐射点 + 随机偏移 → 流星都从右上天空辐射出来
    if (initial) {
      this.startX = radX + rand(-W * 0.30, W * 0.20);
      this.startY = radY + rand(-10, H * 0.15);
    } else {
      this.startX = radX + rand(-W * 0.35, W * 0.18);
      this.startY = radY + rand(-5, H * 0.18);
    }

    // 角度：向右下为主，模拟东北→西南的流星雨
    var angle = rand(-0.55, 0.35); // -31° to +20° (略向下散开)
    var sp = rand(c.s[0], c.s[1]);
    this.vx = Math.cos(angle) * sp;
    this.vy = Math.sin(angle) * sp * 0.8 + sp * 0.5; // 偏向下

    this.x = this.startX;
    this.y = this.startY;
    this.lw   = rand(c.lw[0], c.lw[1]);
    this.trailLen = rand(c.tr[0], c.tr[1]);
    this.alpha = rand(c.a[0], c.a[1]);
    this.headR  = rand(c.hr[0], c.hr[1]);

    if (!initial && Math.random() < 0.20) {
      this.color = COLORS[Math.floor(rand(0, COLORS.length))];
    }
  };

  Meteor.prototype.update = function (dt) {
    var ds = dt * 0.001;
    this.x += this.vx * ds;
    this.y += this.vy * ds;
    // 出了画面就重生
    if (this.x > W + 400 || this.y > H + 300 || this.x < -400 || this.y < -200) {
      this.reset(false);
    }
  };

  Meteor.prototype.draw = function (ctx) {
    var hx = this.x, hy = this.y;
    var speed = Math.sqrt(this.vx * this.vx + this.vy * this.vy);
    if (speed < 1) return;
    var nx = this.vx / speed, ny = this.vy / speed;
    var tx = hx - nx * this.trailLen;
    var ty = hy - ny * this.trailLen;

    var a = this.alpha;
    var lw = this.lw;
    var cr = this.color[0], cg = this.color[1], cb = this.color[2];

    // ── 外层柔光 ──
    ctx.save();
    ctx.globalCompositeOperation = "source-over";
    ctx.beginPath();
    ctx.moveTo(tx, ty);
    ctx.lineTo(hx, hy);
    ctx.strokeStyle = "rgba("+cr+","+cg+","+cb+","+(a*0.10)+")";
    ctx.lineWidth = lw * 12;
    ctx.lineCap = "round";
    ctx.stroke();
    ctx.restore();

    // ── 中层辉光 ──
    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    ctx.beginPath();
    ctx.moveTo(tx, ty);
    ctx.lineTo(hx, hy);
    ctx.strokeStyle = "rgba("+cr+","+cg+","+cb+","+(a*0.35)+")";
    ctx.lineWidth = lw * 3.5;
    ctx.lineCap = "round";
    ctx.stroke();
    ctx.restore();

    // ── 核心亮线 ──
    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    ctx.beginPath();
    ctx.moveTo(tx, ty);
    ctx.lineTo(hx, hy);
    ctx.strokeStyle = "rgba(255,255,255,"+(a*0.75)+")";
    ctx.lineWidth = lw * 1.2;
    ctx.lineCap = "round";
    ctx.stroke();
    ctx.restore();

    // ── 头部光点 + 微星芒 ──
    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    ctx.beginPath();
    ctx.arc(hx, hy, this.headR, 0, Math.PI * 2);
    ctx.fillStyle = "rgba(255,255,255,"+(a*0.80)+")";
    ctx.fill();
    ctx.beginPath();
    ctx.arc(hx, hy, this.headR * 2.5, 0, Math.PI * 2);
    ctx.fillStyle = "rgba("+cr+","+cg+","+cb+","+(a*0.15)+")";
    ctx.fill();
    ctx.restore();
  };

  // ── 种群: 30颗集中在右上天空 ──
  var all = [];
  var COUNTS = [14, 10, 6];
  for (var layer = 0; layer < 3; layer++) {
    for (var i = 0; i < COUNTS[layer]; i++) {
      all.push(new Meteor(layer));
    }
  }

  // ── 动画 ──
  var last = performance.now();
  function frame(now) {
    var dt = Math.min(now - last, 40);
    last = now;
    ctx.clearRect(0, 0, W, H);

    for (var li = 0; li < 3; li++) {
      for (var i = 0; i < all.length; i++) {
        if (all[i].layer !== li) continue;
        all[i].update(dt);
        all[i].draw(ctx);
      }
    }

    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);

  console.log("Shooting Stars v9 — Radiant Shower, " + all.length + " meteors");
})();
