export const TOKEN_SCOPE = 'https://ossrdbms-aad.database.windows.net/.default';
export interface Config { host: string; database: string; writeGuard: string; mode: 'cli' | 'managed-identity'; origin: string; port: number; operatorIpv4?: string; cloud: boolean }
export function validateHost(host: string): string {
  if (!/^[a-z0-9][a-z0-9-]{1,62}(?:\.global)?\.mongocluster\.cosmos\.azure\.com$/.test(host)) throw new Error('DOCUMENTDB_HOST must be a managed Azure DocumentDB public-cloud hostname, not a URI');
  return host;
}
export function assertOwnedDatabase(database: string, guard: string): void {
  if (!/^app_starter_[a-z0-9_]{6,40}$/.test(database) || guard !== database) throw new Error('Use an owned disposable app_starter_<suffix> database and matching ALLOW_SAMPLE_WRITES');
}
export function ipv4(value: string): boolean { return /^(?:\d{1,3}\.){3}\d{1,3}$/.test(value) && value.split('.').every(n => Number(n) <= 255 && String(Number(n)) === n) && value !== '0.0.0.0'; }
export function loadConfig(env = process.env): Config {
  const host = validateHost(env.DOCUMENTDB_HOST ?? '');
  const database = env.DOCUMENTDB_DATABASE ?? ''; const writeGuard = env.ALLOW_SAMPLE_WRITES ?? '';
  assertOwnedDatabase(database, writeGuard);
  const mode = env.AZURE_AUTH_MODE;
  if (mode !== 'cli' && mode !== 'managed-identity') throw new Error('AZURE_AUTH_MODE must be cli or managed-identity');
  const port = Number(env.PORT ?? 3000); if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('Invalid PORT');
  const origin = env.APP_ORIGIN ?? ''; const url = new URL(origin);
  if (url.origin !== origin || url.username || url.password) throw new Error('APP_ORIGIN must be an exact origin');
  const cloud = mode === 'managed-identity';
  if (cloud) {
    if (env.AZURE_TOKEN_CREDENTIALS !== 'ManagedIdentityCredential' || env.AZURE_CLIENT_ID || env.AZURE_CLIENT_SECRET) throw new Error('Cloud requires system-assigned ManagedIdentityCredential only');
    if (!env.WEBSITE_INSTANCE_ID || !env.IDENTITY_ENDPOINT || !env.IDENTITY_HEADER) throw new Error('Managed identity mode requires the App Service identity boundary');
    if (url.protocol !== 'https:' || !url.hostname.endsWith('.azurewebsites.net')) throw new Error('Cloud APP_ORIGIN must be the HTTPS App Service origin');
    if (!ipv4(env.OPERATOR_IPV4 ?? '')) throw new Error('Explicit OPERATOR_IPV4 required');
  } else if (origin !== `http://127.0.0.1:${port}`) throw new Error('Local mode must bind to the matching 127.0.0.1 origin');
  return { host, database, writeGuard, mode, origin, port, cloud, operatorIpv4: env.OPERATOR_IPV4 };
}
