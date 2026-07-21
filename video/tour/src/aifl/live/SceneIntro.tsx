import { AbsoluteFill, interpolate, useCurrentFrame, Easing } from 'remotion';
import { PageCam } from './PageCam';
import { COLORS } from '../theme';

const EASE = Easing.bezier(0.35, 0, 0.2, 1);
const PAGE_H = 1080;

export const SceneIntro: React.FC = () => {
  const frame = useCurrentFrame();
  const outT = interpolate(frame, [180, 210], [1, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: Easing.bezier(0.4, 0, 0.6, 1) });

  return (
    <AbsoluteFill style={{ backgroundColor: COLORS.bgDeepest, opacity: outT }}>
      <PageCam
        src="textures/live/tech-support.png"
        pageH={PAGE_H}
        keys={[
          { frame: 0, cx: 380, cy: 360, zoom: 1.15, rotX: 4, rotY: 12, rotZ: 0, persp: 1400 },
          { frame: 60, cx: 380, cy: 520, zoom: 1.05, rotX: 2, rotY: 6, rotZ: 0, persp: 1400 },
          { frame: 150, cx: 380, cy: 780, zoom: 1.02, rotX: 0, rotY: 0, rotZ: 0, persp: 1400 },
          { frame: 210, cx: 380, cy: 820, zoom: 1.0, rotX: 0, rotY: 0, rotZ: 0, persp: 1400 },
        ]}
        ease={EASE}
      />
    </AbsoluteFill>
  );
};
