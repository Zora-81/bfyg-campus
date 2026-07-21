import { AbsoluteFill, Img, interpolate, staticFile, useCurrentFrame, Easing } from 'remotion';
import { COLORS, FONT, RADII } from '../theme';
import { BRAND, TAGLINE, CHANNELS } from '../content';
import { Meteors } from '../Meteors';

const spring = Easing.bezier(0.2, 1.3, 0.3, 1);
const slam = Easing.bezier(0.18, 1.4, 0.25, 1);

const ELEMENTS = [
  { type: 'badge', x: 200, y: 900, rot: -18, scale: 0.9 },
  { type: 'channel', x: 1700, y: 200, rot: 14, scale: 0.8 },
  { type: 'chat', x: 200, y: 120, rot: 12, scale: 0.85 },
  { type: 'post', x: 1650, y: 850, rot: -10, scale: 0.82 },
];

export const SceneOutroLive: React.FC = () => {
  const frame = useCurrentFrame();
  const assemble = interpolate(frame, [0, 55], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: spring });
  const slamT = interpolate(frame, [70, 88], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: slam });
  const tagT = interpolate(frame, [92, 104], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: Easing.bezier(0.3, 0, 0.2, 1) });
  const line = interpolate(frame, [96, 112], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: Easing.bezier(0.3, 0, 0.2, 1) });
  // all content stays visible through the end (brand hold = energy peak, R1 ≥1s)
  const rootFadeIn = interpolate(frame, [0, 18], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: Easing.bezier(0.4, 0, 0.6, 1) });

  return (
    <AbsoluteFill style={{ background: COLORS.bgDeepest, backgroundImage: `${COLORS.GLOW_PURPLE}, ${COLORS.GLOW_CYAN}, ${COLORS.GRADIENT_BG}`, backgroundSize: 'cover', opacity: rootFadeIn }}>
      <Meteors opacity={0.5} />
      {ELEMENTS.map((el, i) => {
        const cx = 960;
        const cy = 460;
        const tx = cx + (i % 2 ? 1 : -1) * (180 + i * 30);
        const ty = cy + (i < 2 ? -80 : 80);
        const x = interpolate(assemble, [0, 1], [el.x, tx], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: spring });
        const y = interpolate(assemble, [0, 1], [el.y, ty], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: spring });
        const rot = interpolate(assemble, [0, 1], [el.rot, (i - 1.5) * 5], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: spring });
        const sc = interpolate(assemble, [0, 1], [el.scale, 0.72], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: spring });
        const op = interpolate(assemble, [0, 0.4], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });

        const common = { position: 'absolute' as const, left: x, top: y, transform: `rotate(${rot}deg) scale(${sc})`, opacity: op, pointerEvents: 'none' as const };

        if (el.type === 'badge') {
          return (
            <div key={i} style={{ ...common, width: 160, height: 160, borderRadius: RADII.xl, overflow: 'hidden', border: `2px solid ${COLORS.borderLight}`, boxShadow: `0 16px 48px rgba(0,0,0,0.45)` }}>
              <Img src={staticFile('textures/live/badge.png')} style={{ width: '100%', height: '100%' }} />
            </div>
          );
        }
        if (el.type === 'channel') {
          return (
            <div key={i} style={{ ...common, width: 220, height: 130, borderRadius: RADII.md, background: 'rgba(43,45,49,0.9)', border: `1px solid ${COLORS.borderLight}`, padding: 18, display: 'flex', flexDirection: 'column', justifyContent: 'center', boxShadow: `0 12px 36px rgba(0,0,0,0.35)` }}>
              <div style={{ fontSize: 30, marginBottom: 8 }}>{CHANNELS[0].emoji}</div>
              <div style={{ fontFamily: FONT, fontSize: 18, fontWeight: 700, color: COLORS.text }}>{CHANNELS[0].name}</div>
            </div>
          );
        }
        if (el.type === 'chat') {
          return (
            <div key={i} style={{ ...common, width: 260, padding: '14px 18px', borderRadius: RADII.md, background: COLORS.accent, color: '#fff', fontFamily: FONT, fontSize: 15, lineHeight: 1.45, boxShadow: `0 8px 24px rgba(0,0,0,0.35)` }}>
              今晚操场有流星雨，谁一起去？
            </div>
          );
        }
        return (
          <div key={i} style={{ ...common, width: 240, padding: '14px 16px', borderRadius: RADII.md, background: 'rgba(43,45,49,0.9)', border: `1px solid ${COLORS.borderLight}`, fontFamily: FONT, fontSize: 14, color: COLORS.textSec, lineHeight: 1.45, boxShadow: `0 8px 24px rgba(0,0,0,0.35)` }}>
            <span style={{ color: COLORS.amber, fontWeight: 700, marginRight: 6 }}>#通知</span>
            下周一到校时间调整为 7:20
          </div>
        );
      })}

      <AbsoluteFill style={{ justifyContent: 'center', alignItems: 'center', pointerEvents: 'none' }}>
        <div style={{ textAlign: 'center', marginTop: 160 }}>
          <div style={{ fontFamily: FONT, fontSize: 116, fontWeight: 800, color: COLORS.text, letterSpacing: '-0.01em', transform: `scale(${1.35 - 0.35 * slamT})`, opacity: slamT, textShadow: `0 0 60px rgba(124,92,252,0.35)` }}>
            {BRAND}
          </div>
          <div style={{ width: 260, height: 5, background: `linear-gradient(90deg, ${COLORS.accent}, ${COLORS.amber})`, margin: '28px auto 0', borderRadius: 3, transform: `scaleX(${line})`, boxShadow: `0 0 24px ${COLORS.accent}` }} />
          <div style={{ fontFamily: FONT, fontSize: 26, color: COLORS.textSec, letterSpacing: '0.14em', marginTop: 24, opacity: tagT }}>{TAGLINE}</div>
        </div>
      </AbsoluteFill>
    </AbsoluteFill>
  );
};
