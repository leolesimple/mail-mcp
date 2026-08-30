import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { listMessages } from '../../imap/messages.js';
import { listMessagesResultSchema } from '../schemas.js';
import { listResult } from '../result.js';
import { logger } from '../../logger.js';

const log = logger.child({ tool: 'list_messages' });

// z.coerce.date() ne peut pas être représenté en JSON Schema (tools/list plante).
// On valide une chaîne ISO 8601 et on convertit en Date nous-mêmes.
const isoDate = z.union([z.iso.date(), z.iso.datetime({ offset: true, local: true })]);

export function registerListMessagesTool(server: McpServer): void {
  server.registerTool(
    'list_messages',
    {
      title: 'List messages',
      description:
        'Lists messages in an IMAP folder, optionally filtered by read status, date range, or sender. ' +
        'Newest first. The text block is a bare array; structuredContent wraps it under a "messages" key.',
      inputSchema: {
        folder: z.string().min(1).default('INBOX').describe('Folder path, e.g. "INBOX", "Archive"'),
        envelope: z
          .boolean()
          .default(false)
          .describe('Wrap the text block under a "messages" key too (structuredContent always is)'),
        unreadOnly: z.boolean().optional().describe('Only return unread messages'),
        since: isoDate.optional().describe('Only messages received on or after this date (ISO 8601, e.g. "2026-07-01")'),
        before: isoDate.optional().describe('Only messages received before this date (ISO 8601)'),
        from: z.string().optional().describe('Filter by sender address (partial match)'),
        limit: z.coerce
          .number()
          .int()
          .positive()
          .max(200)
          .default(50)
          .describe('Max number of messages to return (newest first)'),
      },
      outputSchema: listMessagesResultSchema.shape,
    },
    async ({ folder, unreadOnly, since, before, from, limit, envelope }) => {
      log.info({ folder, unreadOnly, limit }, 'listing messages');
      const messages = await listMessages(folder, {
        unreadOnly,
        since: since ? new Date(since) : undefined,
        before: before ? new Date(before) : undefined,
        from,
        limit,
      });
      // NOTE MERGE (lot B) : passer ici `nextCursor` de la pagination à listResult.
      return listResult('messages', messages, { envelope });
    },
  );
}
