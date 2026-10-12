import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { documentPreferences, documentZoom, pageGeometry, pageNeighborhood } from '../sdk/web/paged-geometry.js';

test('office document settings match PDF reading, fit and thumbnail defaults', async () => {
  const manifests = await Promise.all(['pdf','word','powerpoint'].map(name=>readFile(new URL(`../plugins/${name}/plugin.json`,import.meta.url),'utf8').then(JSON.parse)));
  for (const manifest of manifests.slice(1)) assert.deepEqual(manifest.settings, manifests[0].settings);
  assert.deepEqual(documentPreferences(), {reading:'single',mode:'fill'});
  assert.deepEqual(documentPreferences({viewMode:'continuous',fitWindow:false}),{reading:'continuous',mode:'page'});
});
test('whole-page fitting accounts for rotation while filling permits scrolling', () => {
  const fitted=pageGeometry(1200,600,0,800,600,'page',1);
  assert.equal(fitted.width,800);assert.equal(fitted.height,400);
  const filled=pageGeometry(1200,600,0,800,600,'fill',1);
  assert.equal(filled.width,1200);assert.equal(filled.height,600);
  const rotated=pageGeometry(1200,600,90,800,600,'page',1);
  assert.equal(rotated.width,300);assert.equal(rotated.height,600);
  assert.equal(rotated.transform,'scale(0.5) translate(600px, 0px) rotate(90deg)');
  assert.equal(pageGeometry(1200,600,270,800,600,'manual',2).height,2400);
  assert.equal(documentZoom(0.5),.01);assert.equal(documentZoom(900),8);
});
test('continuous slide rendering stays bounded at both ends and on long presentations', () => {
  assert.deepEqual(pageNeighborhood(0,3),[0,1,2]);
  assert.deepEqual(pageNeighborhood(0,1000),[0,1,2,3,4]);
  assert.deepEqual(pageNeighborhood(999,1000),[995,996,997,998,999]);
  assert.deepEqual(pageNeighborhood(500,1000),[498,499,500,501,502]);
  assert.equal(pageNeighborhood(500,1000,600).length,32);
});
