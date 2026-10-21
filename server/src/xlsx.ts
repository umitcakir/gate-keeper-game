// Minimal dependency-free .xlsx writer (Office Open XML in a zip): text, numbers, booleans and dates,
// with a bold, frozen, filterable header row per sheet. Strings are written as inline text, never as
// formulas, so a cell like "=HYPERLINK(...)" typed by a player stays plain text in Excel.
import { crc32, deflateRawSync } from 'node:zlib';

export type Cell = string | number | boolean | Date | null | undefined;

export interface Sheet {
  /** At most 31 characters, no []:*?/\ (Excel's limits). */
  name: string;
  columns: string[];
  rows: Cell[][];
}

const NS = 'http://schemas.openxmlformats.org/spreadsheetml/2006/main';
const REL_NS = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';
const PKG_REL_NS = 'http://schemas.openxmlformats.org/package/2006/relationships';
const XML_HEAD = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n';

// Cell styles (indexes into cellXfs below).
const STYLE_HEADER = 1;
const STYLE_DATE = 2;

const esc = (s: string) =>
  s
    // Control characters are not allowed in XML 1.0.
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f￾￿]/g, '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

/** 0 -> A, 25 -> Z, 26 -> AA. */
export function columnName(index: number): string {
  let name = '';
  for (let n = index + 1; n > 0; n = Math.floor((n - 1) / 26)) name = String.fromCharCode(65 + ((n - 1) % 26)) + name;
  return name;
}

/** Excel stores dates as days since 1899-12-30, in local time (it has no time zones). */
function dateSerial(d: Date): number {
  return (d.getTime() - d.getTimezoneOffset() * 60_000) / 86_400_000 + 25_569;
}

function cellXml(ref: string, v: Cell, style = 0): string {
  const s = style ? ` s="${style}"` : '';
  if (v === null || v === undefined || v === '') return '';
  if (v instanceof Date) return Number.isNaN(v.getTime()) ? '' : `<c r="${ref}" s="${STYLE_DATE}"><v>${dateSerial(v)}</v></c>`;
  if (typeof v === 'number') return Number.isFinite(v) ? `<c r="${ref}"${s}><v>${v}</v></c>` : '';
  if (typeof v === 'boolean') return `<c r="${ref}"${s} t="b"><v>${v ? 1 : 0}</v></c>`;
  return `<c r="${ref}"${s} t="inlineStr"><is><t xml:space="preserve">${esc(v)}</t></is></c>`;
}

function displayWidth(v: Cell): number {
  if (v instanceof Date) return 16;
  return v === null || v === undefined ? 0 : String(v).length;
}

function sheetXml(sheet: Sheet): string {
  const last = columnName(Math.max(0, sheet.columns.length - 1));
  const rows = [sheet.columns, ...sheet.rows].map((row, r) => {
    const cells = row.map((v, c) => cellXml(`${columnName(c)}${r + 1}`, v, r === 0 ? STYLE_HEADER : 0)).join('');
    return `<row r="${r + 1}">${cells}</row>`;
  });
  const cols = sheet.columns
    .map((h, c) => {
      const widest = Math.max(h.length + 2, ...sheet.rows.map((row) => displayWidth(row[c])));
      return `<col min="${c + 1}" max="${c + 1}" width="${Math.min(60, Math.max(8, widest + 2))}" customWidth="1"/>`;
    })
    .join('');
  return `${XML_HEAD}<worksheet xmlns="${NS}" xmlns:r="${REL_NS}">`
    + '<sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>'
    + (cols ? `<cols>${cols}</cols>` : '')
    + `<sheetData>${rows.join('')}</sheetData>`
    + (sheet.columns.length ? `<autoFilter ref="A1:${last}${sheet.rows.length + 1}"/>` : '')
    + '</worksheet>';
}

const STYLES = `${XML_HEAD}<styleSheet xmlns="${NS}">`
  + '<numFmts count="1"><numFmt numFmtId="164" formatCode="yyyy-mm-dd hh:mm"/></numFmts>'
  + '<fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><name val="Calibri"/></font></fonts>'
  + '<fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills>'
  + '<borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders>'
  + '<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>'
  + '<cellXfs count="3"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>'
  + '<xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1"/>'
  + '<xf numFmtId="164" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/></cellXfs>'
  + '<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>'
  + '</styleSheet>';

/** Builds the .xlsx file contents. */
export function buildXlsx(sheets: Sheet[]): Buffer {
  const names = sheets.map((s) => s.name.replace(/[[\]:*?/\\]/g, ' ').slice(0, 31) || 'Sheet');
  const files: [string, string][] = [
    ['[Content_Types].xml', `${XML_HEAD}<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">`
      + '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>'
      + '<Default Extension="xml" ContentType="application/xml"/>'
      + '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>'
      + '<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>'
      + sheets.map((_, i) => `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join('')
      + '</Types>'],
    ['_rels/.rels', `${XML_HEAD}<Relationships xmlns="${PKG_REL_NS}">`
      + `<Relationship Id="rId1" Type="${REL_NS}/officeDocument" Target="xl/workbook.xml"/></Relationships>`],
    ['xl/workbook.xml', `${XML_HEAD}<workbook xmlns="${NS}" xmlns:r="${REL_NS}"><sheets>`
      + names.map((n, i) => `<sheet name="${esc(n)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join('')
      + '</sheets><definedNames>'
      // Excel expects a hidden name for each sheet's filter range.
      + sheets.map((s, i) => s.columns.length
        ? `<definedName name="_xlnm._FilterDatabase" localSheetId="${i}" hidden="1">'${esc(names[i]!.replace(/'/g, "''"))}'!$A$1:$${columnName(s.columns.length - 1)}$${s.rows.length + 1}</definedName>`
        : '').join('')
      + '</definedNames></workbook>'],
    ['xl/_rels/workbook.xml.rels', `${XML_HEAD}<Relationships xmlns="${PKG_REL_NS}">`
      + sheets.map((_, i) => `<Relationship Id="rId${i + 1}" Type="${REL_NS}/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`).join('')
      + `<Relationship Id="rId${sheets.length + 1}" Type="${REL_NS}/styles" Target="styles.xml"/></Relationships>`],
    ['xl/styles.xml', STYLES],
    ...sheets.map((s, i): [string, string] => [`xl/worksheets/sheet${i + 1}.xml`, sheetXml(s)]),
  ];
  return zip(files);
}

/** Plain zip archive (deflate, UTF-8 names), enough for Office files. */
function zip(files: [string, string][]): Buffer {
  const parts: Buffer[] = [];
  const central: Buffer[] = [];
  let offset = 0;
  const DOS_DATE = (1 << 5) | 1; // 1980-01-01, keeps the output byte-for-byte reproducible
  for (const [name, text] of files) {
    const data = Buffer.from(text, 'utf8');
    const packed = deflateRawSync(data);
    const crc = crc32(data);
    const nameBuf = Buffer.from(name, 'utf8');

    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4); // version needed
    local.writeUInt16LE(0x0800, 6); // UTF-8 names
    local.writeUInt16LE(8, 8); // deflate
    local.writeUInt16LE(0, 10);
    local.writeUInt16LE(DOS_DATE, 12);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(packed.length, 18);
    local.writeUInt32LE(data.length, 22);
    local.writeUInt16LE(nameBuf.length, 26);
    local.writeUInt16LE(0, 28);

    const entry = Buffer.alloc(46);
    entry.writeUInt32LE(0x02014b50, 0);
    entry.writeUInt16LE(20, 4); // version made by
    entry.writeUInt16LE(20, 6); // version needed
    entry.writeUInt16LE(0x0800, 8);
    entry.writeUInt16LE(8, 10);
    entry.writeUInt16LE(0, 12);
    entry.writeUInt16LE(DOS_DATE, 14);
    entry.writeUInt32LE(crc, 16);
    entry.writeUInt32LE(packed.length, 20);
    entry.writeUInt32LE(data.length, 24);
    entry.writeUInt16LE(nameBuf.length, 28);
    entry.writeUInt32LE(offset, 42); // bytes 30-41 (extra/comment lengths, disk, attributes) stay 0

    parts.push(local, nameBuf, packed);
    central.push(entry, nameBuf);
    offset += local.length + nameBuf.length + packed.length;
  }
  const centralSize = central.reduce((n, b) => n + b.length, 0);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(files.length, 8);
  end.writeUInt16LE(files.length, 10);
  end.writeUInt32LE(centralSize, 12);
  end.writeUInt32LE(offset, 16);
  return Buffer.concat([...parts, ...central, end]);
}
