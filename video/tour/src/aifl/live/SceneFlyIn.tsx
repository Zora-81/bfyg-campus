import { AbsoluteFill, interpolate, useCurrentFrame, Easing } from 'remotion';
import { COLORS, FONT, RADII } from '../theme';
import { CHANNELS } from '../content';

const CARD_W = 320;
const CARD_H = 180;
const GAP = 40;
const GRID_X0 = 960 - (3 * CARD_W + 2 * GAP) / 2;
const GRID_Y0 = 540 - (2 * CARD_H + GAP) / 2;

const positions = CHANNELS.map((_, i) => ({
  x: GRID_X0 + (i % 3) * (CARD_W + GAP),
  y: GRID_Y0 + Math.floor(i / 3) * (CARD_H + GAP),
}));

const PILE_X = 960 - CARD_W / 2;
const PILE_Y = 540 - CARD_H / 2;

const spring = Easing.bezier(0.2, 1.25, 0.3, 1);

export const SceneFlyIn: React.FC = () => {
  const frame = useCurrentFrame();

  return (
    <AbsoluteFill style={{ background: COLORS.bgDeepest, backgroundImage: `${COLORS.GLOW_PURPLE}, ${COLORS.GLOW_CYAN}, ${COLORS.GRADIENT_BG}`, backgroundSize: 'cover' }}>
      {CHANNELS.map((ch, i) => {
        const delay = i * 4;
        const inT = interpolate(frame, [10 + delay, 34 + delay], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: spring });
        const selectT = interpolate(frame, [130, 150], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: Easing.bezier(0.4, 0, 0.2, 1) });
        const pushT = interpolate(frame, [150, 190], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: Easing.bezier(0.35, 0, 0.2, 1) });

        const isSelected = i === 0;
        const target = positions[i];
        const startX = PILE_X + (i - 2.5) * 18;
        const startY = PILE_Y + (i % 2 ? 12 : -12);
        const startRot = (i - 2.5) * 3;

        const x = interpolate(inT, [0, 1], [startX, target.x], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: spring });
        const y = interpolate(inT, [0, 1], [startY, target.y], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: spring });
        const rot = interpolate(inT, [0, 1], [startRot, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: spring });

        const idleScale = isSelected ? 1 + selectT * 0.05 : 1 - selectT * 0.06;
        const pushScale = isSelected ? 1 + pushT * 1.8 : 1 - pushT * 0.35;
        const scale = idleScale * (1 - pushT) + pushScale * pushT;
        const opacity = isSelected ? 1 : 1 - pushT * 0.65;

        return (
          <div
            key={ch.name}
            style={{
              position: 'absolute',
              left: x,
              top: y,
              width: CARD_W,
              height: CARD_H,
              transform: `rotate(${rot}deg) scale(${scale})`,
              opacity,
              borderRadius: RADII.lg,
              background: 'rgba(35,36,40,0.82)',
              backdropFilter: 'blur(10px)',
              WebkitBackdropFilter: 'blur(10px)',
              border: `1px solid ${isSelected && selectT > 0.5 ? COLORS.amber : COLORS.borderLight}`,
              boxShadow: isSelected && selectT > 0.5 ? `0 0 40px rgba(240,178,50,0.25), 0 12px 36px rgba(0,0,0,0.4)` : `0 8px 24px rgba(0,0,0,0.32)`,
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'center',
              padding: '0 34px',
              pointerEvents: 'none',
            }}
          >
            <div style={{ fontSize: 46, lineHeight: 1, marginBottom: 16 }}>{ch.emoji}</div>
            <div style={{ fontFamily: FONT, fontSize: 28, fontWeight: 700, color: COLORS.text, letterSpacing: '0.02em' }}>{ch.name}</div>
            <div style={{ fontFamily: FONT, fontSize: 16, color: COLORS.textDim, marginTop: 8, letterSpacing: '0.04em' }}>{ch.desc}</div>
          </div>
        );
      })}
      {/* fake cursor click */}
      {frame >= 132 && frame <= 146 ? (() => {
        const cT = interpolate(frame, [132, 138, 146], [0, 1, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
        const target = positions[0];
        return (
          <div style={{ position: 'absolute', left: target.x + CARD_W - 28, top: target.y + CARD_H - 28, width: 24, height: 24, borderRadius: 12, background: 'rgba(255,255,255,0.85)', boxShadow: '0 0 14px rgba(255,255,255,0.6)', transform: `scale(${1 + (1 - cT) * 0.4})`, opacity: cT, pointerEvents: 'none' }} />
        );
      })() : null}
    </AbsoluteFill>
  );
};
