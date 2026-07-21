import { staticFile } from 'remotion';

export const FONT_CSS = `
@font-face {
  font-family: 'Noto Sans SC';
  src: url('${staticFile('fonts/noto-sc-400.woff2')}') format('woff2');
  font-weight: 400 500;
  font-style: normal;
  font-display: swap;
}
@font-face {
  font-family: 'Noto Sans SC';
  src: url('${staticFile('fonts/noto-sc-700.woff2')}') format('woff2');
  font-weight: 700 900;
  font-style: normal;
  font-display: swap;
}
`;
