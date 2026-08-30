import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';

/**
 * Fabriques de résultats d'outils MCP. Tous les outils renvoient du JSON dans un
 * bloc de texte ; `errorResult` marque en plus la réponse comme erreur.
 *
 * Contrat partagé avec le lot 0 (socle) — au merge, c'est la version du lot 0
 * qui fait foi.
 */
export function jsonResult(data: unknown): CallToolResult {
  return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
}

export function errorResult(message: string): CallToolResult {
  return { content: [{ type: 'text', text: message }], isError: true };
}
