import { config } from './config.js';

/**
 * Vue « compte mail » de la configuration : les identifiants et les points de
 * connexion, regroupés sous une forme stable que les couches basses et les
 * outils peuvent consommer sans connaître le schéma d'environnement complet.
 *
 * Contrat partagé avec le lot 0 (socle) — au merge, c'est la version du lot 0
 * qui fait foi.
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
