param name string
param location string
param tags object

resource storage 'Microsoft.Storage/storageAccounts@2026-09-01' = {
  name: name
  location: location
  tags: tags
  kind: 'StorageV2'
  sku: { name: 'Standard_LRS' }
  properties: {
    accessTier: 'Hot'
    allowBlobPublicAccess: false
    allowSharedKeyAccess: false
    supportsHttpsTrafficOnly: true
    minimumTlsVersion: 'TLS1_2'
    publicNetworkAccess: 'Enabled'
  }
  resource blobs 'blobServices' = {
    name: 'default'
    properties: {
      isVersioningEnabled: true
      deleteRetentionPolicy: { enabled: true, days: 30 }
      containerDeleteRetentionPolicy: { enabled: true, days: 30 }
    }
    resource money 'containers' = {
      name: 'money-files'
      properties: { publicAccess: 'None' }
    }
    resource deployment 'containers' = {
      name: 'deployment'
      properties: { publicAccess: 'None' }
    }
  }
}

output blobEndpoint string = storage.properties.primaryEndpoints.blob
