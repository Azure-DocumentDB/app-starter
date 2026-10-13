import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { randomBytes, timingSafeEqual } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import type { Config } from './config.js';
import { HttpError, fields, newTask, query, revision, type Store } from './model.js';
const publicRoot = fileURLToPath(new URL('../public/', import.meta.url));
function reply(res: ServerResponse, status: number, body: unknown) { res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' }); res.end(JSON.stringify(body)); }
function equal(a: string, b: string) { const left = Buffer.from(a); const right = Buffer.from(b); return left.length === right.length && timingSafeEqual(left, right); }
async function body(req: IncomingMessage) {
  if (req.headers['content-type']?.split(';')[0] !== 'application/json') throw new HttpError(415, 'Use application/json.');
  const chunks: Buffer[] = []; let size = 0;
  for await (const chunk of req) { size += chunk.length; if (size > 8192) throw new HttpError(413, 'Request body is too large.'); chunks.push(chunk); }
  try { return JSON.parse(Buffer.concat(chunks).toString('utf8')); } catch { throw new HttpError(400, 'Malformed JSON.'); }
}
export function createApp(config: Config, store: Store) {
  const sessions = new Map<string, { csrf: string; expires: number }>();
  const cookieName = config.cloud ? '__Host-workspace' : 'workspace';
  function authorize(req: IncomingMessage) {
    // App Service restrictions are the cloud security boundary. Forwarded headers alone are not authentication.
    if (config.cloud) {
      const forwarded = req.headers['x-forwarded-for'];
      const lastHop = typeof forwarded === 'string' ? forwarded.split(',').at(-1)?.trim().replace(/:\d+$/, '') : '';
      if (lastHop !== config.operatorIpv4 || req.headers['x-forwarded-proto'] !== 'https') throw new HttpError(403, 'Operator network access required.');
    } else if (!['127.0.0.1', '::ffff:127.0.0.1', '::1'].includes(req.socket.remoteAddress ?? '')) throw new HttpError(403, 'Loopback access required.');
    if (req.headers.host !== new URL(config.origin).host) throw new HttpError(403, 'Unexpected request host.');
    if (req.headers.origin && req.headers.origin !== config.origin) throw new HttpError(403, 'Cross-origin access denied.');
    if (req.headers['sec-fetch-site'] && !['same-origin', 'none'].includes(String(req.headers['sec-fetch-site']))) throw new HttpError(403, 'Cross-site access denied.');
  }
  return createServer({ requestTimeout: 15000, headersTimeout: 10000, keepAliveTimeout: 5000 }, async (req, res) => {
    res.setHeader('Cache-Control', 'no-store'); res.setHeader('X-Content-Type-Options', 'nosniff'); res.setHeader('Referrer-Policy', 'no-referrer');
    res.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self'; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'");
    if (config.cloud) res.setHeader('Strict-Transport-Security', 'max-age=31536000');
    try {
      const url = new URL(req.url ?? '/', config.origin); const method = req.method ?? 'GET';
      if (url.pathname === '/health/live' && method === 'GET') return reply(res, 200, { status: 'alive' });
      authorize(req);
      if (url.pathname === '/favicon.ico' && method === 'GET') { res.writeHead(204); res.end(); return; }
      if (url.pathname === '/health/ready' && method === 'GET') { await store.ready(); return reply(res, 200, { status: 'ready' }); }
      if (url.pathname === '/api/session' && method === 'GET') {
        const now = Date.now(); for (const [key, session] of sessions) if (session.expires <= now) sessions.delete(key);
        if (sessions.size >= 1000) throw new HttpError(429, 'Too many active sessions. Try again later.');
        const id = randomBytes(32).toString('hex'); const csrf = randomBytes(32).toString('hex'); sessions.set(id, { csrf, expires: now + 3600000 });
        res.setHeader('Set-Cookie', `${cookieName}=${id}; HttpOnly; SameSite=Strict; Path=/; Max-Age=3600${config.cloud ? '; Secure' : ''}`);
        return reply(res, 200, { csrf, access: 'operator-network', expiresInSeconds: 3600 });
      }
      if (url.pathname.startsWith('/api/')) {
        const cookie = req.headers.cookie?.split(';').map(c => c.trim()).find(c => c.startsWith(`${cookieName}=`))?.slice(cookieName.length + 1);
        const session = cookie ? sessions.get(cookie) : undefined;
        if (!session || session.expires <= Date.now()) throw new HttpError(401, 'Operator session expired. Reload the page.');
        if (!['GET', 'HEAD'].includes(method)) {
          const token = req.headers['x-csrf-token'];
          if (req.headers.origin !== config.origin || typeof token !== 'string' || !equal(token, session.csrf)) throw new HttpError(403, 'Valid same-origin CSRF token required.');
        }
        if (url.pathname === '/api/tasks' && method === 'GET') { const q = query(url.searchParams); return reply(res, 200, { ...await store.list(q), page: q.page, limit: q.limit }); }
        if (url.pathname === '/api/tasks' && method === 'POST') return reply(res, 201, await store.create(newTask(await body(req))));
        const match = /^\/api\/tasks\/([a-zA-Z0-9-]{1,64})$/.exec(url.pathname);
        if (match && method === 'PUT') { const b = await body(req); const data = fields(b); return reply(res, 200, await store.update(match[1]!, revision(b.revision), data)); }
        if (match && method === 'DELETE') { const b = await body(req); if (!b || typeof b !== 'object' || Object.keys(b).some(k => k !== 'revision')) throw new HttpError(400, 'Only revision is accepted.'); await store.delete(match[1]!, revision(b.revision)); return reply(res, 200, { deleted: true }); }
        throw new HttpError(404, 'Endpoint not found.');
      }
      const assets: Record<string, [string, string]> = { '/': ['index.html', 'text/html'], '/app.js': ['app.js', 'text/javascript'], '/styles.css': ['styles.css', 'text/css'] };
      const asset = assets[url.pathname];
      if (method !== 'GET' || !asset) throw new HttpError(404, 'Not found.');
      const content = await readFile(publicRoot + asset[0]); res.writeHead(200, { 'Content-Type': `${asset[1]}; charset=utf-8` }); res.end(content);
    } catch (error) {
      if (!res.headersSent) reply(res, error instanceof HttpError ? error.status : 503, { error: error instanceof HttpError ? error.message : 'Database unavailable. Check identity, network access and database ownership; then retry.' });
      else res.end();
    }
  });
}
