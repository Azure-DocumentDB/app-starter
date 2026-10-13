# Operator deployment runbook

These commands are **operator-run**, not executed by CI. Azure CLI and Bicep are required. Templates were compiled with Bicep **0.37.4**; API versions are pinned. That compiler emits BCP081 for the newer DocumentDB 2026-06-01 types; compilation succeeds, but an Azure what-if/validation remains mandatory. The users fields and lowercase `servicePrincipal` enum were cross-checked against the current Azure REST specification. Never put credentials in command arguments, templates, evidence or source control. Tokens are acquired via your existing CLI login and App Service managed identity.

## 1. Inspect before provisioning

Supply your own nonsecret values (do not copy the placeholders literally):

```bash
export NEW_RESOURCE_GROUP=rg-app-starter-your-unique-suffix
export LOCATION=westus2
export APP_NAME=your-unique-fieldwork-app
export EXISTING_CLUSTER_RESOURCE_ID='/subscriptions/<subscription>/resourceGroups/<cluster-rg>/providers/Microsoft.DocumentDB/mongoClusters/<cluster>'
export DOCUMENTDB_HOST='<cluster>.mongocluster.cosmos.azure.com'
export DOCUMENTDB_DATABASE=app_starter_your_disposable_suffix
export ALLOW_SAMPLE_WRITES="$DOCUMENTDB_DATABASE"
export OPERATOR_IPV4='<your-public-IPv4>'
# Optional existing same-region Linux plan, whose owner consents to this new app:
export EXISTING_PLAN_RESOURCE_ID=''
npm run build
npm run preflight
az account show --query '{subscription:id,tenant:tenantId}'
az provider show --namespace Microsoft.Web --query registrationState
az webapp list-runtimes --os linux
az rest --method get --url "https://management.azure.com${EXISTING_CLUSTER_RESOURCE_ID}?api-version=2026-06-01"
az group exists --name "$NEW_RESOURCE_GROUP"
```

Stop unless the new RG does **not** exist. Confirm correct subscription, ownership, cluster hostname from the portal/connection settings, Entra mode, cluster health, region and plan quota. `NODE|24-lts` must be available. Register `Microsoft.Web` only if authorized and needed. B1 is the default; choose a larger SKU only after cost/quota approval. An advertised SKU/usage limit is not proof Azure can allocate a plan. Do not run this template against a preexisting application name.

## 2. Compile, preview, create the web app

```bash
az bicep build --file infra/main.bicep
az bicep build --file infra/cluster-user.bicep
az group create --name "$NEW_RESOURCE_GROUP" --location "$LOCATION" \
  --tags sample=azure-documentdb-app-starter purpose=owned-disposable-demo
az deployment group what-if --resource-group "$NEW_RESOURCE_GROUP" \
  --template-file infra/main.bicep \
  --parameters appName="$APP_NAME" location="$LOCATION" \
  existingClusterResourceId="$EXISTING_CLUSTER_RESOURCE_ID" \
  documentDbHost="$DOCUMENTDB_HOST" databaseName="$DOCUMENTDB_DATABASE" \
  operatorIpv4="$OPERATOR_IPV4" existingPlanResourceId="$EXISTING_PLAN_RESOURCE_ID"
# Inspect the preview: ONLY this new app, its policies, and optional new plan.
az deployment group create --name app-starter --resource-group "$NEW_RESOURCE_GROUP" \
  --template-file infra/main.bicep \
  --parameters appName="$APP_NAME" location="$LOCATION" \
  existingClusterResourceId="$EXISTING_CLUSTER_RESOURCE_ID" \
  documentDbHost="$DOCUMENTDB_HOST" databaseName="$DOCUMENTDB_DATABASE" \
  operatorIpv4="$OPERATOR_IPV4" existingPlanResourceId="$EXISTING_PLAN_RESOURCE_ID"
```

If using an approved nondefault SKU, pass e.g. `planSku=P0V4` to both preview and create. A shared plan must be Linux and in the same region. Template does not modify an existing plan or the cluster. `APP_ORIGIN` is set for the standard `azurewebsites.net` domain. Verify the returned hostname; if your platform uses an enhanced hostname, update `APP_ORIGIN` to exactly that HTTPS origin before starting. Never permit `0.0.0.0/0`. The only allow rule is `$OPERATOR_IPV4/32`, with explicit default deny on both app and SCM.

## 3. Register the managed identity as a cluster user

This is a separate **cluster-owner administrative approval**. The current stable API permits `root/admin` only; this is broad cluster-wide data access, not a database-scoped role. Prefer a disposable sample cluster.

```bash
PRINCIPAL_ID=$(az webapp identity show --resource-group "$NEW_RESOURCE_GROUP" \
  --name "$APP_NAME" --query principalId -o tsv)
# Set from the existing resource ID after manually confirming ownership:
export CLUSTER_RESOURCE_GROUP='<existing-cluster-resource-group>'
export CLUSTER_NAME='<existing-cluster-name>'
az deployment group what-if --resource-group "$CLUSTER_RESOURCE_GROUP" \
  --template-file infra/cluster-user.bicep --parameters clusterName="$CLUSTER_NAME" \
  principalId="$PRINCIPAL_ID" rootRoleAcknowledgement=I_ACCEPT_CLUSTER_WIDE_ROOT_FOR_DISPOSABLE_DEMO
az deployment group create --name app-starter-identity --resource-group "$CLUSTER_RESOURCE_GROUP" \
  --template-file infra/cluster-user.bicep --parameters clusterName="$CLUSTER_NAME" \
  principalId="$PRINCIPAL_ID" rootRoleAcknowledgement=I_ACCEPT_CLUSTER_WIDE_ROOT_FOR_DISPOSABLE_DEMO
az webapp show --resource-group "$NEW_RESOURCE_GROUP" --name "$APP_NAME" \
  --query '{outbound:outboundIpAddresses,possibleOutbound:possibleOutboundIpAddresses}'
```

The cluster owner must allow the app's actual outbound IPs using narrow firewall rules, or use a separately designed private network path. Do not enable the special all-Azure-services rule or open the cluster to all IPs. Outbound IPs may change with plan/scale changes; revalidate. The app identity has no Azure control-plane role requirement for normal database access. Wait for user replication before concluding an initial 503 is a code failure.

## 4. ZIP deploy from the allowed operator IP

```bash
npm ci --ignore-scripts
npm test
npm run bundle
az webapp deploy --resource-group "$NEW_RESOURCE_GROUP" --name "$APP_NAME" \
  --src-path artifacts/app-starter.zip --type zip
APP_URL=$(az webapp show --resource-group "$NEW_RESOURCE_GROUP" --name "$APP_NAME" \
  --query defaultHostName -o tsv)
curl --fail "https://${APP_URL}/health/live"
curl --fail "https://${APP_URL}/health/ready"
```

Use a current Azure CLI that supports Entra-authenticated deployment when SCM basic auth is disabled. If deploy returns 401/403, inspect CLI permissions and allowed source IP; **do not enable basic credentials or broaden SCM** to work around it. ZIP is prebuilt with `SCM_DO_BUILD_DURING_DEPLOYMENT=false`, run-from-package, `node dist/server.js`. No seed runs automatically on deployment. Seed locally against the same owned DB if desired, using your registered CLI identity.

## 5. Required live acceptance

From the allowed network, open the actual HTTPS app in a real browser and verify readiness, real create → search → edit → conflict → delete, refresh persistence, filters/pages, responsive layouts, no console failures, and honest error/empty states. Record sanitized outcomes and exact revision/commit, never session cookies or tokens. Readiness 200 from the managed-mode app proves managed-identity database ping/index access; complete the CRUD path to prove data writes.

From a distinct **nonallowlisted** client/network, verify App Service returns 403. Do not spoof forwarding headers to claim this platform gate passed. Direct same-origin write without a session must return 401; with session but missing CSRF or wrong Origin, 403. If quota/network/identity blocks deployment, report that live gate as **blocked**, not passed. Do not claim production end-user authentication.

## 6. Cleanup without touching existing resources

There is no destructive cleanup script. First list the new RG resources, confirm the ownership tags and match them to this deployment. If the RG contains anything preexisting, shared, or unrelated, **do not delete the group**. Have its owner remove only this new app and (if created exclusively here) the new plan. A shared existing plan and the existing cluster must remain untouched. Removing an app does not remove its separately registered cluster user: the cluster owner must inspect and remove only this principal's user resource and firewall rules created solely for it. Use the Azure portal's explicit resource confirmation screens; retain a sanitized cleanup inventory. Any failed deployment can still leave billable resources, so inspect even after errors.
