import { AbsoluteFill, interpolate, useCurrentFrame, Easing } from 'remotion';
import { COLORS, FONT, RADII } from '../theme';
import { POSTS } from '../content';

const spring = Easing.bezier(0.25, 1.2, 0.3, 1);

const tagColors: Record<string, string> = {
  通知: COLORS.red,
  社团: COLORS.amber,
  教务: COLORS.blue,
  活动: COLORS.pink,
  生活: COLORS.green,
};

export const ScenePapers: React.FC = () => {
  const frame = useCurrentFrame();
  const counter = Math.min(POSTS.length, Math.max(0, Math.floor((frame - 20) / 14)));

  return (
    <AbsoluteFill style={{ background: COLORS.bgDeepest, backgroundImage: `${COLORS.GLOW_PURPLE}, ${COLORS.GLOW_CYAN}, ${COLORS.GRADIENT_BG}`, backgroundSize: 'cover', justifyContent: 'center', alignItems: 'center' }}>
      <div style={{ width: 720 }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 18, marginBottom: 34 }}>
          <span style={{ fontFamily: FONT, fontSize: 34, fontWeight: 700, color: COLORS.text }}>校园动态</span>
          <span style={{ fontFamily: FONT, fontSize: 20, color: COLORS.textDim }}>{counter} 条更新</span>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          {POSTS.map((p, i) => {
            const t = interpolate(frame, [10 + i * 12, 26 + i * 12], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: spring });
            return (
              <div
                key={i}
                style={{
                  opacity: t,
                  transform: `translateY(${(1 - t) * 40}px) scale(${0.96 + 0.04 * t})`,
                  padding: '18px 22px',
                  borderRadius: RADII.md,
                  background: 'rgba(43,45,49,0.88)',
                  border: `1px solid ${COLORS.borderLight}`,
                  boxShadow: '0 6px 20px rgba(0,0,0,0.28)',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 16,
                }}
              >
                <span
                  style={{
                    fontFamily: FONT,
                    fontSize: 13,
                    fontWeight: 700,
                    color: '#fff',
                    background: tagColors[p.tag] || COLORS.accent,
                    padding: '4px 10px',
                    borderRadius: RADII.xs,
                    letterSpacing: '0.04em',
                  }}
                >
                  {p.tag}
                </span>
                <span style={{ fontFamily: FONT, fontSize: 18, color: COLORS.text, lineHeight: 1.45 }}>{p.text}</span>
              </div>
            );
          })}
        </div>
      </div>
    </AbsoluteFill>
  );
};
