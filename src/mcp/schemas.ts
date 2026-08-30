import { z } from 'zod';
import type { FullMessage, MessageAddress, MessageAttachment, MessageSummary } from '../imap/messages.js';
import type { FolderInfo } from '../imap/folders.js';
import type { DeleteResult, FlagResult, MoveResult } from '../imap/mutations.js';
import type { SendResult } from '../smtp/client.js';
import type { DraftResult } from '../imap/drafts.js';

/**
 * Schémas de sortie (`outputSchema`) des outils MCP.
 *
 * Ils sont *dérivés* des types déjà définis dans la couche IMAP/SMTP, pas
 * redécrits : `schemaFor<T>()(...)` échoue à la compilation si un schéma ne
 * produit plus une valeur assignable à son type source. Quand un de ces types
 * change, le `typecheck` casse ici — c'est voulu.
 *
 * Les lots A et B ajoutent des outils et modifient des formes de retour :
 * `objectResultSchema` / `listResultSchema` sont là pour qu'ils déclarent
 * leurs propres schémas sans réécrire ce fumble d'`outputSchema`.
 */

/** Contraint `schema` à produire un `T` (assignabilité vérifiée à la compilation). */
export function schemaFor<T>() {
  return <S extends z.ZodType<T>>(schema: S): S => schema;
}

/** Enveloppe un schéma d'objet en `outputSchema` (le SDK exige un objet racine). */
export function objectResultSchema<S extends z.ZodRawShape>(shape: S) {
  return z.object(shape);
}

/** `outputSchema` d'un outil qui renvoie une liste, sous la clé `key`. */
export function listResultSchema<K extends string, S extends z.ZodTypeAny>(key: K, item: S) {
  return z.object({ [key]: z.array(item) } as Record<K, z.ZodArray<S>>);
}

export const messageAddressSchema = schemaFor<MessageAddress>()(
  z.object({
    name: z.string().optional(),
    address: z.string().optional(),
  }),
);

export const messageAttachmentSchema = schemaFor<MessageAttachment>()(
  z.object({
    filename: z.string().optional(),
    contentType: z.string(),
    size: z.number(),
    contentId: z.string().optional(),
  }),
);

export const messageSummarySchema = schemaFor<MessageSummary>()(
  z.object({
    uid: z.number(),
    subject: z.string().optional(),
    from: z.array(messageAddressSchema),
    to: z.array(messageAddressSchema),
    date: z.string().optional(),
    seen: z.boolean(),
    flagged: z.boolean(),
    size: z.number().optional(),
  }),
);

/** `get_message` : message complet + drapeau de troncature + en-têtes bruts optionnels. */
export interface GetMessageResult extends FullMessage {
  bodyTruncated: boolean;
  rawHeaders?: string;
}

export const getMessageResultSchema = schemaFor<GetMessageResult>()(
  z.object({
    ...messageSummarySchema.shape,
    cc: z.array(messageAddressSchema),
    messageId: z.string().optional(),
    references: z.array(z.string()),
    text: z.string().optional(),
    html: z.union([z.string(), z.literal(false)]),
    attachments: z.array(messageAttachmentSchema),
    bodyTruncated: z.boolean(),
    rawHeaders: z.string().optional(),
  }),
);

export const folderInfoSchema = schemaFor<FolderInfo>()(
  z.object({
    path: z.string(),
    name: z.string(),
    delimiter: z.string(),
    parentPath: z.string(),
    specialUse: z.string().optional(),
    flags: z.array(z.string()),
    subscribed: z.boolean(),
  }),
);

export const listFoldersResultSchema = z.object({ folders: z.array(folderInfoSchema) });
export const listMessagesResultSchema = z.object({ messages: z.array(messageSummarySchema) });
export const searchMessagesResultSchema = listMessagesResultSchema;

export const moveResultSchema = schemaFor<MoveResult>()(
  z.object({
    uid: z.number(),
    from: z.string(),
    to: z.string(),
    newUid: z.number().optional(),
  }),
);

export const deleteResultSchema = schemaFor<DeleteResult>()(
  z.object({
    uid: z.number(),
    folder: z.string(),
    action: z.enum(['moved_to_trash', 'expunged']),
    destination: z.string().optional(),
  }),
);

export const flagResultSchema = schemaFor<FlagResult>()(
  z.object({
    uid: z.number(),
    folder: z.string(),
    applied: z.array(z.enum(['read', 'unread', 'flagged', 'unflagged'])),
  }),
);

export const sendResultSchema = schemaFor<SendResult>()(
  z.object({
    messageId: z.string(),
    accepted: z.array(z.string()),
    rejected: z.array(z.string()),
  }),
);

export const draftResultSchema = schemaFor<DraftResult>()(
  z.object({
    folder: z.string(),
    uid: z.number().optional(),
  }),
);

export const waitForNewMessageResultSchema = z.object({
  folder: z.string(),
  timedOut: z.boolean(),
  newMessages: z.array(messageSummarySchema),
});
