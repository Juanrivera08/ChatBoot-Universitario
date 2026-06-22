import axios from 'axios';
import { logger } from '../utils/logger';

const GRAPH_URL = 'https://graph.facebook.com/v21.0';
const PHONE_NUMBER_ID = process.env.WHATSAPP_PHONE_NUMBER_ID!;
const ACCESS_TOKEN = process.env.WHATSAPP_ACCESS_TOKEN!;

// WhatsApp solo acepta *negrita* y _cursiva_ — no markdown de HTML
function formatForWhatsApp(text: string): string {
  return text
    .replace(/\*\*(.*?)\*\*/g, '*$1*')   // **bold** → *bold*
    .replace(/__(.*?)__/g, '_$1_')         // __italic__ → _italic_
    .replace(/^#{1,3}\s+(.+)$/gm, '*$1*') // # Headers → *Headers*
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1') // links → solo el texto
    .trim();
}

// Divide un texto largo en partes de máximo 4096 caracteres (límite WhatsApp)
function chunkMessage(text: string, maxLen = 4000): string[] {
  if (text.length <= maxLen) return [text];
  const chunks: string[] = [];
  let remaining = text;
  while (remaining.length > 0) {
    const cut = remaining.lastIndexOf('\n', maxLen) > maxLen / 2
      ? remaining.lastIndexOf('\n', maxLen)
      : maxLen;
    chunks.push(remaining.slice(0, cut).trim());
    remaining = remaining.slice(cut).trim();
  }
  return chunks;
}

class WhatsAppService {
  private async send(payload: object): Promise<void> {
    await axios.post(
      `${GRAPH_URL}/${PHONE_NUMBER_ID}/messages`,
      payload,
      {
        headers: {
          Authorization: `Bearer ${ACCESS_TOKEN}`,
          'Content-Type': 'application/json',
        },
      }
    );
  }

  // Mensaje de texto simple
  async sendText(to: string, text: string): Promise<void> {
    const parts = chunkMessage(formatForWhatsApp(text));
    for (const part of parts) {
      await this.send({
        messaging_product: 'whatsapp',
        recipient_type: 'individual',
        to,
        type: 'text',
        text: { body: part, preview_url: false },
      });
    }
  }

  // Indicador "escribiendo…" (marca leído + typing)
  async markRead(messageId: string): Promise<void> {
    try {
      await this.send({
        messaging_product: 'whatsapp',
        status: 'read',
        message_id: messageId,
      });
    } catch (e) { logger.debug('markRead failed (non-critical):', e); }
  }

  // Botones interactivos para pasos de tipo "select" (máx 3 botones)
  async sendButtons(
    to: string,
    bodyText: string,
    buttons: Array<{ id: string; title: string }>,
    headerText?: string
  ): Promise<void> {
    // WhatsApp limita a 3 botones y 20 chars por título
    const safeButtons = buttons.slice(0, 3).map((b) => ({
      type: 'reply',
      reply: {
        id: b.id.slice(0, 256),
        title: b.title.slice(0, 20),
      },
    }));

    await this.send({
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to,
      type: 'interactive',
      interactive: {
        type: 'button',
        ...(headerText ? { header: { type: 'text', text: headerText.slice(0, 60) } } : {}),
        body: { text: formatForWhatsApp(bodyText).slice(0, 1024) },
        action: { buttons: safeButtons },
      },
    });
  }

  // Lista desplegable para selecciones con más de 3 opciones
  async sendList(
    to: string,
    bodyText: string,
    items: Array<{ id: string; title: string; description?: string }>,
    buttonLabel = 'Ver opciones'
  ): Promise<void> {
    const rows = items.slice(0, 10).map((item) => ({
      id: item.id.slice(0, 200),
      title: item.title.slice(0, 24),
      description: (item.description || '').slice(0, 72),
    }));

    await this.send({
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to,
      type: 'interactive',
      interactive: {
        type: 'list',
        body: { text: formatForWhatsApp(bodyText).slice(0, 1024) },
        action: {
          button: buttonLabel.slice(0, 20),
          sections: [{ title: 'Opciones', rows }],
        },
      },
    });
  }

  // Descarga el audio de un mensaje de voz de WhatsApp
  async downloadAudio(mediaId: string): Promise<Buffer> {
    // Paso 1: obtener la URL del archivo
    const { data: mediaData } = await axios.get(
      `${GRAPH_URL}/${mediaId}`,
      { headers: { Authorization: `Bearer ${ACCESS_TOKEN}` } }
    );

    // Paso 2: descargar el archivo
    const { data } = await axios.get(mediaData.url, {
      headers: { Authorization: `Bearer ${ACCESS_TOKEN}` },
      responseType: 'arraybuffer',
    });

    return Buffer.from(data);
  }

  // Envía un mensaje de flujo según el tipo de paso
  async sendFlowStep(
    to: string,
    question: string,
    stepType: string,
    options: Array<{ label: string; value: string }>,
    flowName: string,
    currentStep: number,
    totalSteps: number
  ): Promise<void> {
    const header = `${flowName} (${currentStep}/${totalSteps})`;

    if (stepType === 'confirmation') {
      await this.sendButtons(to, question, [
        { id: 'confirm_yes', title: '✅ Confirmar' },
        { id: 'confirm_no', title: '❌ Cancelar' },
      ], header);
      return;
    }

    if (stepType === 'select' && options.length > 0) {
      if (options.length <= 3) {
        await this.sendButtons(
          to,
          question,
          options.map((o) => ({ id: o.value, title: o.label })),
          header
        );
      } else {
        await this.sendList(
          to,
          question,
          options.map((o) => ({ id: o.value, title: o.label })),
          'Ver opciones'
        );
      }
      return;
    }

    // Pregunta de texto libre
    await this.sendText(to, `*${header}*\n\n${question}`);
  }

  // Tarjeta de radicado al completar un flujo
  async sendCompletionCard(
    to: string,
    radicado: string,
    flowName: string,
    completionMessage: string,
    data: Record<string, any>
  ): Promise<void> {
    const dataLines = Object.entries(data)
      .filter(([k]) => k !== 'confirmacion')
      .map(([k, v]) => `• *${k.replace(/_/g, ' ')}:* ${v}`)
      .join('\n');

    const message =
      `✅ *${flowName}*\n\n` +
      `${completionMessage}\n\n` +
      `📋 *Número de radicado:*\n` +
      `\`${radicado}\`\n\n` +
      `*Datos registrados:*\n${dataLines}\n\n` +
      `_Guarda tu número de radicado para hacer seguimiento._`;

    await this.sendText(to, message);
  }

  // Mensaje de bienvenida
  async sendWelcome(to: string): Promise<void> {
    await this.sendText(
      to,
      `¡Hola! Soy el *Asistente Virtual de la USH* 🎓\n\n` +
      `Puedo ayudarte con:\n` +
      `• 📅 Calendario académico\n` +
      `• 🎓 Programas disponibles\n` +
      `• 📝 Trámites y certificados\n` +
      `• 🏥 Bienestar universitario\n\n` +
      `También puedes enviarme una *nota de voz* y te respondo.\n\n` +
      `¿En qué te puedo ayudar?`
    );
  }
}

export const whatsappService = new WhatsAppService();
