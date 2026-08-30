import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';

/** Résultat MCP standard : les données sérialisées en JSON dans un bloc texte. */
export function jsonResult(data: unknown): CallToolResult {
  return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
}

/** Résultat MCP d'erreur : message utilisateur (en français) dans un bloc texte. */
export function errorResult(message: string): CallToolResult {
  return { isError: true, content: [{ type: 'text', text: message }] };
}
