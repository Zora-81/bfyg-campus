(function(){
  'use strict';

  var canvas = document.getElementById('gl-canvas');
  var gl = canvas.getContext('webgl') || canvas.getContext('experimental-webgl');
  if (!gl) { document.body.innerHTML = '<div style="color:#fff;padding:20px">您的浏览器不支持 WebGL</div>'; return; }

  var W, H, cx, cy, scale;
  function resize(){
    W = canvas.width = window.innerWidth * window.devicePixelRatio;
    H = canvas.height = window.innerHeight * window.devicePixelRatio;
    canvas.style.width = window.innerWidth + 'px';
    canvas.style.height = window.innerHeight + 'px';
    cx = W/2; cy = H/2;
    scale = Math.max(W, H);
    gl.viewport(0,0,W,H);
  }
  resize();
  window.addEventListener('resize', resize);

  var vsSrc = `
    attribute vec2 a_pos;
    attribute vec3 a_col;
    attribute float a_size;
    attribute float a_alpha;
    uniform vec2 u_resolution;
    uniform float u_time;
    uniform vec2 u_mouse;
    uniform bool u_rotate;
    varying vec3 v_col;
    varying float v_alpha;
    void main(){
      v_col = a_col;
      v_alpha = a_alpha;
      vec2 p = a_pos;
      if (u_rotate){
        // 自转改为非常缓慢的摇摆，不会跑出屏幕
        float angle = sin(u_time * 0.06) * 0.04;
        float c = cos(angle);
        float s = sin(angle);
        p = vec2(p.x*c - p.y*s, p.x*s + p.y*c);
      }
      p += u_mouse * 0.04;
      vec2 clip = (p / u_resolution) * 2.0 - 1.0;
      gl_Position = vec4(clip * vec2(1.0, -1.0), 0.0, 1.0);
      gl_PointSize = a_size;
    }
  `;
  var fsSrc = `
    precision mediump float;
    varying vec3 v_col;
    varying float v_alpha;
    void main(){
      vec2 c = gl_PointCoord - vec2(0.5);
      float d = length(c);
      if (d > 0.5) discard;
      float a = smoothstep(0.5, 0.20, d) * 0.92 + smoothstep(0.20, 0.0, d) * 0.08;
      gl_FragColor = vec4(v_col, v_alpha * a);
    }
  `;

  function createShader(type, src){
    var s = gl.createShader(type);
    gl.shaderSource(s, src); gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)){
      console.error(gl.getShaderInfoLog(s)); return null;
    }
    return s;
  }
  var vs = createShader(gl.VERTEX_SHADER, vsSrc);
  var fs = createShader(gl.FRAGMENT_SHADER, fsSrc);
  var prog = gl.createProgram();
  gl.attachShader(prog, vs); gl.attachShader(prog, fs); gl.linkProgram(prog);
  gl.useProgram(prog);

  var loc_pos = gl.getAttribLocation(prog, 'a_pos');
  var loc_col = gl.getAttribLocation(prog, 'a_col');
  var loc_size = gl.getAttribLocation(prog, 'a_size');
  var loc_alpha = gl.getAttribLocation(prog, 'a_alpha');
  var loc_res = gl.getUniformLocation(prog, 'u_resolution');
  var loc_time = gl.getUniformLocation(prog, 'u_time');
  var loc_mouse = gl.getUniformLocation(prog, 'u_mouse');
  var loc_rotate = gl.getUniformLocation(prog, 'u_rotate');

  function rand(a,b){ return a + Math.random()*(b-a); }
  function clamp(v,a,b){ return Math.max(a, Math.min(b, v)); }

  // 3-4 条松散旋臂的密度调制
  function armDensity(r, theta, arms){
    if (!arms) return 1.0;
    var armCount = 4;
    var twist = 0.55; // 旋臂扭转率
    var phase = theta - r * twist;
    var mod = Math.cos(phase * armCount) * 0.5 + 0.5; // 0~1
    // 越靠近中心越模糊，散成核球
    var fuzz = clamp(0.4 + r * 0.25, 0.0, 1.0);
    return 0.35 + 0.65 * Math.pow(mod, 1.8 + r * 0.6) * fuzz;
  }

  function buildGalaxy(count, arms){
    var positions = new Float32Array(count*2);
    var colors = new Float32Array(count*3);
    var sizes = new Float32Array(count);
    var alphas = new Float32Array(count);

    var maxR = scale * 0.82; // 光带半径稍大，铺满屏幕
    var bulgeR = scale * 0.35; // 核球半径大但密度低

    for (var i=0;i<count;i++){
      var x, y, r, theta, region;
      var t = Math.random();

      if (t < 0.62){
        // ─── 银河盘 / 星河 ─── 沿宽带密集分布，形成明显一条河
        region = 'disk';
        r = Math.sqrt(Math.random()) * maxR;
        theta = Math.random() * Math.PI * 2;

        // 银纬压缩：窄而清晰的星河
        var lat = rand(-1,1) * (0.12 + r * 0.0008);
        var armD = armDensity(r / scale, theta, arms);
        if (Math.random() > armD * 0.72) {
          lat *= 1.5;
        }

        // 投影：压扁成星河带
        var diskR = r * (0.97 + Math.random()*0.06);
        var dx = Math.cos(theta) * diskR;
        var dy = Math.sin(theta) * diskR * 0.34;

        // 整体倾斜约 24°，银河横跨屏幕
        var tilt = 0.42;
        x = cx + dx * Math.cos(tilt) - dy * Math.sin(tilt);
        y = cy + dx * Math.sin(tilt) + dy * Math.cos(tilt);
      } else if (t < 0.72){
        // ─── 核球 ─── 弥散，不是特别亮的小点
        region = 'bulge';
        r = Math.pow(Math.random(), 0.5) * bulgeR;
        theta = Math.random() * Math.PI * 2;
        x = cx + Math.cos(theta) * r * 1.0;
        y = cy + Math.sin(theta) * r * 0.60;
      } else {
        // ─── 散星 / 银晕 ─── 铺满屏幕，但避让星河带避免稀释
        region = 'halo';
        x = rand(0, W);
        y = rand(0, H);
        var distFromPlane = Math.abs(((y - cy) * Math.cos(0.42) - (x - cx) * Math.sin(0.42)) / (H * 0.18));
        if (distFromPlane < 1.0 && Math.random() < 0.6) {
          x = rand(0, W);
          y = rand(0, H);
        }
      }

      var dist = Math.hypot(x-cx, y-cy);
      var norm = dist / scale;

      // ─── 亮星层：少量大尺寸高亮星，多在星河带上 ───
      var bright = (region === 'disk') ? (Math.random() < 0.055) : (Math.random() < 0.018);

      var col;
      if (bright){
        var br = Math.random();
        if (br < 0.6) col = [0.88, 0.94, 1.0];       // 蓝白亮星
        else if (br < 0.85) col = [1.0, 0.97, 0.90]; // 暖白
        else col = [1.0, 0.78, 0.68];                // 红巨星
      } else {
        col = pickColor(region, norm);
      }
      positions[i*2] = x; positions[i*2+1] = y;
      colors[i*3] = col[0]; colors[i*3+1] = col[1]; colors[i*3+2] = col[2];

      var size;
      if (bright) size = rand(3.5, 8.0);
      else if (region === 'bulge') size = rand(0.9, 1.7);
      else if (region === 'disk') size = rand(1.0, 2.2);
      else size = rand(0.7, 1.5);
      sizes[i] = size;

      // 透明度
      var alpha;
      if (bright) alpha = rand(0.85, 1.0);
      else if (region === 'bulge') alpha = rand(0.45, 0.72) * clamp(1.0 - norm * 0.35, 0.45, 1.0);
      else if (region === 'disk') alpha = rand(0.50, 0.82) * (0.55 + 0.45 * armDensity(dist / scale, Math.atan2(y-cy, x-cx), arms));
      else alpha = rand(0.30, 0.60) * clamp(1.0 - norm * 0.25, 0.35, 1.0);
      alpha *= 0.95;
      alphas[i] = alpha;
    }
    return {positions, colors, sizes, alphas};
  }

  function pickColor(region, norm){
    var r = Math.random();
    var base;
    if (region === 'bulge'){
      // 核球偏暖，黄白、淡橙、淡红
      if (r < 0.35) base = [1.0, 0.95, 0.80];
      else if (r < 0.60) base = [1.0, 0.88, 0.72];
      else if (r < 0.85) base = [0.95, 0.85, 0.75];
      else base = [0.90, 0.80, 0.95]; // 少量红巨星
    } else if (region === 'disk'){
      // 银河盘蓝白、暖白为主
      if (r < 0.45) base = [0.78, 0.88, 1.0];
      else if (r < 0.70) base = [1.0, 0.97, 0.88];
      else if (r < 0.85) base = [0.92, 0.85, 1.0];
      else base = [0.70, 0.95, 1.0];
    } else {
      // 银晕偏蓝
      if (r < 0.55) base = [0.72, 0.85, 1.0];
      else if (r < 0.80) base = [0.88, 0.92, 1.0];
      else base = [0.65, 0.80, 1.0];
    }
    // 随机色温抖动
    var jitter = 1.0 + rand(-0.08, 0.08);
    return [clamp(base[0]*jitter,0,1), clamp(base[1]*jitter,0,1), clamp(base[2]*jitter,0,1)];
  }

  var bufPos = gl.createBuffer(), bufCol = gl.createBuffer(), bufSize = gl.createBuffer(), bufAlpha = gl.createBuffer();
  var currentData;
  function upload(data){
    currentData = data;
    gl.bindBuffer(gl.ARRAY_BUFFER, bufPos);
    gl.bufferData(gl.ARRAY_BUFFER, data.positions, gl.STATIC_DRAW);
    gl.enableVertexAttribArray(loc_pos); gl.vertexAttribPointer(loc_pos, 2, gl.FLOAT, false, 0, 0);

    gl.bindBuffer(gl.ARRAY_BUFFER, bufCol);
    gl.bufferData(gl.ARRAY_BUFFER, data.colors, gl.STATIC_DRAW);
    gl.enableVertexAttribArray(loc_col); gl.vertexAttribPointer(loc_col, 3, gl.FLOAT, false, 0, 0);

    gl.bindBuffer(gl.ARRAY_BUFFER, bufSize);
    gl.bufferData(gl.ARRAY_BUFFER, data.sizes, gl.STATIC_DRAW);
    gl.enableVertexAttribArray(loc_size); gl.vertexAttribPointer(loc_size, 1, gl.FLOAT, false, 0, 0);

    gl.bindBuffer(gl.ARRAY_BUFFER, bufAlpha);
    gl.bufferData(gl.ARRAY_BUFFER, data.alphas, gl.STATIC_DRAW);
    gl.enableVertexAttribArray(loc_alpha); gl.vertexAttribPointer(loc_alpha, 1, gl.FLOAT, false, 0, 0);
  }

  var state = { count: 25000, arms: true, rotate: true };
  upload(buildGalaxy(state.count, state.arms));

  var mouseX=0, mouseY=0, targetMX=0, targetMY=0;
  window.addEventListener('mousemove', function(e){
    targetMX = (e.clientX - window.innerWidth/2) / (window.innerWidth/2);
    targetMY = (e.clientY - window.innerHeight/2) / (window.innerHeight/2);
  }, {passive:true});

  gl.enable(gl.BLEND);
  gl.blendFunc(gl.SRC_ALPHA, gl.ONE);

  var lblCount = document.getElementById('pt-count');
  document.getElementById('count-range').addEventListener('input', function(){
    state.count = parseInt(this.value); lblCount.textContent = state.count;
    upload(buildGalaxy(state.count, state.arms));
  });
  document.getElementById('arm-chk').addEventListener('change', function(){
    state.arms = this.checked; upload(buildGalaxy(state.count, state.arms));
  });
  document.getElementById('rotate-chk').addEventListener('change', function(){
    state.rotate = this.checked;
  });

  var start = performance.now();
  function loop(){
    var t = (performance.now() - start) / 1000;
    mouseX += (targetMX - mouseX) * 0.04;
    mouseY += (targetMY - mouseY) * 0.04;

    gl.clearColor(0.006, 0.008, 0.018, 1.0);
    gl.clear(gl.COLOR_BUFFER_BIT);

    gl.uniform2f(loc_res, W, H);
    gl.uniform1f(loc_time, t);
    gl.uniform2f(loc_mouse, mouseX, mouseY);
    gl.uniform1i(loc_rotate, state.rotate ? 1 : 0);

    gl.drawArrays(gl.POINTS, 0, state.count);
    requestAnimationFrame(loop);
  }
  loop();
})();
