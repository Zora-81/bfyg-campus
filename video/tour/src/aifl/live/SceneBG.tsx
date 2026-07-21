import { AbsoluteFill, interpolate, useCurrentFrame, Easing } from 'remotion';
import { PageCam } from './PageCam';
import { COLORS, FONT, RADII } from '../theme';

const EASE = Easing.bezier(0.35, 0, 0.2, 1);
const SPRING = Easing.bezier(0.2, 1.25, 0.3, 1);
const PAGE_H = 1080;

// bg-theme buttons from settings-layout.json (CSS px)
const THEMES = [
  { name: '星空', cx: 1631, cy: 133 },
  { name: '白昼极简', cx: 1711, cy: 133 },
  { name: '自然森绿', cx: 1790, cy: 133 },
  { name: '我的壁纸', cx: 1870, cy: 133 },
];

export const SceneBG: React.FC = () => {
  const frame = useCurrentFrame();

  // establishing → push into appearance section
  // theme highlight boxes (staggered)
  const themeT = (i: number) => interpolate(frame, [50 + i * 16, 66 + i * 16], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: SPRING });

  // switch sweep: highlight moves across themes 星空→白昼极简→自然森绿
  const sweepT = interpolate(frame, [160, 250], [0, 2], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: EASE });
  const sweepIdx = Math.round(sweepT);
  const sweepX = THEMES[Math.min(sweepIdx, THEMES.length - 1)].cx;
  const sweepOpacity = interpolate(frame, [155, 168, 248, 260], [0, 1, 1, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });

  // reset button callout
  const resetT = interpolate(frame, [270, 290], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: SPRING });

  // side label card
  const sideT = interpolate(frame, [30, 48], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: SPRING });

  return (
    <AbsoluteFill style={{ backgroundColor: COLORS.bgDeepest }}>
      <PageCam
        src="textures/live/settings-bg.png"
        pageH={PAGE_H}
        keys={[
          { frame: 0, cx: 1750, cy: 540, zoom: 0.62 },
          { frame: 45, cx: 1750, cy: 165, zoom: 1.35, rotX: 0, rotY: 8, rotZ: 0, persp: 1400 },
          { frame: 330, cx: 1750, cy: 200, zoom: 1.35, rotX: 0, rotY: 8, rotZ: 0, persp: 1400 },
        ]}
        ease={EASE}
      >
        {/* side label card (page-space, left of panel) */}
        {sideT > 0.01 ? (
          <div
            style={{
              position: 'absolute',
              left: 1080,
              top: 96,
              width: 280,
              padding: '16px 20px',
              borderRadius: RADII.lg,
              background: COLORS.callout,
              border: `1px solid ${COLORS.borderLight}`,
              backdropFilter: 'blur(10px)',
              boxShadow: '0 18px 44px rgba(0,0,0,0.4)',
              opacity: sideT,
              transform: `translateX(${(1 - sideT) * -24}px)`,
              pointerEvents: 'none',
            }}
          >
            <div style={{ fontFamily: FONT, fontSize: 18, fontWeight: 800, color: COLORS.text }}>🎨 外观与主题</div>
            <div style={{ fontFamily: FONT, fontSize: 14, color: COLORS.textSec, marginTop: 8, lineHeight: 1.6 }}>星空 / 极简 / 森绿 / 自定义壁纸，一键切换，模糊暗角随心调。</div>
          </div>
        ) : null}

        {/* per-theme highlight boxes */}
        {THEMES.map((t, i) => {
          const tt = themeT(i);
          return (
            <div
              key={i}
              style={{
                position: 'absolute',
                left: t.cx - 35,
                top: t.cy - 46,
                width: 70,
                height: 92,
                borderRadius: RADII.md,
                border: `2px solid ${COLORS.amber}`,
                background: 'rgba(240,178,50,0.10)',
                boxShadow: `0 0 22px rgba(240,178,50,0.30), inset 0 0 16px rgba(240,178,50,0.12)`,
                opacity: tt,
                transform: `scale(${0.94 + 0.06 * tt})`,
                pointerEvents: 'none',
              }}
            />
          );
        })}

        {/* switch sweep highlight */}
        {sweepOpacity > 0.01 ? (
          <div
            style={{
              position: 'absolute',
              left: sweepX - 40,
              top: 133 - 52,
              width: 80,
              height: 104,
              borderRadius: RADII.md,
              border: `3px solid ${COLORS.accentLight}`,
              boxShadow: `0 0 30px ${COLORS.accent}, inset 0 0 20px ${COLORS.accent}66`,
              opacity: sweepOpacity,
              transform: `scale(${0.92 + 0.08 * sweepOpacity})`,
              pointerEvents: 'none',
            }}
          />
        ) : null}

        {/* reset button callout */}
        {resetT > 0.01 ? (
          <div
            style={{
              position: 'absolute',
              left: 1596 - 4,
              top: 189 - 4,
              width: 309 + 8,
              height: 37 + 8,
              borderRadius: RADII.sm,
              border: `2px solid ${COLORS.cyan}`,
              boxShadow: `0 0 22px ${COLORS.cyan}66`,
              opacity: resetT,
              transform: `scale(${0.96 + 0.04 * resetT})`,
              pointerEvents: 'none',
            }}
          />
        ) : null}
      </PageCam>
    </AbsoluteFill>
  );
};
