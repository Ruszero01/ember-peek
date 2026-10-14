import test from 'node:test';
import assert from 'node:assert/strict';
import {SettingDraft} from '../plugins/audio/ui/setting-draft.js';

test('late persisted volume snapshots cannot overwrite a newer continuous edit',()=>{
 const draft=new SettingDraft(0.91);
 draft.edit(0.41);draft.edit(0.45);
 assert.equal(draft.receive(0.91),false);assert.equal(draft.value,0.45);
 draft.edit(0.5);
 assert.equal(draft.receive(0.41),false);assert.equal(draft.value,0.5);
 assert.equal(draft.receive(0.45),false);assert.equal(draft.value,0.5);
 assert.equal(draft.receive(0.5),true);assert.equal(draft.pending,false);
 assert.equal(draft.receive(0.8),true);assert.equal(draft.value,0.8);
 draft.edit(0.9);draft.reset(0.8);assert.equal(draft.pending,false);assert.equal(draft.value,0.8);
});
