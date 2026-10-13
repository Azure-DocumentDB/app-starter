const statusLabels = { planned: 'Planned', 'in-progress': 'In progress', done: 'Done' };
export function renderTasks(document, tasks, onEdit, onDelete) {
  const grid = document.querySelector('#tasks'); grid.replaceChildren();
  if (!tasks.length) { const empty = document.createElement('div'); empty.className = 'empty'; const h = document.createElement('h3'); h.textContent = 'A little space for something new.'; const p = document.createElement('p'); p.textContent = 'No tasks match this view. Try another search, or add your next step.'; empty.append(h, p); grid.append(empty); return; }
  for (const task of tasks) {
    const card = document.createElement('article'); card.className = 'task-card';
    const top = document.createElement('div'); top.className = 'card-top';
    const status = document.createElement('span'); status.className = `status-pill status-${Object.hasOwn(statusLabels, task.status) ? task.status : 'planned'}`; status.textContent = statusLabels[task.status] ?? 'Planned';
    const priority = document.createElement('span'); priority.className = `priority${task.priority === 'high' ? ' priority-high' : ''}`; priority.textContent = `${task.priority} priority`; top.append(status, priority);
    const title = document.createElement('h3'); title.textContent = task.title;
    const notes = document.createElement('p'); notes.className = 'notes'; notes.textContent = task.notes || 'No notes yet. A clean slate.';
    const bottom = document.createElement('div'); bottom.className = 'card-bottom'; const date = document.createElement('span'); date.textContent = `Updated ${new Date(task.updatedAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}`;
    const actions = document.createElement('div'); actions.className = 'card-actions';
    for (const [label, handler, className] of [['Edit', onEdit, ''], ['Delete', onDelete, 'delete-action']]) { const button = document.createElement('button'); button.type = 'button'; button.textContent = label; button.className = className; button.setAttribute('aria-label', `${label} ${task.title}`); button.addEventListener('click', () => handler(task)); actions.append(button); }
    bottom.append(date, actions); card.append(top, title, notes, bottom); grid.append(card);
  }
}
export function mount(document, fetcher = fetch) {
  const $ = selector => document.querySelector(selector); let csrf = ''; let page = 1; let editing = null; let deleting = null; let requestNumber = 0; let debounce;
  const editor = $('#editor'); const form = $('#task-form');
  async function api(path, options = {}) { const response = await fetcher(path, { ...options, credentials: 'same-origin', signal: AbortSignal.timeout(15000), headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': csrf, ...options.headers } }); const data = await response.json(); if (!response.ok) throw new Error(data.error || 'Request failed. Please retry.'); return data; }
  function edit(task = null) { editing = task; form.reset(); $('#form-error').textContent = ''; $('#editor-title').textContent = task ? 'Edit task' : 'New task'; if (task) for (const key of ['title', 'notes', 'status', 'priority']) form.elements.namedItem(key).value = task[key]; editor.showModal(); form.elements.namedItem('title').focus(); }
  function askDelete(task) { deleting = task; $('#delete-title').textContent = task.title; $('#delete-error').textContent = ''; $('#delete-dialog').showModal(); }
  async function load() {
    const current = ++requestNumber; $('#feedback').replaceChildren(); $('#tasks').setAttribute('aria-busy', 'true'); $('#tasks').replaceChildren(); $('#previous').disabled = true; $('#next').disabled = true;
    for (let i = 0; i < 3; i++) { const skeleton = document.createElement('div'); skeleton.className = 'skeleton'; skeleton.setAttribute('aria-hidden', 'true'); $('#tasks').append(skeleton); }
    $('#page-label').textContent = 'Loading collection…';
    try {
      if (!csrf) csrf = (await api('/api/session')).csrf;
      const params = new URLSearchParams({ q: $('#search').value, status: $('#status-filter').value, page: String(page), limit: '8' });
      const data = await api(`/api/tasks?${params}`); if (current !== requestNumber) return;
      if (page > 1 && !data.items.length) { page--; return load(); }
      renderTasks(document, data.items, edit, askDelete); $('#total').textContent = String(data.total);
      $('#page-label').textContent = data.total ? `${(page - 1) * 8 + 1}–${Math.min(page * 8, data.total)} of ${data.total} tasks` : 'No tasks to show';
      $('#previous').disabled = page <= 1; $('#next').disabled = page * 8 >= data.total;
    } catch (error) { if (current !== requestNumber) return; $('#tasks').replaceChildren(); $('#total').textContent = '—'; $('#page-label').textContent = 'Collection unavailable'; $('#feedback').textContent = error.message; const retry = document.createElement('button'); retry.className = 'quiet'; retry.textContent = 'Retry'; retry.addEventListener('click', () => { csrf = ''; void load(); }); $('#feedback').append(retry); }
    finally { if (current === requestNumber) $('#tasks').setAttribute('aria-busy', 'false'); }
  }
  $('#new-task').addEventListener('click', () => edit()); $('#close-editor').addEventListener('click', () => editor.close()); $('#cancel-editor').addEventListener('click', () => editor.close());
  $('#refresh').addEventListener('click', () => { csrf = ''; void load(); });
  $('#search').addEventListener('input', () => { clearTimeout(debounce); debounce = setTimeout(() => { page = 1; void load(); }, 250); }); $('#status-filter').addEventListener('change', () => { page = 1; void load(); });
  $('#previous').addEventListener('click', () => { page--; void load(); }); $('#next').addEventListener('click', () => { page++; void load(); });
  form.addEventListener('submit', async event => { event.preventDefault(); const button = $('#save-task'); button.disabled = true; button.textContent = 'Saving…'; $('#form-error').textContent = ''; try { const data = Object.fromEntries(new document.defaultView.FormData(form)); if (editing) data.revision = editing.revision; await api(editing ? `/api/tasks/${editing.id}` : '/api/tasks', { method: editing ? 'PUT' : 'POST', body: JSON.stringify(data) }); editor.close(); await load(); } catch (error) { $('#form-error').textContent = error.message; } finally { button.disabled = false; button.textContent = 'Save task'; } });
  $('#cancel-delete').addEventListener('click', () => $('#delete-dialog').close());
  $('#confirm-delete').addEventListener('click', async () => { const button = $('#confirm-delete'); button.disabled = true; try { await api(`/api/tasks/${deleting.id}`, { method: 'DELETE', body: JSON.stringify({ revision: deleting.revision }) }); $('#delete-dialog').close(); await load(); } catch (error) { $('#delete-error').textContent = error.message; } finally { button.disabled = false; } });
  return { load, ready: load() };
}
if (typeof document !== 'undefined') mount(document);
