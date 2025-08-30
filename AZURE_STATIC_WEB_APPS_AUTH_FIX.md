# Azure Static Web Apps Authentication Fix

## Problem
The Mo Money application was not working properly in production on Azure Static Web Apps. When users clicked "Sign in with Microsoft", they would be redirected to `/.auth/login/aad?post_login_redirect_uri=%2F` but the authentication wouldn't complete properly.

## Root Cause
The application was using **MSAL (Microsoft Authentication Library)** for client-side authentication in all environments, but Azure Static Web Apps has its own **built-in authentication system** that uses different endpoints and APIs. The app was not detecting that it was running in Azure Static Web Apps and using the appropriate authentication method.

## Solution
Created a smart authentication wrapper that:

1. **Detects the deployment environment**:
   - Development mode: Uses `skipAuthentication` bypass
   - Azure Static Web Apps: Uses built-in `/.auth/` endpoints
   - Other deployments: Falls back to MSAL

2. **New files created**:
   - `src/utils/azureStaticWebAppsDetection.ts` - Detects Azure Static Web Apps environment
   - `src/services/staticWebAppAuthService.ts` - Service for Azure Static Web Apps authentication
   - `src/components/Auth/AuthWrapper.tsx` - Smart authentication wrapper component
   - `src/__tests__/azureStaticWebAppsAuthFix.test.ts` - Tests for the fix

3. **Modified files**:
   - `src/App.tsx` - Updated to use the new AuthWrapper instead of direct MSAL

## Technical Details

### Environment Detection
The system detects Azure Static Web Apps by:
- Checking for `.azurestaticapps.net` in the hostname
- Testing if the `/.auth/me` endpoint returns JSON (Azure Static Web Apps specific)
- Never using Azure Static Web Apps auth in development mode

### Authentication Flow
- **Azure Static Web Apps**: Uses `/.auth/login/aad` and `/.auth/me` endpoints
- **Development**: Bypasses authentication entirely
- **Other environments**: Uses MSAL with popup authentication

### Login Page
The Azure Static Web Apps login page maintains the same visual design as the MSAL version but redirects to the correct Azure Static Web Apps authentication endpoint.

## Testing
- Build passes: ✅
- Authentication tests pass: ✅
- No regressions in existing functionality: ✅

## Production Impact
This fix should resolve the Microsoft Account login issue at:
https://gentle-moss-087d9321e.1.azurestaticapps.net/

Users will now be properly authenticated through Azure Static Web Apps built-in authentication system.
