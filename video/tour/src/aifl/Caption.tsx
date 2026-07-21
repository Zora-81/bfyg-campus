import { interpolate, useCurrentFrame } from 'remotion';
import { COLORS, FONT, RADII } from './theme';

export const Caption: React.FC<{ text: string; duration: number; bottom?: number }> = ({
  text,
  duration,
  bottom = 72,
}) => {
  const frame = useCurrentFrame();
  const inT = interpolate(frame, [0, 8], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  const outT = interpolate(frame, [duration - 8, duration], [1, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });

  return (
    <div
      style={{
        position: 'absolute',
        left: 0,
        right: 0,
        bottom,
        display: 'flex',
        justifyContent: 'center',
        pointerEvents: 'none',
        opacity: inT * outT,
        transform: `translateY(${(1 - inT) * 8}px)`,
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 12,
          fontFamily: FONT,
          fontSize: 22,
          fontWeight: 500,
          letterSpacing: '0.08em',
          color: COLORS.textSec,
          background: 'rgba(17,18,31,0.72)',
          backdropFilter: 'blur(8px)',
          WebkitBackdropFilter: 'blur(8px)',
          border: `1px solid ${COLORS.borderLight}`,
          borderRadius: RADII.md,
          padding: '10px 22px',
          boxShadow: `0 8px 24px ${COLORS.shadow}`,
        }}
      >
        <span style={{ width: 7, height: 7, background: COLORS.amber, borderRadius: 2, boxShadow: `0 0 10px ${COLORS.amber}` }} />
        <span>{text}</span>
      </div>
    </div>
  );
};
