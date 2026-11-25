import React from 'react';
import { SvgXml } from 'react-native-svg';
import { LOGO_ASPECT_TIGHT, LOGO_SVG_TIGHT } from '@theme/logoSvg';

interface Props {
  /** Rendered width in dp; height follows the logo's aspect ratio. */
  width?: number;
}

/** The official Jinni logo (assets/logo-svg.svg) as a self-contained badge — safe on any background. */
export const JinniWordmark: React.FC<Props> = ({ width = 120 }) => (
  <SvgXml xml={LOGO_SVG_TIGHT} width={width} height={width / LOGO_ASPECT_TIGHT} />
);

export default JinniWordmark;
