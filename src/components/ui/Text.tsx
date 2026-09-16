import { Text as RNText, type TextProps as RNTextProps, type TextStyle } from 'react-native';

import { useTheme, type TypeVariant } from '@/theme';

export type TextTone =
  | 'primary'
  | 'secondary'
  | 'tertiary'
  | 'onAccent'
  | 'brand'
  | 'positive'
  | 'negative'
  | 'warning'
  | 'info';

export type TextProps = RNTextProps & {
  variant?: TypeVariant;
  tone?: TextTone;
  /** Escape hatch for category accents and other computed colours. Wins over `tone`. */
  color?: string;
  align?: TextStyle['textAlign'];
  children?: React.ReactNode;
};

/**
 * Users can scale system text well past 200%. Letting display-sized type scale that
 * far breaks every card in the app, so larger variants are capped tighter than body
 * copy. Body text keeps a generous cap because that is what people actually need to
 * read.
 */
const fontScaleCap: Partial<Record<TypeVariant, number>> = {
  displayLg: 1.25,
  display: 1.25,
  amountLg: 1.25,
  h1: 1.35,
  h2: 1.4,
  amount: 1.4,
  overline: 1.6,
};

const DEFAULT_CAP = 1.8;

/**
 * The only text primitive in the app. Going through it guarantees Inter, the shared
 * type scale and a sane Dynamic Type cap — raw `<Text>` gets none of those.
 */
export function Text({
  variant = 'body',
  tone = 'primary',
  color,
  align,
  style,
  maxFontSizeMultiplier,
  ...rest
}: TextProps) {
  const theme = useTheme();

  const toneColor: Record<TextTone, string> = {
    primary: theme.colors.textPrimary,
    secondary: theme.colors.textSecondary,
    tertiary: theme.colors.textTertiary,
    onAccent: theme.colors.textOnAccent,
    brand: theme.colors.brandText,
    positive: theme.colors.positive,
    negative: theme.colors.negative,
    warning: theme.colors.warning,
    info: theme.colors.info,
  };

  return (
    <RNText
      maxFontSizeMultiplier={maxFontSizeMultiplier ?? fontScaleCap[variant] ?? DEFAULT_CAP}
      style={[
        theme.type[variant],
        { color: color ?? toneColor[tone] },
        align ? { textAlign: align } : null,
        style,
      ]}
      {...rest}
    />
  );
}
