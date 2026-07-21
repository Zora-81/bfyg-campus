import { AbsoluteFill, interpolate, useCurrentFrame } from 'remotion';

/** Bright-field cut: a cool-white / purple bloom over the hard transition. */
export const FlashCut: React.FC<{ duration?: number }> = ({ duration = 10 }) => {
  const frame = useCurrentFrame();
  const o = interpolate(frame, [0, duration * 0.4, duration], [0, 0.82, 0], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });
  return (
    <AbsoluteFill
      style={{
        pointerEvents: 'none',
        opacity: o,
        background: 'radial-gradient(ellipse at 50% 45%, rgba(235,245,255,0.96), rgba(167,139,250,0.45) 55%, transparent 80%)',
      }}
    />
  );
};
