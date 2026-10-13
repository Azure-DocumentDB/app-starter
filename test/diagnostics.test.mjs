import test from 'node:test'; import assert from 'node:assert/strict';
import { safeFailure } from '../dist/diagnostics.js';
test('database diagnostics allowlist class/code and omit secret-bearing messages, causes and fields', () => {
 const e=new Error('secret-token mongodb://username:password@example'); e.name='MongoServerError'; e.code=18; e.cause=new Error('nested-secret'); e.headers={Authorization:'secret'};
 assert.deepEqual(safeFailure(e),{name:'MongoServerError',code:18});
 e.name='secret-token';e.code='secret-token';assert.deepEqual(safeFailure(e),{name:'UnknownError',code:null});
 assert.deepEqual(safeFailure({name:'MongoServerError',code:18,message:'secret'}),{name:'UnknownError',code:null});
});
