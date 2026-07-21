import { AbsoluteFill, interpolate, useCurrentFrame, Easing } from 'remotion';
import { COLORS, FONT, RADII } from '../theme';
import { POSTS, HOT_TOPICS } from '../content';

const EASE = Easing.bezier(0.35, 0, 0.2, 1);
const SPRING = Easing.bezier(0.2, 1.25, 0.3, 1);

// tag → accent color
const TAG_COLOR: Record<string, string> = {
  通知: '#ed4245',
  社团: '#7c5cfc',
  教务: '#00b4d8',
  活动: '#f0b232',
  生活: '#23a559',
  公告: '#ed4245',
  资源: '#5865f2',
};

const FEED_X = 150;
const FEED_W = 880;
const CARD_H = 116;
const GAP = 18;
const TOTAL = POSTS.length;

export const SceneFeed: React.FC = () => {
  const frame = useCurrentFrame();

  // column scroll: hold ~120f, then slow upward drift
  const scroll = interpolate(frame, [120, 270], [0, 220], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: EASE });

  return (
    <AbsoluteFill style={{ backgroundColor: COLORS.bgDeepest }}>
      {/* ambient glow */}
      <div style={{ position: 'absolute', inset: 0, background: COLORS.GLOW_PURPLE, opacity: 0.5 }} />

      {/* section titles */}
      <div style={{ position: 'absolute', left: FEED_X, top: 64, fontFamily: FONT, fontSize: 30, fontWeight: 800, color: COLORS.text, opacity: interpolate(frame, [0, 18], [0, 1], { extrapolateRight: 'clamp' }) }}>
        校园动态
      </div>
      <div style={{ position: 'absolute', left: 1140, top: 64, fontFamily: FONT, fontSize: 30, fontWeight: 800, color: COLORS.text, opacity: interpolate(frame, [0, 18], [0, 1], { extrapolateRight: 'clamp' }) }}>
        热门话题
      </div>

      {/* LEFT: feed column */}
      <div style={{ position: 'absolute', left: FEED_X, top: 120, width: FEED_W }}>
        {POSTS.map((p, i) => {
          const enter = interpolate(frame, [10 + i * 14, 26 + i * 14], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: SPRING });
          const top = i * (CARD_H + GAP) - scroll;
          const c = TAG_COLOR[p.tag] || COLORS.accent;
          return (
            <div
              key={i}
              style={{
                position: 'absolute',
                left: 0,
                top,
                width: FEED_W,
                height: CARD_H,
                borderRadius: RADII.lg,
                background: COLORS.cardDeep,
                border: `1px solid ${COLORS.borderLight}`,
                backdropFilter: 'blur(12px)',
                WebkitBackdropFilter: 'blur(12px)',
                boxShadow: '0 18px 44px rgba(0,0,0,0.32)',
                opacity: enter,
                transform: `translateX(${(1 - enter) * -40}px)`,
                display: 'flex',
                alignItems: 'center',
                padding: '0 22px',
                gap: 18,
                pointerEvents: 'none',
              }}
            >
              <div
                style={{
                  flex: '0 0 auto',
                  padding: '7px 14px',
                  borderRadius: RADII.sm,
                  background: `${c}22`,
                  border: `1px solid ${c}`,
                  fontFamily: FONT,
                  fontSize: 14,
                  fontWeight: 700,
                  color: c,
                }}
              >
                {p.tag}
              </div>
              <div style={{ fontFamily: FONT, fontSize: 19, color: COLORS.text, lineHeight: 1.4, fontWeight: 500 }}>{p.text}</div>
            </div>
          );
        })}
      </div>

      {/* RIGHT: hot topics */}
      <div style={{ position: 'absolute', left: 1140, top: 120, width: 620 }}>
        {HOT_TOPICS.map((t, i) => {
          const enter = interpolate(frame, [20 + i * 18, 40 + i * 18], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: SPRING });
          const heatW = interpolate(frame, [34 + i * 18, 80 + i * 18], [0, t.heat], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: EASE });
          const c = i === 0 ? COLORS.amber : i === 1 ? COLORS.pink : i === 2 ? COLORS.accentLight : COLORS.cyan;
          return (
            <div
              key={i}
              style={{
                position: 'absolute',
                left: 0,
                top: i * 132,
                width: 620,
                height: 116,
                borderRadius: RADII.lg,
                background: 'rgba(30,32,48,0.55)', // 略透的深玻璃卡
                border: `1px solid ${COLORS.borderLight}`,
                backdropFilter: 'blur(12px)',
                WebkitBackdropFilter: 'blur(12px)',
                boxShadow: '0 18px 44px rgba(0,0,0,0.30)',
                opacity: enter,
                transform: `translateX(${(1 - enter) * 40}px)`,
                padding: '18px 22px',
                pointerEvents: 'none',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
                <div
                  style={{
                    flex: '0 0 auto',
                    width: 44,
                    height: 44,
                    borderRadius: RADII.md,
                    background: `${c}26`,
                    border: `1px solid ${c}`,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontFamily: FONT,
                    fontSize: 22,
                    fontWeight: 800,
                    color: c,
                  }}
                >
                  {t.rank}
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontFamily: FONT, fontSize: 19, fontWeight: 700, color: COLORS.text }}>{t.text}</div>
                  <div style={{ fontFamily: FONT, fontSize: 13, color: COLORS.textDim, marginTop: 4 }}>{t.tag} · 热度 {t.heat}</div>
                </div>
              </div>
              <div style={{ position: 'absolute', left: 22, right: 22, bottom: 16, height: 6, borderRadius: 3, background: 'rgba(255,255,255,0.08)' }}>
                <div style={{ width: `${heatW}%`, height: 6, borderRadius: 3, background: `linear-gradient(90deg, ${c}, ${c}aa)`, boxShadow: `0 0 12px ${c}88` }} />
              </div>
            </div>
          );
        })}
      </div>
    </AbsoluteFill>
  );
};
