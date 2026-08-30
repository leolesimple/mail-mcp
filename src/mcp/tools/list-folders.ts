import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { listFolders } from '../../imap/folders.js';
import { listFoldersResultSchema } from '../schemas.js';
import { listResult } from '../result.js';
import { logger } from '../../logger.js';

const log = logger.child({ tool: 'list_folders' });

export function registerListFoldersTool(server: McpServer): void {
  server.registerTool(
    'list_folders',
    {
      title: 'List mail folders',
      description:
        'Lists all IMAP folders in the iCloud Mail account (INBOX, Sent, Archive, Trash, and any custom folders). ' +
        'The text block is a bare array; structuredContent wraps it under a "folders" key.',
      inputSchema: {
        envelope: z
          .boolean()
          .default(false)
          .describe('Wrap the text block under a "folders" key too (structuredContent always is)'),
      },
      outputSchema: listFoldersResultSchema.shape,
    },
    async ({ envelope }) => {
      log.info('listing folders');
      const folders = await listFolders();
      return listResult('folders', folders, { envelope });
    },
  );
}
