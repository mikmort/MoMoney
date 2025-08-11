# Mo Money - Financial Tracking Application

Mo Money is a React TypeScript web application for financial tracking and budget management with AI-powered transaction categorization using Azure services.

**Always reference these instructions first and fallback to search or bash commands only when you encounter unexpected information that does not match the info here.**

## Working Effectively

### Bootstrap and Setup
- **FAST**: `npm install` -- takes 5 seconds to complete. Set timeout to 2+ minutes to be safe.
- Copy `.env.example` to `.env` for development mode: `cp .env.example .env`
- Development mode bypasses authentication automatically (REACT_APP_SKIP_AUTH defaults to true)

### Build and Test (VALIDATED!)
- **Build for production**: `npm run build` -- takes 22-23 seconds. NEVER CANCEL. Set timeout to 3+ minutes.
  - **IMPORTANT**: May require fixing ESLint issues first - build treats warnings as errors in CI mode
  - **VERIFIED**: Code splitting implemented - main bundle 133.4 KB gzipped (466 KB ungzipped)
- **Test suite**: `npm test -- --watchAll=false --passWithNoTests` -- completes in 4 seconds
  - **CORRECTED**: Unit tests DO exist in the project (5 test suites, 35+ tests)
  - **NOTE**: Some tests may show console warnings but will pass
- **Linting**: `npx eslint src --ext .ts,.tsx` -- runs in 4 seconds, may show some warnings
- **Performance analysis**: `npm run perf:check` -- analyze bundle size, runs in under 1 second

### Run the Application
- **Development server**: `npm start` -- takes 35 seconds to start, runs on http://localhost:3000
  - Application starts with NO sample data by default (0 transactions)
  - Uses "Development User" account (dev@momoney.app) 
  - **NEVER CANCEL**: Wait for "webpack compiled successfully" message before testing
  - **IMPORTANT**: For screenshots and demos, manually load sample data via Settings (see Sample Data section below)
- **Production preview**: `npx serve -s build` (after building) -- serves on port 3000

## Validation Scenarios

### **CRITICAL**: Manual Testing Requirements
After making changes, **ALWAYS** run through these validation scenarios:

#### Essential User Flows
1. **Dashboard Validation**:
   - Navigate to http://localhost:3000
   - **CRITICAL**: Load sample data first if needed (see Sample Data section)
   - Verify financial summary cards show totals (Income, Expenses, Net Income, Transactions)
   - Confirm "Spending by Category" pie chart renders
   - Check "Monthly Trend" bar chart displays correctly

2. **Transaction Management**:
   - **CRITICAL**: Load sample data first if needed (see Sample Data section)
   - Click "💳 Transactions" in sidebar
   - **NOTE**: Transactions page may show React errors with sample data (known issue)
   - Alternative: View transactions via Dashboard > Recent Transactions > More...
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

## Sample Data for Testing and Screenshots

### **CRITICAL**: Loading Sample Data
The application starts with **NO sample data** by default. For meaningful testing and screenshots, you must manually load sample data:

1. **Start the development server**: `npm start`
2. **Navigate to application**: http://localhost:3000
3. **Dismiss any database dialogs** if they appear
4. **Go to Settings**: Click "⚙️ Settings" in the sidebar
5. **Load sample data**: Scroll down to "📊 Sample Data" section
6. **Click "📊 Load Sample Data"** button
7. **Confirm the dialog** when prompted
8. **Wait for success message** and page reload

### Sample Data Contents (11 Transactions)
After loading, you'll have rich sample data including:
- **Financial Summary**: $2,500 income, $3,759.50 expenses, -$1,259.50 net income
- **Multiple Categories**: Food & Dining, Transportation, Housing, Travel, Internal Transfer
- **Multiple Accounts**: Chase Checking, Primary Savings, Chase Credit, AmEx Platinum
- **Multi-currency**: Transactions in USD, EUR, JPY, GBP with exchange rates
- **AI Features**: Confidence scores (88-99%) with reasoning explanations
- **Transfer Matching**: Paired transfer transactions between accounts
- **Rich Details**: Vendor names, notes, verified/unverified transactions

### Sample Data Dashboard Features
With sample data loaded, the dashboard shows:
- ✅ **Financial cards** with real totals and transaction counts
- ✅ **"Spending by Category" pie chart** with actual category data  
- ✅ **"Monthly Trend" bar chart** with transaction patterns
- ✅ **Recent Transactions list** with 5 sample transactions + "More..." button

### Known Issues with Sample Data
- ⚠️ **Transactions page (/transactions)**: May show React errors with sample data loaded
- ✅ **Dashboard**: Works perfectly with sample data
- ✅ **Other pages**: Categories, Budgets, Reports, Settings work normally

### For Screenshots and Demos
**ALWAYS load sample data first** before taking screenshots or demonstrating features. Without sample data:
- Dashboard shows "Welcome" message asking to add first account
- Charts are empty or show placeholder states  
- No meaningful transaction data to demonstrate features
- Testing scenarios are limited

## Common Commands and Timing

### **CRITICAL**: Timeout Values and Build Times (VALIDATED!)
- **`npm install`**: 5 seconds actual time. **FAST**. Set timeout to 2+ minutes to be safe.
- **`npm run build`**: 22-23 seconds actual time. **NEVER CANCEL**. Set timeout to 3+ minutes.
- **`npm start`**: 35 seconds to start serving. **NEVER CANCEL**. Set timeout to 3+ minutes.
- **`npm test`**: 4 seconds with existing tests (5 suites, 35+ tests).
- **`npx eslint`**: 4 seconds for full codebase lint check.

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
- **Build command in CI**: `npm run build` 
- **IMPORTANT**: CI build may fail if ESLint warnings are present (treats warnings as errors)
- Deploys to Azure Static Web Apps automatically on main branch

### Build Issues (CURRENT STATUS!)
- **⚠️ IMPORTANT**: Build treats ESLint warnings as errors in CI mode - fix warnings first
- **✅ VERIFIED**: Bundle size - main bundle 133.4 KB gzipped, 466 KB ungzipped  
- **✅ OPTIMIZED**: Code splitting implemented for all routes
- **Expected warnings**: Deprecation warnings from webpack-dev-server during `npm start`

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

### Common Issues (VALIDATED!)
1. **⚠️ BUILD FAILURES**: Fix ESLint warnings first - build treats warnings as errors in CI mode
2. **Tests**: Tests exist and run successfully (5 suites, 35+ tests)
3. **Development server slow to start**: Wait for "webpack compiled successfully" message (35 seconds normal)
4. **Missing environment variables**: Copy `.env.example` to `.env` for development
5. **Empty screenshots/demos**: Load sample data first via Settings > "📊 Load Sample Data" (see Sample Data section)
6. **Transactions page errors**: Known issue with sample data - use Dashboard view instead

### Expected Warnings (VALIDATED!)
- Some ESLint warnings may exist in test files (build will fail if any exist)
- Webpack deprecation warnings during `npm start` are normal
- Console warnings in tests are expected but tests still pass

## Quick Reference

### Most Common Commands (VALIDATED!)
```bash
# Initial setup
npm install                                    # 5 sec - FAST!
cp .env.example .env                          # Instant

# Development workflow (VALIDATED!)
npm run build                                 # 22-23 sec - NEVER CANCEL
npm start                                     # 35 sec - NEVER CANCEL
npm test -- --watchAll=false --passWithNoTests # 4 sec - tests exist!

# Code quality & analysis
npx eslint src --ext .ts,.tsx                # 4 sec - may show warnings
npm run perf:check                           # <1 sec - bundle analysis
npm run build:analyze                        # 23 sec - detailed analysis (has source map warnings)
```

### Sample Data Quick Setup
```bash
# After starting the app for testing/screenshots:
# 1. Visit http://localhost:3000
# 2. Click "⚙️ Settings" in sidebar  
# 3. Scroll to "📊 Sample Data" section
# 4. Click "📊 Load Sample Data" button
# 5. Confirm dialog and wait for reload
# Result: 11 transactions with rich financial data loaded
```

### Repository Quick Facts (VALIDATED!)
- **Lines of Code**: ~50+ TypeScript/React files
- **Build Output**: `build/` directory (gitignored)
- **Bundle Size**: 133.4 KB main gzipped + optimized chunks (466 KB main ungzipped)
- **Code Splitting**: ✅ Implemented for all routes
- **Test Coverage**: 35+ tests across 5 test suites (all passing)
- **Dependencies**: 27 production, 8 development packages
- **Sample Data**: 11 transactions (manually loaded via Settings)