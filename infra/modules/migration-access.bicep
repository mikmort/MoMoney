param deployerObjectId string

resource legacy 'Microsoft.Storage/storageAccounts@2026-09-01' existing = {
  name: 'momoneygroupbb64'
}
resource blobs 'Microsoft.Storage/storageAccounts/blobServices@2026-09-01' existing = {
  parent: legacy
  name: 'default'
}
resource source 'Microsoft.Storage/storageAccounts/blobServices/containers@2026-09-01' existing = {
  parent: blobs
  name: 'money-files'
}
resource reader 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  name: guid(source.id, deployerObjectId, '2a2b9908-6ea1-4ae2-8e65-a410df84e7d1')
  scope: source
  properties: {
    principalId: deployerObjectId
    principalType: 'User'
    roleDefinitionId: subscriptionResourceId('Microsoft.Authorization/roleDefinitions', '2a2b9908-6ea1-4ae2-8e65-a410df84e7d1')
  }
}
