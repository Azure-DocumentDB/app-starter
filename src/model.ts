import { randomUUID } from 'node:crypto';
export type Status = 'planned' | 'in-progress' | 'done';
export type Priority = 'low' | 'medium' | 'high';
export interface Task { id: string; title: string; notes: string; status: Status; priority: Priority; revision: number; createdAt: string; updatedAt: string; owner: 'app-starter-v1' }
export interface Query { q: string; status: string; page: number; limit: number }
export class HttpError extends Error { constructor(public status: number, message: string) { super(message); } }
export function fields(input: unknown): Pick<Task, 'title' | 'notes' | 'status' | 'priority'> {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new HttpError(400, 'A JSON object is required.');
  const b = input as Record<string, unknown>;
  if (Object.keys(b).some(k => !['title', 'notes', 'status', 'priority', 'revision'].includes(k))) throw new HttpError(400, 'Unknown task field.');
  if (typeof b.title !== 'string' || !b.title.trim() || b.title.trim().length > 120) throw new HttpError(400, 'Title must contain 1–120 characters.');
  if (typeof b.notes !== 'string' || b.notes.length > 2000) throw new HttpError(400, 'Notes must contain at most 2000 characters.');
  if (!['planned', 'in-progress', 'done'].includes(String(b.status))) throw new HttpError(400, 'Invalid status.');
  if (!['low', 'medium', 'high'].includes(String(b.priority))) throw new HttpError(400, 'Invalid priority.');
  return { title: b.title.trim(), notes: b.notes, status: b.status as Status, priority: b.priority as Priority };
}
export function revision(input: unknown): number { if (!Number.isSafeInteger(input) || Number(input) < 1) throw new HttpError(400, 'A positive integer revision is required.'); return Number(input); }
export function query(params: URLSearchParams): Query {
  if ([...params.keys()].some(k => !['q', 'status', 'page', 'limit'].includes(k)) || [...params.keys()].some(k => params.getAll(k).length !== 1)) throw new HttpError(400, 'Unknown or duplicate query parameter.');
  const q = params.get('q') ?? ''; const status = params.get('status') ?? '';
  if (q.length > 100 || (status && !['planned', 'in-progress', 'done'].includes(status))) throw new HttpError(400, 'Invalid search or status.');
  const number = (key: string, fallback: string, max: number) => { const v = params.get(key) ?? fallback; if (!/^[1-9]\d*$/.test(v) || Number(v) > max) throw new HttpError(400, `Invalid ${key}.`); return Number(v); };
  return { q: q.trim(), status, page: number('page', '1', 10000), limit: number('limit', '8', 50) };
}
export function newTask(input: unknown): Task { const now = new Date().toISOString(); return { ...fields(input), id: randomUUID(), revision: 1, createdAt: now, updatedAt: now, owner: 'app-starter-v1' }; }
export interface Store {
  ready(): Promise<void>;
  list(query: Query): Promise<{ items: Task[]; total: number }>;
  create(task: Task): Promise<Task>;
  update(id: string, version: number, data: ReturnType<typeof fields>): Promise<Task>;
  delete(id: string, version: number): Promise<void>;
  close(): Promise<void>;
}
