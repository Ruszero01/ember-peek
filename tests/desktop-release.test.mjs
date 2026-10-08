import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { publishDesktop, updateKey } from "../scripts/publish-desktop.mjs";

function setup(version = "0.1.0") {
  const bytes = Buffer.from("tested installer");
  const sha = createHash("sha256").update(bytes).digest("hex");
  const objects = new Map(), writes = [];
  return {objects,writes,store:{get:async key=>{if(!objects.has(key))throw Object.assign(new Error(),{code:"NoSuchKey"});return {content:objects.get(key)};},put:async(key,body)=>{writes.push(key);objects.set(key,body);}},config:{base:"https://example.com/ember-peek",key:key=>`ember-peek/${key}`},release:{tag_name:`v${version}`,draft:false,prerelease:false,assets:[{name:"Ember-Peek-setup.exe",size:bytes.length}]},files:new Map([["Ember-Peek-setup.exe",bytes],["SHA256SUMS.txt",Buffer.from(`${sha}  Ember-Peek-setup.exe\n`)]])};
}
test("only stable releases are mirrored and failed checks never write",async()=>{
  for(const mutation of [s=>s.release.prerelease=true,s=>s.release.draft=true,s=>s.files.set("SHA256SUMS.txt",Buffer.from("wrong"))]) {
    const s=setup();mutation(s);
    await assert.rejects(publishDesktop({...s,apply:true}));assert.equal(s.writes.length,0);
  }
});
test("the tested installer is uploaded before the stable pointer, with idempotent retries",async()=>{
  const s=setup();await publishDesktop({...s,apply:true});
  assert.deepEqual(s.writes,["ember-peek/desktop/windows-x86_64/0.1.0/Ember-Peek-setup.exe",`ember-peek/${updateKey}`]);
  await publishDesktop({...s,apply:true});assert.equal(s.writes.length,3);
  const changed=setup();changed.objects.set(s.writes[0],Buffer.from("different"));
  await assert.rejects(publishDesktop({...changed,apply:true}),/cannot be changed/);assert.equal(changed.writes.length,0);
});
test("an old release cannot replace a newer stable pointer and plans never write",async()=>{
  const s=setup();await publishDesktop(s);assert.equal(s.writes.length,0);
  s.objects.set(`ember-peek/${updateKey}`,Buffer.from(JSON.stringify({version:"0.2.0"})));
  await assert.rejects(publishDesktop({...s,apply:true}),/newer stable/);assert.equal(s.writes.length,0);
});
test("Tauri installer names with spaces retain their checksum and have encoded download URLs",async()=>{
  const s=setup(), name="Ember Peek_0.1.0_x64-setup.exe", bytes=s.files.get("Ember-Peek-setup.exe");
  s.files.delete("Ember-Peek-setup.exe");s.files.set(name,bytes);
  s.files.set("SHA256SUMS.txt",Buffer.from(`${createHash("sha256").update(bytes).digest("hex")}  ${name}\r\n`));
  s.release.assets[0].name=name;
  const manifest=await publishDesktop({...s,apply:true});
  assert.ok(manifest.url.endsWith("Ember%20Peek_0.1.0_x64-setup.exe"));
  assert.ok(s.writes[0].endsWith(name));
});
