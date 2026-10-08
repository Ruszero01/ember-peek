import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {transformSync} from 'esbuild';
import {runInNewContext} from 'node:vm';
const module={exports:{}};
runInNewContext(transformSync(readFileSync(new URL('../src/plugin-sort.ts',import.meta.url),'utf8'),{format:'cjs',loader:'ts'}).code,{module,exports:module.exports});
const {sortPosition,moveSortItem}=module.exports;
test('drag preview stays inside list and resolves the nearest insertion slot',()=>{
 const drag={top:100,bottom:380,height:40,offset:20,step:48,ids:['a','b','c','d','e','f']};
 assert.deepEqual({...sortPosition(drag,-500)},{top:100,index:0});
 assert.deepEqual({...sortPosition(drag,999)},{top:340,index:5});
 assert.equal(sortPosition(drag,219).index,2);
});
test('sorting preserves all IDs and moves in both directions without mutating the snapshot',()=>{
 const ids=['a','b','c','d'];
 assert.deepEqual([...moveSortItem(ids,1,3)],['a','c','d','b']);
 assert.deepEqual([...moveSortItem(ids,3,0)],['d','a','b','c']);
 assert.deepEqual(ids,['a','b','c','d']);
});
