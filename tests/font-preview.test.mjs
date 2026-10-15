import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {transformSync} from 'esbuild';
import {runInNewContext} from 'node:vm';

const source = (path) => new URL('../plugins/font/' + path, import.meta.url);

/** Load one of the plugin's own modules the way its page would, with the SDK stubbed. */
function load(path, {locale = 'zh-CN'} = {}) {
  const code = transformSync(readFileSync(source(path), 'utf8'), {loader: 'js', format: 'cjs'}).code;
  const module = {exports: {}};
  const sdk = {
    locale: () => locale,
    call: () => Promise.resolve(null),
    // The host's own fallback order, so a missing translation reads as the key here too.
    translate: (messages) => (key, values) => {
      const chosen = messages[locale] || messages[String(locale).split('-')[0]] || messages.en || {};
      const message = chosen[key] ?? messages.en?.[key] ?? key;
      if (!values) return message;
      return message.replace(/\{(\w+)\}/g, (placeholder, name) =>
        name in values ? String(values[name]) : placeholder);
    },
  };
  const cache = new Map();
  const require = (name) => {
    if (name === './sdk.js') return sdk;
    const target = name.replace(/^\.\//, '');
    if (!cache.has(target)) cache.set(target, load('ui/' + target, {locale}));
    return cache.get(target);
  };
  // A canvas is all `font.js` asks of a document, and only to measure ink.
  const document = {
    createElement: () => ({
      width: 0,
      height: 0,
      getContext: () => null,
      getBoundingClientRect: () => ({top: 0, bottom: 0}),
    }),
  };
  runInNewContext(code, {module, exports: module.exports, require, atob, console, document});
  return module.exports;
}

const manifest = JSON.parse(readFileSync(source('plugin.json'), 'utf8'));
const nativeSource = ['native/src/main.rs', 'native/src/container.rs', 'native/src/glyphs.rs']
  .map((path) => readFileSync(source(path), 'utf8'))
  .join('\n');

// A module loaded in its own context has that context's prototypes, so its arrays are not this
// realm's arrays; comparing them means copying them out first.
const plain = (value) => JSON.parse(JSON.stringify(value));

test('the package declares what the packager expects of a preview plugin', () => {
  assert.equal(manifest.api, 1);
  assert.equal(manifest.id, 'ember.font');
  assert.equal(manifest.entry, 'ui/index.html');
  assert.equal(manifest.executable, 'bin/ember-font-plugin.exe');
  assert.deepEqual(manifest.capabilities, ['view', 'controls', 'overlay']);
  // The library is docked on the right, and picking a glyph opens the inspector, so the panel's
  // default corner is the one opposite it: a panel over the grid would cover what is being clicked.
  assert.equal(manifest.overlay.anchor, 'bottomLeft');
  assert.ok(manifest.overlay.width >= 120 && manifest.overlay.width <= 1600);
  assert.ok(manifest.overlay.height >= 24 && manifest.overlay.height <= 1200);
  // The plugin's version is its own, but the crate that ships with it must agree.
  const crate = readFileSync(source('native/Cargo.toml'), 'utf8');
  assert.match(crate, new RegExp(`^version = "${manifest.version}"$`, 'm'));
  assert.match(crate, /^name = "ember-font-plugin"$/m);
});

test('the extensions it claims are the containers it actually reads', () => {
  assert.deepEqual(manifest.extensions, ['ttf', 'ttc', 'otc', 'otf', 'woff', 'woff2', 'dfont']);
  for (const magic of ['TTCF', 'WOFF', 'WOFF2', 'OTTO', 'TRUE', 'TYP1'])
    assert.ok(nativeSource.includes(magic), `${magic} should be recognized`);
  // A Type 1 or bitmap font is a font this plugin cannot draw, so it does not claim one.
  for (const extension of ['pfb', 'pfa', 'bdf', 'pcf', 'eot', 'fon'])
    assert.ok(!manifest.extensions.includes(extension));
});

test('the type size setting is a hidden number inside the range the interface offers', () => {
  const size = manifest.settings.find((setting) => setting.key === 'typeSize');
  assert.equal(size.type, 'number');
  assert.equal(size.hidden, true);
  assert.equal(size.min, 12);
  assert.equal(size.max, 200);
  assert.ok(size.default >= size.min && size.default <= size.max);
  assert.match(readFileSync(source('ui/view.js'), 'utf8'), /clampSize/);
});

test('the block table is the standard’s own', () => {
  const {BLOCKS} = load('ui/blocks.js');
  assert.ok(BLOCKS.length >= 300 && BLOCKS.length <= 400, 'expected the full block list');
  let previous = -1;
  for (const [name, start, end] of BLOCKS) {
    assert.equal(typeof name, 'string');
    assert.ok(start > previous, `${name} should start after the block before it`);
    assert.ok(end >= start, `${name} should not end before it starts`);
    previous = end;
  }
  const lookup = (name) => BLOCKS.find((block) => block[0] === name);
  assert.deepEqual(plain(lookup('Basic Latin')), ['Basic Latin', 0x0000, 0x007f]);
  assert.deepEqual(plain(lookup('CJK Unified Ideographs')), ['CJK Unified Ideographs', 0x4e00, 0x9fff]);
  assert.deepEqual(plain(lookup('Emoticons')), ['Emoticons', 0x1f600, 0x1f64f]);
  assert.equal(BLOCKS[BLOCKS.length - 1][2], 0x10ffff);
});

test('characters are laid out in the compartments they belong to', () => {
  const {compartments, blockOf, pointsOf, hex, character} = load('ui/glyphs.js');
  const points = Int32Array.from([0x20, 0x41, 0x42, 0x4e00, 0x4e01, 0x1f600]);
  const found = compartments(points);
  assert.deepEqual(
    plain(found.map((block) => [block.name, block.from, block.to, block.count])),
    [
      ['Basic Latin', 0, 3, 3],
      ['CJK Unified Ideographs', 3, 5, 2],
      ['Emoticons', 5, 6, 1],
    ],
  );
  // The slice boundaries are what a row is cut out of, so they must address the list itself.
  for (const block of found)
    for (let at = block.from; at < block.to; at += 1)
      assert.equal(blockOf(points[at]).name, block.name);
  assert.equal(hex(0x4e00), 'U+4E00');
  assert.equal(character(0x1f600), '😀');
  assert.deepEqual(plain(pointsOf('A😀')), [0x41, 0x1f600]);
});

test('a query is read as a code point, a character or the name of a block', () => {
  const {resolveQuery, queryBlock} = load('ui/glyphs.js', {locale: 'zh-CN'});
  assert.deepEqual(plain(resolveQuery('4e00')), {kind: 'point', point: 0x4e00});
  assert.deepEqual(plain(resolveQuery('U+4E01')), {kind: 'point', point: 0x4e01});
  // Two characters that also look like a code point are read as the characters that were typed.
  assert.deepEqual(plain(resolveQuery('AB')), {kind: 'characters', characters: ['A', 'B']});
  assert.deepEqual(plain(resolveQuery('u+ab')), {kind: 'point', point: 0xab});
  assert.deepEqual(plain(resolveQuery('永')), {kind: 'characters', characters: ['永']});
  assert.equal(resolveQuery('   '), null);
  // A name wins only where it is a name rather than a pair of letters.
  assert.equal(queryBlock('AB'), null);
  assert.equal(queryBlock('cjk').name, 'CJK Unified Ideographs');
  assert.equal(queryBlock('cjk').start, 0x4e00);
  assert.equal(queryBlock('表情').name, 'Emoticons');
  assert.equal(queryBlock('latin-1').name, 'Latin-1 Supplement');
  assert.equal(queryBlock('zzz'), null);
});

test('a block is named in the interface language, and keeps its standard name otherwise', () => {
  const zh = load('ui/glyphs.js', {locale: 'zh-CN'});
  const en = load('ui/glyphs.js', {locale: 'en'});
  assert.equal(zh.blockName({name: 'CJK Unified Ideographs'}), '中日韩统一表意文字');
  assert.equal(en.blockName({name: 'CJK Unified Ideographs'}), 'CJK Unified Ideographs');
  // A block without a translation is a name, not a gap.
  assert.equal(zh.blockName({name: 'Aegean Numbers'}), 'Aegean Numbers');
});

test('the wire encodings survive a round trip', () => {
  const {decodePoints, decodeGlyphs} = load('ui/wire.js');
  const encode = (points) => {
    const bytes = [];
    let previous = 0;
    for (const point of points) {
      let delta = point - previous;
      previous = point;
      do {
        let byte = delta & 0x7f;
        delta >>= 7;
        if (delta) byte |= 0x80;
        bytes.push(byte);
      } while (delta);
    }
    return Buffer.from(bytes).toString('base64');
  };
  const points = [0x20, 0x41, 0x42, 0x4e00, 0x4e01, 0x1f600];
  assert.deepEqual(plain(decodePoints(encode(points))), points);
  assert.deepEqual(plain(decodePoints(encode(points.slice(0, 3)))), points.slice(0, 3));
  assert.deepEqual(plain(decodePoints('')), []);
  // Glyph ids are two big-endian bytes each.
  assert.deepEqual(
    plain(decodeGlyphs(Buffer.from([0x00, 0x00, 0x00, 0x07]).toString('base64'))),
    [0, 7],
  );
});

test('every failure token the native half emits has a sentence', () => {
  const {errorText} = load('ui/strings.js', {locale: 'en'});
  const tokens = new Set([...nativeSource.matchAll(/"(font-[a-z0-9-]+)(?::[^"]*)?"/g)].map((match) => match[1]));
  assert.ok(tokens.size >= 6, `expected the native half's tokens, found ${[...tokens].join(', ')}`);
  for (const token of tokens) {
    const sentence = errorText(`${token}:detail`);
    assert.ok(sentence.length > 0, `${token} should read as something`);
    assert.ok(!sentence.includes('font-'), `${token} should be a sentence, not the token`);
  }
  // A token the interface does not know is still readable rather than empty.
  assert.equal(errorText('font-session-expired'), 'The font session has ended; open the file again.');
  assert.equal(errorText('something the host said'), 'something the host said');
});

test('the methods the mounts call are the methods the native half answers', () => {
  const handled = new Set(
    [...nativeSource.matchAll(/"(?:settings|open|details|coverage|covers|rank|unencoded|names|glyph|face|release)"\s*=>/g)]
      .map((match) => match[0].split('"')[1]));
  const called = new Set([...readFileSync(source('ui/native.js'), 'utf8').matchAll(/call\("([a-z-]+)"/g)]
    .map((match) => match[1]));
  assert.ok(called.size >= 6);
  for (const method of called) assert.ok(handled.has(method), `${method} should be answered natively`);
  // `open` is the host's own lifecycle call, so no mount asks for it.
  for (const method of ['details', 'coverage', 'covers', 'rank', 'glyph', 'face', 'unencoded', 'names'])
    assert.ok(called.has(method), `${method} should be asked for`);
});

test('opening a font reads no character list', () => {
  // The whole point of the library being a sidebar: a font opens on its facts and its own bytes,
  // and the character set is read only when someone opens the library to look at it.
  const view = readFileSync(source('ui/view.js'), 'utf8');
  const sidebar = readFileSync(source('ui/sidebar.js'), 'utf8');
  assert.ok(!/native\.page\(/.test(view), 'the view must not read the character list');
  assert.ok(/native\.page\(/.test(sidebar), 'the library reads it a page at a time');
  assert.ok(/requestPage/.test(sidebar), 'the pages follow the scroll');
  // And what the view does ask is about one line of typing, not a character set.
  assert.ok(/native\.covers\(/.test(view));
  const manifest = JSON.parse(readFileSync(source('plugin.json'), 'utf8'));
  const library = manifest.settings.find((setting) => setting.key === 'library');
  assert.equal(library.default, false, 'the library is not opened — and not read — by default');
});

test('each mount only says what its reader listens for', () => {
  const read = (name) => readFileSync(source(`ui/${name}.js`), 'utf8');
  const handled = (text) =>
    new Set([...text.matchAll(/payload\.kind === "([a-z]+)"/g)].map((match) => match[1]));
  const sent = (text, role) =>
    new Set(
      [...text.matchAll(new RegExp(`postTo\\("${role}", \\{ kind: "([a-z]+)"`, 'g'))].map(
        (match) => match[1],
      ),
    );
  const view = read('view');
  const panel = read('panel');
  const sidebar = read('sidebar');
  const pairs = [
    ['panel to view', sent(panel, 'view'), handled(view)],
    ['panel to sidebar', sent(panel, 'sidebar'), handled(sidebar)],
    ['view to sidebar', sent(view, 'sidebar'), handled(sidebar)],
    ['sidebar to panel', sent(sidebar, 'panel'), handled(panel)],
    ['sidebar to view', sent(sidebar, 'view'), handled(view)],
  ];
  for (const [name, outgoing, incoming] of pairs) {
    assert.ok(outgoing.size > 0, `${name} should say something`);
    for (const kind of outgoing)
      assert.ok(incoming.has(kind), `${name}: ${kind} should be handled by the reader`);
  }
  // Picking a glyph in the library asks the view to open the inspector: the toolbar control is
  // the view's, so the panel appearing and the button lighting up are the same decision.
  assert.ok(sent(sidebar, 'view').has('inspect'), 'the library asks for the inspector');
  assert.match(view, /payload\.kind === "inspect"[\s\S]{0,80}?togglePanel\(\)/);
  // The picture the panel shows is drawn by the mount that holds the font.
  assert.match(panel, /payload\.kind === "image"/);
  assert.match(sidebar, /kind: "image"/);
});

test('the information line says what its number counts', () => {
  // The library is the only mount that reads characters; before it has, the view knows the
  // font's glyph count, and calling that a character count would be a lie.
  const {statusLine} = load('ui/glyphs.js', {locale: 'en'});
  assert.equal(statusLine({total: 12345, unit: 'Glyphs'}), '12,345 Glyphs');
  assert.equal(statusLine({total: 678, unit: 'Characters', selected: 0x4e00}), '678 Characters · U+4E00');
  const view = readFileSync(source('ui/view.js'), 'utf8');
  assert.match(view, /characters \? say\("covered"\) : say\("glyphs"\)/);
});

test('the specimen opens on the product name and a line of 滕王阁序', () => {
  const {defaultSample, sampleCandidates} = load('ui/specimen.js');
  const candidates = sampleCandidates();
  assert.equal(
    defaultSample(new Set(candidates)),
    'Ember Peek  落霞与孤鹜齐飞，秋水共长天一色  0123456789',
  );
  // A font that reaches Chinese but not the rarer half of the couplet still gets the ordinary
  // half, and a font with none of it gets nothing rather than a sentence it cannot draw.
  const chinese = new Set(candidates.filter((point) => point > 0x2e80));
  assert.equal(defaultSample(chinese), '落霞与孤鹜齐飞，秋水共长天一色');
  assert.equal(defaultSample(new Set()), '');
});

test('an emptied specimen setting falls back to the sample the font suggests', () => {
  // Clearing the setting has to put the sheet back on the automatic sample, or the preview keeps
  // showing text the setting no longer asks for.
  const view = readFileSync(source('ui/view.js'), 'utf8');
  assert.match(view, /if \(state\.sample\) specimen\.setText\(state\.sample\);/);
  assert.match(view, /else if \(!specimen\.text\(\) \|\| specimen\.text\(\) === previous\)/);
  assert.match(view, /defaultSample\(state\.covered \|\| new Set\(\)\)/);
});

test('the inspector does not report a failure before the library has spoken', () => {
  // The panel is a second document: until the library sends it a state, it knows nothing about
  // the font. Saying "the engine cannot load this font" then is a claim it cannot support — and
  // it was wrong, since the specimen behind it was drawn in that very font.
  const panel = readFileSync(source('ui/panel.js'), 'utf8');
  assert.match(panel, /known: false/);
  assert.match(panel, /state\.known = true/);
  assert.match(panel, /!state\.known/, 'the library is what the panel waits for');
  assert.match(panel, /state\.renderable\s*\?\s*say\("empty"\)/, 'the refusal is only said once known');
  // And opening the inspector opens the library, because it inspects what the library selected.
  const view = readFileSync(source('ui/view.js'), 'utf8');
  assert.match(view, /state\.panelOpen && !state\.library/);
});

test('the plugin’s own wording is complete in both languages', () => {
  // The translator falls back to English, so a key missing from one table is invisible at
  // runtime: both tables are read from the file and compared.
  const text = readFileSync(source('ui/strings.js'), 'utf8');
  const table = (locale) => {
    const start = text.search(new RegExp(`["']?${locale}["']?\\s*:\\s*\\{`));
    assert.ok(start > 0, `${locale} should have a table`);
    const body = text.slice(start, text.indexOf('\n  },', start));
    return new Set([...body.matchAll(/^\s{4}([A-Za-z][A-Za-z0-9-]*):/gm)].map((match) => match[1]));
  };
  const zh = table('zh-CN');
  const en = table('en');
  assert.ok(zh.size >= 40, `expected a real table, found ${zh.size} keys`);
  for (const key of zh) assert.ok(en.has(key), `${key} should be translated`);
  for (const key of en) assert.ok(zh.has(key), `${key} should exist in the base table`);
  assert.equal(load('ui/strings.js', {locale: 'en'}).say('missing'), 'The font data is incomplete');
  assert.equal(load('ui/strings.js', {locale: 'zh-CN'}).say('missing'), '字体数据不完整');
  // A count reaches the sentence it belongs in.
  assert.equal(
    load('ui/strings.js', {locale: 'en'}).say('notInFont', {count: 3}),
    '3 characters are not in this font',
  );
});
