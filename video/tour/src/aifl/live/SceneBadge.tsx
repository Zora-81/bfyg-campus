import { AbsoluteFill, interpolate, useCurrentFrame, Easing } from 'remotion';
import { PageCam } from './PageCam';
import { COLORS } from '../theme';

const EASE = Easing.bezier(0.35, 0, 0.2, 1);
const PAGE_H = 1080;

// drawer-server-icon bbox from live-layout.json
const BADGE = { cx: 64, cy: 62 };

export const SceneBadge: React.FC = () => {
  const frame = useCurrentFrame();

  // phase 1: main UI → badge
  const mainOpacity = interpolate(frame, [72, 84], [1, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: EASE });

  // phase 2: phase-logo overlay
  const logoOpacity = interpolate(frame, [80, 92, 148, 160], [0, 1, 1, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });

  // phase 3: full school intro (info card)
  const infoOpacity = interpolate(frame, [152, 170], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: EASE });

  // cursor overlay: moves to badge, clicks at ~70f
  const cursorT = interpolate(frame, [34, 66], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: EASE });
  const cursorX = 1440 + (BADGE.cx - 1440) * cursorT;
  const cursorY = 720 + (BADGE.cy - 720) * cursorT;
  const clickPulse = interpolate(frame, [68, 78], [1, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });

  return (
    <AbsoluteFill style={{ backgroundColor: COLORS.bgDeepest }}>
      {mainOpacity > 0.001 ? (
        <div style={{ position: 'absolute', inset: 0, opacity: mainOpacity }}>
          <PageCam
            src="textures/live/main-ui.png"
            pageH={PAGE_H}
            keys={[
              { frame: 0, cx: 960, cy: 540, zoom: 0.58, rotX: 0, rotY: 0, rotZ: 0, persp: 1400 },
              { frame: 70, cx: BADGE.cx, cy: BADGE.cy, zoom: 2.7, rotX: 6, rotY: 26, rotZ: 2, persp: 1200 },
              { frame: 84, cx: BADGE.cx, cy: BADGE.cy, zoom: 2.75, rotX: 6, rotY: 26, rotZ: 2, persp: 1200 },
            ]}
            ease={EASE}
          />
        </div>
      ) : null}

      {logoOpacity > 0.001 ? (
        <div style={{ position: 'absolute', inset: 0, opacity: logoOpacity }}>
          <PageCam
            src="textures/live/campus-intro.png"
            pageH={PAGE_H}
            keys={[
              { frame: 80, cx: 960, cy: 540, zoom: 0.85 },
              { frame: 160, cx: 960, cy: 540, zoom: 0.85 },
            ]}
            ease={EASE}
          />
        </div>
      ) : null}

      {infoOpacity > 0.001 ? (
        <div style={{ position: 'absolute', inset: 0, opacity: infoOpacity }}>
          <PageCam
            src="textures/live/tech-support.png"
            pageH={PAGE_H}
            keys={[
              { frame: 160, cx: 960, cy: 540, zoom: 0.9 },
              { frame: 240, cx: 380, cy: 360, zoom: 1.15, rotX: 4, rotY: 12, rotZ: 0, persp: 1400 },
            ]}
            ease={EASE}
          />
        </div>
      ) : null}

      {/* cursor overlay (only during main-ui phase) */}
      {frame >= 34 && frame <= 84 ? (
        <div style={{ position: 'absolute', left: cursorX, top: cursorY, transform: 'translate(-50%, -50%)', pointerEvents: 'none' }}>
          <div style={{ width: 18, height: 18, borderRadius: 9, background: 'rgba(255,255,255,0.9)', boxShadow: '0 0 0 4px rgba(255,255,255,0.25), 0 0 18px rgba(124,92,252,0.6)' }} />
          {clickPulse > 0.01 ? (
            <div style={{ position: 'absolute', left: 9, top: 9, transform: 'translate(-50%,-50%)', width: 80 * clickPulse, height: 80 * clickPulse, borderRadius: '50%', border: `2px solid rgba(240,178,50,${clickPulse})` }} />
          ) : null}
        </div>
      ) : null}
    </AbsoluteFill>
  );
};
