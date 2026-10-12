import { TextStyle } from 'react-native';

export const fontFamily = {
  regular: 'Inter-Regular',
  medium: 'Inter-Medium',
  semiBold: 'Inter-SemiBold',
  bold: 'Inter-Bold',
} as const;

export const typography = {
  h1: {
    fontSize: 32,
    lineHeight: 40,
    fontFamily: fontFamily.bold,
    letterSpacing: -0.5,
  } as TextStyle,
  h2: {
    fontSize: 28,
    lineHeight: 36,
    fontFamily: fontFamily.bold,
    letterSpacing: -0.5,
  } as TextStyle,
  h3: {
    fontSize: 24,
    lineHeight: 32,
    fontFamily: fontFamily.semiBold,
    letterSpacing: -0.3,
  } as TextStyle,
  h4: {
    fontSize: 20,
    lineHeight: 28,
    fontFamily: fontFamily.semiBold,
    letterSpacing: -0.2,
  } as TextStyle,
  h5: {
    fontSize: 18,
    lineHeight: 26,
    fontFamily: fontFamily.medium,
    letterSpacing: -0.1,
  } as TextStyle,
  h6: {
    fontSize: 16,
    lineHeight: 24,
    fontFamily: fontFamily.medium,
  } as TextStyle,
  body1: {
    fontSize: 16,
    lineHeight: 24,
    fontFamily: fontFamily.regular,
  } as TextStyle,
  body2: {
    fontSize: 14,
    lineHeight: 22,
    fontFamily: fontFamily.regular,
  } as TextStyle,
  caption: {
    fontSize: 12,
    lineHeight: 18,
    fontFamily: fontFamily.regular,
    letterSpacing: 0.2,
  } as TextStyle,
  overline: {
    fontSize: 11,
    lineHeight: 16,
    fontFamily: fontFamily.medium,
    letterSpacing: 0.5,
    textTransform: 'uppercase',
  } as TextStyle,
  button: {
    fontSize: 14,
    lineHeight: 20,
    fontFamily: fontFamily.semiBold,
    letterSpacing: 0.5,
  } as TextStyle,
  label: {
    fontSize: 12,
    lineHeight: 18,
    fontFamily: fontFamily.medium,
    letterSpacing: 0.3,
  } as TextStyle,
} as const;

export type Typography = typeof typography;
