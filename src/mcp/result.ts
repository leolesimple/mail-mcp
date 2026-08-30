import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';

/** Sérialise une valeur en réponse MCP (un bloc de texte JSON indenté). */
export function jsonResult(data: unknown): CallToolResult {
  return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
}

/** Réponse d'erreur MCP : `isError` + message destiné à l'utilisateur (en français). */
export function errorResult(message: string): CallToolResult {
  return { isError: true, content: [{ type: 'text', text: message }] };
}
