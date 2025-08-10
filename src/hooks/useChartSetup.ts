import { useEffect } from 'react';
import 'chartjs-adapter-date-fns';
import { commonBarChartOptions, commonDoughnutOptions } from '../utils/chartConfig';

/**
 * Custom hook for chart setup and configuration
 * Reduces duplicate Chart.js imports and adapter setup across components
 */
export const useChartSetup = () => {
  // Chart.js is already registered in chartConfig.ts when imported
  // This hook provides a consistent place to handle chart setup if needed
  useEffect(() => {
    // Any additional chart setup can go here
    // Chart.js components are already registered via chartConfig.ts
  }, []);

  // Return common chart configurations
  return {
    barChartOptions: commonBarChartOptions,
    doughnutOptions: commonDoughnutOptions
  };
};

export default useChartSetup;