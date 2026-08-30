import MailComposer from 'nodemailer/lib/mail-composer/index.js';
import { config } from '../config.js';

/** Pièce jointe prête à être encodée dans un message MIME. */
export interface ComposeAttachment {
  filename: string;
  contentType?: string;
  content: Buffer;
  contentDisposition?: 'attachment' | 'inline';
  cid?: string;
}

/** Entrée de composition partagée par l'envoi SMTP et le brouillon IMAP. */
export interface ComposeInput {
  from?: string;
  to: string[];
  cc?: string[];
  bcc?: string[];
  subject: string;
  text?: string;
  html?: string;
  inReplyTo?: string;
  references?: string[];
  attachments?: ComposeAttachment[];
}

/**
 * Compile un message MIME complet (avec Message-ID, Date, MIME-Version) en un
 * buffer RFC 5322. Extrait du `MailComposer` historiquement inline dans
 * `src/imap/drafts.ts` pour que l'envoi SMTP et l'APPEND IMAP partagent
 * exactement la même sérialisation.
 */
export async function composeRaw(input: ComposeInput): Promise<Buffer> {
  return new MailComposer({
    from: input.from ?? config.ICLOUD_EMAIL,
    to: input.to,
    cc: input.cc,
    bcc: input.bcc,
    subject: input.subject,
    text: input.text,
    html: input.html,
    inReplyTo: input.inReplyTo,
    references: input.references,
    attachments: input.attachments,
  })
    .compile()
    .build();
}
