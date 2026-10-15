import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

// The host draws a plugin's settings from the manifest declaration, so these are the rules every
// plugin's settings page depends on — not one plugin's markup.
const source = readFileSync(new URL('../src/main.tsx', import.meta.url), 'utf8');

/** The part of `SettingField` that renders each kind of control. */
function field() {
  const start = source.indexOf('function SettingField');
  const end = source.indexOf('function SettingLabel');
  assert.ok(start > 0 && end > start, 'SettingField should still be one function');
  return source.slice(start, end);
}

test('a text setting keeps the caret while its value is being saved', () => {
  // Text settings save on every keystroke. A save in flight must not disable the input it was
  // typed into: a disabled input loses focus, so the setting would take one character and then
  // ignore the rest of what was typed.
  const inputs = field().split('<input');
  assert.ok(inputs.length >= 3, `expected a folder input and a draft input, found ${inputs.length - 1}`);
  // The folder field commits on blur, so it may be guarded; the draft input is the last one and
  // holds text that is still being typed.
  const draft = inputs.at(-1).slice(0, inputs.at(-1).indexOf('/>'));
  assert.ok(!/disabled=\{busy\}/.test(draft), 'the draft input must stay enabled while saving');
  // The controls that act rather than hold a draft are still guarded by it.
  assert.match(field(), /<Toggle[\s\S]{0,120}?busy=\{busy\}/, 'the toggle is guarded');
  assert.match(field(), /<Select[\s\S]{0,160}?busy=\{busy\}/, 'the select is guarded');
});

test('a text setting commits per keystroke and a number setting on blur', () => {
  // Which is why the draft input above must survive re-rendering, and why a number's half-typed
  // value is never stored: the commit points are the difference between the two.
  const text = field();
  assert.match(text, /if \(!numeric && event\.target\.value !== String\(current \?\? ""\)\)/);
  assert.match(text, /onBlur=\{commit\}/);
  assert.match(text, /value=\{draft\}/, 'both kinds edit a local draft');
});
