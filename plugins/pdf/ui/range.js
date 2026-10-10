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

// Leave room for lifecycle and controls requests in the host's shared request budget.
export function createPdfRangeReader(read) {
  const lanes = Array.from({ length: 4 }, () => Promise.resolve());
  let next = 0;
  return (begin, end) => {
    const lane = next++ % lanes.length;
    const result = lanes[lane].then(() => readPdfRange(read, begin, end));
    lanes[lane] = result.catch(() => {});
    return result;
  };
}
