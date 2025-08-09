# Mo Money - Financial Tracking Application

Mo Money is a React TypeScript web application for financial tracking and budget management with AI-powered transaction categorization using Azure services.

**Always reference these instructions first and fallback to search or bash commands only when you encounter unexpected information that does not match the info here.**

## Working Effectively

### Bootstrap and Setup
- **NEVER CANCEL**: `npm install` -- takes 2-3 minutes to complete. Set timeout to 10+ minutes.
- Copy `.env.example` to `.env` for development mode: `cp .env.example .env`
- Development mode bypasses authentication automatically (REACT_APP_SKIP_AUTH defaults to true)

### Build and Test
- **Build for production**: `npm run build` -- takes 25-30 seconds. NEVER CANCEL. Set timeout to 3+ minutes.
  - **OPTIMIZED**: ESLint warnings have been fixed - no longer requires `CI=false` prefix
  - **OPTIMIZED**: Code splitting implemented - main bundle reduced from 717KB to 132KB
  - Bundle now uses lazy loading for better performance
- **Test suite**: `npm test -- --watchAll=false --passWithNoTests` -- completes in 10 seconds
  - **NOTE**: Some tests exist but may have implementation issues (not related to performance)
  - Test command requires `--passWithNoTests` flag for CI environments
- **Linting**: `npm run lint` -- runs in 2 seconds, zero warnings/errors
  - Use `npm run lint:fix` to automatically fix issues

### Run the Application
- **Development server**: `npm start` -- takes 15-20 seconds to start, runs on http://localhost:3000
  - Application loads with sample data automatically
  - Uses "Development User" account with mock transactions
  - **OPTIMIZED**: Lazy loading implemented - faster initial page load
  - **NEVER CANCEL**: Wait for "webpack compiled" message before testing
- **Production preview**: `npx serve -s build` (after building) -- serves on port 3000

## Validation Scenarios

### **CRITICAL**: Manual Testing Requirements
After making changes, **ALWAYS** run through these validation scenarios:

#### Essential User Flows
1. **Dashboard Validation**:
   - Navigate to http://localhost:3000
   - Verify financial summary cards show totals (Income, Expenses, Net Income, Transactions)
   - Confirm "Spending by Category" pie chart renders
   - Check "Monthly Trend" bar chart displays correctly

2. **Transaction Management**:
   - Click "💳 Transactions" in sidebar
   - Verify transaction grid loads with sample data (5 mock transactions)
   - Test file upload area (drag & drop functionality)
   - Confirm filters work (Category, Type, Account dropdowns)
   - Validate AI confidence scores display (percentages with ℹ️ icons)

3. **Navigation Testing**:
   - Test all sidebar links: Dashboard, Transactions, Categories, Budgets, Reports, Settings
   - Verify URL routing works correctly (/transactions, /categories, etc.)
   - Confirm active page highlighting in navigation

#### Development Mode Authentication
- Application automatically logs in as "Development User" (dev@momoney.app)
- No Azure AD setup required for development
- Sign out button visible but not required for testing

## Common Commands and Timing

### **CRITICAL**: Timeout Values and Build Times
- **`npm install`**: 2-3 minutes actual time. **NEVER CANCEL**. Set timeout to 10+ minutes.
- **`npm run build`**: 25-30 seconds actual time. **NEVER CANCEL**. Set timeout to 3+ minutes.
- **`npm start`**: 15-20 seconds to start serving. **NEVER CANCEL**. Set timeout to 3+ minutes.
- **`npm test`**: 10 seconds with `--passWithNoTests` flag.
- **`npm run lint`**: 2 seconds for full codebase lint check (zero warnings).
- **Bundle analysis**: `npm run build:analyze` to analyze bundle size and chunks.

### Environment Requirements
- **Node.js**: Version 20.19.4+ (confirmed working)
- **npm**: Version 10.8.2+ (confirmed working)
- **Browser**: Chrome, Firefox, or Safari for testing

## Codebase Navigation

### Project Structure
```
src/
├── components/         # React components by feature
│   ├── Auth/          # Authentication (Azure AD/dev mode)
│   ├── Dashboard/     # Financial overview and charts
│   ├── Transactions/  # Transaction management and import
│   ├── Categories/    # Expense categorization
│   ├── Budgets/       # Budget tracking
│   ├── Reports/       # Financial reports
│   ├── Settings/      # Application settings
│   └── shared/        # Reusable UI components
├── services/          # Business logic and Azure integrations
│   ├── azureOpenAIService.ts      # AI transaction categorization
│   ├── dataService.ts             # Local data management
│   ├── fileProcessingService.ts   # Statement import processing
│   └── accountManagementService.ts # Account management
├── config/           # Application configuration
├── data/            # Default categories and mock data
└── types/           # TypeScript type definitions
```

### Key Files to Monitor
- **Always check** `src/services/dataService.ts` after making transaction-related changes
- **Always review** `src/components/Dashboard/` after modifying financial calculations
- **Always validate** `src/services/azureOpenAIService.ts` when updating AI features
- **Package updates**: Check `package.json` and run `npm install` if dependencies change

## CI/CD and Deployment

### GitHub Actions
- Workflow: `.github/workflows/azure-static-web-apps.yml`
- **Build command in CI**: `npm run build` (ESLint warnings fixed - no longer fails)
- **OPTIMIZED**: Enhanced with Node.js 20, better caching, and parallel linting
- Deploys to Azure Static Web Apps automatically on main branch

### Build Optimizations
- **Code splitting**: Lazy loading implemented for all major components
- **Bundle size**: Reduced from 717KB to 132KB main bundle + smaller chunks
- **ESLint**: Zero warnings/errors (previously had 22 warnings)
- **Caching**: npm install optimized with `.npmrc` configuration

## Azure Services Integration

### Development Mode (Default)
- No Azure services required for basic functionality
- Authentication bypassed automatically
- Mock data used for all features
- AI features will show mock confidence scores

### Production Mode (Azure Required)
- **Azure OpenAI**: For transaction categorization
- **Azure AD**: For Microsoft account authentication
- **Azure Static Web Apps**: For hosting
- Environment variables required in `.env` file

## Technology Stack Details

### Core Technologies
- **React**: 18.2.0 with TypeScript
- **Styling**: Styled Components 6.1.6
- **State Management**: React hooks and local storage
- **Grid**: AG Grid Community 31.0.3
- **Charts**: Chart.js 4.4.0 with React Chart.js 2
- **Authentication**: Azure MSAL (production), bypassed in development

### File Processing Support
- **CSV**: Papa Parse library
- **Excel**: XLSX library (.xlsx, .xls)
- **PDF**: pdf-parse library
- **Images**: Browser native support (PNG, JPG)

## Troubleshooting

### Common Issues
1. **Build fails with ESLint errors**: Use `CI=false npm run build`
2. **No tests found error**: Add `--passWithNoTests` flag to test command
3. **Development server slow to start**: Wait for "webpack compiled" message (30 seconds normal)
4. **Missing environment variables**: Copy `.env.example` to `.env` for development

### Expected Warnings
- ESLint warnings (22 warnings, no errors)
- Webpack deprecation warnings during `npm start`
- Bundle size warnings after build (expected for rich financial app)

## Quick Reference

### Most Common Commands
```bash
# Initial setup
npm install                                    # 2-3 min - NEVER CANCEL
cp .env.example .env                          # Instant

# Development workflow  
npm run build                                 # 25-30 sec - NEVER CANCEL (no CI=false needed)
npm start                                     # 15-20 sec - NEVER CANCEL
npm test -- --watchAll=false --passWithNoTests # 10 sec

# Code quality
npm run lint                                  # 2 sec (zero warnings)
npm run lint:fix                              # Auto-fix linting issues
npm run build:analyze                         # Analyze bundle size
```

### Repository Quick Facts
- **Lines of Code**: ~50+ TypeScript/React files
- **Build Output**: `build/` directory (gitignored)  
- **Main Bundle Size**: 132KB (down from 717KB with code splitting)
- **Total Bundle Size**: ~700KB split across multiple lazy-loaded chunks
- **ESLint Status**: Zero warnings/errors (optimized from 22 warnings)
- **Dependencies**: 27 production, 6 development packages
- **Node.js**: Requires version 20+ for optimal performance