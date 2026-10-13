import { HttpError } from '../dist/model.js';
// Test double is ONLY in tests. Runtime always uses managed Azure DocumentDB.
export class MemoryStore {
  tasks = new Map(); unavailable = false;
  async ready() { if (this.unavailable) throw new Error('secret-token-do-not-leak'); }
  async list(q) { await this.ready(); const all = [...this.tasks.values()].filter(t => (!q.status || t.status === q.status) && t.title.toLowerCase().includes(q.q.toLowerCase())).sort((a,b) => b.createdAt.localeCompare(a.createdAt) || a.id.localeCompare(b.id)); return { items: all.slice((q.page-1)*q.limit,q.page*q.limit), total: all.length }; }
  async create(t) { await this.ready(); if(this.tasks.has(t.id)) throw new HttpError(409,'Task already exists.'); this.tasks.set(t.id,t); return t; }
  async update(id,version,data) { await this.ready(); const t=this.tasks.get(id); if(!t || t.revision!==version) throw new HttpError(409,'Task changed.'); const next={...t,...data,revision:version+1};this.tasks.set(id,next);return next; }
  async delete(id,version) { await this.ready(); if(this.tasks.get(id)?.revision!==version) throw new HttpError(409,'Task changed.');this.tasks.delete(id); }
  async close() {}
}
