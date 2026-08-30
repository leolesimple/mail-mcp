import './helpers/env.js';
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { parseConfig } from '../src/config.js';

const validEnv = {
  ICLOUD_EMAIL: 'user@icloud.com',
  ICLOUD_APP_PASSWORD: 'abcd-efgh-ijkl-mnop',
  MCP_BEARER_TOKEN: '0123456789abcdef0123456789abcdef',
};

describe('parseConfig', () => {
  it('applique les valeurs par défaut iCloud', () => {
    const config = parseConfig({ ...validEnv });
    assert.equal(config.IMAP_HOST, 'imap.mail.me.com');
    assert.equal(config.IMAP_PORT, 993);
    assert.equal(config.SMTP_HOST, 'smtp.mail.me.com');
    assert.equal(config.SMTP_PORT, 587);
    assert.equal(config.PORT, 3000);
    assert.equal(config.LOG_LEVEL, 'info');
    assert.equal(config.IMAP_POOL_SIZE, 2);
    assert.equal(config.MCP_TRANSPORT, 'http');
    assert.equal(config.MAX_BODY_CHARS, 20000);
    assert.equal(config.ENABLE_IDLE_WATCH, false);
  });

  describe('ENABLE_IDLE_WATCH', () => {
    it('est off par défaut', () => {
      assert.equal(parseConfig({ ...validEnv }).ENABLE_IDLE_WATCH, false);
    });

    for (const value of ['true', '1', 'yes']) {
      it(`s'active pour ${JSON.stringify(value)}`, () => {
        assert.equal(parseConfig({ ...validEnv, ENABLE_IDLE_WATCH: value }).ENABLE_IDLE_WATCH, true);
      });
    }

    for (const value of ['false', '0', 'no', ' FALSE ']) {
      it(`reste off pour ${JSON.stringify(value)}`, () => {
        assert.equal(parseConfig({ ...validEnv, ENABLE_IDLE_WATCH: value }).ENABLE_IDLE_WATCH, false);
      });
    }
  });

  it('accepte les trois valeurs de MCP_TRANSPORT', () => {
    for (const transport of ['http', 'stdio', 'both'] as const) {
      assert.equal(parseConfig({ ...validEnv, MCP_TRANSPORT: transport }).MCP_TRANSPORT, transport);
    }
  });

  it('rejette un MCP_TRANSPORT inconnu', () => {
    assert.throws(() => parseConfig({ ...validEnv, MCP_TRANSPORT: 'grpc' }), /MCP_TRANSPORT/);
  });

  it('convertit MAX_BODY_CHARS en nombre', () => {
    assert.equal(parseConfig({ ...validEnv, MAX_BODY_CHARS: '5000' }).MAX_BODY_CHARS, 5000);
  });

  it('convertit les ports en nombres', () => {
    const config = parseConfig({ ...validEnv, PORT: '8080', IMAP_PORT: '143' });
    assert.equal(config.PORT, 8080);
    assert.equal(config.IMAP_PORT, 143);
  });

  it('rejette un email invalide', () => {
    assert.throws(() => parseConfig({ ...validEnv, ICLOUD_EMAIL: 'pas-un-email' }), /ICLOUD_EMAIL/);
  });

  it('rejette un bearer token trop court', () => {
    assert.throws(() => parseConfig({ ...validEnv, MCP_BEARER_TOKEN: 'court' }), /au moins 16 caractères/);
  });

  it('rejette une configuration sans identifiants', () => {
    assert.throws(() => parseConfig({}), /Configuration invalide/);
  });

  it('rejette un port non numérique', () => {
    assert.throws(() => parseConfig({ ...validEnv, PORT: 'http' }), /PORT/);
  });

  it('rejette un niveau de log inconnu', () => {
    assert.throws(() => parseConfig({ ...validEnv, LOG_LEVEL: 'verbose' }), /LOG_LEVEL/);
  });

  it('liste toutes les variables fautives dans le message d’erreur', () => {
    assert.throws(
      () => parseConfig({ ICLOUD_EMAIL: 'x', ICLOUD_APP_PASSWORD: 'y', MCP_BEARER_TOKEN: 'z' }),
      (err: Error) => err.message.includes('ICLOUD_EMAIL') && err.message.includes('MCP_BEARER_TOKEN'),
    );
  });

  describe('ENABLE_SENDING', () => {
    // Le piège que le schéma contourne : z.coerce.boolean() ferait de la
    // chaîne "false" un `true`, réactivant silencieusement l'envoi de mails.
    for (const value of ['false', 'FALSE', ' false ', '0', 'no', 'No']) {
      it(`désactive l'envoi pour ${JSON.stringify(value)}`, () => {
        assert.equal(parseConfig({ ...validEnv, ENABLE_SENDING: value }).ENABLE_SENDING, false);
      });
    }

    for (const value of ['true', '1', 'yes', 'nimporte quoi']) {
      it(`laisse l'envoi actif pour ${JSON.stringify(value)}`, () => {
        assert.equal(parseConfig({ ...validEnv, ENABLE_SENDING: value }).ENABLE_SENDING, true);
      });
    }

    it("est actif par défaut quand la variable n'est pas définie", () => {
      assert.equal(parseConfig({ ...validEnv }).ENABLE_SENDING, true);
    });
  });
});
