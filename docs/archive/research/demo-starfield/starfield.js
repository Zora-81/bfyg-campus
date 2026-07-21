// ============================================================
//  开源片段（原样套用）：UsmanDevCraft/grok-shooting-stars
//  GROK 风格 · MIT 开源 · 原生 Canvas 零依赖
//  仅做了两处「集成层」改造（不影响原算法手感）：
//   1) USE_NEBULA 开关：true 时画布透明，露出底层星云图；false 时填 #161618（原版）
//   2) 星数可由滑块实时调整（re-init）
// ============================================================

const canvas = document.getElementById("starfield");
const ctx = canvas.getContext("2d");

let stars = [];
let shootingStars = [];
let numStars = 360;
let animationId;
let USE_NEBULA = false; // false = 原版纯黑；true = 透明叠星云

// —— prefers-reduced-motion 守卫 ——
const REDUCED = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

function resizeCanvas() {
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;
  initStars();
}

// ↓↓↓ 以下为开源片段原算法（未改动逻辑）↓↓↓
function initStars() {
  stars = Array.from({ length: numStars }, () => ({
    angle: Math.random() * Math.PI * 2,
    radius: Math.random() * Math.sqrt(canvas.width ** 2 + canvas.height ** 2),
    speed: Math.random() * 0.0003 + 0.00015,
    size: Math.random() * 1.2 + 0.5,
  }));
}

function spawnShootingStar() {
  if (shootingStars.length === 0 && Math.random() < 0.01) {
    shootingStars.push({
      x: Math.random() * canvas.width * 0.5,
      y: Math.random() * canvas.height * 0.5,
      vx: 3 + Math.random() * 2,
      vy: 1 + Math.random() * 1.5,
      life: 80,
      initialLife: 80,
    });
  }
}

function animate() {
  const centerX = canvas.width;
  const centerY = canvas.height;

  // 原版：fillRect 纯色底；叠加星云：clearRect 透明
  if (USE_NEBULA) {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
  } else {
    ctx.fillStyle = "#161618";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  }

  // Stars orbiting
  stars.forEach((star, i) => {
    star.angle += star.speed;
    const x = centerX + star.radius * Math.cos(star.angle);
    const y = centerY + star.radius * Math.sin(star.angle);

    const flicker = 0.4 + Math.abs(Math.sin(Date.now() * 0.0015 + i)) * 0.5;

    ctx.beginPath();
    ctx.fillStyle = `rgba(255, 255, 255, ${flicker})`;
    ctx.arc(x, y, star.size, 0, Math.PI * 2);
    ctx.fill();
  });

  // Shooting stars
  spawnShootingStar();
  for (let i = shootingStars.length - 1; i >= 0; i--) {
    const s = shootingStars[i];
    const opacity = s.life / s.initialLife;

    const grad = ctx.createLinearGradient(
      s.x, s.y, s.x - s.vx * 35, s.y - s.vy * 35
    );
    grad.addColorStop(0, `rgba(255, 255, 255, ${opacity})`);
    grad.addColorStop(1, `rgba(255, 255, 255, 0)`);
    ctx.strokeStyle = grad;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(s.x, s.y);
    ctx.lineTo(s.x - s.vx * 18, s.y - s.vy * 18);
    ctx.stroke();

    s.x += s.vx;
    s.y += s.vy;
    s.life -= 1;

    if (s.life <= 0) shootingStars.splice(i, 1);
  }

  if (!REDUCED) animationId = requestAnimationFrame(animate);
}

// Init
window.addEventListener("resize", resizeCanvas);
resizeCanvas();
animate();

// —— 集成层：模式切换 + 密度 ——
const nebula = document.getElementById('nebula');
const btnBlack = document.getElementById('btnBlack');
const btnNebula = document.getElementById('btnNebula');
const slider = document.getElementById('density');
const cnt = document.getElementById('cnt');

btnBlack.onclick = () => {
  USE_NEBULA = false; nebula.style.display = 'none';
  btnBlack.classList.add('active'); btnNebula.classList.remove('active');
};
btnNebula.onclick = () => {
  USE_NEBULA = true; nebula.style.display = 'block';
  btnNebula.classList.add('active'); btnBlack.classList.remove('active');
};
slider.oninput = () => {
  numStars = parseInt(slider.value, 10);
  cnt.textContent = numStars;
  initStars();
};
