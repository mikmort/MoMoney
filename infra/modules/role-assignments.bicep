param storageName string
param insightsName string
param principalId string
param deployerObjectId string

resource storage 'Microsoft.Storage/storageAccounts@2026-09-01' existing = { name: storageName }
resource insights 'Microsoft.Insights/components@2020-02-02' existing = { name: insightsName }

var hostRoles = [
  'b7e6dc6d-f1e8-4753-8033-0f276bb0955b' // Storage Blob Data Owner: host leases and API blobs
  '974c5e8b-45b9-4653-ba55-5f855dd0fb88' // Storage Queue Data Contributor: Functions host
]

resource hostAccess 'Microsoft.Authorization/roleAssignments@2022-04-01' = [for roleId in hostRoles: {
  name: guid(storage.id, principalId, roleId)
  scope: storage
  properties: {
    principalId: principalId
    principalType: 'ServicePrincipal'
    roleDefinitionId: subscriptionResourceId('Microsoft.Authorization/roleDefinitions', roleId)
  }
}]

resource migrationAccess 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  name: guid(storage.id, deployerObjectId, 'ba92f5b4-2d11-453d-a403-e96b0029c9fe')
  scope: storage
  properties: {
    principalId: deployerObjectId
    principalType: 'User'
    roleDefinitionId: subscriptionResourceId('Microsoft.Authorization/roleDefinitions', 'ba92f5b4-2d11-453d-a403-e96b0029c9fe')
  }
}

resource telemetryAccess 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  name: guid(insights.id, principalId, '3913510d-42f4-4e42-8a64-420c390055eb')
  scope: insights
  properties: {
    principalId: principalId
    principalType: 'ServicePrincipal'
    roleDefinitionId: subscriptionResourceId('Microsoft.Authorization/roleDefinitions', '3913510d-42f4-4e42-8a64-420c390055eb')
  }
}
