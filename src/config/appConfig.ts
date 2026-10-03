import { DEFAULT_AI_DEPLOYMENT } from './openAI';

// Configuration for Azure services and application settings
export interface AppConfig {
  azure: {
    openai: {
      deploymentName: string;
    };
    /**
     * @deprecated - MSAL configuration no longer used
     * Azure Static Web Apps handles authentication automatically
     */
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

// Azure credentials and model API configuration belong only on the backend.
export const defaultConfig: AppConfig = {
  azure: {
    openai: {
      deploymentName: process.env.REACT_APP_AZURE_OPENAI_DEPLOYMENT || DEFAULT_AI_DEPLOYMENT
    },
    /**
     * @deprecated - MSAL configuration no longer used
     * Azure Static Web Apps handles authentication automatically
     */
    msal: {
      clientId: process.env.REACT_APP_AZURE_AD_CLIENT_ID || 'YOUR_AZURE_AD_CLIENT_ID',
      authority: process.env.REACT_APP_AZURE_AD_AUTHORITY || 'https://login.microsoftonline.com/common',
      redirectUri: process.env.REACT_APP_REDIRECT_URI || 'http://localhost:3000'
    }
  },
  features: {
    enableAIClassification: true,
    enableStatementParsing: true
  }
};
