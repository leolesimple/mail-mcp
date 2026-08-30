import { config } from './config.js';

/**
 * Identité du compte mail, dérivée de la configuration. Point d'accès unique
 * aux identifiants pour le code qui ouvre une connexion hors des pools
 * IMAP/SMTP (par exemple la connexion IDLE de `wait_for_new_message`).
 *
 * NOTE (lot C) : fichier appartenant au lot 0. Créé ici à l'identique du
 * contrat pour pouvoir compiler ; la version du lot 0 fait foi au merge.
 */
export interface MailAccount {
  email: string;
  password: string;
  imap: { host: string; port: number };
  smtp: { host: string; port: number };
}

export const account: MailAccount = {
  email: config.ICLOUD_EMAIL,
  password: config.ICLOUD_APP_PASSWORD,
  imap: { host: config.IMAP_HOST, port: config.IMAP_PORT },
  smtp: { host: config.SMTP_HOST, port: config.SMTP_PORT },
};
