targetScope = 'resourceGroup'
@description('Existing cluster name in this deployment resource group.')
param clusterName string
@description('App Service system-assigned identity principal/object ID, NOT app/client ID.')
param principalId string
@description('Must explicitly acknowledge the 2026-06-01 API root/admin limitation.')
@allowed(['I_ACCEPT_CLUSTER_WIDE_ROOT_FOR_DISPOSABLE_DEMO'])
param rootRoleAcknowledgement string
resource cluster 'Microsoft.DocumentDB/mongoClusters@2026-06-01' existing = { name: clusterName }
resource user 'Microsoft.DocumentDB/mongoClusters/users@2026-06-01' = {
  parent: cluster
  name: principalId
  properties: {
    identityProvider: {
      type: 'MicrosoftEntraID'
      properties: { principalType: 'servicePrincipal' }
    }
    roles: [ { db: 'admin', role: 'root' } ]
  }
}
output userResourceId string = user.id
output acknowledged string = rootRoleAcknowledgement
