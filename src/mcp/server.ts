import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { registerListFoldersTool } from './tools/list-folders.js';
import { registerListMessagesTool } from './tools/list-messages.js';
import { registerSearchMessagesTool } from './tools/search-messages.js';
import { registerGetMessageTool } from './tools/get-message.js';
import { registerSendMessageTool } from './tools/send-message.js';
import { registerReplyMessageTool } from './tools/reply-message.js';
import { registerMoveMessageTool } from './tools/move-message.js';
import { registerDeleteMessageTool } from './tools/delete-message.js';
import { registerFlagMessageTool } from './tools/flag-message.js';
import { registerSaveDraftTool } from './tools/save-draft.js';
import { registerWaitForNewMessageTool } from './tools/wait-for-new-message.js';
import { registerMailResources } from './resources.js';
import { registerMailPrompts } from './prompts.js';
import { config } from '../config.js';

export function createMailMcpServer(): McpServer {
  const server = new McpServer({
    name: 'icloud-mail',
    version: '0.1.0',
  });

  registerListFoldersTool(server);
  registerListMessagesTool(server);
  registerSearchMessagesTool(server);
  registerGetMessageTool(server);
  registerSendMessageTool(server);
  registerReplyMessageTool(server);
  registerMoveMessageTool(server);
  registerDeleteMessageTool(server);
  registerFlagMessageTool(server);
  registerSaveDraftTool(server);

  // wait_for_new_message reste derrière un flag (défaut OFF) : sans reconnexion,
  // l'attente IDLE se dégrade silencieusement si la connexion iCloud saute (#20).
  if (config.ENABLE_IDLE_WATCH) {
    registerWaitForNewMessageTool(server);
  }

  registerMailResources(server);
  registerMailPrompts(server);

  return server;
}
