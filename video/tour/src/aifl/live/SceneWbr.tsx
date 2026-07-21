import { AbsoluteFill, interpolate, useCurrentFrame, Easing } from 'remotion';
import { COLORS, FONT, RADII } from '../theme';
import { POSTS } from '../content';

const spring = Easing.bezier(0.2, 1.25, 0.3, 1);
const fullText = '今晚操场有流星雨，欢迎大家一起来看 ✨';
const charsPerFrame = 0.55;

export const SceneWbr: React.FC = () => {
  const frame = useCurrentFrame();
  const typedChars = Math.min(fullText.length, Math.max(0, Math.floor((frame - 10) * charsPerFrame)));
  const cursorOn = frame < 10 + fullText.length / charsPerFrame || ((Math.floor(frame / 2) % 2 === 0) && frame < 90);

  return (
    <AbsoluteFill style={{ background: COLORS.bgDeepest, backgroundImage: `${COLORS.GLOW_PURPLE}, ${COLORS.GLOW_CYAN}, ${COLORS.GRADIENT_BG}`, backgroundSize: 'cover', justifyContent: 'center', alignItems: 'center' }}>
      <div style={{ display: 'flex', gap: 28, alignItems: 'stretch' }}>
        {/* left rail: recent posts pop in */}
        <div
          style={{
            width: 340,
            borderRadius: RADII.lg,
            background: 'rgba(35,36,40,0.82)',
            border: `1px solid ${COLORS.borderLight}`,
            padding: 22,
            display: 'flex',
            flexDirection: 'column',
            gap: 12,
          }}
        >
          <div style={{ fontFamily: FONT, fontSize: 16, fontWeight: 700, color: COLORS.textSec, marginBottom: 6 }}>最新动态</div>
          {POSTS.slice(0, 4).map((p, i) => {
            const t = interpolate(frame, [50 + i * 8, 64 + i * 8], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: spring });
            return (
              <div key={i} style={{ opacity: t, transform: `translateX(${(1 - t) * -30}px)`, padding: '12px 14px', borderRadius: RADII.sm, background: COLORS.card, fontFamily: FONT, fontSize: 14, color: COLORS.textSec, lineHeight: 1.45 }}>
                <span style={{ color: COLORS.amber, fontWeight: 700, marginRight: 6 }}>#{p.tag}</span>
                {p.text}
              </div>
            );
          })}
          {/* skeleton placeholder before posts land */}
          {frame < 54 ? (() => {
            const skel = interpolate(frame, [0, 16], [1, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
            return (
              <div style={{ opacity: skel, display: 'flex', flexDirection: 'column', gap: 12, marginTop: 4 }}>
                {[0.7, 0.55, 0.8].map((w, i) => (
                  <div key={i} style={{ height: 14, width: `${w * 100}%`, borderRadius: 4, background: COLORS.elevated }} />
                ))}
              </div>
            );
          })() : null}
        </div>

        {/* composer */}
        <div
          style={{
            width: 640,
            borderRadius: RADII.lg,
            background: 'rgba(35,36,40,0.86)',
            border: `1px solid ${COLORS.borderLight}`,
            padding: 32,
            boxShadow: '0 24px 80px rgba(0,0,0,0.4)',
          }}
        >
          <div style={{ fontFamily: FONT, fontSize: 22, fontWeight: 700, color: COLORS.text, marginBottom: 20 }}>发布一条校园动态</div>
          <div
            style={{
              minHeight: 220,
              borderRadius: RADII.md,
              background: COLORS.bgDeepest,
              border: `1px solid ${COLORS.borderLight}`,
              padding: 22,
              fontFamily: FONT,
              fontSize: 22,
              color: COLORS.text,
              lineHeight: 1.6,
            }}
          >
            {fullText.slice(0, typedChars)}
            <span style={{ display: 'inline-block', width: 3, height: 28, background: COLORS.amber, verticalAlign: 'middle', marginLeft: 2, opacity: cursorOn ? 1 : 0 }} />
          </div>
          <div style={{ marginTop: 20, display: 'flex', justifyContent: 'flex-end' }}>
            <div style={{ padding: '12px 28px', borderRadius: RADII.md, background: COLORS.accent, fontFamily: FONT, fontSize: 16, fontWeight: 700, color: '#fff', boxShadow: `0 0 20px rgba(124,92,252,0.35)` }}>发布</div>
          </div>
        </div>
      </div>
    </AbsoluteFill>
  );
};
