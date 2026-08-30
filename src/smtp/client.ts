import nodemailer from 'nodemailer';
import { config } from '../config.js';
import { logger } from '../logger.js';
import { classifySmtpError, SmtpMessageError, SmtpNetworkError } from './errors.js';
import { checkSendAllowed } from './guards.js';

const log = logger.child({ module: 'smtp' });

const transporter = nodemailer.createTransport({
  host: config.SMTP_HOST,
  port: config.SMTP_PORT,
  secure: false, // STARTTLS sur le port 587, pas de TLS implicite
  requireTLS: true,
  auth: {
    user: config.ICLOUD_EMAIL,
    pass: config.ICLOUD_APP_PASSWORD,
  },
  pool: true,
  maxConnections: config.SMTP_POOL_SIZE,
  connectionTimeout: 15_000,
  greetingTimeout: 15_000,
  socketTimeout: 30_000,
});

type MailOptions = Parameters<typeof transporter.sendMail>[0];

export interface OutgoingMessage {
  to: string[];
  cc?: string[];
  bcc?: string[];
  subject: string;
  text?: string;
  html?: string;
  inReplyTo?: string;
  references?: string[];
}

export interface SendResult {
  messageId: string;
  accepted: string[];
  rejected: string[];
}

async function send(mailOptions: MailOptions): Promise<SendResult> {
  const info = await transporter.sendMail(mailOptions);
  log.info(
    { messageId: info.messageId, accepted: info.accepted.length, rejected: info.rejected.length },
    'message sent',
  );
  return {
    messageId: info.messageId,
    accepted: info.accepted.map(String),
    rejected: info.rejected.map(String),
  };
}

export async function sendMail(message: OutgoingMessage): Promise<SendResult> {
  // Filet de sécurité au niveau du transport : même un appel forgé qui
  // contournerait l'orchestration de src/smtp/send.ts ne peut pas émettre.
  // La branche `draft` est gérée en amont (send.ts) ; ici elle vaut refus.
  const decision = checkSendAllowed({ to: message.to, cc: message.cc, bcc: message.bcc });
  if (decision.action === 'deny') {
    throw new SmtpMessageError(decision.reason);
  }
  if (decision.action === 'draft') {
    throw new SmtpMessageError(
      'DRAFTS_ONLY=true : passer par send_message / reply_message, qui déposent le message ' +
        "en brouillon au lieu de l'envoyer.",
    );
  }

  const mailOptions: MailOptions = {
    from: config.ICLOUD_EMAIL,
    to: message.to,
    cc: message.cc,
    bcc: message.bcc,
    subject: message.subject,
    text: message.text,
    html: message.html,
    inReplyTo: message.inReplyTo,
    references: message.references,
  };

  try {
    return await send(mailOptions);
  } catch (err) {
    const classified = classifySmtpError(err);
    if (!(classified instanceof SmtpNetworkError)) {
      throw classified;
    }
    log.warn({ reason: classified.message }, 'smtp send failed, retrying once');
    await new Promise((resolve) => setTimeout(resolve, 750));
    try {
      return await send(mailOptions);
    } catch (retryErr) {
      throw classifySmtpError(retryErr);
    }
  }
}

export function closeSmtp(): void {
  transporter.close();
}
