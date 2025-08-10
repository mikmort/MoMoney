import { 
  Chart as ChartJS, 
  CategoryScale, 
  LinearScale, 
  BarElement, 
  Title, 
  Tooltip, 
  Legend,
  ArcElement,
  PointElement,
  LineElement,
  TimeScale
} from 'chart.js';

// Register Chart.js components once - shared across all chart components
export const initializeChartJS = () => {
  ChartJS.register(
    CategoryScale,
    LinearScale,
    BarElement,
    Title,
    Tooltip,
    Legend,
    ArcElement,
    PointElement,
    LineElement,
    TimeScale
  );
};

// Call initialization immediately when imported
initializeChartJS();

// Export Chart.js for components to use
export { ChartJS };

// Common chart options that can be reused
export const commonChartOptions = {
  responsive: true,
  maintainAspectRatio: false,
  plugins: {
    legend: {
      position: 'bottom' as const,
    },
  },
};

export const commonBarChartOptions = {
  ...commonChartOptions,
  scales: {
    y: {
      beginAtZero: true,
    },
  },
};

export const commonDoughnutOptions = {
  ...commonChartOptions,
  cutout: '60%',
};