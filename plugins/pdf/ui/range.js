// The SDK caps each read at 1 MiB. PDF.js expects one complete response per range.
export async function readPdfRange(read, begin, end) {
  const result = new Uint8Array(end - begin);
  for (let offset = begin; offset < end;) {
    const bytes = await read(offset, Math.min(1024 * 1024, end - offset));
    if (!bytes.length || bytes.length > Math.min(1024 * 1024, end - offset)) {
      throw new Error("Unexpected end of PDF");
    }
    result.set(bytes, offset - begin);
    offset += bytes.length;
  }
  return result;
}
