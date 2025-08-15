import styled, { createGlobalStyle } from 'styled-components';

export const GlobalStyles = createGlobalStyle`
  * {
    margin: 0;
    padding: 0;
    box-sizing: border-box;
  }

  body {
    font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
    background-color: ${props => props.theme.background};
    color: ${props => props.theme.text};
    line-height: 1.6;
  }

  button {
    cursor: pointer;
    border: none;
    outline: none;
    font-family: inherit;
  }

  input, select, textarea {
    border: 1px solid ${props => props.theme.border};
    border-radius: 4px;
    padding: 8px 12px;
    font-family: inherit;
    outline: none;
    
    &:focus {
      border-color: ${props => props.theme.primary};
      box-shadow: 0 0 0 2px ${props => props.theme.primaryLight};
    }
  }

  .ag-theme-alpine {
    --ag-background-color: ${props => props.theme.cardBackground};
    --ag-header-background-color: ${props => props.theme.headerBackground};
    --ag-odd-row-background-color: ${props => props.theme.oddRowBackground};
    --ag-border-color: ${props => props.theme.border};
  }
`;

export const lightTheme = {
  primary: '#1976d2',
  primaryLight: '#42a5f5',
  primaryDark: '#1565c0',
  secondary: '#dc004e',
  background: '#e8f5e9',
  cardBackground: '#ffffff',
  headerBackground: '#fafafa',
  oddRowBackground: '#f9f9f9',
  text: '#333333',
  textSecondary: '#666666',
  border: '#e0e0e0',
  success: '#4caf50',
  warning: '#ff9800',
  error: '#f44336',
  info: '#2196f3'
};

export const darkTheme = {
  primary: '#90caf9',
  primaryLight: '#e3f2fd',
  primaryDark: '#42a5f5',
  secondary: '#f48fb1',
  background: '#0d2818',
  cardBackground: '#1e1e1e',
  headerBackground: '#2d2d2d',
  oddRowBackground: '#2d2d2d',
  text: '#ffffff',
  textSecondary: '#b0b0b0',
  border: '#333333',
  success: '#81c784',
  warning: '#ffb74d',
  error: '#e57373',
  info: '#64b5f6'
};

// Common styled components
export const Card = styled.div`
  background: ${props => props.theme.cardBackground};
  border-radius: 8px;
  padding: 24px;
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
  margin-bottom: 20px;
`;

export const Button = styled.button.withConfig({
  shouldForwardProp: (prop) => !['variant'].includes(prop)
})<{ variant?: 'primary' | 'secondary' | 'outline' }>`
  background: ${props => {
    switch (props.variant) {
      case 'secondary': return props.theme.secondary;
      case 'outline': return 'transparent';
      default: return props.theme.primary;
    }
  }};
  color: ${props => props.variant === 'outline' ? props.theme.primary : '#ffffff'};
  border: ${props => props.variant === 'outline' ? `2px solid ${props.theme.primary}` : 'none'};
  padding: 10px 20px;
  border-radius: 4px;
  font-weight: 500;
  transition: all 0.2s ease;

  &:hover {
    opacity: 0.9;
    transform: translateY(-1px);
  }

  &:disabled {
    opacity: 0.6;
    cursor: not-allowed;
    transform: none;
  }
`;

export const PageHeader = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 24px;
  padding-bottom: 16px;
  border-bottom: 1px solid ${props => props.theme.border};

  h1 {
    color: ${props => props.theme.text};
    font-size: 2rem;
    font-weight: 600;
  }
`;

export const Grid = styled.div.withConfig({
  shouldForwardProp: (prop) => !['columns', 'gap'].includes(prop)
})<{ columns?: number; gap?: string }>`
  display: grid;
  grid-template-columns: repeat(${props => props.columns || 1}, 1fr);
  gap: ${props => props.gap || '20px'};
`;

export const FlexBox = styled.div.withConfig({
  shouldForwardProp: (prop) => !['direction', 'justify', 'align', 'gap', 'wrap'].includes(prop)
})<{ 
  direction?: 'row' | 'column'; 
  justify?: string; 
  align?: string; 
  gap?: string;
  wrap?: boolean;
}>`
  display: flex;
  flex-direction: ${props => props.direction || 'row'};
  justify-content: ${props => props.justify || 'flex-start'};
  align-items: ${props => props.align || 'stretch'};
  gap: ${props => props.gap || '0'};
  flex-wrap: ${props => props.wrap ? 'wrap' : 'nowrap'};
`;

export const Badge = styled.span.withConfig({
  shouldForwardProp: (prop) => !['variant'].includes(prop)
})<{ variant?: 'success' | 'warning' | 'error' | 'info' }>`
  display: inline-block;
  padding: 4px 8px;
  border-radius: 12px;
  font-size: 0.75rem;
  font-weight: 500;
  background: ${props => {
    switch (props.variant) {
      case 'success': return props.theme.success;
      case 'warning': return props.theme.warning;
      case 'error': return props.theme.error;
      case 'info': return props.theme.info;
      default: return props.theme.primary;
    }
  }};
  color: white;
`;

export type Theme = typeof lightTheme;
