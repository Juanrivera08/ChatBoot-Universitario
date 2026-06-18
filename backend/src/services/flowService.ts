import crypto from 'crypto';
import { query } from '../config/database';
import { logger } from '../utils/logger';

export interface FlowStep {
  id: string;
  flow_id: string;
  step_order: number;
  field_name: string;
  question: string;
  field_type: 'text' | 'email' | 'phone' | 'number' | 'select' | 'confirmation';
  options: Array<{ label: string; value: string }>;
  validation_regex: string | null;
  error_message: string;
  is_required: boolean;
}

export interface Flow {
  id: string;
  name: string;
  description: string;
  trigger_keywords: string[];
  completion_message: string;
  is_active: boolean;
}

export interface FlowSession {
  id: string;
  session_id: string;
  flow_id: string;
  current_step: number;
  collected_data: Record<string, any>;
  status: 'active' | 'completed' | 'abandoned';
}

export interface FlowResponse {
  type: 'flow_question' | 'flow_complete' | 'flow_validation_error' | 'flow_cancelled';
  message: string;
  step?: FlowStep;
  progress?: number;         // 0-1 para barra de progreso
  totalSteps?: number;
  currentStep?: number;
  flowName?: string;
  radicado?: string;
  submissionData?: Record<string, any>;
}

// Genera número de radicado único: USH-YYYYMMDD-XXXXX (5 dígitos criptográficos)
function generateRadicado(): string {
  const date = new Date();
  const dateStr = `${date.getFullYear()}${String(date.getMonth() + 1).padStart(2, '0')}${String(date.getDate()).padStart(2, '0')}`;
  const random = crypto.randomInt(10000, 99999);
  return `USH-${dateStr}-${random}`;
}

// Valida una respuesta según el tipo de campo
function validateInput(value: string, step: FlowStep): boolean {
  const trimmed = value.trim();
  if (step.is_required && !trimmed) return false;

  if (step.validation_regex) {
    return new RegExp(step.validation_regex).test(trimmed);
  }

  if (step.field_type === 'email') {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed);
  }

  if (step.field_type === 'phone') {
    // Exige al menos 7 dígitos reales; permite espacios, guiones, paréntesis y +
    return /^\+?[\d\s\-\(\)]{7,20}$/.test(trimmed) && (trimmed.match(/\d/g) || []).length >= 7;
  }

  if (step.field_type === 'number') {
    return !isNaN(Number(trimmed));
  }

  if (step.field_type === 'select') {
    // Acepta el value o el label (por si el usuario escribe en vez de hacer clic)
    const valid = step.options.map((o) => o.value.toLowerCase());
    const labels = step.options.map((o) => o.label.toLowerCase());
    return valid.includes(trimmed.toLowerCase()) || labels.some((l) => trimmed.toLowerCase().includes(l.toLowerCase()));
  }

  if (step.field_type === 'confirmation') {
    const yes = ['sí', 'si', 'yes', 'confirmar', 'confirmo', 'ok', 'dale', 'correcto', '1'];
    const no = ['no', 'cancelar', 'cancela', 'no confirmo', 'salir', '0'];
    const lower = trimmed.toLowerCase();
    return yes.some((w) => lower.includes(w)) || no.some((w) => lower.includes(w));
  }

  return trimmed.length > 0;
}

// Normaliza la respuesta a un valor guardable
function normalizeInput(value: string, step: FlowStep): string {
  const trimmed = value.trim();

  if (step.field_type === 'select') {
    const found = step.options.find(
      (o) =>
        trimmed.toLowerCase() === o.value.toLowerCase() ||
        trimmed.toLowerCase().includes(o.label.toLowerCase())
    );
    return found ? found.label : trimmed;
  }

  if (step.field_type === 'confirmation') {
    const yes = ['sí', 'si', 'yes', 'confirmar', 'confirmo', 'ok', 'dale', 'correcto', '1'];
    return yes.some((w) => trimmed.toLowerCase().includes(w)) ? 'Sí' : 'No';
  }

  return trimmed;
}

class FlowService {
  private flowsCache: { data: Flow[]; expiresAt: number } | null = null;
  private readonly FLOWS_CACHE_TTL_MS = 60_000;

  private invalidateFlowsCache(): void {
    this.flowsCache = null;
  }

  private async getActiveFlows(): Promise<Flow[]> {
    const now = Date.now();
    if (this.flowsCache && now < this.flowsCache.expiresAt) return this.flowsCache.data;
    const { rows } = await query<Flow>('SELECT * FROM flows WHERE is_active = true');
    this.flowsCache = { data: rows, expiresAt: now + this.FLOWS_CACHE_TTL_MS };
    return rows;
  }

  // Detecta si el mensaje activa algún flujo configurado
  async detectFlow(message: string): Promise<Flow | null> {
    const flows = await this.getActiveFlows();
    const normalized = message.toLowerCase();
    for (const flow of flows) {
      for (const keyword of flow.trigger_keywords) {
        if (normalized.includes(keyword.toLowerCase())) {
          return flow;
        }
      }
    }
    return null;
  }

  // Obtiene la sesión activa de un usuario (si existe)
  async getActiveSession(sessionId: string): Promise<FlowSession | null> {
    const { rows } = await query<FlowSession>(
      `SELECT * FROM flow_sessions WHERE session_id = $1 AND status = 'active' ORDER BY created_at DESC LIMIT 1`,
      [sessionId]
    );
    return rows[0] || null;
  }

  // Inicia un nuevo flujo para el usuario
  async startFlow(sessionId: string, flow: Flow): Promise<FlowResponse> {
    // Abandonar sesión anterior si existe
    await query(
      `UPDATE flow_sessions SET status = 'abandoned' WHERE session_id = $1 AND status = 'active'`,
      [sessionId]
    );

    // Crear nueva sesión
    await query(
      `INSERT INTO flow_sessions (session_id, flow_id, current_step, collected_data)
       VALUES ($1, $2, 0, '{}')`,
      [sessionId, flow.id]
    );

    // Obtener el primer paso
    const firstStep = await this.getStep(flow.id, 1);
    if (!firstStep) throw new Error('El flujo no tiene pasos configurados');

    const totalSteps = await this.getTotalSteps(flow.id);

    return {
      type: 'flow_question',
      message: firstStep.question,
      step: firstStep,
      progress: 0,
      currentStep: 1,
      totalSteps,
      flowName: flow.name,
    };
  }

  // Procesa la respuesta del usuario al paso actual
  async processStep(session: FlowSession, userInput: string): Promise<FlowResponse> {
    const steps = await this.getSteps(session.flow_id);
    const flow = await this.getFlow(session.flow_id);
    if (!flow) throw new Error('Flujo no encontrado');

    const currentStep = steps[session.current_step];
    if (!currentStep) throw new Error('Paso no encontrado');

    // Cancelación explícita
    const cancelWords = ['cancelar', 'salir', 'cancel', 'no quiero', 'atrás'];
    if (cancelWords.some((w) => userInput.toLowerCase().includes(w))) {
      await query(
        `UPDATE flow_sessions SET status = 'abandoned' WHERE id = $1`,
        [session.id]
      );
      return {
        type: 'flow_cancelled',
        message: 'Entendido, cancelé el proceso. ¿En qué más te puedo ayudar?',
        flowName: flow.name,
      };
    }

    // Para confirmación: verificar si es "No"
    if (currentStep.field_type === 'confirmation') {
      const no = ['no', 'cancelar', 'no confirmo', 'salir', '0'];
      if (no.some((w) => userInput.toLowerCase().includes(w))) {
        await query(
          `UPDATE flow_sessions SET status = 'abandoned' WHERE id = $1`,
          [session.id]
        );
        return {
          type: 'flow_cancelled',
          message: 'Solicitud cancelada. ¿En qué más te puedo ayudar?',
          flowName: flow.name,
        };
      }
    }

    // Validar la respuesta
    if (!validateInput(userInput, currentStep)) {
      return {
        type: 'flow_validation_error',
        message: currentStep.error_message || 'Por favor ingresa un valor válido.',
        step: currentStep,
        progress: session.current_step / steps.length,
        currentStep: session.current_step + 1,
        totalSteps: steps.length,
        flowName: flow.name,
      };
    }

    // Guardar el dato recopilado
    const normalized = normalizeInput(userInput, currentStep);
    const updatedData = { ...session.collected_data, [currentStep.field_name]: normalized };

    const nextStepIndex = session.current_step + 1;

    // ¿Quedan más pasos?
    if (nextStepIndex < steps.length) {
      const nextStep = steps[nextStepIndex];
      await query(
        `UPDATE flow_sessions SET current_step = $1, collected_data = $2 WHERE id = $3`,
        [nextStepIndex, JSON.stringify(updatedData), session.id]
      );

      return {
        type: 'flow_question',
        message: nextStep.question,
        step: nextStep,
        progress: nextStepIndex / steps.length,
        currentStep: nextStepIndex + 1,
        totalSteps: steps.length,
        flowName: flow.name,
      };
    }

    // Flujo completado — guardar submission
    const radicado = generateRadicado();

    await query(
      `UPDATE flow_sessions SET status = 'completed', collected_data = $1 WHERE id = $2`,
      [JSON.stringify(updatedData), session.id]
    );

    await query(
      `INSERT INTO flow_submissions (radicado, flow_id, flow_name, session_id, data)
       VALUES ($1, $2, $3, $4, $5)`,
      [radicado, flow.id, flow.name, session.session_id, JSON.stringify(updatedData)]
    );

    logger.info(`Flujo completado: ${flow.name} | Radicado: ${radicado}`);

    return {
      type: 'flow_complete',
      message: flow.completion_message,
      flowName: flow.name,
      radicado,
      submissionData: updatedData,
    };
  }

  private async getFlow(flowId: string): Promise<Flow | null> {
    const { rows } = await query<Flow>('SELECT * FROM flows WHERE id = $1', [flowId]);
    return rows[0] || null;
  }

  private async getSteps(flowId: string): Promise<FlowStep[]> {
    const { rows } = await query<FlowStep>(
      `SELECT * FROM flow_steps WHERE flow_id = $1 ORDER BY step_order ASC`,
      [flowId]
    );
    return rows;
  }

  private async getStep(flowId: string, order: number): Promise<FlowStep | null> {
    const { rows } = await query<FlowStep>(
      `SELECT * FROM flow_steps WHERE flow_id = $1 AND step_order = $2`,
      [flowId, order]
    );
    return rows[0] || null;
  }

  private async getTotalSteps(flowId: string): Promise<number> {
    const { rows } = await query<{ count: string }>(
      'SELECT COUNT(*) as count FROM flow_steps WHERE flow_id = $1',
      [flowId]
    );
    return parseInt(rows[0]?.count || '0');
  }

  // ── Admin CRUD ──────────────────────────────────────────────

  async getAllFlows() {
    const { rows } = await query(
      `SELECT f.*, COUNT(fs.id)::int as submission_count
       FROM flows f
       LEFT JOIN flow_submissions fs ON fs.flow_id = f.id
       GROUP BY f.id ORDER BY f.created_at DESC`
    );
    return rows;
  }

  async getFlowWithSteps(flowId: string) {
    const { rows: flowRows } = await query('SELECT * FROM flows WHERE id = $1', [flowId]);
    const flow = flowRows[0];
    if (!flow) return null;
    const steps = await this.getSteps(flowId);
    return { ...flow, steps };
  }

  async createFlow(data: {
    name: string; description: string; triggerKeywords: string[];
    completionMessage: string; notificationEmail: string;
  }) {
    const { rows } = await query(
      `INSERT INTO flows (name, description, trigger_keywords, completion_message, notification_email)
       VALUES ($1, $2, $3, $4, $5) RETURNING *`,
      [data.name, data.description, data.triggerKeywords, data.completionMessage, data.notificationEmail || null]
    );
    this.invalidateFlowsCache();
    return rows[0];
  }

  async addStep(flowId: string, step: Omit<FlowStep, 'id' | 'flow_id' | 'created_at'>) {
    const { rows } = await query(
      `INSERT INTO flow_steps (flow_id, step_order, field_name, question, field_type, options, validation_regex, error_message, is_required)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING *`,
      [flowId, step.step_order, step.field_name, step.question, step.field_type,
       JSON.stringify(step.options || []), step.validation_regex || null,
       step.error_message || 'Valor inválido.', step.is_required ?? true]
    );
    return rows[0];
  }

  async deleteFlow(flowId: string) {
    await query('DELETE FROM flows WHERE id = $1', [flowId]);
    this.invalidateFlowsCache();
  }

  async toggleFlow(flowId: string, isActive: boolean) {
    await query('UPDATE flows SET is_active = $1 WHERE id = $2', [isActive, flowId]);
    this.invalidateFlowsCache();
  }

  async getSubmissions(page = 1, limit = 20, status?: string) {
    const safePage = Math.max(1, page);
    const safeLimit = Math.min(100, Math.max(1, limit));
    const offset = (safePage - 1) * safeLimit;
    let sql = `SELECT fs.*, f.name as flow_name
               FROM flow_submissions fs
               JOIN flows f ON fs.flow_id = f.id`;
    const params: any[] = [safeLimit, offset];
    if (status) { sql += ` WHERE fs.status = $3`; params.push(status); }
    sql += ` ORDER BY fs.created_at DESC LIMIT $1 OFFSET $2`;
    const { rows } = await query(sql, params);
    const countSql = status
      ? 'SELECT COUNT(*) as total FROM flow_submissions WHERE status = $1'
      : 'SELECT COUNT(*) as total FROM flow_submissions';
    const { rows: countRows } = await query(countSql, status ? [status] : []);
    return { submissions: rows, total: parseInt(countRows[0].total) };
  }

  async updateSubmissionStatus(id: string, status: string, notes: string) {
    await query(
      `UPDATE flow_submissions SET status = $1, notes = $2 WHERE id = $3`,
      [status, notes, id]
    );
  }
}

export const flowService = new FlowService();
