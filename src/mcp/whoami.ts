import { config } from '../config.js';
import { account } from '../account.js';
import { serverVersion } from '../version.js';
import { imapPool } from '../imap/pool.js';
import { listFolders } from '../imap/folders.js';
import { classifyImapError } from '../imap/errors.js';

/**
 * Logique pure de l'outil `whoami`. Aucun secret ne doit sortir d'ici : le mot
 * de passe d'application et le bearer token ne sont exposés que sous forme d'un
 * booléen « configuré ». Un test verrouille cette règle sur la sortie sérialisée.
 */

export interface WhoamiGuardrails {
  /** Coupe-circuit d'envoi (`ENABLE_SENDING`). Toujours présent. */
  sendingEnabled: boolean;
  /** Garde-fous posés par le lot D — affichés seulement s'ils existent. */
  draftsOnly?: boolean;
  unrestricted?: boolean;
  allowlistActive?: boolean;
  maxSendsPerDay?: number;
  quota?: WhoamiQuota;
}

export interface WhoamiQuota {
  windowHours: number;
  limit: number;
  remaining: number;
}

export interface WhoamiReport {
  server: { name: string; version: string };
  account: {
    email: string;
    imap: { host: string; port: number };
    smtp: { host: string; port: number };
  };
  credentials: { appPasswordConfigured: boolean; bearerTokenConfigured: boolean };
  guardrails: WhoamiGuardrails;
  imapPool: { open: number; inUse: number; max: number };
  probe?: { attempted: true; ok: boolean; folderCount?: number; error?: string };
}

export interface WhoamiDeps {
  /** Environnement à inspecter pour les garde-fous optionnels. Défaut : `process.env`. */
  env?: NodeJS.ProcessEnv;
  /** Photo du pool IMAP. Défaut : `imapPool.stats()`. */
  poolStats?: () => { open: number; inUse: number; max: number };
  /** Vérification de connexion réelle et légère. Défaut : `listFolders()`. */
  probe?: () => Promise<{ folderCount: number }>;
  /** Quota d'envoi restant, si le lot D l'expose. Défaut : indisponible. */
  quota?: () => WhoamiQuota | undefined;
}

/** `false` / `0` / `no` → false ; toute autre valeur non vide → true ; absent/vide → undefined. */
function optionalFlag(raw: string | undefined): boolean | undefined {
  if (raw === undefined) return undefined;
  const value = raw.trim().toLowerCase();
  if (value === '') return undefined;
  return !['false', '0', 'no'].includes(value);
}

/** Présent et non vide → allowlist active. Absent → undefined (le lot D ne l'a pas posée). */
function parseAllowlist(raw: string | undefined): boolean | undefined {
  if (raw === undefined) return undefined;
  return raw
    .split(',')
    .map((entry) => entry.trim())
    .some((entry) => entry.length > 0);
}

function parseMaxSends(raw: string | undefined): number | undefined {
  if (raw === undefined || raw.trim() === '') return undefined;
  const value = Number(raw);
  return Number.isFinite(value) && value > 0 ? value : undefined;
}

const defaultProbe = async (): Promise<{ folderCount: number }> => {
  const folders = await listFolders();
  return { folderCount: folders.length };
};

/**
 * Ceinture et bretelles : même si une erreur de sonde ne contient en pratique
 * jamais d'identifiant, on retire toute occurrence littérale des secrets connus
 * avant de la mettre dans la sortie.
 */
function redactSecrets(text: string): string {
  let out = text;
  for (const secret of [account.password, config.MCP_BEARER_TOKEN]) {
    if (secret.length >= 4) {
      out = out.split(secret).join('[redacted]');
    }
  }
  return out;
}

export async function buildWhoami(probeRequested: boolean, deps: WhoamiDeps = {}): Promise<WhoamiReport> {
  const env = deps.env ?? process.env;
  const poolStats = deps.poolStats ?? (() => imapPool.stats());
  const probe = deps.probe ?? defaultProbe;

  const guardrails: WhoamiGuardrails = { sendingEnabled: config.ENABLE_SENDING };

  const draftsOnly = optionalFlag(env.DRAFTS_ONLY);
  if (draftsOnly !== undefined) guardrails.draftsOnly = draftsOnly;

  const unrestricted = optionalFlag(env.UNRESTRICTED);
  if (unrestricted !== undefined) guardrails.unrestricted = unrestricted;

  const allowlistActive = parseAllowlist(env.ALLOWED_RECIPIENTS);
  if (allowlistActive !== undefined) guardrails.allowlistActive = allowlistActive;

  const maxSendsPerDay = parseMaxSends(env.MAX_SENDS_PER_DAY);
  if (maxSendsPerDay !== undefined) guardrails.maxSendsPerDay = maxSendsPerDay;

  const quota = deps.quota?.();
  if (quota !== undefined) guardrails.quota = quota;

  const report: WhoamiReport = {
    server: { name: 'icloud-mail', version: serverVersion },
    account: {
      email: account.email,
      imap: { host: account.imap.host, port: account.imap.port },
      smtp: { host: account.smtp.host, port: account.smtp.port },
    },
    credentials: {
      appPasswordConfigured: account.password.length > 0,
      bearerTokenConfigured: config.MCP_BEARER_TOKEN.length > 0,
    },
    guardrails,
    imapPool: poolStats(),
  };

  if (probeRequested) {
    try {
      const { folderCount } = await probe();
      report.probe = { attempted: true, ok: true, folderCount };
    } catch (err) {
      report.probe = { attempted: true, ok: false, error: redactSecrets(classifyImapError(err).message) };
    }
  }

  return report;
}
