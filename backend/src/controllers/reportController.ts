import { Request, Response, NextFunction } from 'express';
import { reportService, QUERY_TYPES, ReportFilters } from '../services/reportService';
import { generatePdf, generateExcel } from '../utils/reportGenerators';
import { AppError } from '../middleware/errorHandler';

// ============================================================
// CONTROLADOR DE REPORTES
// Valida y normaliza los parámetros, delega a reportService para los
// datos y a reportGenerators para los archivos. No contiene lógica de
// negocio ni de presentación de archivos.
// ============================================================

/**
 * Parsea y valida los filtros de la query string compartidos por todos
 * los endpoints (preview, PDF, Excel).
 *  - from / to: YYYY-MM-DD (to es inclusivo: se extiende al final del día).
 *  - queryType: debe existir en QUERY_TYPES.
 *  - includeTranscript: '1' | 'true' para incluir transcripciones.
 */
function parseFilters(req: Request): ReportFilters {
  const { from, to, queryType, includeTranscript } = req.query as Record<string, string>;

  const parseDate = (value: string | undefined, label: string): Date | undefined => {
    if (!value) return undefined;
    const d = new Date(value);
    if (isNaN(d.getTime())) throw new AppError(`Fecha "${label}" inválida`, 400);
    return d;
  };

  const fromDate = parseDate(from, 'desde');
  let toDate = parseDate(to, 'hasta');
  // 'to' inclusivo: si llega solo la fecha (sin hora), abarcar todo el día.
  if (toDate && to && to.length <= 10) {
    toDate = new Date(toDate.getTime() + 24 * 60 * 60 * 1000);
  }

  if (fromDate && toDate && fromDate > toDate) {
    throw new AppError('El rango de fechas es inválido: "desde" es posterior a "hasta"', 400);
  }

  if (queryType && !QUERY_TYPES[queryType]) {
    throw new AppError('Tipo de consulta no válido', 400);
  }

  return {
    from: fromDate,
    to: toDate,
    queryType: queryType || null,
    includeTranscript: includeTranscript === '1' || includeTranscript === 'true',
  };
}

/** Catálogo de tipos de consulta para poblar el filtro del dashboard. */
export function getReportQueryTypes(_req: Request, res: Response, next: NextFunction) {
  try {
    res.json({ queryTypes: reportService.getQueryTypes() });
  } catch (error) {
    next(error);
  }
}

/** Vista previa en JSON (tabla + resumen) sin generar archivo. */
export async function getReportPreview(req: Request, res: Response, next: NextFunction) {
  try {
    const filters = parseFilters(req);
    // La vista previa nunca carga transcripciones completas (eficiencia).
    const report = await reportService.generate({ ...filters, includeTranscript: false });
    res.json({
      summary: report.summary,
      filters: report.filters,
      generatedAt: report.generatedAt,
      rows: report.rows.map(({ transcript, ...row }) => row),
    });
  } catch (error) {
    next(error);
  }
}

function buildFilename(ext: string, filters: ReportFilters): string {
  const stamp = new Date().toISOString().slice(0, 10);
  const scope = filters.queryType ? `_${filters.queryType}` : '';
  return `informe_conversaciones${scope}_${stamp}.${ext}`;
}

/** Descarga del informe en PDF. */
export async function exportReportPdf(req: Request, res: Response, next: NextFunction) {
  try {
    const filters = parseFilters(req);
    const report = await reportService.generate(filters);
    const buffer = await generatePdf(report);

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${buildFilename('pdf', filters)}"`);
    res.setHeader('Content-Length', buffer.length);
    res.send(buffer);
  } catch (error) {
    next(error);
  }
}

/** Descarga del informe en Excel (.xlsx). */
export async function exportReportExcel(req: Request, res: Response, next: NextFunction) {
  try {
    const filters = parseFilters(req);
    const report = await reportService.generate(filters);
    const buffer = await generateExcel(report);

    res.setHeader(
      'Content-Type',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    );
    res.setHeader('Content-Disposition', `attachment; filename="${buildFilename('xlsx', filters)}"`);
    res.setHeader('Content-Length', buffer.length);
    res.send(buffer);
  } catch (error) {
    next(error);
  }
}
