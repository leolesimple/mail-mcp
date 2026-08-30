import type { FullMessage, MessageAddress } from './messages.js';

/** Les champs d'un message original nécessaires pour construire une réponse. */
export type ThreadableMessage = Pick<FullMessage, 'subject' | 'messageId' | 'references' | 'from'>;

export interface ReplyHeaders {
  subject: string;
  inReplyTo?: string;
  references: string[];
  to: string[];
}

const FALLBACK_SUBJECT = '(sans objet)';

// Préfixes de réponse / transfert, plusieurs langues, éventuellement suivis
// d'un compteur "[2]". Le quantificateur `+` retire les préfixes empilés
// ("Re: Fwd: Re: ") en une passe.
const STACKED_REPLY_PREFIXES = /^\s*(?:(?:re|r[ée]f|fwd?|fw|tr|aw|wg|antw|sv|vs|encaminhar)\s*(?:\[\d+\])?\s*:\s*)+/i;

/**
 * Ramène un sujet à sa forme « racine » pour regrouper un fil : retire les
 * préfixes `Re:` / `Fwd:` empilés (toutes casses, quelques langues) et les
 * espaces superflus. `"Re: Re: Fwd: Facture"` → `"Facture"`. Fonction pure,
 * utilisée en repli quand les en-têtes `References` / `In-Reply-To` manquent.
 */
export function normalizeSubject(subject: string | undefined): string {
  if (!subject) return '';
  return subject.replace(STACKED_REPLY_PREFIXES, '').trim();
}

/** Préfixe "Re: " sauf si le sujet en porte déjà un. */
export function replySubject(originalSubject: string | undefined): string {
  const subject = originalSubject ?? FALLBACK_SUBJECT;
  return /^re:/i.test(subject) ? subject : `Re: ${subject}`;
}

/** Adresses exploitables d'une liste d'expéditeurs (celles sans adresse sont ignorées). */
export function addressList(addresses: MessageAddress[]): string[] {
  return addresses
    .map((address) => address.address)
    .filter((address): address is string => Boolean(address));
}

/**
 * Chaîne de References conforme à la RFC 5322 : les références du message
 * original, suivies de son propre Message-ID, sans doublon.
 */
export function replyReferences(original: ThreadableMessage): string[] {
  const references = [...original.references];
  if (original.messageId && !references.includes(original.messageId)) {
    references.push(original.messageId);
  }
  return references;
}

/**
 * Construit les en-têtes d'une réponse à `original`. Partagé par l'envoi SMTP
 * (`sendReply`) et le brouillon IMAP (`saveDraft`) pour que les deux produisent
 * exactement le même threading.
 */
export function buildReplyHeaders(original: ThreadableMessage): ReplyHeaders {
  return {
    subject: replySubject(original.subject),
    inReplyTo: original.messageId,
    references: replyReferences(original),
    to: addressList(original.from),
  };
}
