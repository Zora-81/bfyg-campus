import { AbsoluteFill, interpolate, useCurrentFrame, Easing } from 'remotion';
import { PageCam } from './PageCam';
import { COLORS, FONT, RADII } from '../theme';

const EASE = Easing.bezier(0.35, 0, 0.2, 1);
const SPRING = Easing.bezier(0.2, 1.25, 0.3, 1);
const PAGE_H = 1080;

// section boxes from settings-layout.json (CSS px)
const SECTIONS = [
  { name: '通知与消息', x: 1581, y: 247, w: 339, h: 84, color: COLORS.cyan },
  { name: '账户与隐私', x: 1581, y: 339, w: 339, h: 84, color: COLORS.accentLight },
  { name: '关于', x: 1581, y: 430, w: 339, h: 162, color: COLORS.green },
];

export const SceneSupport: React.FC = () => {
  const frame = useCurrentFrame();

  const secT = (i: number) => interpolate(frame, [30 + i * 22, 48 + i * 22], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: SPRING });
  const sideT = interpolate(frame, [20, 38], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: SPRING });

  return (
    <AbsoluteFill style={{ backgroundColor: COLORS.bgDeepest }}>
      <PageCam
        src="textures/live/settings-bg.png"
        pageH={PAGE_H}
        keys={[
          { frame: 0, cx: 1750, cy: 540, zoom: 0.62 },
          { frame: 40, cx: 1750, cy: 400, zoom: 1.3, rotX: 0, rotY: 8, rotZ: 0, persp: 1400 },
          { frame: 210, cx: 1750, cy: 440, zoom: 1.3, rotX: 0, rotY: 8, rotZ: 0, persp: 1400 },
        ]}
        ease={EASE}
      >
        {/* support callout card (left of panel) */}
        {sideT > 0.01 ? (
          <div
            style={{
              position: 'absolute',
              left: 1040,
              top: 300,
              width: 320,
              padding: '18px 22px',
              borderRadius: RADII.lg,
              background: COLORS.callout,
              border: `1px solid ${COLORS.borderLight}`,
              backdropFilter: 'blur(10px)',
              boxShadow: '0 18px 44px rgba(0,0,0,0.42)',
              opacity: sideT,
              transform: `translateX(${(1 - sideT) * -24}px)`,
              pointerEvents: 'none',
            }}
          >
            <div style={{ fontFamily: FONT, fontSize: 18, fontWeight: 800, color: COLORS.text }}>💬 技术支持</div>
            <div style={{ fontFamily: FONT, fontSize: 14, color: COLORS.textSec, marginTop: 10, lineHeight: 1.7 }}>遇到问题？查看常见问题，或联系管理员</div>
            <div style={{ fontFamily: FONT, fontSize: 15, fontWeight: 700, color: COLORS.accentLight, marginTop: 12 }}>admin@baofeng.campus</div>
          </div>
        ) : null}

        {/* section highlight boxes */}
        {SECTIONS.map((s, i) => {
          const tt = secT(i);
          return (
            <div
              key={i}
              style={{
                position: 'absolute',
                left: s.x - 4,
                top: s.y - 4,
                width: s.w + 8,
                height: s.h + 8,
                borderRadius: RADII.md,
                border: `2px solid ${s.color}`,
                background: `${s.color}14`,
                boxShadow: `0 0 22px ${s.color}55`,
                opacity: tt,
                transform: `scale(${0.96 + 0.04 * tt})`,
                pointerEvents: 'none',
              }}
            />
          );
        })}

        {/* about info callout */}
        {secT(2) > 0.01 ? (
          <div
            style={{
              position: 'absolute',
              left: 1596 - 2,
              top: 502 - 2,
              width: 309 + 4,
              height: 39 + 4,
              borderRadius: RADII.sm,
              border: `2px solid ${COLORS.amber}`,
              boxShadow: `0 0 20px ${COLORS.amber}55`,
              opacity: secT(2),
              transform: `scale(${0.96 + 0.04 * secT(2)})`,
              pointerEvents: 'none',
            }}
          />
        ) : null}
      </PageCam>
    </AbsoluteFill>
  );
};
