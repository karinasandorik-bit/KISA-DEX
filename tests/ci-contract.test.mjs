import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
test('CI must have a real PostgreSQL integration target',()=>{
 const workflow=readFileSync(new URL('../.github/workflows/test.yml',import.meta.url),'utf8');
 assert.match(workflow,/postgres:16/);
 assert.match(workflow,/TEST_DATABASE_URL/);
 assert.match(workflow,/npm test/);
});
