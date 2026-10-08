import test from 'node:test';
import assert from 'node:assert/strict';
import {validateShortcuts, matchShortcut} from '../sdk/web/shortcuts.js';

test('shortcut declarations are normalized and protect host keys and duplicate bindings',()=>{
 assert.deepEqual(validateShortcuts([{id:'save',key:'Shift+Ctrl+S'}]),[{id:'save',key:'Ctrl+Shift+s',allowInInputs:false,repeat:false}]);
 for(const key of ['Escape','Space','Ctrl+O','Meta+o','Ctrl+Shift+O','Ctrl+Ctrl+s','Hyper+x','Ctrl+','Tab'])
  assert.throws(()=>validateShortcuts([{id:'bad',key}]));
 assert.throws(()=>validateShortcuts([{id:'a',key:'Ctrl+s'},{id:'b',key:'Ctrl+S'}]));
 assert.throws(()=>validateShortcuts([{id:'a',key:'a'},{id:'a',key:'b'}]));
 assert.throws(()=>validateShortcuts([{id:'a',key:'a',repeat:'true'}]));
});
test('matching respects exact modifiers, input focus, repetition and IME composition',()=>{
 const bindings=validateShortcuts([{id:'save',key:'Ctrl+s',allowInInputs:true},{id:'back',key:'ArrowLeft',repeat:true}]);
 assert.equal(matchShortcut(bindings,{key:'S',ctrlKey:true},true)?.id,'save');
 assert.equal(matchShortcut(bindings,{key:'s',ctrlKey:true,shiftKey:true}),undefined);
 assert.equal(matchShortcut(bindings,{key:'ArrowLeft',repeat:true})?.id,'back');
 assert.equal(matchShortcut(bindings,{key:'ArrowLeft'},true),undefined);
 for(const flag of ['isComposing','defaultPrevented','repeat'])
  assert.equal(matchShortcut(bindings,{key:'s',ctrlKey:true,[flag]:true},true),undefined);
 assert.equal(matchShortcut([], {key:'ArrowLeft'}),undefined);
});
