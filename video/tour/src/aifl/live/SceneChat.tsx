import { AbsoluteFill, interpolate, useCurrentFrame, Easing } from 'remotion';
import { PageCam } from './PageCam';
import { COLORS, FONT, RADII } from '../theme';

const EASE = Easing.bezier(0.35, 0, 0.2, 1);
const PAGE_H = 1080;

// seeded PRNG for deterministic particles
function mulberry32(seed: number) {
  return function () {
    let t = (seed += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rand = mulberry32(20260721_5);
const PARTICLES = Array.from({ length: 18 }, () => ({
  ang: rand() * Math.PI * 2,
  dist: 30 + rand() * 90,
  size: 4 + rand() * 8,
  hue: rand() > 0.5 ? 38 : 340, // amber / pink
}));

export const SceneChat: React.FC = () => {
  const frame = useCurrentFrame();

  // @ highlight
  const mentionT = interpolate(frame, [30, 44, 80, 95], [0, 1, 1, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: Easing.bezier(0.2, 1.25, 0.3, 1) });
  const mentionPulse = interpolate(frame, [44, 52, 60], [0, 1, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });

  // like particles
  const likeT = interpolate(frame, [110, 128, 170, 185], [0, 1, 1, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: Easing.bezier(0.2, 1.25, 0.3, 1) });

  // forward tooltip
  const fwdT = interpolate(frame, [250, 266, 310, 325], [0, 1, 1, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: Easing.bezier(0.2, 1.25, 0.3, 1) });

  return (
    <AbsoluteFill style={{ backgroundColor: COLORS.bgDeepest }}>
      <PageCam
        src="textures/live/main-ui.png"
        pageH={PAGE_H}
        keys={[
          { frame: 0, cx: 960, cy: 540, zoom: 0.62 },
          { frame: 40, cx: 840, cy: 340, zoom: 1.05, rotX: 0, rotY: 8, rotZ: 0, persp: 1400 },
          { frame: 180, cx: 900, cy: 520, zoom: 1.0, rotX: 0, rotY: 4, rotZ: 0, persp: 1400 },
          { frame: 320, cx: 820, cy: 430, zoom: 1.35, rotX: 0, rotY: 0, rotZ: 0, persp: 1400 },
          { frame: 390, cx: 940, cy: 520, zoom: 0.95, rotX: 0, rotY: 0, rotZ: 0, persp: 1400 },
        ]}
        ease={EASE}
      >
        {/* @ mention highlight */}
        {mentionT > 0.01 ? (
          <div
            style={{
              position: 'absolute',
              left: 620,
              top: 280,
              padding: '8px 14px',
              borderRadius: RADII.sm,
              background: 'rgba(240,178,50,0.18)',
              border: `1px solid ${COLORS.amber}`,
              boxShadow: `0 0 20px rgba(240,178,50,${0.35 + mentionPulse * 0.35})`,
              fontFamily: FONT,
              fontSize: 16,
              fontWeight: 700,
              color: COLORS.amber,
              opacity: mentionT,
              transform: `translateY(${(1 - mentionT) * 12}px) scale(${0.96 + 0.04 * mentionT})`,
              pointerEvents: 'none',
            }}
          >
            @小宇
          </div>
        ) : null}

        {/* like particles */}
        {likeT > 0.01 ? (
          <div style={{ position: 'absolute', left: 1180, top: 360, opacity: likeT, pointerEvents: 'none' }}>
            {PARTICLES.map((p, i) => {
              const pt = interpolate(frame, [128 + i * 1.5, 165 + i * 1.5], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
              const x = Math.cos(p.ang) * p.dist * pt;
              const y = Math.sin(p.ang) * p.dist * pt - 20 * pt * pt;
              return (
                <div
                  key={i}
                  style={{
                    position: 'absolute',
                    left: x,
                    top: y,
                    width: p.size,
                    height: p.size,
                    borderRadius: '50%',
                    background: `hsl(${p.hue}, 85%, 65%)`,
                    boxShadow: `0 0 10px hsl(${p.hue},85%,65%)`,
                    opacity: pt * (1 - pt * 0.5),
                  }}
                />
              );
            })}
          </div>
        ) : null}

        {/* forward tooltip */}
        {fwdT > 0.01 ? (
          <div
            style={{
              position: 'absolute',
              left: 980,
              top: 520,
              width: 160,
              padding: '12px 14px',
              borderRadius: RADII.md,
              background: 'rgba(35,36,40,0.92)',
              border: `1px solid ${COLORS.borderLight}`,
              backdropFilter: 'blur(10px)',
              boxShadow: `0 12px 36px rgba(0,0,0,0.4)`,
              opacity: fwdT,
              transform: `translateY(${(1 - fwdT) * 16}px)`,
              pointerEvents: 'none',
            }}
          >
            <div style={{ fontFamily: FONT, fontSize: 13, color: COLORS.textDim, marginBottom: 8 }}>转发到</div>
            <div style={{ fontFamily: FONT, fontSize: 15, color: COLORS.text, padding: '6px 0', borderBottom: `1px solid ${COLORS.border}` }}>站内频道</div>
            <div style={{ fontFamily: FONT, fontSize: 15, color: COLORS.text, padding: '6px 0' }}>站外链接</div>
          </div>
        ) : null}
      </PageCam>
    </AbsoluteFill>
  );
};
