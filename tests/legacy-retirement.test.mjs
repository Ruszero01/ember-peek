import test from 'node:test';
import assert from 'node:assert/strict';
import {retireLegacy} from '../scripts/retire-legacy-plugins.mjs';
import {updateKey} from '../scripts/publish-desktop.mjs';
import {sha256} from '../scripts/publish-plugins.mjs';
import {ossConfig,catalogKey,packagesKey,registryKey,legacyCatalogKey,legacyPackagesKey,legacyRegistryKey,retirementKey,target} from '../scripts/oss-config.mjs';
const config=ossConfig({OSS_REGION:'oss-cn-hongkong',OSS_BUCKET:'test-bucket',OSS_PUBLIC_BASE_URL:'https://test.invalid/ember-peek'});
function fixture(){
 const body=Buffer.from('package'), values=new Map(),writes=[],deletes=[];
 const entry={id:'ember.text',version:'0.1.1',minHostVersion:'0.1.1',buildId:'a'.repeat(64),artifact:'text.zip',sha256:sha256(body),size:body.length,targets:[target]};
 values.set(config.key(catalogKey),Buffer.from(JSON.stringify({api:1,entries:[entry]})));
 const installer=Buffer.from('installer'), installerKey='desktop/windows-x86_64/0.1.1/setup.exe';
 values.set(config.key(installerKey),installer);
 values.set(config.key(updateKey),Buffer.from(JSON.stringify({api:1,version:'0.1.1',url:`${config.base}/${installerKey}`,sha256:sha256(installer),size:installer.length})));
 values.set(config.key(`${packagesKey}/text.zip`),body);
 values.set(config.key(`${registryKey}/text/0.1.1.json`),Buffer.from('{}'));
 values.set(config.key(legacyCatalogKey),Buffer.from('{"api":1,"entries":[]}'));
 values.set(config.key(`${legacyPackagesKey}/old.zip`),body);
 values.set(config.key(`${legacyRegistryKey}/text/0.1.0.json`),Buffer.from('{}'));
 values.set(config.key(retirementKey),Buffer.from(JSON.stringify({api:1,successor:catalogKey,startedAt:'2026-10-16T00:00:00Z',retireAfter:'2026-11-15T00:00:00Z'})));
 const store={
  getBucketVersioning:async()=>({}),
  get:async key=>{if(!values.has(key))throw Object.assign(new Error('missing'),{code:'NoSuchKey'});return {content:values.get(key)};},
  put:async(key,bytes,options)=>{if(options?.headers?.['x-oss-forbid-overwrite']==='true'&&values.has(key))throw new Error('locked');writes.push(key);values.set(key,Buffer.from(bytes));},
  delete:async key=>{deletes.push(key);values.delete(key);},
  listV2:async({prefix})=>({objects:[...values.keys()].filter(key=>key.startsWith(prefix)).map(name=>({name})),isTruncated:false}),
 };
 return {store,config,now:new Date('2026-11-16T00:00:00Z'),publicGet:async url=>values.get(config.key(url.slice(config.base.length+1))),log:()=>{},values,writes,deletes};
}
for(const apply of [false,true])test(`grace period and missing marker never delete old packages (apply=${apply})`,async()=>{
 const f=fixture(); await retireLegacy({...f,apply,now:new Date('2026-11-01T00:00:00Z')});
 assert.ok(f.values.has(config.key(`${legacyPackagesKey}/old.zip`)));
 f.values.delete(config.key(retirementKey)); await retireLegacy({...f,apply});
 assert.ok(f.values.has(config.key(`${legacyPackagesKey}/old.zip`)));
});
test('retirement plan is read-only and applying verifies the old empty catalog before cleanup',async()=>{
 const f=fixture();let plan=await retireLegacy(f);assert.equal(plan.obsolete.length,2);assert.equal(f.writes.length,0);
 const oldDelete=f.store.delete;
 f.store.delete=async key=>{if(!key.endsWith('publish.lock'))assert.deepEqual(JSON.parse(f.values.get(config.key(legacyCatalogKey))),{api:1,entries:[]});await oldDelete(key);};
 await retireLegacy({...f,apply:true});
 assert.ok(!f.values.has(config.key(`${legacyPackagesKey}/old.zip`)));
 assert.ok(f.values.has(config.key(`${packagesKey}/text.zip`)));
 assert.ok(f.values.has(config.key(`${registryKey}/text/0.1.1.json`)));
 assert.ok(!f.values.has(config.key('publish.lock')));
});
test('unavailable new packages and stale old catalog prevent deletion',async()=>{
 for(const failed of ['text.zip','catalog.json']){
  const f=fixture();await assert.rejects(retireLegacy({...f,apply:true,publicGet:async url=>url.endsWith(failed)?Buffer.from('stale'):f.publicGet(url)}));
  assert.ok(f.values.has(config.key(`${legacyPackagesKey}/old.zip`)));
 }
});
test('cleanup failures can be retried and a held publication lock is preserved',async()=>{
 const f=fixture(),remove=f.store.delete;f.store.delete=async key=>{if(key.endsWith('old.zip'))throw new Error('denied');return remove(key);};
 await assert.rejects(retireLegacy({...f,apply:true}),/denied/);f.store.delete=remove;
 await retireLegacy({...f,apply:true});assert.ok(!f.values.has(config.key(`${legacyPackagesKey}/old.zip`)));
 f.values.set(config.key('publish.lock'),Buffer.from('{"owner":"other"}'));
 await assert.rejects(retireLegacy({...f,apply:true}),/locked/);assert.equal(JSON.parse(f.values.get(config.key('publish.lock'))).owner,'other');
});
test('malformed deadlines and out-of-scope listing results cannot authorize deletion',async()=>{
 const f=fixture();f.values.set(config.key(retirementKey),Buffer.from(JSON.stringify({api:1,successor:catalogKey,startedAt:'2026-10-16',retireAfter:'2026-10-17'})));
 await assert.rejects(retireLegacy({...f,apply:true}),/退役记录/);
 const g=fixture();g.store.listV2=async()=>({objects:[{name:config.key(`${packagesKey}/text.zip`)}]});
 await assert.rejects(retireLegacy({...g,apply:true}),/范围/);assert.ok(g.values.has(config.key(`${legacyPackagesKey}/old.zip`)));
});


test('stale public tombstone retains every old object even after the successor is verified',async()=>{
 const f=fixture();
 await assert.rejects(retireLegacy({...f,apply:true,publicGet:async url=>url===`${config.base}/${legacyCatalogKey}`?Buffer.from('stale'):f.publicGet(url)}),/旧目录/);
 assert.ok(f.values.has(config.key(`${legacyPackagesKey}/old.zip`)));
 assert.ok(f.values.has(config.key(`${legacyRegistryKey}/text/0.1.0.json`)));
});


test('the grace period starts once only after a stable host and plugins are publicly usable',async()=>{
 const f=fixture();f.values.delete(config.key(retirementKey));
 await retireLegacy(f);assert.ok(!f.values.has(config.key(retirementKey)));
 await retireLegacy({...f,apply:true});
 const first=JSON.parse(f.values.get(config.key(retirementKey)));
 assert.equal(Date.parse(first.retireAfter)-Date.parse(first.startedAt),30*86400000);
 await retireLegacy({...f,apply:true,now:new Date(f.now.getTime()+86400000)});
 assert.deepEqual(JSON.parse(f.values.get(config.key(retirementKey))),first);
});
test('a missing, old or prerelease desktop cannot start or complete retirement',async()=>{
 for(const version of [null,'0.1.0','0.1.1-rc.1','v0.1.1']){
  for(const hasMarker of [true,false]){
   const f=fixture();if(!hasMarker)f.values.delete(config.key(retirementKey));
   if(version===null)f.values.delete(config.key(updateKey));
   else {const metadata=JSON.parse(f.values.get(config.key(updateKey)));metadata.version=version;f.values.set(config.key(updateKey),Buffer.from(JSON.stringify(metadata)));}
   await retireLegacy({...f,apply:true});
   assert.ok(f.values.has(config.key(`${legacyPackagesKey}/old.zip`)));
   if(!hasMarker)assert.ok(!f.values.has(config.key(retirementKey)));
  }
 }
 const f=fixture();f.values.delete(config.key(retirementKey));f.values.delete(config.key(catalogKey));
 await retireLegacy({...f,apply:true});assert.ok(!f.values.has(config.key(retirementKey)));
});

test('a stale stable pointer or unavailable host installer cannot start the grace period',async()=>{
 for(const unavailable of [updateKey,'desktop/windows-x86_64/0.1.1/setup.exe']){
  const f=fixture();f.values.delete(config.key(retirementKey));
  await assert.rejects(retireLegacy({...f,apply:true,publicGet:async url=>url===`${config.base}/${unavailable}`?Buffer.from('stale'):f.publicGet(url)}),/宿主/);
  assert.ok(!f.values.has(config.key(retirementKey)));
  assert.ok(f.values.has(config.key(`${legacyPackagesKey}/old.zip`)));
 }
});
