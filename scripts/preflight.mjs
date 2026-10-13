import { validateHost, assertOwnedDatabase, ipv4 } from '../dist/config.js';
const e=process.env;
try {
  validateHost(e.DOCUMENTDB_HOST??''); assertOwnedDatabase(e.DOCUMENTDB_DATABASE??'',e.ALLOW_SAMPLE_WRITES??'');
  if(!/^\/subscriptions\/[0-9a-f-]{36}\/resourceGroups\/[^/]+\/providers\/Microsoft\.DocumentDB\/mongoClusters\/[^/]+$/i.test(e.EXISTING_CLUSTER_RESOURCE_ID??''))throw new Error('EXISTING_CLUSTER_RESOURCE_ID must identify an existing managed cluster');
  if(!ipv4(e.OPERATOR_IPV4??''))throw new Error('OPERATOR_IPV4 must be a single explicit IPv4 address, not a CIDR or wildcard');
  if(!/^rg-app-starter-[a-z0-9-]{6,50}$/.test(e.NEW_RESOURCE_GROUP??''))throw new Error('NEW_RESOURCE_GROUP must be a new owned rg-app-starter-<unique> group');
  if(!/^[a-z][a-z0-9-]{4,49}$/.test(e.APP_NAME??''))throw new Error('APP_NAME must be a new unique lowercase web app name');
  if(e.EXISTING_PLAN_RESOURCE_ID&&!/^\/subscriptions\/[0-9a-f-]{36}\/resourceGroups\/[^/]+\/providers\/Microsoft\.Web\/serverfarms\/[^/]+$/i.test(e.EXISTING_PLAN_RESOURCE_ID))throw new Error('Invalid existing plan resource ID');
  console.log('Local preflight passed. No cloud calls were made. Verify cluster hostname, Entra mode, ownership, quota, region and firewall in Azure before deployment.');
} catch(error){console.error(error.message);process.exitCode=1;}
