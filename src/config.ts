import 'dotenv/config';
import { z } from 'zod';

/**
 * Booléen d'environnement tolérant, pour toutes les variables « interrupteur ».
 *
 * `false`, `0`, `no` (casse et espaces ignorés) → `false` ; toute autre chaîne
 * non vide → `true` ; variable absente ou vide → `defaultValue`.
 *
 * Volontairement PAS `z.coerce.boolean()` : en zod, la chaîne `"false"` est une
 * chaîne non vide, donc coercée à `true` — l'interrupteur serait silencieusement
 * inopérant. Verrouillé par `test/config.test.ts`.
 */
export function envBool(defaultValue: boolean): z.ZodType<boolean, unknown> {
  return z
    .string()
    .optional()
    .transform((v) => {
      if (v === undefined || v.trim() === '') {
        return defaultValue;
      }
      return !['false', '0', 'no'].includes(v.trim().toLowerCase());
    }) as unknown as z.ZodType<boolean, unknown>;
}

/** Découpe une liste `"a, b ,,c"` en entrées normalisées (trim + lowercase, vides retirées). */
export function parseList(raw: string): string[] {
  return raw
    .split(',')
    .map((entry) => entry.trim().toLowerCase())
    .filter((entry) => entry.length > 0);
}

const envSchema = z.object({
  ICLOUD_EMAIL: z.string().email('ICLOUD_EMAIL doit être une adresse email valide'),
  ICLOUD_APP_PASSWORD: z.string().min(1, 'ICLOUD_APP_PASSWORD est requis'),
  IMAP_HOST: z.string().min(1).default('imap.mail.me.com'),
  IMAP_PORT: z.coerce.number().int().positive().default(993),
  IMAP_POOL_SIZE: z.coerce.number().int().positive().default(2),
  SMTP_HOST: z.string().min(1).default('smtp.mail.me.com'),
  SMTP_PORT: z.coerce.number().int().positive().default(587),
  SMTP_POOL_SIZE: z.coerce.number().int().positive().default(2),
  MCP_BEARER_TOKEN: z.string().min(16, 'MCP_BEARER_TOKEN doit faire au moins 16 caractères'),
  PORT: z.coerce.number().int().positive().default(3000),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),
  // Coupe-circuit historique pour send_message / reply_message : à `false`, le
  // transport SMTP refuse tout envoi (garde-fou n°2, voir src/smtp/guards.ts).
  ENABLE_SENDING: envBool(true),

  // --- Garde-fous d'envoi gradués (src/smtp/guards.ts) -----------------------
  // Adresses exactes (`a@exemple.com`) ou domaines (`@exemple.com`) séparés par
  // des virgules. Vide = aucune restriction. Un envoi vers un destinataire hors
  // liste (to, cc OU bcc) est refusé, avec les adresses fautives nommées.
  ALLOWED_RECIPIENTS: z.string().default(''),
  // Nombre maximum d'envois réussis sur une fenêtre glissante de 24 h. `0` =
  // illimité. Compteur en mémoire, non persisté : un redémarrage le remet à zéro
  // (choix assumé, voir docs/security.md).
  MAX_SENDS_PER_DAY: z.coerce.number().int().min(0).default(0),
  // À `true`, send_message / reply_message ne transmettent rien : ils déposent le
  // message dans Drafts et renvoient un succès explicite (reason: 'DRAFTS_ONLY').
  DRAFTS_ONLY: envBool(false),
  // Mode « sans filet » : désactive les garde-fous d'envoi (n°2 à 5) ET le rate
  // limit HTTP. Ne désactive JAMAIS l'auth bearer ni le TTL des sessions.
  UNRESTRICTED: envBool(false),

  // --- Garde-fous HTTP (src/http/) ------------------------------------------
  // Requêtes /mcp autorisées par IP et par minute (fenêtre glissante). Au-delà :
  // 429. /health n'est jamais limité.
  RATE_LIMIT_PER_MINUTE: z.coerce.number().int().positive().default(120),
  // Durée d'inactivité au-delà de laquelle une session MCP est évincée et son
  // transport fermé. Empêche la Map de sessions de fuir.
  SESSION_TTL_MS: z.coerce.number().int().positive().default(1_800_000),
});

/** Valide un environnement arbitraire. Exporté pour les tests ; l'app utilise `config`. */
export function parseConfig(env: NodeJS.ProcessEnv = process.env) {
  const parsed = envSchema.safeParse(env);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((issue) => `  - ${issue.path.join('.')}: ${issue.message}`).join('\n');
    throw new Error(`Configuration invalide (voir .env / .env.example) :\n${issues}`);
  }
  return {
    ...parsed.data,
    /** `ALLOWED_RECIPIENTS` déjà découpé et normalisé — à consommer plutôt que la chaîne brute. */
    ALLOWED_RECIPIENTS_LIST: parseList(parsed.data.ALLOWED_RECIPIENTS),
  };
}

export const config = parseConfig(process.env);
export type Config = typeof config;
