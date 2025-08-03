import React from 'react';
import { PageHeader, Card } from '../../styles/globalStyles';

const Reports: React.FC = () => {
  return (
    <div>
      <PageHeader>
        <h1>Reports</h1>
      </PageHeader>
      <Card>
        <h3>Financial Reports</h3>
        <p>Generate detailed reports and insights about your financial data.</p>
        <p>Available reports will include:</p>
        <ul>
          <li>Monthly income and expense summaries</li>
          <li>Category-wise spending analysis</li>
          <li>Trends and patterns over time</li>
          <li>Tax-ready transaction exports</li>
          <li>Custom date range reports</li>
        </ul>
      </Card>
    </div>
  );
};

export default Reports;
