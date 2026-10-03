targetScope = 'subscription'

param environmentName string
param location string
param sessionId string
param deployedBy string
param createdAt string
param deployerObjectId string
param resourceGroupName string
param storageAccountName string
param functionAppName string
param planName string
param identityName string
param workspaceName string
param insightsName string

var tags = {
  'app-onboard-skill': 'true'
  'app-onboard-session-id': sessionId
  'created-at': createdAt
  environment: environmentName
  'deployed-by': deployedBy
}

resource rg 'Microsoft.Resources/resourceGroups@2023-07-01' = {
  name: resourceGroupName
  location: location
  tags: tags
}

module identity './modules/identity.bicep' = {
  name: 'identity'
  scope: rg
  params: { name: identityName, location: location, tags: tags }
}

module storage './modules/storage.bicep' = {
  name: 'storage'
  scope: rg
  params: { name: storageAccountName, location: location, tags: tags }
}

module monitoring './modules/monitoring.bicep' = {
  name: 'monitoring'
  scope: rg
  params: { workspaceName: workspaceName, insightsName: insightsName, location: location, tags: tags }
}

module roles './modules/role-assignments.bicep' = {
  name: 'roles'
  scope: rg
  params: {
    storageName: storageAccountName
    insightsName: insightsName
    principalId: identity.outputs.principalId
    deployerObjectId: deployerObjectId
  }
  dependsOn: [storage, monitoring]
}

module app './modules/functions.bicep' = {
  name: 'functions'
  scope: rg
  params: {
    name: functionAppName
    planName: planName
    location: location
    tags: tags
    storageName: storageAccountName
    storageEndpoint: storage.outputs.blobEndpoint
    identityId: identity.outputs.id
    identityClientId: identity.outputs.clientId
    insightsConnectionString: monitoring.outputs.connectionString
  }
  dependsOn: [roles]
}

module migrationAccess './modules/migration-access.bicep' = {
  name: 'legacy-read-access'
  scope: resourceGroup('MoMoney_group')
  params: { deployerObjectId: deployerObjectId }
}

output resourceGroupName string = rg.name
output functionAppId string = app.outputs.id
output functionHostname string = app.outputs.hostname
output storageAccountName string = storageAccountName
output identityClientId string = identity.outputs.clientId
// Microsoft.Web/staticSites/Momoney is reused, never redeployed by this template.
output staticWebAppId string = '/subscriptions/${subscription().subscriptionId}/resourceGroups/Momoney_group-8b40/providers/Microsoft.Web/staticSites/Momoney'
