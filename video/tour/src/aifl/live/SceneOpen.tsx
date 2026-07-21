import { AbsoluteFill, Img, interpolate, staticFile, useCurrentFrame, Easing } from 'remotion';
import { TOUR_SHOTS } from '../Main';
import { PageCam, CamKey } from './PageCam';
import { Meteors } from '../Meteors';
import { COLORS, FONT, RADII } from '../theme';
import { BRAND, KICKER } from '../content';

const WORDMARK = BRAND;
const KICK = KICKER;

const BADGE = { x: 880, y: 240, w: 160, h: 160 };
const MCX = BADGE.x + BADGE.w / 2; // 960
const MCY = BADGE.y + BADGE.h / 2; // 320
const RADIUS = RADII.xl; // 24 (badge is round-ish, but cutout is circular-ish; use rounded rect)

const PAGE_H = 1080;

const CAM_KEYS: CamKey[] = [
  { frame: 82, cx: 960, cy: 540, zoom: 0.78, rotX: 0, rotY: 0, rotZ: 0, persp: 1200 },
  { frame: 114, cx: 960, cy: 540, zoom: 0.78, rotX: 0, rotY: 0, rotZ: 0, persp: 1200 },
  { frame: 130, cx: MCX - 20, cy: MCY, zoom: 3.3, rotX: 8, rotY: 34, rotZ: 2, persp: 1200 },
  { frame: 220, cx: MCX - 20, cy: MCY, zoom: 3.28, rotX: 8, rotY: 34, rotZ: 2, persp: 1200 },
];
const PUSH_EASE = Easing.bezier(0.35, 0, 0.2, 1);
const POP_EASE = Easing.bezier(0.2, 1.25, 0.3, 1);
const RESEAT_EASE = Easing.bezier(0.4, 0, 0.3, 1.05);

const PATCH = COLORS.bgDeepest;
const SLOT_ACCENT = COLORS.accent;
const BEAM_CORE = 'rgba(255,255,255,0.96)';

export const SceneOpen: React.FC = () => {
  const frame = useCurrentFrame();
  const duration = TOUR_SHOTS.s1.duration;

  // four-point star draw-on
  const vDraw = interpolate(frame, [0, 9], [100, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: Easing.bezier(0.3, 0, 0.2, 1) });
  const hDraw = interpolate(frame, [8, 18], [100, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: Easing.linear });
  const crossFade = interpolate(frame, [24, 34], [1, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });

  // kicker typewriter
  const perChar = 0.7;
  const kickStart = 28;
  const kickChars = Math.floor(Math.max(0, frame - kickStart) / perChar);
  const kickDone = kickStart + KICK.length * perChar;
  const cursorOn = (() => {
    if (frame < kickStart) return false;
    if (frame < kickDone) return true;
    if (frame > 74) return false;
    return Math.floor((frame - kickDone) / 2) % 2 === 0;
  })();

  // brand rest + dissolve
  const brandOut = interpolate(frame, [76, 83], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: Easing.bezier(0.4, 0, 0.5, 1) });
  const brandOpacity = 1 - brandOut;
  const groupY = -brandOut * 40;
  const groupScale = 1 - brandOut * 0.12;

  const macroIn = interpolate(frame, [82, 90], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: Easing.bezier(0.3, 0, 0.2, 1) });

  // roving spotlight
  const spotEase = Easing.bezier(0.4, 0, 0.3, 1);
  const spotX = interpolate(frame, [86, 90, 98, 104, 110, 130], [25, 25, 70, 42, 50, 50], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: spotEase });
  const spotY = interpolate(frame, [86, 90, 98, 104, 110, 130], [30, 30, 45, 60, 42, 40], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: spotEase });
  const spotOn = interpolate(frame, [84, 92], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });

  const poolBase = interpolate(frame, [104, 114, 130], [620, 420, 360], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: Easing.bezier(0.4, 0, 0.3, 1) });
  const poolPulse = interpolate(frame, [114, 118, 123], [0, 0.06, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  const poolRx = poolBase * (1 + poolPulse);
  const poolRy = poolBase * 0.8 * (1 + poolPulse);
  const vignette = interpolate(frame, [104, 114, 130], [0.16, 0.34, 0.42], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });

  const dofStrength = interpolate(frame, [114, 130, 140, 150], [0, 9, 9, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });

  // badge pop-up
  const rise = interpolate(frame, [130, 140], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: POP_EASE });
  const reseat = interpolate(frame, [194, 212], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: RESEAT_EASE });
  const lift = rise * (1 - reseat);
  const bob = Math.sin(((frame - 140) / 40) * Math.PI * 2) * 4 * lift;
  const z = 110 * lift + bob;
  const landed = frame >= 212;
  const press = interpolate(frame, [208, 211, 212], [1, 0.997, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  const shadow = `0 ${8 * lift}px ${10 + 12 * lift}px rgba(0,0,0,${0.28 * lift}), 0 ${46 * lift}px ${90 * lift}px rgba(0,0,0,${0.35 * lift})`;

  const slotVis = Math.min(1, rise * 2) * (1 - reseat);
  const landPulse = interpolate(frame, [208, 212, 216], [0, 1, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  const slotEdge = Math.min(1, 0.4 * (1 - reseat)) + landPulse * 0.6;

  // perimeter beam
  const beam1Prog = interpolate(frame, [142, 156], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: Easing.linear });
  const beam1On = frame >= 141 && frame <= 157;
  const beam2Prog = interpolate(frame, [162, 182], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: Easing.bezier(0.4, 0, 0.4, 1) });
  const beam2On = frame >= 161 && frame <= 183;
  const beamTrail = interpolate(frame, [182, 194], [0.35, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  const bw = BADGE.w + 6;
  const bh = BADGE.h + 6;

  const hiresIn = interpolate(frame, [114, 120], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });

  const outT = interpolate(frame, [duration - 5, duration], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: Easing.bezier(0.5, 0, 0.6, 1) });
  const rootOpacity = 1 - outT;

  return (
    <AbsoluteFill style={{ background: COLORS.bgDeepest, opacity: rootOpacity }}>
      {frame >= 84 ? (
        <AbsoluteFill style={{ opacity: macroIn }}>
          <PageCam src="textures/live/login-full.png" pageH={PAGE_H} keys={CAM_KEYS} ease={PUSH_EASE} dof={{ focusY: 240, strength: dofStrength }}>
            <div style={{ position: 'absolute', left: 0, right: 0, bottom: 0, height: 8, background: 'rgba(255,255,255,0.85)', filter: 'blur(6px)', opacity: 0.6 * Math.min(1, lift + Math.max(0, (frame - 114) / 16)), pointerEvents: 'none' }} />

            <div style={{ transformStyle: 'preserve-3d' }}>
              {slotVis > 0.02 ? (
                <div style={{ position: 'absolute', left: BADGE.x - 2, top: BADGE.y - 2, width: BADGE.w + 4, height: BADGE.h + 4, background: PATCH, borderRadius: RADIUS, boxShadow: `inset 0 0 26px rgba(124,92,252,${0.12 * slotEdge})`, opacity: slotVis }}>
                  <div style={{ position: 'absolute', inset: 0, borderRadius: RADIUS, border: `1.5px solid ${SLOT_ACCENT}`, opacity: slotEdge, pointerEvents: 'none' }} />
                </div>
              ) : null}

              <div style={{ position: 'absolute', left: BADGE.x, top: BADGE.y, width: BADGE.w, height: BADGE.h, transform: `translateZ(${z}px) scale(${press})`, transformOrigin: 'center center', transformStyle: 'preserve-3d' }}>
                <div style={{ position: 'absolute', inset: 0, borderRadius: RADIUS, overflow: 'hidden', boxShadow: landed ? 'none' : shadow }}>
                  <Img src={staticFile('textures/live/badge.png')} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', display: 'block' }} />
                  <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(160deg, rgba(255,255,255,0.35), transparent 40%)', opacity: lift, pointerEvents: 'none' }} />
                </div>
                <div style={{ position: 'absolute', inset: 0, borderRadius: RADIUS, boxShadow: `inset 0 0 0 1px rgba(255,255,255,${0.7 * lift})`, pointerEvents: 'none' }} />

                {(beam1On || beam2On) && lift > 0.4 ? (
                  <svg width={bw} height={bh} viewBox={`0 0 ${bw} ${bh}`} style={{ position: 'absolute', left: -3, top: -3, overflow: 'visible', pointerEvents: 'none', opacity: beam1On ? 1 : 0.62, filter: `drop-shadow(0 0 6px ${COLORS.amber}) drop-shadow(0 0 18px rgba(124,92,252,0.55))` }}>
                    <rect x={2} y={2} width={bw - 4} height={bh - 4} rx={RADIUS} fill="none" stroke={COLORS.amber} strokeWidth={beam1On ? 5 : 3.5} strokeLinecap="round" pathLength={1} strokeDasharray="0.14 1" strokeDashoffset={-(beam1On ? beam1Prog : beam2Prog)} />
                    <rect x={2} y={2} width={bw - 4} height={bh - 4} rx={RADIUS} fill="none" stroke={BEAM_CORE} strokeWidth={beam1On ? 2.5 : 1.75} strokeLinecap="round" pathLength={1} strokeDasharray="0.14 1" strokeDashoffset={-(beam1On ? beam1Prog : beam2Prog)} />
                  </svg>
                ) : null}

                {beamTrail > 0.01 ? (
                  <div style={{ position: 'absolute', inset: -3, borderRadius: RADIUS + 3, border: `1.5px solid ${COLORS.amber}`, opacity: beamTrail, pointerEvents: 'none' }} />
                ) : null}
              </div>
            </div>

            {frame >= 142 && frame <= 212 ? (() => {
              const noteIn = interpolate(frame, [142, 152], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: Easing.bezier(0.2, 0.75, 0.3, 1) });
              const noteOut = interpolate(frame, [198, 208], [1, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
              const noteVis = noteIn * noteOut;
              const noteZ = 92 + Math.sin(((frame - 142) / 44) * Math.PI * 2) * 3;
              const hl = interpolate(frame, [156, 168], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: Easing.bezier(0.3, 0, 0.2, 1) });
              return (
                <div style={{ transformStyle: 'preserve-3d', pointerEvents: 'none' }}>
                  <div style={{ position: 'absolute', left: 566, top: 736, width: 210, height: 74, transform: 'translateZ(2px)', background: 'radial-gradient(ellipse at 50% 50%, rgba(0,0,0,0.45), transparent 70%)', filter: 'blur(12px)', opacity: 0.55 * noteVis }} />
                  <div style={{ position: 'absolute', left: 556, top: 668, width: 230, transform: `translateZ(${noteZ}px) translateY(${(1 - noteIn) * 26}px)`, opacity: noteVis, filter: `blur(${(1 - noteIn) * 4}px)` }}>
                    <div style={{ fontFamily: FONT, fontSize: 34, fontWeight: 700, color: COLORS.text, lineHeight: 1.22, letterSpacing: '-0.01em' }}>
                      一校人的
                    </div>
                    <div style={{ position: 'relative', display: 'inline-block' }}>
                      <div style={{ position: 'absolute', left: -5, top: '12%', bottom: '4%', width: `calc(${hl} * (100% + 10px))`, background: COLORS.accent, borderRadius: 4 }} />
                      <div style={{ position: 'relative', fontFamily: FONT, fontSize: 34, fontWeight: 700, color: COLORS.amber, lineHeight: 1.22, letterSpacing: '-0.01em' }}>
                        专属入口
                      </div>
                    </div>
                  </div>
                </div>
              );
            })() : null}
          </PageCam>

          <AbsoluteFill style={{ background: `radial-gradient(${poolRx}px ${poolRy}px at ${spotX}% ${spotY}%, rgba(167,139,250,0.38), rgba(167,139,250,0.08) 45%, rgba(2,4,18,${vignette * spotOn}) 100%)`, pointerEvents: 'none', opacity: spotOn }} />
          <AbsoluteFill style={{ background: `radial-gradient(300px 220px at ${spotX - 6}% ${spotY + 10}%, rgba(0,210,255,0.14), transparent 70%)`, pointerEvents: 'none', opacity: spotOn * 0.7 }} />
          <Meteors opacity={0.45} />
        </AbsoluteFill>
      ) : null}

      {brandOpacity > 0 ? (
        <AbsoluteFill style={{ justifyContent: 'center', alignItems: 'center', pointerEvents: 'none', opacity: brandOpacity }}>
          <div style={{ textAlign: 'center', transform: `translateY(${groupY}px) scale(${groupScale})`, transformOrigin: 'center center' }}>
            <svg width={64} height={64} viewBox="0 0 64 64" style={{ display: 'block', margin: '0 auto 34px', opacity: crossFade, filter: `drop-shadow(0 0 10px ${COLORS.amber})` }}>
              <line x1={32} y1={2} x2={32} y2={62} stroke={COLORS.amber} strokeWidth={5} strokeLinecap="round" pathLength={100} strokeDasharray={100} strokeDashoffset={vDraw} />
              <line x1={2} y1={32} x2={62} y2={32} stroke={COLORS.amber} strokeWidth={5} strokeLinecap="round" pathLength={100} strokeDasharray={100} strokeDashoffset={hDraw} />
            </svg>

            <div style={{ fontFamily: FONT, fontSize: 128, fontWeight: 800, color: COLORS.text, letterSpacing: '-0.01em', lineHeight: 1, whiteSpace: 'pre', display: 'inline-flex', alignItems: 'flex-end' }}>
              {WORDMARK.split('').map((ch, i) => {
                const delay = 10 + i * 3;
                const t = interpolate(frame, [delay, delay + 12], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: Easing.bezier(0.2, 0.7, 0.25, 1) });
                const glintCenter = delay + 12;
                const glint = interpolate(frame, [glintCenter - 4, glintCenter, glintCenter + 4], [0, 1, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
                return (
                  <span key={i} style={{ position: 'relative', display: 'inline-block', opacity: t, transform: `scale(${1.6 - 0.6 * t})`, transformOrigin: 'center bottom', filter: `blur(${(1 - t) * 6}px)` }}>
                    {ch === ' ' ? ' ' : ch}
                    <span style={{ position: 'absolute', left: '50%', bottom: -6, transform: 'translateX(-50%)', width: `${glint * 100}%`, height: 3, background: COLORS.amber, opacity: glint, borderRadius: 2, boxShadow: `0 0 12px ${COLORS.amber}` }} />
                  </span>
                );
              })}
            </div>

            <div style={{ fontFamily: FONT, fontSize: 26, fontWeight: 500, letterSpacing: '0.18em', color: COLORS.textSec, marginTop: 30, height: 30, display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
              <span style={{ whiteSpace: 'pre' }}>{KICK.slice(0, kickChars)}</span>
              <span style={{ display: 'inline-block', width: 12, height: 22, marginLeft: 4, background: COLORS.amber, opacity: cursorOn ? 0.85 : 0, borderRadius: 1 }} />
            </div>
          </div>
        </AbsoluteFill>
      ) : null}
    </AbsoluteFill>
  );
};
