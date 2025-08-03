import React from 'react';
import { PageHeader, Card, Button } from '../../styles/globalStyles';
import { defaultConfig } from '../../config/appConfig';

const Settings: React.FC = () => {
  return (
    <div>
      <PageHeader>
        <h1>Settings</h1>
      </PageHeader>
      
      <Card>
        <h3>Azure OpenAI Configuration</h3>
        <p>Configure your Azure OpenAI settings for AI-powered transaction classification.</p>
        <div style={{ marginTop: '16px' }}>
          <div style={{ marginBottom: '12px' }}>
            <strong>Current Endpoint:</strong> {defaultConfig.azure.openai.endpoint}
          </div>
          <div style={{ marginBottom: '12px' }}>
            <strong>Deployment:</strong> {defaultConfig.azure.openai.deploymentName}
          </div>
          <div style={{ marginBottom: '12px' }}>
            <strong>API Version:</strong> {defaultConfig.azure.openai.apiVersion}
          </div>
          <Button variant="outline">Test Connection</Button>
        </div>
      </Card>

      <Card>
        <h3>Application Preferences</h3>
        <p>Customize your experience with Mo Money.</p>
        <ul>
          <li>Currency preferences</li>
          <li>Date format settings</li>
          <li>Notification preferences</li>
          <li>Auto-categorization settings</li>
          <li>Default account selection</li>
        </ul>
      </Card>

      <Card>
        <h3>Account Management</h3>
        <p>Manage your connected accounts and data.</p>
        <ul>
          <li>Connected bank accounts</li>
          <li>Data export/import</li>
          <li>Privacy settings</li>
          <li>Account deletion</li>
        </ul>
      </Card>
    </div>
  );
};

export default Settings;
