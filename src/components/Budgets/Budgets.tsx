import React from 'react';
import { PageHeader, Card } from '../../styles/globalStyles';

const Budgets: React.FC = () => {
  return (
    <div>
      <PageHeader>
        <h1>Budgets</h1>
      </PageHeader>
      <Card>
        <h3>Budget Management</h3>
        <p>Set up and monitor your spending budgets by category.</p>
        <p>This feature will allow you to:</p>
        <ul>
          <li>Create monthly, quarterly, or yearly budgets</li>
          <li>Track spending against budget limits</li>
          <li>Receive alerts when approaching limits</li>
          <li>View budget performance over time</li>
        </ul>
      </Card>
    </div>
  );
};

export default Budgets;
