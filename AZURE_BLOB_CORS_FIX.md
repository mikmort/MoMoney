# Azure Blob Storage CORS Fix Guide

## Problem
Blob file uploads to Azure Functions are failing with:
```
403 (Forbidden) - Origin not allowed
```

## Root Cause
The Azure Functions app `storageproxy-c6g8bvbcdqc7duam.canadacentral-01.azurewebsites.net` does not have CORS (Cross-Origin Resource Sharing) configured to allow requests from the Static Web Apps domain `https://gentle-moss-087d9321e.1.azurestaticapps.net`.

## Fix Steps

### Option 1: Azure Portal CORS Configuration (Recommended)
1. **Go to Azure Portal**: https://portal.azure.com
2. **Navigate to Function Apps** → **storageproxy-c6g8bvbcdqc7duam**
3. **Click "CORS"** in the left sidebar (under API section)
4. **Add these allowed origins**:
   ```
   https://gentle-moss-087d9321e.1.azurestaticapps.net
   http://localhost:3000
   https://localhost:3000
   ```
5. **Enable "Access-Control-Allow-Credentials"** (check the box)
6. **Click "Save"**
7. **Wait 2-3 minutes** for changes to propagate

### Option 2: Functions Code Configuration
If you have access to the Azure Functions source code, add this to `host.json`:

```json
{
  "version": "2.0",
  "cors": {
    "supportCredentials": true,
    "allowedOrigins": [
      "https://gentle-moss-087d9321e.1.azurestaticapps.net",
      "http://localhost:3000",
      "https://localhost:3000"
    ]
  }
}
```

### Option 3: Individual Function CORS Headers
Add these headers to each Azure Function response:

```javascript
context.res = {
    headers: {
        "Access-Control-Allow-Origin": "https://gentle-moss-087d9321e.1.azurestaticapps.net",
        "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type, x-metadata-source, x-metadata-timestamp",
        "Access-Control-Allow-Credentials": "true"
    },
    body: responseData
};
```

## Testing the Fix

### 1. Browser Console Test
After applying CORS fix, test in browser console:
```javascript
fetch('https://storageproxy-c6g8bvbcdqc7duam.canadacentral-01.azurewebsites.net/api/blob/list')
  .then(r => console.log('Status:', r.status))
  .catch(e => console.log('Error:', e));
```

**Expected Result (fixed):**
- Status: 200 or 404 (depending on endpoint existence)
- No CORS errors

**Current Result (broken):**
- Status: 403
- Error: "Origin not allowed"

### 2. App Upload Test
1. Go to Mo Money app: https://gentle-moss-087d9321e.1.azurestaticapps.net/
2. Navigate to Settings → Cloud Sync
3. Try uploading/syncing data
4. Check browser console for errors

**Expected Result (fixed):**
- Upload successful
- No 403 Forbidden errors

**Current Result (broken):**
- 403 Forbidden: Origin not allowed
- Upload fails

## Verification Checklist
- [ ] CORS origins added to Azure Functions app
- [ ] Access-Control-Allow-Credentials enabled
- [ ] Changes saved and propagated (wait 2-3 minutes)
- [ ] Browser test shows no CORS errors
- [ ] App blob upload works without 403 errors
- [ ] Console shows successful upload messages

## Troubleshooting
If CORS fix doesn't work immediately:

1. **Wait for propagation**: CORS changes can take 2-5 minutes to take effect
2. **Clear browser cache**: Hard refresh the app (Ctrl+F5)
3. **Check exact origin**: Ensure the origin exactly matches the domain (https vs http, www vs non-www)
4. **Check Function App logs**: Look for CORS-related errors in Azure Portal → Functions → Monitor
5. **Verify Function App is running**: Check that the Functions app is not stopped or in an error state

## Additional Notes
- The Azure Functions app `storageproxy-c6g8bvbcdqc7duam` appears to be in Canada Central region
- The Static Web Apps domain `gentle-moss-087d9321e.1.azurestaticapps.net` needs to be explicitly allowed
- Local development (localhost:3000) should also be allowed for testing
- All blob endpoints (/list, /upload, etc.) will be affected by CORS settings
