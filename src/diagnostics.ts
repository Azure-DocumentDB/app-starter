// Never log exception messages, causes, request data, headers, credentials or tokens.
const names = new Set(['Error', 'MongoAPIError', 'MongoInvalidArgumentError', 'MongoParseError', 'MongoServerError', 'MongoServerSelectionError', 'MongoNetworkError', 'MongoRuntimeError', 'MongoCompatibilityError', 'MongoOperationTimeoutError', 'AggregateAuthenticationError', 'AuthenticationError', 'CredentialUnavailableError']);
const codes = new Set(['ENOTFOUND', 'ENODATA', 'ECONNREFUSED', 'ETIMEDOUT', 'AuthenticationFailed', 'Unauthorized']);
export function safeFailure(error: unknown) {
  const value = error instanceof Error ? error as Error & { code?: unknown } : undefined;
  return { name: value && names.has(value.name) ? value.name : 'UnknownError', code: typeof value?.code === 'number' ? value.code : typeof value?.code === 'string' && codes.has(value.code) ? value.code : null };
}
export function databaseDiagnostic(stage: 'token' | 'ping' | 'initialize', error: unknown) {
  console.error(JSON.stringify({ event: 'database-operation-failed', stage, ...safeFailure(error) }));
}
