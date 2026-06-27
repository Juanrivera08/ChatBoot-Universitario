import PDFDocument from 'pdfkit';
import ExcelJS from 'exceljs';
import type { ReportResult, ReportRow } from '../services/reportService';

// ============================================================
// GENERADORES DE ARCHIVOS DE REPORTE (PDF y Excel)
// Reciben el resultado ya modelado por reportService y producen un Buffer.
// Separados del servicio de datos para mantener responsabilidades aisladas.
// ============================================================

const BRAND = '#6e8afc';
const INK = '#1f2937';
const MUTED = '#6b7280';
const LINE = '#e5e7eb';

const dateFmt = new Intl.DateTimeFormat('es-CO', {
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
});

const fmtDate = (d: Date | string | null): string => (d ? dateFmt.format(new Date(d)) : '—');
const fmtSat = (n: number | null): string => (n == null ? 'N/D' : `${n}/5`);

// ------------------------------------------------------------
// PDF — diseño tabular claro, A4 horizontal, con encabezado de marca,
// resumen ejecutivo, tabla de conversaciones y (opcional) transcripciones.
// ------------------------------------------------------------

interface Column {
  header: string;
  width: number;
  key: keyof PdfTableRow;
  align?: 'left' | 'center' | 'right';
}

interface PdfTableRow {
  id: string;
  user: string;
  startedAt: string;
  endedAt: string;
  duration: string;
  type: string;
  messages: string;
  satisfaction: string;
  status: string;
  summary: string;
}

const PDF_COLUMNS: Column[] = [
  { header: 'ID', width: 58, key: 'id' },
  { header: 'Usuario', width: 92, key: 'user' },
  { header: 'Inicio', width: 78, key: 'startedAt' },
  { header: 'Fin', width: 78, key: 'endedAt' },
  { header: 'Duración', width: 52, key: 'duration', align: 'center' },
  { header: 'Tipo', width: 88, key: 'type' },
  { header: 'Msj', width: 32, key: 'messages', align: 'center' },
  { header: 'Satisf.', width: 42, key: 'satisfaction', align: 'center' },
  { header: 'Estado', width: 74, key: 'status' },
  { header: 'Resumen / consulta inicial', width: 168, key: 'summary' },
];

function toPdfRow(r: ReportRow): PdfTableRow {
  return {
    id: r.id.slice(0, 8),
    user: r.user,
    startedAt: fmtDate(r.startedAt),
    endedAt: fmtDate(r.endedAt),
    duration: r.durationLabel,
    type: r.queryTypeLabel,
    messages: String(r.messageCount),
    satisfaction: fmtSat(r.satisfaction),
    status: r.status,
    summary: r.summary,
  };
}

export function generatePdf(report: ReportResult): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', layout: 'landscape', margin: 36 });
    const chunks: Buffer[] = [];
    doc.on('data', (c: Buffer) => chunks.push(c));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    const left = doc.page.margins.left;
    const right = doc.page.width - doc.page.margins.right;

    // ---- Encabezado ----
    doc.rect(left, 36, right - left, 4).fill(BRAND);
    doc.fillColor(INK).font('Helvetica-Bold').fontSize(18)
      .text('Informe de Conversaciones', left, 50);
    doc.font('Helvetica').fontSize(10).fillColor(MUTED)
      .text('Chatbot · Institución Universitaria Salazar y Herrera', left, 72);

    const { from, to, queryTypeLabel } = report.filters;
    doc.fontSize(9).fillColor(MUTED).text(
      `Rango: ${fmtDate(from)} — ${fmtDate(to)}` +
        (queryTypeLabel ? `   ·   Tipo: ${queryTypeLabel}` : '   ·   Tipo: Todos') +
        `   ·   Generado: ${fmtDate(report.generatedAt)}`,
      left,
      88
    );

    // ---- Resumen ejecutivo ----
    const s = report.summary;
    const cards: Array<[string, string]> = [
      ['Conversaciones', String(s.totalConversations)],
      ['Mensajes totales', String(s.totalMessages)],
      ['Prom. mensajes', String(s.avgMessagesPerConversation)],
      ['Duración prom.', s.avgDurationLabel],
      ['Satisfacción prom.', s.avgSatisfaction == null ? 'N/D' : `${s.avgSatisfaction}/5`],
      ['Atención humana', String(s.humanHandledConversations)],
    ];
    const cardY = 108;
    const cardW = (right - left) / cards.length;
    cards.forEach(([label, value], i) => {
      const x = left + i * cardW;
      doc.roundedRect(x + 2, cardY, cardW - 4, 44, 6).fill('#f3f4f6');
      doc.fillColor(MUTED).font('Helvetica').fontSize(8)
        .text(label.toUpperCase(), x + 10, cardY + 8, { width: cardW - 20 });
      doc.fillColor(INK).font('Helvetica-Bold').fontSize(15)
        .text(value, x + 10, cardY + 20, { width: cardW - 20 });
    });

    // ---- Tabla ----
    let y = cardY + 64;
    y = drawTableHeader(doc, left, y);

    if (report.rows.length === 0) {
      doc.font('Helvetica-Oblique').fontSize(10).fillColor(MUTED)
        .text('No hay conversaciones que coincidan con los filtros seleccionados.', left, y + 10);
    }

    for (const row of report.rows) {
      const pdfRow = toPdfRow(row);
      const rowHeight = measureRowHeight(doc, pdfRow);
      if (y + rowHeight > doc.page.height - doc.page.margins.bottom) {
        doc.addPage();
        y = doc.page.margins.top;
        y = drawTableHeader(doc, left, y);
      }
      y = drawTableRow(doc, left, y, pdfRow, rowHeight);
    }

    // ---- Transcripciones (opcional) ----
    const withTranscript = report.rows.filter((r) => r.transcript && r.transcript.length > 0);
    if (withTranscript.length > 0) {
      doc.addPage();
      doc.font('Helvetica-Bold').fontSize(14).fillColor(INK)
        .text('Transcripciones', doc.page.margins.left, doc.page.margins.top);
      doc.moveDown(0.5);
      for (const r of withTranscript) {
        ensureSpace(doc, 60);
        doc.font('Helvetica-Bold').fontSize(10).fillColor(BRAND)
          .text(`Conversación ${r.id.slice(0, 8)} · ${r.user} · ${fmtDate(r.startedAt)}`);
        doc.moveDown(0.2);
        for (const line of r.transcript!) {
          ensureSpace(doc, 24);
          doc.font('Helvetica-Bold').fontSize(8.5).fillColor(MUTED)
            .text(`${line.author} · ${fmtDate(line.at)}`);
          doc.font('Helvetica').fontSize(9).fillColor(INK)
            .text(line.content, { width: right - left });
          doc.moveDown(0.3);
        }
        doc.moveDown(0.6);
      }
    }

    addPageNumbers(doc);
    doc.end();
  });
}

function drawTableHeader(doc: PDFKit.PDFDocument, left: number, y: number): number {
  const totalWidth = PDF_COLUMNS.reduce((a, c) => a + c.width, 0);
  doc.rect(left, y, totalWidth, 20).fill(BRAND);
  doc.fillColor('#ffffff').font('Helvetica-Bold').fontSize(8.5);
  let x = left;
  for (const col of PDF_COLUMNS) {
    doc.text(col.header, x + 4, y + 6, { width: col.width - 8, align: col.align ?? 'left' });
    x += col.width;
  }
  return y + 20;
}

function measureRowHeight(doc: PDFKit.PDFDocument, row: PdfTableRow): number {
  doc.font('Helvetica').fontSize(8);
  let max = 14;
  for (const col of PDF_COLUMNS) {
    const h = doc.heightOfString(String(row[col.key] ?? ''), { width: col.width - 8 });
    if (h + 8 > max) max = h + 8;
  }
  return max;
}

function drawTableRow(
  doc: PDFKit.PDFDocument,
  left: number,
  y: number,
  row: PdfTableRow,
  height: number
): number {
  const totalWidth = PDF_COLUMNS.reduce((a, c) => a + c.width, 0);
  // Cebra para legibilidad
  if ((Math.round(y) % 2) === 0) doc.rect(left, y, totalWidth, height).fill('#fafafa');
  doc.font('Helvetica').fontSize(8).fillColor(INK);
  let x = left;
  for (const col of PDF_COLUMNS) {
    doc.text(String(row[col.key] ?? ''), x + 4, y + 4, {
      width: col.width - 8,
      align: col.align ?? 'left',
    });
    x += col.width;
  }
  doc.moveTo(left, y + height).lineTo(left + totalWidth, y + height).strokeColor(LINE).lineWidth(0.5).stroke();
  return y + height;
}

function ensureSpace(doc: PDFKit.PDFDocument, needed: number): void {
  if (doc.y + needed > doc.page.height - doc.page.margins.bottom) doc.addPage();
}

function addPageNumbers(doc: PDFKit.PDFDocument): void {
  const range = doc.bufferedPageRange();
  for (let i = range.start; i < range.start + range.count; i++) {
    doc.switchToPage(i);
    doc.font('Helvetica').fontSize(8).fillColor(MUTED).text(
      `Página ${i + 1} de ${range.count}`,
      doc.page.margins.left,
      doc.page.height - 24,
      { width: doc.page.width - doc.page.margins.left - doc.page.margins.right, align: 'right' }
    );
  }
}

// ------------------------------------------------------------
// Excel — hoja "Conversaciones" con tabla filtrable + hoja "Resumen"
// y, si aplica, hoja "Transcripciones".
// ------------------------------------------------------------

export async function generateExcel(report: ReportResult): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'Chatbot USH';
  wb.created = report.generatedAt;

  // ---- Hoja Resumen ----
  const summarySheet = wb.addWorksheet('Resumen');
  summarySheet.columns = [{ width: 32 }, { width: 28 }];
  const { from, to, queryTypeLabel } = report.filters;
  const s = report.summary;

  summarySheet.addRow(['Informe de Conversaciones — Chatbot USH']).font = { bold: true, size: 14 };
  summarySheet.addRow([]);
  const meta: Array<[string, string]> = [
    ['Rango de fechas', `${fmtDate(from)}  —  ${fmtDate(to)}`],
    ['Tipo de consulta', queryTypeLabel ?? 'Todos'],
    ['Generado', fmtDate(report.generatedAt)],
    ['Conversaciones', String(s.totalConversations)],
    ['Mensajes totales', String(s.totalMessages)],
    ['Promedio mensajes/conversación', String(s.avgMessagesPerConversation)],
    ['Duración promedio', s.avgDurationLabel],
    ['Satisfacción promedio', s.avgSatisfaction == null ? 'N/D' : `${s.avgSatisfaction}/5`],
    ['Conversaciones valoradas', String(s.ratedConversations)],
    ['Atendidas por humano', String(s.humanHandledConversations)],
  ];
  for (const [k, v] of meta) {
    const row = summarySheet.addRow([k, v]);
    row.getCell(1).font = { bold: true, color: { argb: 'FF6B7280' } };
  }
  summarySheet.addRow([]);
  summarySheet.addRow(['Distribución por tipo de consulta']).font = { bold: true };
  summarySheet.addRow(['Tipo', 'Conversaciones']).eachCell((c) => {
    c.font = { bold: true };
  });
  for (const t of s.byQueryType) summarySheet.addRow([t.label, t.count]);

  // ---- Hoja Conversaciones ----
  const sheet = wb.addWorksheet('Conversaciones', {
    views: [{ state: 'frozen', ySplit: 1 }],
  });
  sheet.columns = [
    { header: 'ID Conversación', key: 'id', width: 38 },
    { header: 'Usuario', key: 'user', width: 30 },
    { header: 'Inicio', key: 'startedAt', width: 18 },
    { header: 'Fin', key: 'endedAt', width: 18 },
    { header: 'Duración', key: 'duration', width: 12 },
    { header: 'Tipo de consulta', key: 'type', width: 22 },
    { header: 'Mensajes', key: 'messages', width: 10 },
    { header: 'Mensajes usuario', key: 'userMessages', width: 16 },
    { header: 'Satisfacción', key: 'satisfaction', width: 12 },
    { header: 'Estado', key: 'status', width: 18 },
    { header: 'Resumen / consulta inicial', key: 'summary', width: 60 },
  ];

  const header = sheet.getRow(1);
  header.font = { bold: true, color: { argb: 'FFFFFFFF' } };
  header.alignment = { vertical: 'middle' };
  header.height = 20;
  header.eachCell((cell) => {
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF6E8AFC' } };
  });

  for (const r of report.rows) {
    sheet.addRow({
      id: r.id,
      user: r.user,
      startedAt: new Date(r.startedAt),
      endedAt: new Date(r.endedAt),
      duration: r.durationLabel,
      type: r.queryTypeLabel,
      messages: r.messageCount,
      userMessages: r.userMessages,
      satisfaction: r.satisfaction == null ? 'N/D' : r.satisfaction,
      status: r.status,
      summary: r.summary,
    });
  }

  sheet.getColumn('startedAt').numFmt = 'dd/mm/yyyy hh:mm';
  sheet.getColumn('endedAt').numFmt = 'dd/mm/yyyy hh:mm';
  // Autofiltro sobre todas las columnas de datos
  sheet.autoFilter = { from: 'A1', to: { row: 1, column: sheet.columnCount } };

  // ---- Hoja Transcripciones (opcional) ----
  const withTranscript = report.rows.filter((r) => r.transcript && r.transcript.length > 0);
  if (withTranscript.length > 0) {
    const tSheet = wb.addWorksheet('Transcripciones');
    tSheet.columns = [
      { header: 'ID Conversación', key: 'id', width: 38 },
      { header: 'Fecha/hora', key: 'at', width: 18 },
      { header: 'Autor', key: 'author', width: 16 },
      { header: 'Mensaje', key: 'content', width: 90 },
    ];
    tSheet.getRow(1).font = { bold: true };
    tSheet.getColumn('at').numFmt = 'dd/mm/yyyy hh:mm';
    for (const r of withTranscript) {
      for (const line of r.transcript!) {
        const row = tSheet.addRow({
          id: r.id,
          at: new Date(line.at),
          author: line.author,
          content: line.content,
        });
        row.getCell('content').alignment = { wrapText: true, vertical: 'top' };
      }
    }
  }

  const arrayBuffer = await wb.xlsx.writeBuffer();
  return Buffer.from(arrayBuffer);
}
