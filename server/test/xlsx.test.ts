import assert from 'node:assert/strict';
import { test } from 'node:test';
import { inflateRawSync } from 'node:zlib';
import { buildXlsx, columnName } from '../src/xlsx.ts';

/** Reads the entries of a zip produced by buildXlsx (via the central directory). */
function unzip(buf: Buffer): Map<string, string> {
  const end = buf.length - 22;
  assert.equal(buf.readUInt32LE(end), 0x06054b50);
  const count = buf.readUInt16LE(end + 10);
  let p = buf.readUInt32LE(end + 16);
  const files = new Map<string, string>();
  for (let i = 0; i < count; i++) {
    assert.equal(buf.readUInt32LE(p), 0x02014b50);
    const size = buf.readUInt32LE(p + 20);
    const nameLen = buf.readUInt16LE(p + 28);
    const local = buf.readUInt32LE(p + 42);
    const name = buf.subarray(p + 46, p + 46 + nameLen).toString('utf8');
    const dataStart = local + 30 + buf.readUInt16LE(local + 26) + buf.readUInt16LE(local + 28);
    files.set(name, inflateRawSync(buf.subarray(dataStart, dataStart + size)).toString('utf8'));
    p += 46 + nameLen;
  }
  return files;
}

test('columnName', () => {
  assert.deepEqual([0, 25, 26, 27, 701, 702].map(columnName), ['A', 'Z', 'AA', 'AB', 'ZZ', 'AAA']);
});

test('buildXlsx writes a valid package with typed cells', () => {
  const files = unzip(
    buildXlsx([{ name: 'Players', columns: ['name', 'trust', 'won_at'], rows: [['Ayşe <&> "Ş"', 87, new Date(2026, 9, 21, 12, 0)], ['=1+1', null, null]] }]),
  );
  assert.deepEqual([...files.keys()].sort(), [
    '[Content_Types].xml', '_rels/.rels', 'xl/_rels/workbook.xml.rels', 'xl/styles.xml', 'xl/workbook.xml', 'xl/worksheets/sheet1.xml',
  ]);
  const sheet = files.get('xl/worksheets/sheet1.xml')!;
  assert.match(sheet, /<c r="A1" s="1" t="inlineStr"><is><t xml:space="preserve">name<\/t>/);
  assert.match(sheet, /Ayşe &lt;&amp;&gt; &quot;Ş&quot;/);
  assert.match(sheet, /<c r="B2"><v>87<\/v><\/c>/);
  // 2026-10-21 12:00 local time as an Excel date serial.
  assert.match(sheet, /<c r="C2" s="2"><v>46316\.5<\/v><\/c>/);
  // Player text that looks like a formula stays text.
  assert.match(sheet, /<c r="A3" t="inlineStr"><is><t xml:space="preserve">=1\+1<\/t>/);
  assert.doesNotMatch(sheet, /<f>/);
  assert.match(sheet, /<autoFilter ref="A1:C3"\/>/);
  assert.match(files.get('xl/workbook.xml')!, /<sheet name="Players" sheetId="1" r:id="rId1"\/>/);
});
