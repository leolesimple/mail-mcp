import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { flagMessage, flagMessages, BULK_UID_LIMIT } from '../../imap/mutations.js';
import { jsonResult, errorResult } from '../result.js';
import { logger } from '../../logger.js';

const log = logger.child({ tool: 'flag_message' });

export function registerFlagMessageTool(server: McpServer): void {
  server.registerTool(
    'flag_message',
    {
      title: 'Flag message',
      description:
        'Marks one message (uid) or up to 200 messages (uids) as read/unread and/or starred (flagged)/' +
        'unstarred, in a single IMAP command. Exactly one of uid / uids is required.',
      inputSchema: {
        folder: z.string().min(1).default('INBOX'),
        uid: z.coerce.number().int().positive().optional(),
        uids: z.array(z.coerce.number().int().positive()).min(1).max(BULK_UID_LIMIT).optional(),
        actions: z
          .array(z.enum(['read', 'unread', 'flagged', 'unflagged']))
          .min(1)
          .describe('One or more flag changes to apply'),
      },
    },
    async ({ folder, uid, uids, actions }) => {
      if ((uid === undefined) === (uids === undefined)) {
        return errorResult('Fournir exactement un de "uid" (un message) ou "uids" (jusqu\'à 200 messages).');
      }

      if (uids) {
        log.info({ folder, count: uids.length, actions }, 'flagging messages (bulk)');
        return jsonResult(await flagMessages(folder, uids, actions));
      }

      log.info({ folder, uid, actions }, 'flagging message');
      return jsonResult(await flagMessage(folder, uid as number, actions));
    },
  );
}
