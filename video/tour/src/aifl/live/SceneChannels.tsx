import { AbsoluteFill, interpolate, useCurrentFrame, Easing } from 'remotion';
import { PageCam } from './PageCam';
import { COLORS, FONT, RADII } from '../theme';

const EASE = Easing.bezier(0.35, 0, 0.2, 1);
const PAGE_H = 1080;

// channel item y positions from live-layout.json (CSS px, sidebar x≈6..253)
const CHANNEL_RECTS = [
  { y: 134, h: 42, name: '公告栏', desc: '官方发布' },
  { y: 215, h: 40, name: '综合大厅', desc: '全校都在聊' },
  { y: 256, h: 40, name: '学习园地', desc: '资料互助' },
  { y: 297, h: 40, name: '生活日常', desc: '随便唠' },
  { y: 338, h: 40, name: '二次元世界', desc: '兴趣同好' },
];

export const SceneChannels: React.FC = () => {
  const frame = useCurrentFrame();

  return (
    <AbsoluteFill style={{ backgroundColor: COLORS.bgDeepest }}>
      <PageCam
        src="textures/live/main-ui.png"
        pageH={PAGE_H}
        keys={[
          { frame: 0, cx: 960, cy: 540, zoom: 0.6 },
          { frame: 45, cx: 130, cy: 280, zoom: 1.35, rotX: 0, rotY: 18, rotZ: 0, persp: 1400 },
          { frame: 330, cx: 130, cy: 280, zoom: 1.35, rotX: 0, rotY: 18, rotZ: 0, persp: 1400 },
        ]}
        ease={EASE}
      >
        {CHANNEL_RECTS.map((ch, i) => {
          const t = interpolate(frame, [30 + i * 22, 44 + i * 22], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: Easing.bezier(0.2, 1.25, 0.3, 1) });
          const out = interpolate(frame, [300 - (5 - i) * 8, 320 - (5 - i) * 8], [1, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
          const op = t * out;
          return (
            <div
              key={i}
              style={{
                position: 'absolute',
                left: 6,
                top: ch.y - 4,
                width: 247,
                height: ch.h + 8,
                borderRadius: RADII.md,
                border: `2px solid ${COLORS.amber}`,
                background: 'rgba(240,178,50,0.10)',
                boxShadow: `0 0 24px rgba(240,178,50,0.25), inset 0 0 20px rgba(240,178,50,0.12)`,
                opacity: op,
                transform: `scale(${0.96 + 0.04 * t})`,
                transformOrigin: 'left center',
                pointerEvents: 'none',
              }}
            >
              <div
                style={{
                  position: 'absolute',
                  left: 260,
                  top: 4,
                  width: 180,
                  padding: '10px 14px',
                  borderRadius: RADII.sm,
                  background: COLORS.callout,
                  border: `1px solid ${COLORS.borderLight}`,
                  backdropFilter: 'blur(8px)',
                  opacity: t,
                  transform: `translateX(${(1 - t) * -12}px)`,
                }}
              >
                <div style={{ fontFamily: FONT, fontSize: 15, fontWeight: 700, color: COLORS.text }}>{ch.name}</div>
                <div style={{ fontFamily: FONT, fontSize: 12, color: COLORS.textSec, marginTop: 4 }}>{ch.desc}</div>
              </div>
            </div>
          );
        })}
      </PageCam>
    </AbsoluteFill>
  );
};
