import { AbsoluteFill, interpolate, useCurrentFrame, Easing } from 'remotion';
import { COLORS, FONT } from './theme';
import { DigitRoll } from './DigitRoll';

/**
 * Dark glass title card: each word presses in with a blur-to-sharp reveal.
 * Accent words use amber or accent purple depending on scene.
 */
export const PaperTitleCard: React.FC<{
  duration: number;
  words: { text: string; accent?: boolean }[];
  sub?: string;
  subDigits?: string;
}> = ({ duration, words, sub, subDigits }) => {
  const frame = useCurrentFrame();
  const fadeOut = interpolate(frame, [duration - 8, duration], [1, 0], {
    extrapolateLeft: 'clamp', extrapolateRight: 'clamp',
  });
  const underline = interpolate(frame, [16, 34], [0, 1], {
    extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: Easing.bezier(0.3, 0, 0.2, 1),
  });
  const subT = interpolate(frame, [10, 22], [0, 1], {
    extrapolateLeft: 'clamp', extrapolateRight: 'clamp',
  });

  return (
    <AbsoluteFill
      style={{
        background: `${COLORS.bgDeepest}`,
        backgroundImage: `${COLORS.GLOW_PURPLE}, ${COLORS.GLOW_CYAN}, ${COLORS.GRADIENT_BG}`,
        backgroundSize: 'cover',
        justifyContent: 'center',
        alignItems: 'center',
        opacity: fadeOut,
      }}
    >
      <div style={{ textAlign: 'center', maxWidth: 1500, padding: '0 80px' }}>
        <div
          style={{
            fontFamily: FONT,
            fontSize: 118,
            fontWeight: 700,
            lineHeight: 1.18,
            color: COLORS.text,
            letterSpacing: '-0.01em',
            display: 'flex',
            flexWrap: 'wrap',
            justifyContent: 'center',
            columnGap: '0.24em',
            rowGap: '0.1em',
          }}
        >
          {words.map((w, i) => {
            const delay = 4 + i * 4;
            const t = interpolate(frame, [delay, delay + 9], [0, 1], {
              extrapolateLeft: 'clamp', extrapolateRight: 'clamp',
              easing: Easing.bezier(0.2, 0.75, 0.3, 1),
            });
            return (
              <span
                key={i}
                style={{
                  opacity: t,
                  transform: `scale(${1.24 - 0.24 * t})`,
                  filter: `blur(${(1 - t) * 7}px)`,
                  display: 'inline-block',
                  color: w.accent ? COLORS.amber : COLORS.text,
                  textShadow: w.accent ? `0 0 42px rgba(240,178,50,0.35)` : undefined,
                }}
              >
                {w.text}
              </span>
            );
          })}
        </div>
        <div
          style={{
            height: 6,
            width: 220,
            margin: '40px auto 0',
            borderRadius: 3,
            background: `linear-gradient(90deg, ${COLORS.accent}, ${COLORS.amber})`,
            transform: `scaleX(${underline})`,
            transformOrigin: 'center',
            boxShadow: `0 0 24px ${COLORS.accent}`,
          }}
        />
        {sub ? (
          <div
            style={{
              fontFamily: FONT,
              fontSize: 26,
              fontWeight: 400,
              letterSpacing: '0.16em',
              color: COLORS.textSec,
              marginTop: 36,
              opacity: subT,
              textTransform: 'uppercase',
              display: 'flex',
              justifyContent: 'center',
              alignItems: 'baseline',
              gap: '0.5em',
            }}
          >
            {subDigits ? <DigitRoll value={subDigits} delay={12} fontSize={26} /> : null}
            <span>{sub}</span>
          </div>
        ) : null}
      </div>
    </AbsoluteFill>
  );
};
