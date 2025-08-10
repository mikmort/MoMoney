import styled from 'styled-components';
import { Card } from '../../styles/globalStyles';

/**
 * Shared styled component for chart containers
 * Used in Dashboard and Reports components to maintain consistent chart layouts
 */
export const ChartCard = styled(Card)`
  height: 400px;
  
  .chart-container {
    height: 320px;
    position: relative;
  }
  
  h3 {
    margin-bottom: 20px;
    color: #333;
  }
`;