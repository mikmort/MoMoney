import 'styled-components';

declare module 'styled-components' {
  export interface DefaultTheme {
    primary: string;
    primaryLight: string;
    primaryDark: string;
    secondary: string;
    background: string;
    cardBackground: string;
    headerBackground: string;
    oddRowBackground: string;
    text: string;
    textSecondary: string;
    border: string;
    success: string;
    warning: string;
    error: string;
    info: string;
  }
}
