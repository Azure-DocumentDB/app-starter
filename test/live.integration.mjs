import test from 'node:test'; import assert from 'node:assert/strict'; import { randomUUID } from 'node:crypto';
import { loadConfig } from '../dist/config.js'; import { MongoStore } from '../dist/database.js'; import { newTask } from '../dist/model.js';
test('opt-in real managed Azure DocumentDB CRUD, indexing and conflict',async()=>{
  assert.equal(process.env.RUN_LIVE_TESTS,'I_OWN_THIS_DISPOSABLE_DATABASE','Live test requires explicit opt-in; not skipped.');
  const store=new MongoStore(loadConfig());const owned=new Map();const label=`Live integration ${randomUUID()}`;
  try{await store.ready();const t=newTask({title:label,notes:'Synthetic integration row',status:'planned',priority:'low'});const created=await store.create(t);owned.set(t.id,1);assert.equal(created.id,t.id);await assert.rejects(()=>store.create(t),e=>e.status===409);const result=await store.list({q:label,status:'planned',page:1,limit:8});assert.equal(result.items.length,1);const updated=await store.update(t.id,1,{title:label,notes:'Updated',status:'done',priority:'high'});owned.set(t.id,updated.revision);assert.equal(updated.revision,2);await assert.rejects(()=>store.update(t.id,1,{title:label,notes:'Stale',status:'planned',priority:'low'}),e=>e.status===409);await store.delete(t.id,2);owned.delete(t.id);assert.equal((await store.list({q:label,status:'',page:1,limit:8})).total,0);}
  finally{for(const[id,version]of owned)await store.delete(id,version);await store.close();}
});
