import styled from 'styled-components';
import { Card } from '../../styles/globalStyles';

export interface StatsCardProps {
  clickable?: boolean;
}

export const StatsCard = styled(Card).withConfig({
  shouldForwardProp: (prop) => prop !== 'clickable',
})<StatsCardProps>`
  text-align: center;
  
  .amount {
    font-size: 2rem;
    font-weight: 600;
    margin: 8px 0;
    
    &.positive {
      color: #4caf50;
    }
    
    &.negative {
      color: #f44336;
    }
    
    &.neutral {
      color: #2196f3;
    }
    
    ${props => props.clickable && `
      cursor: pointer;
      transition: color 0.2s;
      
      &:hover {
        color: #1976d2;
        text-decoration: underline;
      }
    `}
  }
  
  .label {
    color: #666;
    font-size: 0.9rem;
    text-transform: uppercase;
    letter-spacing: 0.5px;
  }
  
  .percentage {
    font-size: 0.8rem;
    color: #888;
    margin-top: 4px;
  }
`;

export default StatsCard;