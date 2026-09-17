# Fixtures

`package/` is a minimal valid plugin package used as the input for the packaging
contract test. `package.zip` is that directory packed by `scripts/zip.mjs`, and it is
committed so the two sides of the format can be checked against each other:

- `tests/zip.test.mjs` rebuilds the zip and compares its entry table and payloads with
  the committed one, so a change to the writer cannot silently drift from the fixture.
- the `artifact` unit tests in `crates/runtime` unpack the committed zip with the host's
  extractor, so the writer and the reader have to agree on the real format.

Regenerate it after an intentional writer change:

```powershell
node -e "import('./scripts/zip.mjs').then(async m => require('node:fs').writeFileSync('crates/runtime/tests/fixtures/package.zip', await m.zipDirectory('crates/runtime/tests/fixtures/package')))"
```
