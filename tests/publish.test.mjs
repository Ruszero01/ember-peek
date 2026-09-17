import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { hashInput } from "../scripts/release-inputs.mjs";
import { publishRelease, planRelease, sha256, checkCatalog, checkInputs } from "../scripts/publish-plugins.mjs";
import { ossConfig, sourceConfig, target, catalogKey, packagesKey } from "../scripts/oss-config.mjs";

const config = ossConfig({ OSS_REGION: "oss-cn-hongkong", OSS_BUCKET: "test-bucket", OSS_PREFIX: "ember-peek", OSS_PUBLIC_BASE_URL: "https://test.invalid/ember-peek" });
const body = Buffer.from("a verified package");
test("source fingerprints normalize text newlines but retain binary bytes and boundaries", () => {
  const digest = (name, bytes) => { const hash = createHash("sha256"); hashInput(hash, name, Buffer.from(bytes)); return hash.digest("hex"); };
  assert.equal(digest("native/main.rs", "a\r\nb\r\n"), digest("native/main.rs", "a\nb\n"));
  assert.notEqual(digest("ui/image.png", "a\r\nb"), digest("ui/image.png", "a\nb"));
  assert.notEqual(digest("native/a.rs", "bc"), digest("native/ab.rs", "c"));
});
function entry(version = "0.1.0") {
  return { id: "ember.text", version, buildId: "b".repeat(64), artifact: `ember.text-${version}-test.zip`, sha256: sha256(body), size: body.length, targets: [target], name: "Text", summary: "text", publisher: "Ember", extensions: ["txt"] };
}
function fixture(version = "0.1.0") {
  const values = new Map(), writes = [];
  const store = {
    async listV2({ prefix }) { return { objects: [...values.keys()].filter((name) => name.startsWith(prefix)).map((name) => ({ name })), isTruncated: false }; },
    getBucketVersioning: async () => ({}),
    async get(key) { if (!values.has(key)) throw Object.assign(new Error("missing"), { code: "NoSuchKey" }); return { content: values.get(key) }; },
    async put(key, bytes, options) {
      if (options?.headers?.["x-oss-forbid-overwrite"] === "true" && values.has(key)) throw Object.assign(new Error("exists"), { code: "FileAlreadyExists" });
      writes.push(key); values.set(key, Buffer.from(bytes));
    },
    async delete(key) { values.delete(key); },
  };
  return { store, config, catalog: { api: 1, entries: [entry(version)] }, inputs: { api: 1, target, inputs: { "ember.text": "a".repeat(64) } }, readArtifact: async () => body, publicGet: async (url) => {
    const key = `${config.prefix}/${url.slice(config.base.length + 1)}`;
    return values.get(key);
  }, log: () => {}, values, writes };
}

test("source URLs and OSS object keys use the same prefix", () => {
  assert.equal(sourceConfig(config.base).sources[0].catalog, `${config.base}/${catalogKey}`);
  assert.throws(() => sourceConfig("http://example.test"));
  assert.throws(() => ossConfig({ OSS_REGION: "oss-cn-hongkong", OSS_BUCKET: "test-bucket", OSS_PREFIX: "../escape", OSS_PUBLIC_BASE_URL: config.base }));
});
test("release metadata must match the platform and exact catalog bytes", () => {
  const f = fixture(); const bytes = Buffer.from(JSON.stringify(f.catalog));
  const inputs = { ...f.inputs, catalogSha256: sha256(bytes) };
  checkInputs(inputs, f.catalog, bytes);
  assert.throws(() => checkInputs({ ...inputs, target: "C:/catalog.json" }, f.catalog, bytes), /不匹配/);
  assert.throws(() => checkInputs(inputs, f.catalog, Buffer.from("different")), /不匹配/);
});
test("read-only plan never uploads or takes a lock", async () => {
  const f = fixture(); const plan = await publishRelease(f);
  assert.equal(plan.packages.length, 1); assert.equal(f.writes.length, 0);
});
test("publication verifies packages before switching the catalog without retaining snapshots", async () => {
  const f = fixture(); await publishRelease({ ...f, apply: true });
  assert.equal(f.writes.at(-1), config.key(catalogKey));
  assert.ok(!f.writes.find((key) => key.includes("catalog-history/")));
  assert.ok(!f.values.has(config.key("publish.lock")));
});

test('cleanup retains only current packages and records, paginates and respects target boundaries', async () => {
  const f = fixture(); await publishRelease({ ...f, apply: true });
  const oldPackage = config.key(`${packagesKey}/${entry().artifact}`);
  const oldRecord = config.key(`registry/${target}/ember.text/0.1.0.json`);
  const history = config.key('catalog-history/old.json');
  const otherTarget = config.key('packages/linux-x86_64/keep.zip');
  f.values.set(history, Buffer.from('{}')); f.values.set(otherTarget, body);
  f.catalog.entries[0] = entry('0.2.0');
  const list = f.store.listV2;
  f.store.listV2 = async (query) => {
    const all = (await list(query)).objects;
    const index = Number(query['continuation-token'] || 0);
    return { objects: all.slice(index, index + 1), isTruncated: index + 1 < all.length, nextContinuationToken: String(index + 1) };
  };
  const plan = await publishRelease(f);
  assert.ok(plan.obsolete.includes(oldPackage)); assert.ok(f.values.has(oldPackage));
  const remove = f.store.delete;
  f.store.delete = async (key) => {
    if (key !== config.key('publish.lock')) assert.equal(JSON.parse(f.values.get(config.key(catalogKey))).entries[0].version, '0.2.0');
    await remove(key);
  };
  await publishRelease({ ...f, apply: true });
  for (const key of [oldPackage, oldRecord, history]) assert.ok(!f.values.has(key));
  assert.ok(f.values.has(otherTarget));
  assert.ok(f.values.has(config.key(`${packagesKey}/${entry('0.2.0').artifact}`)));
  assert.equal((await planRelease(f)).obsolete.length, 0);
});

test('catalog verification failure never deletes old packages; cleanup failures can be retried', async () => {
  const f = fixture(); await publishRelease({ ...f, apply: true });
  const oldPackage = config.key(`${packagesKey}/${entry().artifact}`);
  f.catalog.entries[0] = entry('0.2.0');
  await assert.rejects(publishRelease({ ...f, apply: true, publicGet: async (url, size) => url.endsWith('/catalog.json') ? Buffer.from('stale') : f.publicGet(url, size) }), /公开地址/);
  assert.ok(f.values.has(oldPackage));
  const remove = f.store.delete;
  f.store.delete = async (key) => { if (key === oldPackage) throw Object.assign(new Error('denied'), { code: 'AccessDenied' }); await remove(key); };
  await assert.rejects(publishRelease({ ...f, apply: true }), /最新目录已生效.*AccessDenied/);
  assert.ok(f.values.has(oldPackage)); assert.ok(!f.values.has(config.key('publish.lock')));
  f.store.delete = remove;
  await publishRelease({ ...f, apply: true });
  assert.ok(!f.values.has(oldPackage));
});
test("same-version rebuild reuses original immutable package", async () => {
  const f = fixture(); await publishRelease({ ...f, apply: true });
  const original = f.catalog.entries[0].artifact;
  f.catalog.entries[0] = { ...f.catalog.entries[0], buildId: "c".repeat(64), artifact: "another-build.zip", sha256: "d".repeat(64) };
  const plan = await planRelease(f);
  assert.equal(plan.catalog.entries[0].artifact, original);
  assert.equal(plan.packages.length, 0); assert.equal(plan.records.length, 0);
});
test("changed sources without a version bump and catalog downgrades are refused", async () => {
  const f = fixture("0.2.0"); await publishRelease({ ...f, apply: true });
  f.inputs.inputs["ember.text"] = "e".repeat(64);
  await assert.rejects(planRelease(f), /升级/);
  f.catalog.entries[0] = entry("0.1.0");
  await assert.rejects(planRelease(f), /降级/);
});
test("public download failure leaves the previous catalog intact and releases lock", async () => {
  const f = fixture(); await publishRelease({ ...f, apply: true });
  const original = f.values.get(config.key(catalogKey));
  f.catalog.entries[0] = entry("0.2.0");
  await assert.rejects(publishRelease({ ...f, apply: true, publicGet: async () => { throw new Error("HTTP 403"); } }), /403/);
  assert.deepEqual(f.values.get(config.key(catalogKey)), original);
  assert.ok(!f.values.has(config.key("publish.lock")));
  await publishRelease({ ...f, apply: true }); // uploaded package from the failed run is reused
});
test("a second publisher cannot remove the first publisher's lock", async () => {
  const f = fixture(); const held = Buffer.from('{"owner":"another-run"}');
  f.values.set(config.key("publish.lock"), held);
  await assert.rejects(publishRelease({ ...f, apply: true }), /exists/);
  assert.deepEqual(f.values.get(config.key("publish.lock")), held);
});
test("versioned and suspended buckets cannot silently ignore overwrite protection", async () => {
  for (const status of ["Enabled", "Suspended"]) {
    const f = fixture(); f.store.getBucketVersioning = async () => ({ versionStatus: status });
    await assert.rejects(publishRelease({ ...f, apply: true }), /版本控制/);
    assert.equal(f.writes.length, 0);
  }
});
test("historical version claims survive a failed catalog switch", async () => {
  const f = fixture(); const put = f.store.put;
  f.store.put = async (key, ...args) => { if (key === config.key(catalogKey)) throw new Error("network"); return put(key, ...args); };
  await assert.rejects(publishRelease({ ...f, apply: true }), /network/);
  f.store.put = put;
  f.inputs.inputs["ember.text"] = "e".repeat(64);
  await assert.rejects(planRelease(f), /升级/);
});
test("duplicate IDs, path traversal, and missing published packages are refused", async () => {
  assert.throws(() => checkCatalog({ api: 1, entries: [entry(), entry()] }), /重复/);
  assert.throws(() => checkCatalog({ api: 1, entries: [{ ...entry(), artifact: "../escape.zip" }] }), /包名/);
  const f = fixture(); await publishRelease({ ...f, apply: true });
  f.values.delete(config.key(`${packagesKey}/${entry().artifact}`));
  await assert.rejects(planRelease(f), /包丢失/);
});
