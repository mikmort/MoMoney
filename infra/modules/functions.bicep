param name string
param planName string
param location string
param tags object
param storageName string
param storageEndpoint string
param identityId string
param identityClientId string
param insightsConnectionString string

resource plan 'Microsoft.Web/serverfarms@2026-08-01' = {
  name: planName
  location: location
  tags: tags
  kind: 'functionapp'
  sku: { name: 'FC1', tier: 'FlexConsumption' }
  properties: { reserved: true }
}

resource app 'Microsoft.Web/sites@2026-08-01' = {
  name: name
  location: location
  tags: tags
  kind: 'functionapp,linux'
  identity: {
    type: 'UserAssigned'
    userAssignedIdentities: { '${identityId}': {} }
  }
  properties: {
    serverFarmId: plan.id
    httpsOnly: true
    siteConfig: {
      minTlsVersion: '1.2'
      ftpsState: 'Disabled'
      appSettings: [
        { name: 'AzureWebJobsStorage__accountName', value: storageName }
        { name: 'AzureWebJobsStorage__credential', value: 'managedidentity' }
        { name: 'AzureWebJobsStorage__clientId', value: identityClientId }
        { name: 'AZURE_CLIENT_ID', value: identityClientId }
        { name: 'STORAGE_ACCOUNT_URL', value: storageEndpoint }
        { name: 'STORAGE_CONTAINER', value: 'money-files' }
        // No data access until the linked platform identity is configured and checked.
        { name: 'STORAGE_AUTH_MODE', value: 'disabled' }
        { name: 'STORAGE_IMPORT_LEGACY', value: 'true' }
        { name: 'FUNCTIONS_REQUEST_BODY_SIZE_LIMIT', value: '10485760' }
        { name: 'APPLICATIONINSIGHTS_CONNECTION_STRING', value: insightsConnectionString }
        { name: 'APPLICATIONINSIGHTS_AUTHENTICATION_STRING', value: 'ClientId=${identityClientId};Authorization=AAD' }
      ]
    }
    functionAppConfig: {
      runtime: { name: 'node', version: '22' }
      deployment: {
        storage: {
          type: 'blobContainer'
          value: '${storageEndpoint}deployment'
          authentication: {
            type: 'UserAssignedIdentity'
            userAssignedIdentityResourceId: identityId
          }
        }
      }
      scaleAndConcurrency: {
        maximumInstanceCount: 40
        instanceMemoryMB: 512
      }
    }
  }
}

resource authentication 'Microsoft.Web/sites/config@2026-08-01' = {
  parent: app
  name: 'authsettingsV2'
  properties: {
    platform: { enabled: true }
    globalValidation: { requireAuthentication: true, unauthenticatedClientAction: 'Return401' }
    httpSettings: { requireHttps: true }
  }
}

resource scm 'Microsoft.Web/sites/basicPublishingCredentialsPolicies@2026-08-01' = {
  parent: app
  name: 'scm'
  properties: { allow: false }
}
resource ftp 'Microsoft.Web/sites/basicPublishingCredentialsPolicies@2026-08-01' = {
  parent: app
  name: 'ftp'
  properties: { allow: false }
}

output id string = app.id
output hostname string = app.properties.defaultHostName
