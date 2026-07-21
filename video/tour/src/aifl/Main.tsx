import { AbsoluteFill, Audio, Sequence, staticFile } from 'remotion';
import { SceneOpen } from './live/SceneOpen';
import { SceneBadge } from './live/SceneBadge';
import { SceneIntro } from './live/SceneIntro';
import { SceneChannels } from './live/SceneChannels';
import { SceneChat } from './live/SceneChat';
import { SceneFeed } from './live/SceneFeed';
import { SceneBG } from './live/SceneBG';
import { SceneSupport } from './live/SceneSupport';
import { SceneOutroLive } from './live/SceneOutroLive';
import { PaperTitleCard } from './PaperTitleCard';
import { FlashCut } from './FlashCut';
import { Caption } from './Caption';
import { FONT_CSS } from './GlobalFonts';
import { CAPTIONS, TITLE_CARDS } from './content';
import { COLORS } from './theme';

// ~87s @ 30fps — 校园频道功能导览（9 段 + 3 段字卡呼吸位）
export const TOUR_SHOTS = {
  s1: { from: 0, duration: 240 },      // 开场氛围
  ta: { from: 240, duration: 45 },     // 字卡 A
  s2: { from: 285, duration: 240 },    // 隐藏校徽动画
  s3: { from: 525, duration: 210 },    // 校园介绍页
  tb: { from: 735, duration: 45 },     // 字卡 B
  s4: { from: 780, duration: 330 },    // 频道总览
  s5: { from: 1110, duration: 390 },   // 实时聊天 + @提醒 + 图片
  s6: { from: 1500, duration: 270 },   // 校园动态 + 热门话题
  tc: { from: 1770, duration: 45 },    // 字卡 C
  s7: { from: 1815, duration: 330 },   // 背景设置
  s8: { from: 2145, duration: 210 },   // 技术支持 + 设置
  s9: { from: 2355, duration: 240 },   // 结尾
} as const;

export const TOUR_TOTAL = 2595;

const SFX: { seg: keyof typeof TOUR_SHOTS; at: number; src: string; volume: number; dur?: number }[] = [
  // S1 开场（复用 v1 开场节奏）
  { seg: 's1', at: 12, src: 'transition-soft.mp3', volume: 0.45 },
  { seg: 's1', at: 78, src: 'whoosh-fast.mp3', volume: 0.48 },
  { seg: 's1', at: 127, src: 'whoosh-big.mp3', volume: 0.52 },
  { seg: 's1', at: 141, src: 'sparkle.mp3', volume: 0.38 },
  // 字卡
  { seg: 'ta', at: 0, src: 'swoosh-quick.mp3', volume: 0.4 },
  { seg: 'tb', at: 0, src: 'swoosh-quick.mp3', volume: 0.4 },
  { seg: 'tc', at: 0, src: 'swoosh-quick.mp3', volume: 0.4 },
  // S2 校徽动画
  { seg: 's2', at: 80, src: 'transition-snap.mp3', volume: 0.5 },
  { seg: 's2', at: 140, src: 'whoosh-big.mp3', volume: 0.5 },
  // S4 频道逐个飞入
  { seg: 's4', at: 30, src: 'swoosh-quick.mp3', volume: 0.38 },
  { seg: 's4', at: 80, src: 'swoosh-quick.mp3', volume: 0.36 },
  { seg: 's4', at: 130, src: 'swoosh-quick.mp3', volume: 0.34 },
  { seg: 's4', at: 180, src: 'swoosh-quick.mp3', volume: 0.32 },
  { seg: 's4', at: 230, src: 'swoosh-quick.mp3', volume: 0.30 },
  { seg: 's4', at: 280, src: 'swoosh-quick.mp3', volume: 0.28 },
  // S5 聊天互动
  { seg: 's5', at: 40, src: 'sparkle.mp3', volume: 0.45 },    // @提醒
  { seg: 's5', at: 120, src: 'pop.mp3', volume: 0.42 },       // 点赞
  { seg: 's5', at: 190, src: 'whoosh-fast.mp3', volume: 0.40 }, // 评论
  { seg: 's5', at: 260, src: 'transition-soft.mp3', volume: 0.40 }, // 转发
  { seg: 's5', at: 340, src: 'click-camera.mp3', volume: 0.45 },    // 图片
  // S7 背景设置
  { seg: 's7', at: 60, src: 'transition-soft.mp3', volume: 0.45 },
  { seg: 's7', at: 180, src: 'whoosh-fast.mp3', volume: 0.40 },
  // S8 技术支持
  { seg: 's8', at: 20, src: 'whoosh-fast.mp3', volume: 0.40 },
  // S9 结尾固定句式 riser → impact → sparkle
  { seg: 's9', at: 10, src: 'riser-cine.mp3', volume: 0.5 },
  { seg: 's9', at: 45, src: 'impact-cine.mp3', volume: 0.55 },
  { seg: 's9', at: 70, src: 'sparkle.mp3', volume: 0.3 },
];

const FLASH_CUTS = [
  TOUR_SHOTS.s2.from + 80, // main → campus intro
  TOUR_SHOTS.s4.from,      // title → channels
  TOUR_SHOTS.s5.from,      // channels → chat
  TOUR_SHOTS.s7.from,      // title → bg settings
];

export const TourMain: React.FC = () => {
  return (
    <AbsoluteFill style={{ backgroundColor: COLORS.bgDeepest }}>
      <style>{FONT_CSS}</style>
      <Sequence from={0} durationInFrames={TOUR_TOTAL}>
        <Audio src={staticFile('audio/bgm.mp3')} volume={0.28} loop />
      </Sequence>
      {SFX.map((s, i) => (
        <Sequence key={`sfx-${i}`} from={TOUR_SHOTS[s.seg].from + s.at} durationInFrames={s.dur || (s.src === 'keyboard.mp3' ? 24 : 90)}>
          <Audio src={staticFile(`audio/${s.src}`)} volume={s.volume} />
        </Sequence>
      ))}

      <Sequence from={TOUR_SHOTS.s1.from} durationInFrames={TOUR_SHOTS.s1.duration}><SceneOpen /></Sequence>
      <Sequence from={TOUR_SHOTS.ta.from} durationInFrames={TOUR_SHOTS.ta.duration}>
        <PaperTitleCard duration={TOUR_SHOTS.ta.duration} words={TITLE_CARDS.badge.words} />
      </Sequence>
      <Sequence from={TOUR_SHOTS.s2.from} durationInFrames={TOUR_SHOTS.s2.duration}><SceneBadge /></Sequence>
      <Sequence from={TOUR_SHOTS.s3.from} durationInFrames={TOUR_SHOTS.s3.duration}><SceneIntro /></Sequence>
      <Sequence from={TOUR_SHOTS.tb.from} durationInFrames={TOUR_SHOTS.tb.duration}>
        <PaperTitleCard duration={TOUR_SHOTS.tb.duration} words={TITLE_CARDS.channels.words} />
      </Sequence>
      <Sequence from={TOUR_SHOTS.s4.from} durationInFrames={TOUR_SHOTS.s4.duration}><SceneChannels /></Sequence>
      <Sequence from={TOUR_SHOTS.s5.from} durationInFrames={TOUR_SHOTS.s5.duration}><SceneChat /></Sequence>
      <Sequence from={TOUR_SHOTS.s6.from} durationInFrames={TOUR_SHOTS.s6.duration}><SceneFeed /></Sequence>
      <Sequence from={TOUR_SHOTS.tc.from} durationInFrames={TOUR_SHOTS.tc.duration}>
        <PaperTitleCard duration={TOUR_SHOTS.tc.duration} words={TITLE_CARDS.bg.words} />
      </Sequence>
      <Sequence from={TOUR_SHOTS.s7.from} durationInFrames={TOUR_SHOTS.s7.duration}><SceneBG /></Sequence>
      <Sequence from={TOUR_SHOTS.s8.from} durationInFrames={TOUR_SHOTS.s8.duration}><SceneSupport /></Sequence>
      <Sequence from={TOUR_SHOTS.s9.from} durationInFrames={TOUR_SHOTS.s9.duration}><SceneOutroLive /></Sequence>

      {CAPTIONS.map((c, i) => (
        <Sequence key={`cap-${i}`} from={TOUR_SHOTS[c.seg as keyof typeof TOUR_SHOTS].from + c.at} durationInFrames={c.dur}>
          <Caption text={c.text} duration={c.dur} />
        </Sequence>
      ))}

      {FLASH_CUTS.map((cut) => (
        <Sequence key={`cut-${cut}`} from={cut - 5} durationInFrames={10}>
          <FlashCut duration={10} />
        </Sequence>
      ))}
    </AbsoluteFill>
  );
};
