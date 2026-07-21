(function(){
  'use strict';
  var canvas = document.getElementById('space-canvas');
  var ctx = canvas.getContext('2d');
  var W, H, cx, cy;

  var state = {
    nebulaOn: true,
    nebulaStrength: 0.5,
    starCount: 700,
    reducedMotion: window.matchMedia('(prefers-reduced-motion: reduce)').matches
  };

  // ─────────────────────────────────────────────
  //  工具
  // ─────────────────────────────────────────────
  function rand(a,b){ return a + Math.random()*(b-a); }
  function clamp(v,min,max){ return Math.max(min, Math.min(max, v)); }
  function resize(){
    W = canvas.width = window.innerWidth;
    H = canvas.height = window.innerHeight;
    cx = W/2; cy = H/2;
    buildNebula(); buildStars(); buildMilkyWay();
  }

  // ─────────────────────────────────────────────
  //  程序化星云：多层柔和径向渐变叠加
  // ─────────────────────────────────────────────
  var nebulaCanvas, nebulaCtx, mwCanvas, mwCtx;
  function buildNebula(){
    nebulaCanvas = document.createElement('canvas');
    nebulaCanvas.width = W; nebulaCanvas.height = H;
    nebulaCtx = nebulaCanvas.getContext('2d');

    // 深蓝紫底色
    var base = nebulaCtx.createLinearGradient(0,0, W,H);
    base.addColorStop(0, '#030511');
    base.addColorStop(0.5, '#040714');
    base.addColorStop(1, '#02030a');
    nebulaCtx.fillStyle = base; nebulaCtx.fillRect(0,0,W,H);

    // 随机雾状星云团（蓝/紫/青/粉），数量减少、尺寸更小、透明度更低，避免均匀糊
    var blobs = [];
    for (var i=0;i<26;i++){
      var x = rand(-W*0.15, W*1.15);
      var y = rand(-H*0.15, H*1.15);
      var r = rand(Math.min(W,H)*0.12, Math.max(W,H)*0.42);
      var hue = Math.random() < 0.5 ? rand(215,245) : (Math.random()<0.7 ? rand(255,285) : rand(180,205));
      var sat = rand(55,85);
      var light = rand(40,58);
      var a = rand(0.015, 0.045) * (Math.random()<0.2 ? 1.4 : 1);
      blobs.push({x,y,r,hue,sat,light,a});
    }
    // 按大小从大到小绘制
    blobs.sort(function(a,b){ return b.r - a.r; });
    for (var k=0;k<blobs.length;k++){
      var b = blobs[k];
      var g = nebulaCtx.createRadialGradient(b.x, b.y, 0, b.x, b.y, b.r);
      g.addColorStop(0, 'hsla('+b.hue+','+b.sat+'%,'+b.light+'%,'+b.a+')');
      g.addColorStop(0.25, 'hsla('+b.hue+','+b.sat+'%,'+b.light+'%,'+b.a*0.35+')');
      g.addColorStop(0.65, 'hsla('+b.hue+','+b.sat+'%,'+b.light+'%,'+b.a*0.08+')');
      g.addColorStop(1, 'hsla('+b.hue+','+b.sat+'%,'+b.light+'%,0)');
      nebulaCtx.fillStyle = g; nebulaCtx.fillRect(0,0,W,H);
    }

    // 银河带：主结构椭圆 + 暗道 + 密集微星
    mwCanvas = document.createElement('canvas');
    mwCanvas.width = W; mwCanvas.height = H;
    mwCtx = mwCanvas.getContext('2d');
    mwCtx.save();
    mwCtx.translate(W*0.48, H*0.42);
    mwCtx.rotate(-0.32);
    var mw = mwCtx.createRadialGradient(0,0,0, 0,0, Math.max(W,H)*0.82);
    mw.addColorStop(0, 'rgba(230,240,255,0.00)');
    mw.addColorStop(0.15, 'rgba(230,240,255,0.055)');
    mw.addColorStop(0.35, 'rgba(220,235,255,0.095)');
    mw.addColorStop(0.55, 'rgba(210,230,255,0.065)');
    mw.addColorStop(0.78, 'rgba(220,235,255,0.025)');
    mw.addColorStop(1, 'rgba(230,240,255,0.0)');
    mwCtx.fillStyle = mw;
    mwCtx.beginPath(); mwCtx.ellipse(0,0, Math.max(W,H)*0.75, Math.max(W,H)*0.10, 0,0,Math.PI*2); mwCtx.fill();
    // 暗道
    mwCtx.globalCompositeOperation = 'destination-out';
    for (var d=0; d<3; d++){
      var dark = mwCtx.createRadialGradient(rand(-W*0.3,W*0.3), rand(-H*0.03,H*0.03), 0, 0, 0, Math.max(W,H)*0.18);
      dark.addColorStop(0, 'rgba(0,0,0,0.22)'); dark.addColorStop(1, 'rgba(0,0,0,0)');
      mwCtx.fillStyle = dark; mwCtx.beginPath(); mwCtx.ellipse(0,0, Math.max(W,H)*0.6, Math.max(W,H)*0.035, 0,0,Math.PI*2); mwCtx.fill();
    }
    mwCtx.restore();
    mwCtx.globalCompositeOperation = 'source-over';
    for (var m=0;m<700;m++){
      var t = Math.random();
      var x = t*W + rand(-W*0.12, W*0.12);
      var y = t*H + rand(-H*0.04, H*0.04);
      var dist = Math.abs((y - (H*0.42 - 0.32*(x-W*0.48))) / (H*0.10)); // 近似到银河带距离
      if (dist > 1.2) continue;
      var s = rand(0.25, 0.9);
      var a = rand(0.04, 0.18) * (1 - Math.min(1, dist));
      mwCtx.fillStyle = 'rgba(230,242,255,'+a.toFixed(3)+')';
      mwCtx.beginPath(); mwCtx.arc(x,y,s,0,Math.PI*2); mwCtx.fill();
    }
  }

  // ─────────────────────────────────────────────
  //  星星：分层视差 + 色温 + 闪烁 + 星芒
  // ─────────────────────────────────────────────
  var stars = [];
  var starSprites = {};
  function makeStarSprite(size, color, type){
    var key = size.toFixed(2)+'|'+color+'|'+type;
    if (starSprites[key]) return starSprites[key];
    // 画布尺寸按实际像素放大，确保锐利
    var d = Math.max(12, Math.ceil(size * 12));
    var c = document.createElement('canvas');
    c.width = d; c.height = d;
    var x = c.getContext('2d');
    x.imageSmoothingEnabled = false;
    var center = d/2;

    // 星核：极小的硬白点 + 紧窄柔光
    var core = size * 0.55; // 像素核
    var g = x.createRadialGradient(center,center, 0, center,center, d/2);
    g.addColorStop(0, 'rgba(255,255,255,0.98)');
    g.addColorStop(0.20, 'rgba('+color+',0.78)');
    g.addColorStop(0.45, 'rgba('+color+',0.28)');
    g.addColorStop(0.75, 'rgba('+color+',0.06)');
    g.addColorStop(1, 'rgba('+color+',0)');
    x.fillStyle = g; x.fillRect(0,0,d,d);

    // 星芒：只给近星，极短、极细
    if (type === 'near'){
      x.globalAlpha = 0.55;
      x.strokeStyle = 'rgba(255,255,255,0.75)';
      x.lineWidth = Math.max(0.5, size * 0.18);
      x.lineCap = 'round';
      var spike = d/2.6;
      x.beginPath(); x.moveTo(center-spike, center); x.lineTo(center+spike, center); x.stroke();
      x.beginPath(); x.moveTo(center, center-spike); x.lineTo(center, center+spike); x.stroke();
    }
    starSprites[key] = c;
    return c;
  }
  function starColor(){
    var r = Math.random();
    if (r<0.55) return '210,230,255';      // 蓝白
    if (r<0.80) return '255,255,245';      // 暖白
    if (r<0.92) return '255,235,210';      // 淡黄
    return '200,190,255';                   // 淡紫
  }
  function buildStars(){
    stars = [];
    var count = state.starCount;
      var layers = [
      { name:'far',  pct:0.55, size:[0.35,0.85], base:[0.18,0.42], tw:[0.004,0.012], parallax:0.10, parallaxZ:0.0 },
      { name:'mid',  pct:0.32, size:[0.70,1.35], base:[0.48,0.72], tw:[0.010,0.022], parallax:0.30, parallaxZ:0.05 },
      { name:'near', pct:0.13, size:[1.15,2.10], base:[0.78,0.98], tw:[0.018,0.040], parallax:0.65, parallaxZ:0.12 }
    ];
    for (var i=0;i<count;i++){
      var layer = layers[Math.random()<0.55?0 : (Math.random()<0.73?1:2)];
      var x = rand(0,W), y = rand(0,H);
      var size = rand(layer.size[0], layer.size[1]);
      var col = starColor();
      var type = layer.name === 'near' ? 'near' : (layer.name==='mid' && Math.random()<0.15 ? 'near' : 'dim');
      stars.push({
        x:x, y:y, ox:x, oy:y,
        size:size, base:rand(layer.base[0], layer.base[1]),
        phase:rand(0, Math.PI*2), tw:rand(layer.tw[0], layer.tw[1]),
        parallax:layer.parallax, parallaxZ:layer.parallaxZ,
        color:col, type:type
      });
    }
  }
  function buildMilkyWay(){} // 已并入 buildNebula

  // ─────────────────────────────────────────────
  //  流星
  // ─────────────────────────────────────────────
  var meteors = [];
  var meteorTimer = 0, meteorNext = rand(90, 240);
  function spawnMeteor(){
    var side = Math.random();
    var x, y, ang;
    if (side < 0.5){
      x = rand(-W*0.1, W*0.45); y = rand(-H*0.1, H*0.3); ang = rand(0.55, 0.85);
    } else {
      x = rand(W*0.55, W*1.1); y = rand(-H*0.1, H*0.3); ang = rand(0.65, 1.15);
    }
    meteors.push({
      x:x, y:y, ang:ang,
      speed:rand(8,16), len:rand(180,420),
      life:0, max:rand(70,130), alpha:rand(0.8,1),
      bolide:Math.random()<0.15
    });
  }
  function drawMeteor(m){
    var t = m.life/m.max;
    var fade = (t<0.12?t/0.12:(t>0.65?(1-t)/0.35:1))*m.alpha;
    if (fade<=0) return;
    var tx = m.x - Math.cos(m.ang)*m.len;
    var ty = m.y - Math.sin(m.ang)*m.len;
    var grad = ctx.createLinearGradient(m.x,m.y,tx,ty);
    grad.addColorStop(0, 'rgba(255,255,255,'+fade.toFixed(3)+')');
    grad.addColorStop(0.3, 'rgba(200,230,255,'+(fade*0.7).toFixed(3)+')');
    grad.addColorStop(1, 'rgba(160,210,255,0)');
    ctx.strokeStyle = grad; ctx.lineWidth = m.bolide?2.4:1.4;
    ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(m.x,m.y); ctx.lineTo(tx,ty); ctx.stroke();
    // 头部亮核
    ctx.beginPath(); ctx.arc(m.x,m.y, m.bolide?2.6:1.5, 0, Math.PI*2);
    ctx.fillStyle = 'rgba(255,255,255,'+fade.toFixed(3)+')'; ctx.fill();
    if (m.bolide){
      ctx.globalAlpha = fade*0.5;
      ctx.beginPath(); ctx.arc(m.x,m.y,6,0,Math.PI*2);
      ctx.fillStyle = 'rgba(200,230,255,0.4)'; ctx.fill();
      ctx.globalAlpha = 1;
    }
  }

  // ─────────────────────────────────────────────
  //  鼠标视差
  // ─────────────────────────────────────────────
  var mx = 0, my = 0, targetMx = 0, targetMy = 0;
  window.addEventListener('mousemove', function(e){
    targetMx = (e.clientX - cx) / cx;
    targetMy = (e.clientY - cy) / cy;
  }, {passive:true});
  window.addEventListener('mouseleave', function(){ targetMx=0; targetMy=0; });

  // ─────────────────────────────────────────────
  //  主循环
  // ─────────────────────────────────────────────
  var rotation = 0;
  function draw(){
    ctx.clearRect(0,0,W,H);

    // 1. 画程序化星云
    if (state.nebulaOn && nebulaCanvas){
      ctx.globalAlpha = 0.28 + state.nebulaStrength*0.38;
      ctx.drawImage(nebulaCanvas,0,0);
      ctx.globalAlpha = 0.35 + state.nebulaStrength*0.28;
      ctx.drawImage(mwCanvas,0,0);
      ctx.globalAlpha = 1;
    }

    // 2. 视差插值
    mx += (targetMx - mx)*0.04;
    my += (targetMy - my)*0.04;

    // 3. 画星星
    rotation += 0.00003;
    for (var i=0;i<stars.length;i++){
      var s = stars[i];
      var tw = s.base * (0.5 + 0.5*Math.sin(s.phase));
      s.phase += s.tw;
      var px = s.ox - mx * s.parallax * 80 - Math.cos(rotation)*s.parallaxZ*W;
      var py = s.oy - my * s.parallax * 80 - Math.sin(rotation)*s.parallaxZ*H;
      // wrap around
      px = ((px % W) + W) % W; py = ((py % H) + H) % H;
      var alpha = clamp(tw, 0.08, 1);
      var sprite = makeStarSprite(s.size, s.color, s.type);
      ctx.globalAlpha = alpha;
      var drawSize = s.size * 10;
      ctx.drawImage(sprite, px-drawSize/2, py-drawSize/2, drawSize, drawSize);
      ctx.globalAlpha = 1;
    }

    // 4. 流星
    meteorTimer++;
    if (meteorTimer >= meteorNext){ meteorTimer=0; meteorNext=rand(60,190); spawnMeteor(); }
    for (var j=meteors.length-1;j>=0;j--){
      var m = meteors[j];
      m.life++; m.x += Math.cos(m.ang)*m.speed; m.y += Math.sin(m.ang)*m.speed;
      if (m.life>=m.max || m.x<-80 || m.y>H+80 || m.x>W+80){ meteors.splice(j,1); continue; }
      drawMeteor(m);
    }

    if (!state.reducedMotion) requestAnimationFrame(draw);
  }

  // ─────────────────────────────────────────────
  //  UI
  // ─────────────────────────────────────────────
  var btnNebula = document.getElementById('toggle-nebula');
  var rngStars = document.getElementById('star-range');
  var lblStars = document.getElementById('star-count');
  var rngNebula = document.getElementById('nebula-range');
  var lblNebula = document.getElementById('nebula-level');

  btnNebula.addEventListener('click', function(){
    state.nebulaOn = !state.nebulaOn;
    btnNebula.textContent = '星云: ' + (state.nebulaOn?'开':'关');
  });
  rngStars.addEventListener('input', function(){
    state.starCount = parseInt(this.value);
    lblStars.textContent = state.starCount;
  });
  rngStars.addEventListener('change', buildStars);
  rngNebula.addEventListener('input', function(){
    state.nebulaStrength = parseInt(this.value)/10;
    lblNebula.textContent = this.value;
  });

  // 启动
  state.starCount = 700;
  state.nebulaStrength = 0.5;
  resize();
  window.addEventListener('resize', resize);
  draw();
})();
