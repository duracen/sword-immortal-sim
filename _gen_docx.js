// Generate 검선귀환_신통_정리.docx from 신통_정리.md
const fs = require('fs');
const path = require('path');
const {
  Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell,
  HeadingLevel, AlignmentType, BorderStyle, WidthType, ShadingType,
  LevelFormat, PageOrientation,
} = require('docx');

const ROOT = path.resolve(__dirname);
const MD = path.join(ROOT, '신통_정리.md');
const OUT = path.join(ROOT, '검선귀환_신통_정리.docx');

const src = fs.readFileSync(MD, 'utf8');
const lines = src.split(/\r?\n/);

// Parse into blocks. We'll handle:
// - "# "  → H1
// - "## " → H2
// - "### " → H3
// - "#### " → H4
// - "> "  → blockquote (italic gray)
// - "| ... |" tables (contiguous)
// - "" blank lines
// - default paragraph

const border = { style: BorderStyle.SINGLE, size: 4, color: 'BFBFBF' };
const tableBorders = { top: border, bottom: border, left: border, right: border, insideHorizontal: border, insideVertical: border };

const CONTENT_WIDTH = 9360; // US Letter, 1-inch margins

function runFromText(text, opts = {}) {
  // Convert ** ** emphasis (bold) pairs. Also plain text.
  const runs = [];
  // Simple bold parser.
  const re = /\*\*([^*]+)\*\*/g;
  let last = 0, m;
  while ((m = re.exec(text)) !== null) {
    if (m.index > last) runs.push(new TextRun({ text: text.slice(last, m.index), font: 'Malgun Gothic', ...opts }));
    runs.push(new TextRun({ text: m[1], bold: true, font: 'Malgun Gothic', ...opts }));
    last = m.index + m[0].length;
  }
  if (last < text.length) runs.push(new TextRun({ text: text.slice(last), font: 'Malgun Gothic', ...opts }));
  if (runs.length === 0) runs.push(new TextRun({ text, font: 'Malgun Gothic', ...opts }));
  return runs;
}

function parseTableRows(tableLines) {
  // tableLines: array of "| a | b |" lines
  const rows = tableLines
    .map((l) => l.trim())
    .filter((l) => l.startsWith('|'))
    .map((l) => l.slice(1, l.endsWith('|') ? -1 : l.length).split('|').map((c) => c.trim()));
  // Strip separator row like |---|---|
  return rows.filter((cells) => !cells.every((c) => /^[-: ]+$/.test(c)));
}

function makeTable(tableLines) {
  const rows = parseTableRows(tableLines);
  if (rows.length === 0) return null;
  const nCols = Math.max(...rows.map((r) => r.length));
  const colW = Math.floor(CONTENT_WIDTH / nCols);
  const columnWidths = new Array(nCols).fill(colW);
  // Adjust last col to make sum exactly equal
  columnWidths[nCols - 1] += CONTENT_WIDTH - colW * nCols;

  const docRows = rows.map((cells, rIdx) => new TableRow({
    tableHeader: rIdx === 0,
    children: Array.from({ length: nCols }).map((_, cIdx) => {
      const txt = cells[cIdx] ?? '';
      return new TableCell({
        width: { size: columnWidths[cIdx], type: WidthType.DXA },
        margins: { top: 60, bottom: 60, left: 100, right: 100 },
        shading: rIdx === 0 ? { fill: 'E7EEF5', type: ShadingType.CLEAR } : undefined,
        borders: { top: border, bottom: border, left: border, right: border },
        children: [new Paragraph({
          children: runFromText(txt, rIdx === 0 ? { bold: true, size: 18 } : { size: 18 }),
        })],
      });
    }),
  }));

  return new Table({
    width: { size: CONTENT_WIDTH, type: WidthType.DXA },
    columnWidths,
    rows: docRows,
  });
}

// Walk lines, build children array
const children = [];
let i = 0;
while (i < lines.length) {
  const line = lines[i];
  const trimmed = line.trimEnd();

  // Table block?
  if (trimmed.startsWith('|')) {
    const tableLines = [];
    while (i < lines.length && lines[i].trim().startsWith('|')) {
      tableLines.push(lines[i]);
      i++;
    }
    const t = makeTable(tableLines);
    if (t) children.push(t);
    // spacer paragraph after table
    children.push(new Paragraph({ children: [new TextRun({ text: '' })] }));
    continue;
  }

  if (trimmed === '') {
    // blank
    i++;
    continue;
  }

  if (trimmed.startsWith('# ')) {
    children.push(new Paragraph({
      heading: HeadingLevel.HEADING_1,
      spacing: { before: 360, after: 200 },
      children: runFromText(trimmed.slice(2), { bold: true, size: 36, color: '1F3A5F' }),
    }));
    i++; continue;
  }
  if (trimmed.startsWith('## ')) {
    children.push(new Paragraph({
      heading: HeadingLevel.HEADING_2,
      spacing: { before: 320, after: 160 },
      children: runFromText(trimmed.slice(3), { bold: true, size: 30, color: '24517A' }),
    }));
    i++; continue;
  }
  if (trimmed.startsWith('### ')) {
    children.push(new Paragraph({
      heading: HeadingLevel.HEADING_3,
      spacing: { before: 260, after: 120 },
      children: runFromText(trimmed.slice(4), { bold: true, size: 26, color: '2E6AAD' }),
    }));
    i++; continue;
  }
  if (trimmed.startsWith('#### ')) {
    children.push(new Paragraph({
      heading: HeadingLevel.HEADING_4,
      spacing: { before: 200, after: 100 },
      children: runFromText(trimmed.slice(5), { bold: true, size: 22, color: '2E6AAD' }),
    }));
    i++; continue;
  }
  if (trimmed.startsWith('> ')) {
    children.push(new Paragraph({
      spacing: { before: 60, after: 60 },
      indent: { left: 360 },
      children: runFromText(trimmed.slice(2), { italics: true, color: '666666', size: 20 }),
    }));
    i++; continue;
  }

  // default paragraph
  children.push(new Paragraph({
    spacing: { before: 40, after: 40 },
    children: runFromText(trimmed, { size: 20 }),
  }));
  i++;
}

const doc = new Document({
  creator: 'Claude',
  title: '검선귀환 신통 정리',
  styles: {
    default: { document: { run: { font: 'Malgun Gothic', size: 20 } } },
    paragraphStyles: [
      { id: 'Heading1', name: 'Heading 1', basedOn: 'Normal', next: 'Normal', quickFormat: true,
        run: { size: 36, bold: true, font: 'Malgun Gothic', color: '1F3A5F' },
        paragraph: { spacing: { before: 360, after: 200 }, outlineLevel: 0 } },
      { id: 'Heading2', name: 'Heading 2', basedOn: 'Normal', next: 'Normal', quickFormat: true,
        run: { size: 30, bold: true, font: 'Malgun Gothic', color: '24517A' },
        paragraph: { spacing: { before: 320, after: 160 }, outlineLevel: 1 } },
      { id: 'Heading3', name: 'Heading 3', basedOn: 'Normal', next: 'Normal', quickFormat: true,
        run: { size: 26, bold: true, font: 'Malgun Gothic', color: '2E6AAD' },
        paragraph: { spacing: { before: 260, after: 120 }, outlineLevel: 2 } },
      { id: 'Heading4', name: 'Heading 4', basedOn: 'Normal', next: 'Normal', quickFormat: true,
        run: { size: 22, bold: true, font: 'Malgun Gothic', color: '2E6AAD' },
        paragraph: { spacing: { before: 200, after: 100 }, outlineLevel: 3 } },
    ],
  },
  sections: [{
    properties: {
      page: {
        size: { width: 12240, height: 15840 },
        margin: { top: 1440, right: 1440, bottom: 1440, left: 1440 },
      },
    },
    children,
  }],
});

Packer.toBuffer(doc).then((buf) => {
  fs.writeFileSync(OUT, buf);
  console.log('OK', OUT, buf.length, 'bytes');
}).catch((e) => { console.error(e); process.exit(1); });
