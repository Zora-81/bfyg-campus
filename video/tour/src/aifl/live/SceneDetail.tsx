import { AbsoluteFill, interpolate, useCurrentFrame, Easing } from 'remotion';
import { COLORS, FONT, RADII } from '../theme';
import { CHAT } from '../content';

const PANEL_W = 760;
const PANEL_H = 760;

const peers = [
  { name: CHAT.peer, color: COLORS.pink },
  { name: CHAT.me, color: COLORS.blue },
];

const spring = Easing.bezier(0.2, 1.25, 0.3, 1);

export const SceneDetail: React.FC = () => {
  const frame = useCurrentFrame();

  const panelIn = interpolate(frame, [0, 12], [0.92, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: spring });

  return (
    <AbsoluteFill style={{ background: COLORS.bgDeepest, backgroundImage: `${COLORS.GLOW_PURPLE}, ${COLORS.GLOW_CYAN}, ${COLORS.GRADIENT_BG}`, backgroundSize: 'cover', justifyContent: 'center', alignItems: 'center' }}>
      <div
        style={{
          width: PANEL_W,
          height: PANEL_H,
          borderRadius: RADII.lg,
          background: 'rgba(35,36,40,0.86)',
          backdropFilter: 'blur(12px)',
          WebkitBackdropFilter: 'blur(12px)',
          border: `1px solid ${COLORS.borderLight}`,
          boxShadow: `0 24px 80px rgba(0,0,0,0.45)`,
          overflow: 'hidden',
          transform: `scale(${panelIn})`,
          display: 'flex',
          flexDirection: 'column',
        }}
      >
        <div style={{ padding: '22px 28px', borderBottom: `1px solid ${COLORS.border}`, display: 'flex', alignItems: 'center', gap: 14 }}>
          <span style={{ fontSize: 22 }}>#</span>
          <span style={{ fontFamily: FONT, fontSize: 20, fontWeight: 700, color: COLORS.text }}>综合大厅</span>
          <span style={{ marginLeft: 'auto', fontFamily: FONT, fontSize: 14, color: COLORS.green }}>● 128 人在线</span>
        </div>
        <div style={{ flex: 1, padding: '28px', display: 'flex', flexDirection: 'column', gap: 22, overflow: 'hidden' }}>
          {CHAT.messages.map((m, i) => {
            const isMe = m.who === 'me';
            const profile = isMe ? peers[1] : peers[0];
            const t = interpolate(frame, [12 + i * 8, 24 + i * 8], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: spring });
            return (
              <div key={i} style={{ display: 'flex', flexDirection: isMe ? 'row-reverse' : 'row', alignItems: 'flex-end', gap: 12, opacity: t, transform: `translateY(${(1 - t) * 20}px)` }}>
                <div style={{ width: 42, height: 42, borderRadius: 21, background: profile.color, display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: FONT, fontSize: 16, fontWeight: 700, color: '#fff', flexShrink: 0 }}>
                  {profile.name[0]}
                </div>
                <div style={{ maxWidth: '68%', display: 'flex', flexDirection: 'column', alignItems: isMe ? 'flex-end' : 'flex-start', gap: 4 }}>
                  <span style={{ fontFamily: FONT, fontSize: 13, color: COLORS.textDim }}>{profile.name}</span>
                  <div
                    style={{
                      padding: '12px 18px',
                      borderRadius: RADII.md,
                      background: isMe ? COLORS.accent : COLORS.elevated,
                      color: COLORS.text,
                      fontFamily: FONT,
                      fontSize: 17,
                      lineHeight: 1.5,
                      boxShadow: '0 4px 12px rgba(0,0,0,0.18)',
                    }}
                  >
                    {m.text}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
        <div style={{ padding: '16px 24px', borderTop: `1px solid ${COLORS.border}`, display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{ flex: 1, height: 44, borderRadius: RADII.md, background: COLORS.bgDeepest, border: `1px solid ${COLORS.borderLight}`, display: 'flex', alignItems: 'center', padding: '0 16px' }}>
            <span style={{ fontFamily: FONT, fontSize: 15, color: COLORS.textDim }}>输入消息...</span>
          </div>
          <div style={{ width: 44, height: 44, borderRadius: RADII.md, background: COLORS.accent, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18 }}>➤</div>
        </div>
      </div>
    </AbsoluteFill>
  );
};
