export const ROW_LIMIT = 100000;
export const COLUMN_LIMIT = 256;
export function sheetRange(sheet, parser) {
  const ref = sheet['!fullref'] || sheet['!ref'];
  if (!ref) return { rows: 0, columns: 0, startRow: 0, startColumn: 0, truncated: false };
  const range = parser.utils.decode_range(ref);
  if (![range.s.r, range.s.c, range.e.r, range.e.c].every(Number.isSafeInteger) || range.s.r < 0 || range.s.c < 0 || range.e.r < range.s.r || range.e.c < range.s.c) throw new Error('Invalid worksheet dimensions');
  const rows = range.e.r - range.s.r + 1, columns = range.e.c - range.s.c + 1;
  return { rows: Math.max(0, Math.min(range.e.r + 1, ROW_LIMIT) - range.s.r), columns: Math.min(columns, COLUMN_LIMIT), startRow: range.s.r, startColumn: range.s.c, truncated: range.e.r >= ROW_LIMIT || columns > COLUMN_LIMIT };
}
export function readRows(book, sheetIndex, first, count, parser) {
  if (!Number.isInteger(sheetIndex) || sheetIndex < 0 || sheetIndex >= book.SheetNames.length || !Number.isInteger(first) || first < 0 || !Number.isInteger(count) || count < 1 || count > 200) throw new Error('Invalid worksheet request');
  const sheet = book.Sheets[book.SheetNames[sheetIndex]], range = sheetRange(sheet, parser);
  const result = [];
  for (let row = first; row < Math.min(first + count, range.rows); row++) {
    const cells = [];
    for (let column = 0; column < range.columns; column++) {
      const r = row + range.startRow, c = column + range.startColumn;
      const cell = sheet['!data']?.[r]?.[c] ?? sheet[parser.utils.encode_cell({ r, c })];
      cells.push(cell ? { text: (cell.v === undefined || cell.t === 'z') && cell.f ? `=${cell.f}` : (cell.w ?? (cell.v === undefined ? '' : parser.utils.format_cell(cell))), formula: cell.f || '', numeric: cell.t === 'n' } : null);
    }
    result.push(cells);
  }
  return result;
}

export function parseWorkbook(value, parser) {
 const book=parser.read(value,{type:'array',dense:true,cellFormula:true,sheetStubs:true,cellStyles:false,sheetRows:ROW_LIMIT});
 if(book.SheetNames.length>256)throw new Error('Workbook exceeds 256 worksheets');
 return book;
}
