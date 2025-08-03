// Configuration for Azure services and application settings
export interface AppConfig {
  azure: {
    openai: {
      endpoint: string;
      apiKey: string;
      deploymentName: string;
      apiVersion: string;
    };
    msal: {
      clientId: string;
      authority: string;
      redirectUri: string;
    };
  };
  features: {
    enableAIClassification: boolean;
    enableStatementParsing: boolean;
  };
}

// Default configuration - replace with your actual Azure credentials
export const defaultConfig: AppConfig = {
  azure: {
    openai: {
      endpoint: process.env.REACT_APP_AZURE_OPENAI_ENDPOINT || 'YOUR_AZURE_OPENAI_ENDPOINT',
      apiKey: process.env.REACT_APP_AZURE_OPENAI_API_KEY || 'YOUR_AZURE_OPENAI_API_KEY',
      deploymentName: process.env.REACT_APP_AZURE_OPENAI_DEPLOYMENT || 'gpt-4o',
      apiVersion: process.env.REACT_APP_AZURE_OPENAI_API_VERSION || '2024-02-15-preview'
    },
    msal: {
      clientId: process.env.REACT_APP_AZURE_AD_CLIENT_ID || 'YOUR_AZURE_AD_CLIENT_ID',
      authority: process.env.REACT_APP_AZURE_AD_AUTHORITY || 'https://login.microsoftonline.com/consumers',
      redirectUri: process.env.REACT_APP_REDIRECT_URI || 'http://localhost:3000'
    }
  },
  features: {
    enableAIClassification: true,
    enableStatementParsing: true
  }
};
