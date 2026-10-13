import { loadConfig } from './config.js';
import { MongoStore } from './database.js';
import { newTask } from './model.js';
export const seedTasks = ['Sketch a welcome screen', 'Review keyboard navigation', 'Write an onboarding checklist', 'Test the empty state', 'Polish task descriptions', 'Plan the next iteration', 'Review the release notes', 'Celebrate a small win'].map((title, i) => ({ ...newTask({ title, notes: 'Synthetic sample task. Safe to edit or delete in this owned demo database.', status: ['planned', 'in-progress', 'done'][i % 3], priority: ['medium', 'high', 'low'][i % 3] }), id: `seed-${String(i + 1).padStart(2, '0')}`, createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z' }));
if (import.meta.url === new URL(process.argv[1]!, 'file:').href) {
  let store: MongoStore | undefined;
  try { store = new MongoStore(loadConfig()); await store.seed(seedTasks); console.log('Eight synthetic task IDs seeded idempotently; existing edits preserved.'); }
  catch { console.error('Seed failed. Check ownership guard, managed identity and network access.'); process.exitCode = 1; }
  finally { await store?.close(); }
}
