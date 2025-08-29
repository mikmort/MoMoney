# Azure Static Web Apps Authentication Fix Guide

## Problem
The MSA (Microsoft Account) login is not working in production at https://gentle-moss-087d9321e.1.azurestaticapps.net/

**Root Cause:** The `/.auth/me` endpoint is returning HTML instead of JSON, which indicates that Azure Static Web Apps authentication is not properly configured.

## Diagnosis Results
- ✗ `/.auth/me` returns HTML (should return JSON)
- ✗ Missing or incorrect Azure AD app registration configuration
- ✗ Missing environment variables in Azure Static Web Apps

## Required Fixes

### 1. Azure AD App Registration
You need to create or update an Azure AD app registration:

1. Go to [Azure Portal](https://portal.azure.com)
2. Navigate to **Azure Active Directory** > **App registrations**
3. Create a new registration or find existing one for "Mo Money"
4. Configure the following:
   - **Name**: Mo Money
   - **Supported account types**: Accounts in any organizational directory (Any Azure AD directory - Multitenant) and personal Microsoft accounts (e.g. Skype, Xbox)
   - **Redirect URI**: 
     - Type: Web
     - URI: `https://gentle-moss-087d9321e.1.azurestaticapps.net/.auth/login/aad/callback`

5. After creation, note down:
   - **Application (client) ID**
   - Create a **Client Secret** (Certificates & secrets section)

### 2. Azure Static Web Apps Configuration
In the Azure Portal, find your Static Web App "gentle-moss-087d9321e" and add these environment variables:

1. Go to **Azure Portal** > **Static Web Apps** > **gentle-moss-087d9321e**
2. Click **Configuration** in the left menu
3. Add the following **Application settings**:
   - `AZURE_CLIENT_ID`: [Your App Registration Client ID]
   - `AZURE_CLIENT_SECRET`: [Your App Registration Client Secret]

### 3. Verify Configuration File
Ensure `public/staticwebapp.config.json` is properly deployed (it should be):

```json
{
  "auth": {
    "identityProviders": {
      "azureActiveDirectory": {
        "registration": {
          "openIdIssuer": "https://login.microsoftonline.com/common/v2.0",
          "clientIdSettingName": "AZURE_CLIENT_ID",
          "clientSecretSettingName": "AZURE_CLIENT_SECRET"
        }
      }
    }
  }
}
```

## Testing the Fix

### 1. Test Authentication Endpoint
After applying the fixes, test the auth endpoint:

```bash
curl -s "https://gentle-moss-087d9321e.1.azurestaticapps.net/.auth/me" | head -1
```

**Expected Result (fixed):**
```json
{"clientPrincipal":null}
```

**Current Result (broken):**
```html
<!doctype html>
```

### 2. Use Debug Page
Visit: https://gentle-moss-087d9321e.1.azurestaticapps.net/auth-debug.html

This will provide detailed diagnostics about the authentication configuration.

### 3. Test Login Flow
1. Visit: https://gentle-moss-087d9321e.1.azurestaticapps.net/
2. Click "Sign in with Microsoft" 
3. Should redirect to Microsoft login
4. After login, should redirect back to the app with user authenticated

## Expected Timeline
- **Configuration changes**: 5-10 minutes
- **Deployment propagation**: 5-15 minutes
- **DNS/CDN cache**: Up to 30 minutes

## Verification Checklist
- [ ] Azure AD app registration created with correct redirect URI
- [ ] AZURE_CLIENT_ID environment variable set in Static Web Apps
- [ ] AZURE_CLIENT_SECRET environment variable set in Static Web Apps
- [ ] `/.auth/me` returns JSON instead of HTML
- [ ] Login flow redirects to Microsoft authentication
- [ ] User can successfully authenticate and access the app
- [ ] Debug page shows successful authentication configuration

## Troubleshooting
If issues persist after configuration:

1. **Check deployment**: Ensure latest code with `staticwebapp.config.json` is deployed
2. **Check environment variables**: Verify they are set correctly (no extra spaces, correct values)
3. **Check app registration**: Ensure redirect URI exactly matches the Static Web Apps domain
4. **Clear browser cache**: Authentication tokens may be cached
5. **Check Azure logs**: Look for authentication errors in Azure Portal logs

## Technical Details
- **Service**: `src/services/staticWebAppAuthService.ts` - handles /.auth/ endpoints
- **Hook**: `src/hooks/useAppAuth.ts` - provides authentication state
- **Wrapper**: `src/components/Auth/AuthWrapper.tsx` - manages auth UI
- **Config**: `public/staticwebapp.config.json` - Azure Static Web Apps configuration
