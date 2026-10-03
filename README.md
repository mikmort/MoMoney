# 💰 Mo Money - Smart Money Tracking App

A modern React TypeScript application for tracking expenses, managing budgets, and analyzing financial data with AI-powered transaction categorization.

## � Quick Start

### Development Mode (No Authentication Required) 

For immediate testing without setting up Azure services:

```bash
# Install dependencies
npm install

# Run in development mode (authentication bypassed)
npm start
```

The app will open at `http://localhost:3000` and automatically log you in as a test user.

Use Node.js 22 LTS. Local development now bypasses sign-in by default **only in
development builds**; it does not connect to cloud storage. Existing explicit
`REACT_APP_SKIP_AUTH` settings still take precedence. If a local `.env` enables
production sign-in, set `REACT_APP_SKIP_AUTH=true` and restart. If port 3000 is
occupied, PowerShell users can run `$env:PORT='3001'; npm start`.

Your data is stored in this browser's IndexedDB and localStorage, separately for
each origin/port. To move data between devices or ports, use Settings > Export
Data. Clearing browser storage deletes local data and local backups.

### Protected cloud saves

The old hard-coded storage proxy is no longer used. Cloud sync is opt-in and
requires the versioned API in [`api/`](api/README.md), Microsoft sign-in, and
`REACT_APP_CLOUD_SYNC_ENABLED=true` at frontend build time. Deploying just the
frontend does **not** deploy the API. The managed-identity deployment documented
there uses a linked Function App and requires **Static Web Apps Standard**.
The existing `Momoney` Static Web App is Standard. The protected API was deployed
and linked on October 3, 2026; infrastructure and controlled redeployment
instructions are in [`infra/`](infra/README.md). Infrastructure is not
automatically reprovisioned by frontend builds.

In Settings, download your existing cloud save (or upload once for a new
account), then enable auto-sync. Startup never chooses a winner based on device
clocks or silently replaces local data. Stale revisions and any removed record
IDs block automatic saves; intentional deletions require explicit confirmation.
Export local changes before downloading a conflicting cloud version.

For local JSON backups, Settings > **Import Data** opens an in-page import dialog.
Browse for a file, drag a JSON backup into the drop area, or expand **Paste JSON
instead** and paste the file contents. Drop and paste work without an operating
system file window. All three paths open the same import-options preview; no data
is replaced until you confirm the import. If the browser blocks its file picker,
use either alternative instead.

Each successful save retains a create-only recovery version on the server.
Settings > Recovery versions can restore older cloud versions or pre-restore
local snapshots. Restores disable auto-sync and reload to discard stale service
caches. A failed/interrupted restore blocks uploads until recovered. Manual local
backups and the last automatic backup containing transactions are protected from
automatic pruning. Cloud versions and local recovery snapshots are not
automatically pruned: monitor storage usage and keep independent exports.

Cloud snapshots preserve transactions, transaction history, stored preferences,
all accounts (including inactive ones), categories, budgets, rules, and templates.
Account balance history and transfer links are preserved in their underlying
records. Live exchange-rate caches, authentication tokens, and UI state are not
synced.

### Production Mode (With Microsoft Authentication)

1. **Set up Azure AD App Registration**:
   - Go to [Azure Portal](https://portal.azure.com) → Azure Active Directory → App registrations
   - Create new registration for "Mo Money App"
   - Set redirect URI to `http://localhost:3000` (SPA type)
   - Copy the Application (client) ID

2. **Configure Environment**:
   ```bash
   # Copy the example environment file
   cp .env.example .env
   
   # Edit .env and update:
   REACT_APP_SKIP_AUTH=false
   REACT_APP_AZURE_AD_CLIENT_ID=your-actual-client-id
   ```

3. **Run the application**:
   ```bash
   npm start
   ```

## 🎯 Features

- **📊 Dashboard**: Financial overview with charts and statistics
- **💳 Transactions**: AG Grid-powered transaction management
- **📄 Statement Upload**: Support for PDF, CSV, Excel, and image files
- **🤖 AI Categorization**: Azure OpenAI-powered transaction classification
- **📈 Charts**: Interactive visualizations using Chart.js
- **🔐 Authentication**: Microsoft Account sign-in (production mode)
- **📱 Responsive**: Mobile-friendly design

## 🛠 Technology Stack

- **Frontend**: React 18 + TypeScript
- **Styling**: Styled Components
- **Grid**: AG Grid Community
- **Charts**: Chart.js + React Chart.js 2
- **Authentication**: Azure Static Web Apps built-in providers
- **AI**: Azure OpenAI (for transaction categorization)
- **Deployment**: Azure Static Web Apps (Standard tier)

## 📂 Project Structure

```
src/
├── components/         # React components
│   ├── Auth/          # Authentication components
│   ├── Dashboard/     # Dashboard and charts
│   ├── Transactions/  # Transaction management
│   └── Layout/        # Navigation and layout
├── config/            # Configuration files
├── data/              # Default categories and mock data
├── services/          # Azure services integration
├── styles/            # Global styles and themes
└── types/             # TypeScript type definitions
```

## 🔧 Configuration

### Development Mode
Set `REACT_APP_SKIP_AUTH=true` in `.env` to bypass authentication for testing.

### Azure Services Setup
1. **Azure AD**: For user authentication
2. **Azure OpenAI**: For AI-powered transaction categorization
3. **Azure Static Web Apps**: For deployment

### Environment Variables
See `.env.example` for all available configuration options.

## 📦 Available Scripts

- `npm start` - Start development server
- `npm build` - Build for production
- `npm test` - Run tests
- `npm run build` - Create production build

## 🚀 Deployment

The project includes GitHub Actions workflow for automatic deployment to Azure Static Web Apps. Just push to the main branch after configuring your Azure resources.

## 🔒 Security

- Environment variables for sensitive data
- Azure AD integration for secure authentication
- Content Security Policy configured
- API keys stored securely in Azure

## 📄 License

This project is for demonstration purposes. Modify as needed for your use case.

A smart money tracking and budgeting application built with React, TypeScript, and Azure services.

## Features

- 🔐 **Microsoft Account Authentication** - Secure sign-in with Azure AD
- 📊 **Interactive Dashboard** - Overview of income, expenses, and trends
- 💳 **Transaction Management** - Upload and categorize bank statements
- 🤖 **AI-Powered Categorization** - Automatic transaction classification using Azure OpenAI
- 📈 **Visual Analytics** - Charts and reports for spending insights
- 📄 **Statement Processing** - Support for PDF, CSV, Excel, OFX, and image files
- 🎯 **Budget Tracking** - Set and monitor spending budgets
- 📱 **Responsive Design** - Works on desktop and mobile devices

## Tech Stack

- **Frontend**: React 18, TypeScript, Styled Components
- **Data Grid**: AG Grid Community
- **Charts**: Chart.js with React Chart.js 2
- **Authentication**: Azure MSAL (Microsoft Authentication Library)
- **AI Services**: Azure OpenAI for transaction classification
- **Deployment**: Azure Static Web Apps

## Prerequisites

Before setting up the application, you'll need:

1. **Azure Subscription** with the following services:
   - Azure OpenAI Service
   - Azure AD App Registration
   - Azure Static Web Apps (for deployment)

2. **Development Environment**:
   - Node.js 18+ 
   - npm or yarn
   - Git

## Setup Instructions

### 1. Clone the Repository

```bash
git clone <your-repo-url>
cd MoMoney
```

### 2. Install Dependencies

```bash
npm install
```

### 3. Azure OpenAI Setup

1. Create an Azure OpenAI resource in the Azure portal
2. Deploy a GPT-4 model (or GPT-3.5-turbo)
3. Note down:
   - Endpoint URL
   - API Key
   - Deployment name
   - API version

### 4. Azure AD App Registration

1. Go to Azure Portal > Azure Active Directory > App registrations
2. Create a new registration:
   - Name: "Mo Money App"
   - Supported account types: "Accounts in any organizational directory and personal Microsoft accounts"
   - Redirect URI: `http://localhost:3000` (for development)
3. Note down the **Application (client) ID**

### 5. Environment Configuration

1. Copy the example environment file:
   ```bash
   cp .env.example .env
   ```

2. Update `.env` with your Azure credentials:
   ```env
   # Azure OpenAI Configuration
   REACT_APP_AZURE_OPENAI_ENDPOINT=https://your-openai-resource.openai.azure.com/
   REACT_APP_AZURE_OPENAI_API_KEY=your-api-key
   REACT_APP_AZURE_OPENAI_DEPLOYMENT=gpt-4
   REACT_APP_AZURE_OPENAI_API_VERSION=2024-02-15-preview

   # Azure AD Configuration
   REACT_APP_AZURE_AD_CLIENT_ID=your-client-id
   REACT_APP_AZURE_AD_AUTHORITY=https://login.microsoftonline.com/common
   REACT_APP_REDIRECT_URI=http://localhost:3000
   ```

### 6. Run the Application

```bash
npm start
```

The application will open at `http://localhost:3000`.

### Azure OpenAI Proxy Configuration

This app calls an HTTP proxy for Azure OpenAI chat completions. By default, it targets a relative path: `/api/openai/chat/completions`. If you see 404 Not Found on that path during import, configure one of the following:

1) Remote Azure Function (recommended)
- In `.env`, set:
   - `REACT_APP_OPENAI_PROXY_URL=https://<your-function>.azurewebsites.net/api/openai/chat/completions`
- Restart `npm start` after updating `.env`.

2) Local dev proxy to a local API
- Add a CRA proxy file `src/setupProxy.ts` to forward `/api` to your local functions (e.g., http://localhost:7071).
- Start your local API and then run `npm start`.

When configured correctly, imports will call your proxy and AI features will return results instead of 404s.

## Usage Guide

### 1. Authentication
- Click "Sign in with Microsoft" on the login page
- Use your Microsoft account credentials

### 2. Upload Bank Statements
- Go to the Transactions page
- Click on the upload area or drag and drop files
- Supported formats: PDF, CSV, Excel, PNG, JPG

### 3. AI Transaction Classification
- Uploaded transactions are automatically processed by Azure OpenAI
- The AI assigns categories and confidence scores
- Review and verify classifications as needed

### 4. View Analytics
- Dashboard shows spending summaries and trends
- Charts display category breakdowns and monthly patterns
- Use filters to analyze specific time periods or categories

## Project Structure

```
src/
├── components/           # React components
│   ├── Auth/            # Authentication components
│   ├── Dashboard/       # Dashboard and analytics
│   ├── Layout/          # Navigation and layout
│   ├── Transactions/    # Transaction management
│   ├── Budgets/         # Budget tracking
│   ├── Reports/         # Financial reports
│   └── Settings/        # App configuration
├── config/              # Configuration files
├── data/                # Default categories and mock data
├── services/            # API services (Azure OpenAI)
├── styles/              # Styled components and themes
└── types/               # TypeScript type definitions
```

## Deployment to Azure Static Web Apps

The existing `Momoney` resource uses **Azure Static Web Apps Standard**, verified
on October 3, 2026. Standard supports the linked Function App required for the
protected storage API. The hosting plan alone does not deploy or configure that API.

For more details, see [Azure Static Web Apps hosting plans](https://learn.microsoft.com/en-us/azure/static-web-apps/plans).

### 1. Create Azure Static Web App

1. In Azure portal, create a new Static Web App
2. **Select the Standard plan** for the protected cloud-storage architecture
3. Connect to your GitHub repository
4. Set build configuration:
   - Framework: React
   - App location: `/`
   - Build location: `build`

### 2. Configure Environment Variables

Follow [the API deployment instructions](api/README.md) for server-side storage
settings and frontend build-time cloud flags. Do not put storage credentials or
API secrets in `REACT_APP_*` variables: those values are bundled into the browser.

Note: `REACT_APP_AZURE_AD_CLIENT_ID` is not required when using the built-in AAD authentication provider.

### 3. Authentication

> ⚠️ **Security Note**: Changing the hosting plan does not automatically restrict sign-in. Configure custom authentication and authorization explicitly if you need tenant or domain restrictions.

The app uses Azure Static Web Apps' built-in authentication providers:
- **Microsoft/AAD**: `/.auth/login/aad` - Allows any Microsoft account to sign in
- **GitHub**: `/.auth/login/github` - Allows GitHub account sign in

No custom Azure AD app registration is required for basic authentication. The built-in providers handle user authentication automatically.

### 4. Configure the Linked Storage API

The hosting plan and linked storage API are configured. The legacy blob function
is disabled; unrelated OpenAI functions remain enabled. Follow
[api/README.md](api/README.md) and [infra/README.md](infra/README.md) for
controlled redeployment without overwriting saved data.

## Development

### Available Scripts

- `npm start` - Run development server
- `npm run build` - Build for production
- `npm test` - Run tests
- `npm run eject` - Eject from Create React App

### Adding New Features

1. **New Transaction Categories**: Update `src/data/defaultCategories.ts`
2. **AI Prompts**: Modify `src/services/azureOpenAIService.ts`
3. **Chart Types**: Add new chart components in `src/components/Dashboard/`
4. **Styling**: Update themes in `src/styles/globalStyles.ts`

## Security Considerations

- ✅ Environment variables for sensitive credentials
- ✅ Microsoft Authentication for secure access
- ✅ HTTPS enforcement in production
- ✅ Content Security Policy headers
- ⚠️ Client-side Azure OpenAI calls (consider moving to backend API)

## Contributing

1. Fork the repository
2. Create a feature branch: `git checkout -b feature/new-feature`
3. Commit changes: `git commit -am 'Add new feature'`
4. Push to branch: `git push origin feature/new-feature`
5. Submit a pull request

## License

This project is licensed under the MIT License.

## Support

For issues and questions:
1. Check the [Issues](../../issues) page
2. Create a new issue with detailed description
3. Include error messages and screenshots if applicable
