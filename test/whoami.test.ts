import './helpers/env.js';
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { buildWhoami } from '../src/mcp/whoami.js';

// Valeurs posées par test/helpers/env.ts — ce sont les « secrets » factices qui
// ne doivent jamais apparaître dans la sortie de whoami.
const APP_PASSWORD = process.env.ICLOUD_APP_PASSWORD as string;
const BEARER_TOKEN = process.env.MCP_BEARER_TOKEN as string;

const noPool = () => ({ open: 0, inUse: 0, max: 2 });

describe('buildWhoami', () => {
  it('décrit le compte, le serveur et le pool IMAP', async () => {
    const report = await buildWhoami(false, { poolStats: noPool });

    assert.equal(report.account.email, 'test@example.com');
    assert.equal(report.account.imap.host, 'imap.mail.me.com');
    assert.equal(report.account.imap.port, 993);
    assert.equal(report.account.smtp.host, 'smtp.mail.me.com');
    assert.equal(report.account.smtp.port, 587);
    assert.equal(report.server.name, 'icloud-mail');
    assert.match(report.server.version, /^\d+\.\d+\.\d+/);
    assert.deepEqual(report.imapPool, { open: 0, inUse: 0, max: 2 });
  });

  it('expose les identifiants comme des booléens « configuré », jamais leur valeur', async () => {
    const report = await buildWhoami(false, { poolStats: noPool });
    assert.equal(report.credentials.appPasswordConfigured, true);
    assert.equal(report.credentials.bearerTokenConfigured, true);
  });

  it('reflète ENABLE_SENDING (false dans l’environnement de test)', async () => {
    const report = await buildWhoami(false, { poolStats: noPool });
    assert.equal(report.guardrails.sendingEnabled, false);
  });

  it('affiche les garde-fous optionnels quand ils sont dans l’environnement', async () => {
    const report = await buildWhoami(false, {
      poolStats: noPool,
      env: {
        DRAFTS_ONLY: 'true',
        UNRESTRICTED: 'false',
        ALLOWED_RECIPIENTS: 'alice@example.com, bob@example.com',
        MAX_SENDS_PER_DAY: '20',
      },
    });
    assert.equal(report.guardrails.draftsOnly, true);
    assert.equal(report.guardrails.unrestricted, false);
    assert.equal(report.guardrails.allowlistActive, true);
    assert.equal(report.guardrails.maxSendsPerDay, 20);
  });

  it('omet les garde-fous optionnels absents (tolérant au lot D non mergé)', async () => {
    const report = await buildWhoami(false, { poolStats: noPool, env: {} });
    assert.equal(report.guardrails.draftsOnly, undefined);
    assert.equal(report.guardrails.unrestricted, undefined);
    assert.equal(report.guardrails.allowlistActive, undefined);
    assert.equal(report.guardrails.maxSendsPerDay, undefined);
    assert.equal(report.guardrails.quota, undefined);
  });

  it('traite ALLOWED_RECIPIENTS vide comme allowlist inactive', async () => {
    const report = await buildWhoami(false, {
      poolStats: noPool,
      env: { ALLOWED_RECIPIENTS: '  ,  ' },
    });
    assert.equal(report.guardrails.allowlistActive, false);
  });

  it('inclut le quota restant si un fournisseur est branché (lot D)', async () => {
    const report = await buildWhoami(false, {
      poolStats: noPool,
      quota: () => ({ windowHours: 24, limit: 50, remaining: 47 }),
    });
    assert.deepEqual(report.guardrails.quota, { windowHours: 24, limit: 50, remaining: 47 });
  });

  it('rapporte le résultat d’une sonde de connexion réussie', async () => {
    const report = await buildWhoami(true, {
      poolStats: noPool,
      probe: async () => ({ folderCount: 12 }),
    });
    assert.deepEqual(report.probe, { attempted: true, ok: true, folderCount: 12 });
  });

  it('rapporte un échec de sonde sans propager l’erreur', async () => {
    const report = await buildWhoami(true, {
      poolStats: noPool,
      probe: async () => {
        throw Object.assign(new Error('Invalid credentials'), { authenticationFailed: true });
      },
    });
    assert.equal(report.probe?.attempted, true);
    assert.equal(report.probe?.ok, false);
    assert.match(report.probe?.error ?? '', /Authentification/);
  });

  it('ne sonde pas quand probe vaut false', async () => {
    let called = false;
    const report = await buildWhoami(false, {
      poolStats: noPool,
      probe: async () => {
        called = true;
        return { folderCount: 0 };
      },
    });
    assert.equal(called, false);
    assert.equal(report.probe, undefined);
  });

  describe('aucun secret dans la sortie sérialisée', () => {
    it('ni mot de passe d’application ni bearer token, sonde comprise', async () => {
      const reports = await Promise.all([
        buildWhoami(false, { poolStats: noPool }),
        buildWhoami(true, { poolStats: noPool, probe: async () => ({ folderCount: 3 }) }),
        buildWhoami(true, {
          poolStats: noPool,
          probe: async () => {
            throw new Error(`échec avec ${APP_PASSWORD}`);
          },
        }),
      ]);

      for (const report of reports) {
        const json = JSON.stringify(report);
        assert.ok(!json.includes(APP_PASSWORD), 'le mot de passe d’application ne doit pas apparaître');
        assert.ok(!json.includes(BEARER_TOKEN), 'le bearer token ne doit pas apparaître');
      }
    });
  });
});
