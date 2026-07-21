// theme.ts — 从宝丰一高校园频道 CSS 提取的设计 token
export const COLORS = {
  bgDeepest: '#020412',
  bg: '#080b20',
  bg2: '#0f1232',
  bg3: '#140f35',
  bg4: '#0d0f28',
  surface: '#232428',
  elevated: '#2c2d32',
  card: '#2b2d31',
  text: '#f2f3f5',
  textSec: '#b5bac1',
  textDim: '#80848e',
  textMuted: '#5c5e66',
  accent: '#7c5cfc',
  accentHover: '#6a4ae8',
  accentActive: '#5939d4',
  accentLight: '#a78bfa',
  amber: '#f0b232',
  amberLight: '#fbd38d',
  cyan: '#00b4d8',
  blue: '#5865f2',
  green: '#23a559',
  red: '#ed4245',
  pink: '#ff6b8a',
  border: 'rgba(255,255,255,0.06)',
  borderLight: 'rgba(255,255,255,0.10)',
  shadow: 'rgba(0,0,0,0.32)',
  callout: 'rgba(17,18,31,0.92)', // 暗色玻璃说明卡（叠在截图上方）
  cardDeep: 'rgba(30,32,48,0.62)', // 深玻璃信息卡底
  GLOW_PURPLE: `radial-gradient(ellipse 80% 50% at 75% 22%, rgba(124,92,252,0.45), transparent 55%)`,
  GLOW_CYAN: `radial-gradient(ellipse 80% 50% at 25% 30%, rgba(0,210,255,0.35), transparent 50%)`,
  GRADIENT_BG: `linear-gradient(180deg, ${'#080b20'} 0%, ${'#0f1232'} 25%, ${'#140f35'} 55%, ${'#0d0f28'} 100%)`,
};

export const FONT = `'Noto Sans SC', 'Microsoft YaHei', 'PingFang SC', system-ui, -apple-system, sans-serif`;
export const FONT_MONO = `ui-monospace, SFMono-Regular, Menlo, Consolas, monospace`;

export const RADII = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24 };

export const GRADIENT_BG = `linear-gradient(180deg, ${COLORS.bg} 0%, ${COLORS.bg2} 25%, ${COLORS.bg3} 55%, ${COLORS.bg4} 100%)`;
export const GLOW_PURPLE = `radial-gradient(ellipse 80% 50% at 75% 22%, rgba(124,92,252,0.45), transparent 55%)`;
export const GLOW_CYAN = `radial-gradient(ellipse 80% 50% at 25% 30%, rgba(0,210,255,0.35), transparent 50%)`;
