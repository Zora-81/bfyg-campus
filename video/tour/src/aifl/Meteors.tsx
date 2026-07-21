import React, { useEffect, useRef } from 'react';
import { useCurrentFrame } from 'remotion';
import { COLORS } from './theme';

// Deterministic seeded PRNG so every frame is reproducible.
function mulberry32(seed: number) {
  return function () {
    let t = (seed += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const METEORS = (() => {
  const rand = mulberry32(20260721);
  return Array.from({ length: 16 }, (_, i) => {
    const layer = i % 3;
    const speeds = [7, 10, 14];
    const lengths = [140, 220, 320];
    const start = Math.floor(rand() * 200);
    const duration = 24 + Math.floor(rand() * 22);
    return {
      start,
      duration,
      x0: rand() * 1920,
      y0: rand() * 500,
      vx: speeds[layer] + rand() * 3,
      vy: (speeds[layer] * 0.42) + rand() * 1.5,
      len: lengths[layer] + rand() * 80,
      width: 0.8 + layer * 0.5 + rand() * 0.6,
      hue: layer === 2 ? 38 : layer === 1 ? 185 : 260, // amber / cyan / purple
      sat: 70 + rand() * 30,
      light: 75 + rand() * 20,
    };
  });
})();

export const Meteors: React.FC<{ opacity?: number }> = ({ opacity = 1 }) => {
  const frame = useCurrentFrame();
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const c = ref.current;
    if (!c) return;
    const ctx = c.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, 1920, 1080);

    for (const m of METEORS) {
      const t = frame - m.start;
      if (t < 0 || t > m.duration) continue;
      const progress = t / m.duration;
      const x = m.x0 + m.vx * t;
      const y = m.y0 + m.vy * t;
      if (x > 2100 || y > 1200) continue;
      const tailX = x - (m.vx / Math.sqrt(m.vx * m.vx + m.vy * m.vy)) * m.len;
      const tailY = y - (m.vy / Math.sqrt(m.vx * m.vx + m.vy * m.vy)) * m.len;
      const fade = Math.sin(progress * Math.PI); // fade in/out
      const a = fade * (0.7 + 0.3 * Math.sin(progress * 8));

      const grad = ctx.createLinearGradient(tailX, tailY, x, y);
      grad.addColorStop(0, `hsla(${m.hue}, ${m.sat}%, ${m.light}%, 0)`);
      grad.addColorStop(0.65, `hsla(${m.hue}, ${m.sat}%, ${m.light}%, ${a * 0.55})`);
      grad.addColorStop(1, `hsla(${m.hue}, ${m.sat}%, ${m.light + 15}%, ${a})`);

      ctx.beginPath();
      ctx.moveTo(tailX, tailY);
      ctx.lineTo(x, y);
      ctx.strokeStyle = grad;
      ctx.lineWidth = m.width;
      ctx.lineCap = 'round';
      ctx.stroke();

      // tiny head glow
      ctx.beginPath();
      ctx.arc(x, y, m.width * 2, 0, Math.PI * 2);
      ctx.fillStyle = `hsla(${m.hue}, ${m.sat}%, ${m.light + 20}%, ${a * 0.9})`;
      ctx.fill();
    }
  }, [frame]);

  return (
    <canvas
      ref={ref}
      width={1920}
      height={1080}
      style={{
        position: 'absolute',
        inset: 0,
        width: 1920,
        height: 1080,
        opacity,
        pointerEvents: 'none',
        mixBlendMode: 'screen',
      }}
    />
  );
};
