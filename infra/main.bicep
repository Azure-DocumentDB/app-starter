targetScope = 'resourceGroup'

@description('Globally unique name for a NEW operator demo web app.')
@minLength(3)
@maxLength(50)
param appName string
param location string = resourceGroup().location
@description('Existing managed Azure DocumentDB cluster; never created, changed or deleted by this template.')
param existingClusterResourceId string
param documentDbHost string
param databaseName string
@description('One explicit operator public IPv4 address, no CIDR. Main and SCM deny every other source.')
param operatorIpv4 string
@description('Optional existing Linux plan in the same region. Otherwise creates an owned plan.')
param existingPlanResourceId string = ''
@allowed(['B1', 'S1', 'P0V4'])
param planSku string = 'B1'

var tags = { sample: 'azure-documentdb-app-starter', purpose: 'owned-disposable-demo' }
resource plan 'Microsoft.Web/serverfarms@2024-11-01' = if (empty(existingPlanResourceId)) {
  name: '${appName}-plan'
  location: location
  tags: tags
  kind: 'linux'
  sku: { name: planSku, capacity: 1 }
  properties: { reserved: true }
}
resource app 'Microsoft.Web/sites@2024-11-01' = {
  name: appName
  location: location
  tags: tags
  kind: 'app,linux'
  identity: { type: 'SystemAssigned' }
  properties: {
    serverFarmId: empty(existingPlanResourceId) ? plan!.id : existingPlanResourceId
    httpsOnly: true
    publicNetworkAccess: 'Enabled'
    siteConfig: {
      linuxFxVersion: 'NODE|24-lts'
      appCommandLine: 'node dist/server.js'
      alwaysOn: true
      ftpsState: 'Disabled'
      minTlsVersion: '1.2'
      scmMinTlsVersion: '1.2'
      http20Enabled: true
      remoteDebuggingEnabled: false
      ipSecurityRestrictionsDefaultAction: 'Deny'
      ipSecurityRestrictions: [
        { name: 'Explicit operator only', ipAddress: '${operatorIpv4}/32', action: 'Allow', priority: 100 }
      ]
      scmIpSecurityRestrictionsUseMain: true
      scmIpSecurityRestrictionsDefaultAction: 'Deny'
      appSettings: [
        { name: 'NODE_ENV', value: 'production' }
        { name: 'AZURE_AUTH_MODE', value: 'managed-identity' }
        { name: 'AZURE_TOKEN_CREDENTIALS', value: 'ManagedIdentityCredential' }
        { name: 'DOCUMENTDB_HOST', value: documentDbHost }
        { name: 'DOCUMENTDB_DATABASE', value: databaseName }
        { name: 'ALLOW_SAMPLE_WRITES', value: databaseName }
        { name: 'APP_ORIGIN', value: 'https://${appName}.azurewebsites.net' }
        { name: 'OPERATOR_IPV4', value: operatorIpv4 }
        { name: 'SCM_DO_BUILD_DURING_DEPLOYMENT', value: 'false' }
        { name: 'WEBSITE_RUN_FROM_PACKAGE', value: '1' }
      ]
    }
  }
}
resource ftpPolicy 'Microsoft.Web/sites/basicPublishingCredentialsPolicies@2024-11-01' = {
  parent: app
  name: 'ftp'
  properties: { allow: false }
}
resource scmPolicy 'Microsoft.Web/sites/basicPublishingCredentialsPolicies@2024-11-01' = {
  parent: app
  name: 'scm'
  properties: { allow: false }
}
output appUrl string = 'https://${app.properties.defaultHostName}'
output principalId string = app.identity.principalId
output appResourceId string = app.id
output existingClusterId string = existingClusterResourceId
