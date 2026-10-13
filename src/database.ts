import { AzureCliCredential, DefaultAzureCredential } from '@azure/identity';
import { MongoClient, MongoServerError, type Filter } from 'mongodb';
import { assertOwnedDatabase, TOKEN_SCOPE, type Config } from './config.js';
import { HttpError, type Store, type Task, type Query, type fields } from './model.js';
export function tokenCallback(credential: { getToken(scope: string, options?: object): Promise<{ token: string; expiresOnTimestamp: number } | null> }) {
  return async (params: { timeoutContext: AbortSignal }) => {
    const token = await credential.getToken(TOKEN_SCOPE, { abortSignal: params.timeoutContext });
    if (!token || token.expiresOnTimestamp <= Date.now() + 1000) throw new Error('No usable Entra access token');
    return { accessToken: token.token, expiresInSeconds: Math.floor((token.expiresOnTimestamp - Date.now()) / 1000) };
  };
}
export function mongoOptions(config: Config) {
  const credential = config.mode === 'cli' ? new AzureCliCredential({ processTimeoutInMs: 8000 }) : new DefaultAzureCredential();
  return {
    authMechanism: 'MONGODB-OIDC' as const,
    authMechanismProperties: { OIDC_CALLBACK: tokenCallback(credential), ALLOWED_HOSTS: [config.host, '*.mongocluster.cosmos.azure.com'] },
    tls: true, tlsAllowInvalidCertificates: false, tlsAllowInvalidHostnames: false,
    retryWrites: false, connectTimeoutMS: 8000, serverSelectionTimeoutMS: 8000,
    socketTimeoutMS: 10000, timeoutMS: 12000, maxIdleTimeMS: 120000, maxPoolSize: 10,
  };
}
export class MongoStore implements Store {
  private readonly client; private readonly db; private readonly tasks; private initialization?: Promise<void>;
  constructor(private readonly config: Config) {
    assertOwnedDatabase(config.database, config.writeGuard);
    this.client = new MongoClient(`mongodb+srv://${config.host}/`, mongoOptions(config));
    this.db = this.client.db(config.database); this.tasks = this.db.collection<Task>('tasks');
  }
  async ready() { await this.db.command({ ping: 1 }, { timeoutMS: 8000 }); await this.initialize(); }
  private async initialize() {
    this.initialization ??= this.preflight().catch(error => { this.initialization = undefined; throw error; });
    await this.initialization;
  }
  private async preflight() {
    // Do not adopt a database that already contains unrecognized collections or rows.
    assertOwnedDatabase(this.config.database, this.config.writeGuard);
    const collections = await this.db.listCollections({}, { nameOnly: true }).toArray();
    if (collections.some(c => !['tasks', 'sample_metadata'].includes(c.name))) throw new Error('Database ownership preflight failed');
    if (await this.tasks.findOne({ owner: { $ne: 'app-starter-v1' } } as Filter<Task>)) throw new Error('Database contains non-sample rows');
    const meta = this.db.collection<{ _id: string; database: string; version: number }>('sample_metadata');
    const marker = await meta.findOne({ _id: 'app-starter-v1' });
    if (await meta.findOne({ _id: { $ne: 'app-starter-v1' } })) throw new Error('Database contains unknown ownership metadata');
    if (marker && (marker.database !== this.config.database || marker.version !== 1)) throw new Error('Database marker mismatch');
    if (!marker && await this.tasks.countDocuments({}, { limit: 1 })) throw new Error('Nonempty database has no ownership marker');
    await meta.updateOne({ _id: 'app-starter-v1' }, { $setOnInsert: { database: this.config.database, version: 1 } }, { upsert: true });
    await this.tasks.createIndex({ id: 1 }, { unique: true, name: 'task_id_unique' });
    await this.tasks.createIndex({ owner: 1, status: 1, createdAt: -1, id: 1 }, { name: 'task_status_page' });
  }
  async list(q: Query) {
    await this.initialize();
    const filter: Filter<Task> = { owner: 'app-starter-v1' };
    if (q.status) filter.status = q.status as Task['status'];
    if (q.q) filter.title = { $regex: q.q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), $options: 'i' };
    const [items, total] = await Promise.all([this.tasks.find(filter, { projection: { _id: 0 } }).sort({ createdAt: -1, id: 1 }).skip((q.page - 1) * q.limit).limit(q.limit).toArray(), this.tasks.countDocuments(filter)]);
    return { items, total };
  }
  async create(task: Task) { await this.initialize(); try { await this.tasks.insertOne({ ...task }); } catch (error) { if (error instanceof MongoServerError && error.code === 11000) throw new HttpError(409, 'Task already exists.'); throw error; } return task; }
  async update(id: string, version: number, data: ReturnType<typeof fields>) {
    await this.initialize();
    const task = await this.tasks.findOneAndUpdate({ id, revision: version, owner: 'app-starter-v1' }, { $set: { ...data, updatedAt: new Date().toISOString() }, $inc: { revision: 1 } }, { returnDocument: 'after', projection: { _id: 0 } });
    if (!task) throw new HttpError(409, 'Task changed or was deleted. Refresh before editing.'); return task;
  }
  async delete(id: string, version: number) { await this.initialize(); const result = await this.tasks.deleteOne({ id, revision: version, owner: 'app-starter-v1' }); if (!result.deletedCount) throw new HttpError(409, 'Task changed or was deleted. Refresh before deleting.'); }
  async seed(tasks: Task[]) { await this.ready(); if (tasks.length > 20) throw new Error('At most 20 seed rows'); for (const task of tasks) await this.tasks.updateOne({ id: task.id, owner: 'app-starter-v1' }, { $setOnInsert: task }, { upsert: true }); }
  async close() { await this.client.close(); }
}
