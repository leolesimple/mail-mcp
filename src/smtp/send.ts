import { sendMail } from './client.js';
import type { SendResult } from './client.js';
import { SmtpMessageError } from './errors.js';
import { checkSendAllowed } from './guards.js';
import type { GuardContext, GuardMessage } from './guards.js';
import { sendQuota } from './quota.js';
import { config } from '../config.js';
import { getMessage } from '../imap/messages.js';
import { saveDraft } from '../imap/drafts.js';
import type { DraftResult } from '../imap/drafts.js';
import { buildReplyHeaders } from '../imap/threading.js';
import { logger } from '../logger.js';

const log = logger.child({ module: 'smtp' });

export interface NewMessageInput {
  to: string[];
  cc?: string[];
  bcc?: string[];
  subject: string;
  text?: string;
  html?: string;
}

/** Le message est parti. */
export interface SentOutcome {
  sent: true;
  messageId: string;
  accepted: string[];
  rejected: string[];
}

/** Le message n'est pas parti : il a été déposé dans Drafts (DRAFTS_ONLY). */
export interface DraftOutcome {
  sent: false;
  draft: { folder: string; uid?: number };
  reason: 'DRAFTS_ONLY';
}

export type SendOutcome = SentOutcome | DraftOutcome;

export interface SendActions {
  /** Émet réellement le message et renvoie le résultat du transport. */
  send: () => Promise<SendResult>;
  /** Compose le message et le dépose dans Drafts (threading compris). */
  draft: () => Promise<DraftResult>;
}

/**
 * Applique les garde-fous puis exécute l'action correspondante. Partagé par
 * `send_message`, `reply_message` — et, s'ils existent, `forward_message` /
 * `send_draft` (lots A/B), qui peuvent réutiliser cette fonction telle quelle.
 *
 * `ctx` est injectable pour les tests ; par défaut la vraie config + le vrai quota.
 */
export async function resolveSendOutcome(
  recipients: GuardMessage,
  actions: SendActions,
  ctx?: GuardContext,
): Promise<SendOutcome> {
  const decision = checkSendAllowed(recipients, ctx);

  if (decision.action === 'deny') {
    throw new SmtpMessageError(decision.reason);
  }

  if (decision.action === 'draft') {
    const draft = await actions.draft();
    log.info({ folder: draft.folder, uid: draft.uid }, 'DRAFTS_ONLY: message saved to Drafts, not sent');
    return { sent: false, draft: { folder: draft.folder, uid: draft.uid }, reason: 'DRAFTS_ONLY' };
  }

  // decision.action === 'allow'
  // Traçabilité : on doit voir dans les logs chaque envoi passé sans garde-fou.
  if ((ctx?.config ?? config).UNRESTRICTED) {
    log.warn(
      { to: recipients.to, cc: recipients.cc, bcc: recipients.bcc },
      'UNRESTRICTED=true: message sent with sending guards disabled (allowlist, quota, circuit breaker)',
    );
  }

  const result = await actions.send();
  sendQuota.record();
  return {
    sent: true,
    messageId: result.messageId,
    accepted: result.accepted,
    rejected: result.rejected,
  };
}

export async function sendNewMessage(input: NewMessageInput): Promise<SendOutcome> {
  return resolveSendOutcome(
    { to: input.to, cc: input.cc, bcc: input.bcc },
    {
      send: () => sendMail(input),
      draft: () =>
        saveDraft({
          to: input.to,
          cc: input.cc,
          bcc: input.bcc,
          subject: input.subject,
          text: input.text,
          html: input.html,
        }),
    },
  );
}

export interface ReplyInput {
  folder: string;
  uid: number;
  to?: string[];
  cc?: string[];
  bcc?: string[];
  text?: string;
  html?: string;
}

export async function sendReply(input: ReplyInput): Promise<SendOutcome> {
  const original = await getMessage(input.folder, input.uid);
  const reply = buildReplyHeaders(original);

  const to = input.to && input.to.length > 0 ? input.to : reply.to;
  if (to.length === 0) {
    throw new Error(
      `Impossible de déterminer un destinataire pour la réponse au message UID ${input.uid} ` +
        `(pas de champ "From" sur le message original et aucun "to" fourni)`,
    );
  }

  return resolveSendOutcome(
    { to, cc: input.cc, bcc: input.bcc },
    {
      send: () =>
        sendMail({
          to,
          cc: input.cc,
          bcc: input.bcc,
          subject: reply.subject,
          text: input.text,
          html: input.html,
          inReplyTo: reply.inReplyTo,
          references: reply.references,
        }),
      draft: () =>
        saveDraft({
          to,
          cc: input.cc,
          bcc: input.bcc,
          text: input.text,
          html: input.html,
          replyFolder: input.folder,
          replyUid: input.uid,
        }),
    },
  );
}
