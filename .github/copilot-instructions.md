# Mo Money - Financial Tracking Application

Mo Money is a React TypeScript web application for financial tracking and budget management with AI-powered transaction categorization using Azure services.

**Always reference these instructions first and fallback to search or bash commands only when you encounter unexpected information that does not match the info here.**

## Working Effectively

### Bootstrap and Setup
- **NEVER CANCEL**: `npm install` -- takes 4 minutes to complete. Set timeout to 10+ minutes.
- Copy `.env.example` to `.env` for development mode: `cp .env.example .env`
- Development mode bypasses authentication automatically (REACT_APP_SKIP_AUTH defaults to true)

### Build and Test (OPTIMIZED!)
- **Build for production**: `npm run build` -- takes 23 seconds (down from 45s!). NEVER CANCEL. Set timeout to 3+ minutes.
  - **FIXED**: No longer requires `CI=false` - ESLint warnings resolved!
  - **NEW**: Code splitting implemented - main bundle reduced from 716KB to 133KB (81% improvement!)
- **Test suite**: `npm test -- --watchAll=false --passWithNoTests` -- completes in 10 seconds
  - **NOTE**: No unit tests exist in the project, but test infrastructure works
  - Test command will fail without `--passWithNoTests` flag
- **Linting**: `npx eslint src --ext .ts,.tsx` -- runs in 30 seconds, minimal warnings
- **Performance analysis**: `npm run perf:check` -- analyze bundle size and performance

### Run the Application
- **Development server**: `npm start` -- takes 30 seconds to start, runs on http://localhost:3000
  - Application loads with sample data automatically
  - Uses "Development User" account with mock transactions
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

### **CRITICAL**: Timeout Values and Build Times (UPDATED - Much Faster!)
- **`npm install`**: 16 seconds actual time. **NEVER CANCEL**. Set timeout to 2+ minutes.
- **`npm run build`**: 23 seconds actual time (down from 45s!). **NEVER CANCEL**. Set timeout to 3+ minutes.
- **`npm start`**: 30 seconds to start serving. **NEVER CANCEL**. Set timeout to 3+ minutes.
- **`npm test`**: 10 seconds with `--passWithNoTests` flag.
- **`npx eslint`**: 30 seconds for full codebase lint check.

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
- **Build command in CI**: `npm run build` (ESLint warnings now resolved!)
- **FIXED**: CI build no longer requires CI=false workaround
- Deploys to Azure Static Web Apps automatically on main branch

### Build Issues (RESOLVED!)
- **✅ FIXED**: ESLint warnings that caused CI failures - no longer need CI=false
- **✅ IMPROVED**: Bundle size reduced from 716KB to 133KB main bundle (81% improvement)
- **✅ OPTIMIZED**: Code splitting implemented for all routes
- **Known warnings**: Deprecation warnings from webpack-dev-server are expected

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

### Common Issues (UPDATED!)
1. **✅ RESOLVED**: Build no longer fails with ESLint errors
2. **No tests found error**: Add `--passWithNoTests` flag to test command
3. **Development server slow to start**: Wait for "webpack compiled" message (30 seconds normal)
4. **Missing environment variables**: Copy `.env.example` to `.env` for development

### Expected Warnings (UPDATED!)
- Minimal ESLint warnings (major issues resolved)
- Webpack deprecation warnings during `npm start`
- Bundle analysis shows optimal code splitting (main: 133KB, chunks: auto-loaded)

## Quick Reference

### Most Common Commands (UPDATED - Much Faster!)
```bash
# Initial setup
npm install                                    # 16 sec - MUCH FASTER!
cp .env.example .env                          # Instant

# Development workflow (OPTIMIZED!)
npm run build                                 # 23 sec - 50% FASTER!
npm start                                     # 30 sec - NEVER CANCEL
npm test -- --watchAll=false --passWithNoTests # 10 sec

# Code quality & analysis
npx eslint src --ext .ts,.tsx                # 30 sec
npm run perf:check                           # 5 sec - NEW: bundle analysis
npm run build:analyze                        # 25 sec - detailed analysis
```

### Repository Quick Facts (UPDATED!)
- **Lines of Code**: ~50+ TypeScript/React files
- **Build Output**: `build/` directory (gitignored)
- **Bundle Size**: 133KB main + optimized chunks (was 658KB single bundle - 81% improvement!)
- **Code Splitting**: ✅ Implemented for all routes
- **Test Coverage**: 0% (no tests exist)
- **Dependencies**: 27 production, 8 development packages