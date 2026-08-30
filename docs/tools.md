# Référence des outils

Les quatorze outils exposés par le serveur MCP. Les descriptions transmises à Claude sont en anglais
(c'est ce que le modèle lit) ; cette page en donne la version détaillée.

Conventions communes :

- **`folder`** est un chemin IMAP tel que renvoyé par `list_folders` : `INBOX`, `Archive`,
  `Sent Messages`, `Deleted Messages`… Les chemins iCloud contiennent des espaces et sont sensibles
  à la casse.
- **`uid`** est l'identifiant IMAP d'un message *dans un dossier donné*. Un message qui change de
  dossier change d'UID : toujours re-lister après un `move_message`.
- Tous les outils renvoient du JSON dans un bloc de texte.
- Une erreur IMAP/SMTP remonte classifiée, avec un message explicite (voir
  [architecture.md](architecture.md#gestion-des-erreurs)).

---

## Lecture

### `list_folders`

Liste tous les dossiers IMAP du compte.

| Paramètre | Type | Défaut | Description |
|---|---|---|---|
| `includeStatus` | boolean | `true` | Ajoute les compteurs `messages` et `unseen` par dossier |
| `envelope` | boolean | `false` | Enveloppe le bloc texte en `{ folders: [...] }` au lieu d'un tableau nu |

À appeler en premier quand on ne connaît pas les noms exacts des dossiers, notamment pour trouver
l'archive et la corbeille via leur `specialUse`.

Avec `includeStatus` (défaut), chaque dossier porte le nombre total de messages et le nombre de
non-lus. C'est **une commande `STATUS` par dossier** — une dizaine d'allers-retours sur un compte
iCloud typique. Passer `includeStatus: false` pour un simple listing rapide (les deux champs sont
alors absents).

Le bloc texte est un **tableau nu** par défaut (`envelope: true` le passe en `{ folders }` ; le
`structuredContent` MCP est toujours enveloppé).

```jsonc
[
  {
    "path": "INBOX",
    "name": "INBOX",
    "delimiter": "/",
    "parentPath": "",
    "flags": ["\\HasNoChildren"],
    "subscribed": true,
    "messages": 1284,   // absent si includeStatus=false
    "unseen": 17        // absent si includeStatus=false
  },
  {
    "path": "Deleted Messages",
    "name": "Deleted Messages",
    "delimiter": "/",
    "parentPath": "",
    "specialUse": "\\Trash",   // rôle standard, indépendant du nom affiché
    "flags": ["\\HasNoChildren", "\\Trash"],
    "subscribed": true,
    "messages": 42,
    "unseen": 0
  }
]
```

---

### `list_messages`

Liste les messages d'un dossier, **du plus récent au plus ancien**.

| Paramètre | Type | Défaut | Description |
|---|---|---|---|
| `folder` | string | `INBOX` | Dossier à lister |
| `unreadOnly` | boolean | — | Ne renvoyer que les messages non lus |
| `since` | string ISO 8601 | — | Messages reçus à partir de cette date (incluse) |
| `before` | string ISO 8601 | — | Messages reçus avant cette date (exclue) |
| `from` | string | — | Filtre sur l'expéditeur (correspondance partielle, côté serveur) |
| `beforeUid` | number | — | Curseur de pagination : ne renvoie que les UID inférieurs à cette valeur |
| `envelope` | boolean | `false` | Enveloppe le bloc texte en `{ messages, nextCursor? }` |
| `limit` | number | `50` | Nombre max de messages (200 maximum) |

`since` et `before` acceptent une date seule (`2026-07-01`) ou un instant complet
(`2026-07-01T08:00:00Z`).

Le filtrage est fait par le serveur IMAP, pas en local : demander les non-lus d'un dossier de
50 000 messages reste rapide.

**Forme de la réponse** — le bloc texte est un **tableau nu** par défaut (rétrocompatible) :

```jsonc
[
  {
    "uid": 10432,
    "subject": "Votre facture de juillet",
    "from": [{ "name": "Compta", "address": "compta@exemple.fr" }],
    "to": [{ "name": "Vous", "address": "vous@icloud.com" }],
    "date": "2026-07-14T09:30:00.000Z",   // toujours normalisée en UTC
    "seen": false,
    "flagged": false,
    "size": 24815
  }
]
```

Il devient l'objet enveloppé `{ messages, nextCursor? }` quand `envelope: true` **ou** dès qu'un
curseur existe (sinon la pagination serait invisible pour un client qui ne lit pas le
`structuredContent`, lequel reste toujours enveloppé) :

```jsonc
{
  "messages": [ /* … */ ],
  "nextCursor": 10380   // plus petit UID renvoyé ; présent uniquement s'il reste des messages
}
```

**Pagination** — pour la page suivante, repasser le `nextCursor` reçu en `beforeUid`. Les UID
croissent avec le temps dans un dossier : ce curseur est plus robuste qu'un décalage numérique face
aux suppressions. `nextCursor` est absent dès qu'il ne reste plus rien.

Le corps des messages n'est pas chargé : c'est un résumé d'enveloppe, volontairement léger. Pour
lire un message, enchaîner sur `get_message` avec son `uid`.

---

### `search_messages`

Recherche IMAP native. Les critères de premier niveau sont **combinés en ET**. Au moins un critère
réel est requis (les seuls `folder` / `beforeUid` ne suffisent pas).

| Paramètre | Type | Défaut | Description |
|---|---|---|---|
| `folder` | string | `INBOX` | Dossier où chercher (ignoré si `folders` est fourni) |
| `folders` | string[] | — | Cherche dans plusieurs dossiers ; résultats fusionnés et étiquetés |
| `subject` | string | — | Sous-chaîne dans le sujet |
| `body` | string | — | Sous-chaîne dans le corps |
| `from` | string | — | Sous-chaîne dans l'expéditeur |
| `to` | string | — | Sous-chaîne dans le destinataire |
| `text` | string | — | Sous-chaîne dans les en-têtes **ou** le corps |
| `since` | string ISO 8601 | — | Messages reçus à partir de cette date (incluse) |
| `before` | string ISO 8601 | — | Messages reçus avant cette date (exclue) |
| `unreadOnly` | boolean | — | Uniquement les non-lus |
| `flagged` | boolean | — | Uniquement les messages favoris |
| `not` | objet texte | — | Critères texte (`subject`/`body`/`from`/`to`/`text`) à **exclure** |
| `or` | objet texte[] | — | Branches dont **au moins une** doit correspondre |
| `beforeUid` | number | — | Curseur de pagination (mono-dossier uniquement) |
| `envelope` | boolean | `false` | Enveloppe le bloc texte (`{ messages, nextCursor? }`) |
| `limit` | number | `50` | Nombre max de résultats (200 maximum) |

**Forme de la réponse**, comme `list_messages` : bloc texte = **tableau nu** par défaut, enveloppé
en `{ messages, nextCursor? }` si `envelope: true` ou dès qu'un curseur existe. Trié du plus récent
au plus ancien.

**Recherche mono-dossier** — `beforeUid` / `nextCursor` fonctionnent comme pour `list_messages`.

**Recherche multi-dossiers** (`folders`) — chaque message porte en plus son `folder` d'origine ; les
résultats sont fusionnés puis triés par date et tronqués à `limit`. Pas de `nextCursor` dans ce
mode : la pagination n'a de sens que dossier par dossier. Bloc texte enveloppé (`{ messages }`)
seulement avec `envelope: true`.

```jsonc
// search_messages avec folders: ["INBOX", "Archive"], envelope: true
{
  "messages": [
    { "uid": 55, "folder": "Archive", "subject": "Devis", "from": [/* … */], "date": "2026-05-02T…" }
  ]
}
```

---

### `get_message`

Contenu complet d'un message.

| Paramètre | Type | Défaut | Description |
|---|---|---|---|
| `folder` | string | `INBOX` | Dossier contenant le message |
| `uid` | number | *(requis)* | UID IMAP du message |

```jsonc
{
  "uid": 10432,
  "subject": "Votre facture de juillet",
  "from": [{ "name": "Compta", "address": "compta@exemple.fr" }],
  "to": [{ "name": "Vous", "address": "vous@icloud.com" }],
  "cc": [],
  "date": "2026-07-14T09:30:00.000Z",
  "seen": true,
  "flagged": false,
  "size": 24815,
  "messageId": "<abc123@exemple.fr>",     // sert au threading des réponses
  "references": ["<message-precedent@exemple.fr>"],
  "text": "Bonjour,\n\nVeuillez trouver…",
  "html": "<html>…</html>",                // `false` si le message n'a pas de partie HTML
  "attachments": [
    { "filename": "facture.pdf", "contentType": "application/pdf", "size": 18234 }
  ]
}
```

**Le contenu binaire des pièces jointes n'est pas renvoyé**, seulement leurs métadonnées.

Lire un message le marque comme lu du côté iCloud uniquement si le serveur le décide : le dossier
est ouvert en lecture seule, donc en pratique le flag `\Seen` n'est pas posé. Utiliser
`flag_message` pour le faire explicitement.

---

### `get_thread`

Reconstitue le fil de discussion autour d'un message.

| Paramètre | Type | Défaut | Description |
|---|---|---|---|
| `folder` | string | `INBOX` | Dossier contenant le message |
| `uid` | number | *(requis)* | UID de n'importe quel message du fil |

La recherche croise trois sources : les en-têtes `References` / `In-Reply-To` du message, dans le
**dossier courant + Sent + Archive** ; puis, en repli quand ces en-têtes manquent, un **sujet
normalisé** (les `Re:` / `Fwd:` empilés retirés). Les messages sont dédupliqués par `Message-ID`.

```jsonc
{
  "subject": "Question sur la facture",   // sujet normalisé
  "messages": [
    { "uid": 90, "folder": "INBOX", "role": "received", "date": "2026-03-01T10:00:00.000Z", /* … */ },
    { "uid": 12, "folder": "Sent Messages", "role": "sent", "date": "2026-03-01T11:00:00.000Z", /* … */ },
    { "uid": 91, "folder": "INBOX", "role": "received", "date": "2026-03-01T12:00:00.000Z", /* … */ }
  ]
}
```

`role` vaut `sent` quand l'adresse du compte figure dans le `From` du message, `received` sinon.
Les messages sont triés **du plus ancien au plus récent**. Chaque entrée est un résumé d'enveloppe
identique à celui de `list_messages`, augmenté de `folder` et `role`.

---

## Écriture

### `send_message`

Envoie un nouveau message via le SMTP iCloud.

| Paramètre | Type | Défaut | Description |
|---|---|---|---|
| `to` | string[] | *(requis)* | Destinataires, au moins un |
| `cc` | string[] | — | Copie |
| `bcc` | string[] | — | Copie cachée |
| `subject` | string | *(requis)* | Sujet |
| `text` | string | — | Corps en texte brut |
| `html` | string | — | Corps en HTML |

`text` et/ou `html` : au moins l'un des deux est obligatoire. L'expéditeur est toujours
`ICLOUD_EMAIL` — il n'est pas paramétrable, iCloud refuserait l'envoi.

```jsonc
{
  "messageId": "<f4c1…@icloud.com>",
  "accepted": ["destinataire@exemple.fr"],
  "rejected": []                            // adresses refusées par le serveur
}
```

Refuse avec une erreur explicite si `ENABLE_SENDING=false`.

---

### `reply_message`

Répond à un message existant, avec un threading correct.

| Paramètre | Type | Défaut | Description |
|---|---|---|---|
| `folder` | string | `INBOX` | Dossier du message d'origine |
| `uid` | number | *(requis)* | UID du message auquel répondre |
| `to` | string[] | expéditeur d'origine | Destinataires |
| `cc` | string[] | — | Copie |
| `bcc` | string[] | — | Copie cachée |
| `text` | string | — | Corps en texte brut |
| `html` | string | — | Corps en HTML |

Ce qui est déduit automatiquement du message d'origine :

- **le sujet** — préfixé `Re: `, sauf s'il l'est déjà (`RE:`, `re:` reconnus) ;
- **le destinataire** — l'expéditeur d'origine, si `to` n'est pas fourni ;
- **`In-Reply-To`** — le `Message-ID` du message d'origine ;
- **`References`** — la chaîne du message d'origine, complétée de son `Message-ID`, sans doublon.

C'est ce qui fait que la réponse s'affiche dans le bon fil chez le destinataire, et pas comme un
message isolé. Refuse si `ENABLE_SENDING=false`.

---

### `save_draft`

Compose un message et l'enregistre dans le dossier Drafts via `IMAP APPEND`, **sans rien envoyer**.

| Paramètre | Type | Défaut | Description |
|---|---|---|---|
| `to` | string[] | — | Requis, sauf si `replyFolder`/`replyUid` sont fournis |
| `cc` | string[] | — | Copie |
| `bcc` | string[] | — | Copie cachée |
| `subject` | string | — | Requis, sauf si `replyFolder`/`replyUid` sont fournis |
| `text` | string | — | Corps en texte brut |
| `html` | string | — | Corps en HTML |
| `replyFolder` | string | — | Dossier du message auquel ce brouillon répond |
| `replyUid` | number | — | UID de ce message |

`replyFolder` et `replyUid` vont toujours ensemble. Fournis, ils appliquent au brouillon exactement
le même threading que `reply_message` : le brouillon envoyé plus tard depuis Mail.app atterrira
dans le bon fil.

**`save_draft` n'est jamais bloqué par `ENABLE_SENDING`** : il n'utilise que l'IMAP, jamais le SMTP.
C'est le mode de travail recommandé — Claude prépare, vous relisez et envoyez depuis votre client
mail habituel.

```jsonc
{ "folder": "Drafts", "uid": 87 }
```

---

### `update_draft`

Remplace un brouillon existant par une version recomposée.

| Paramètre | Type | Défaut | Description |
|---|---|---|---|
| `uid` | number | *(requis)* | UID du brouillon à remplacer, dans le dossier Drafts |
| `to` | string[] | — | Requis, sauf si `replyFolder`/`replyUid` sont fournis |
| `cc` | string[] | — | Copie |
| `bcc` | string[] | — | Copie cachée |
| `subject` | string | — | Requis, sauf si `replyFolder`/`replyUid` sont fournis |
| `text` | string | — | Corps en texte brut |
| `html` | string | — | Corps en HTML |
| `replyFolder` | string | — | Dossier du message auquel ce brouillon répond |
| `replyUid` | number | — | UID de ce message |

L'ordre des opérations est volontaire : la nouvelle version est **d'abord** écrite (`APPEND`), la
précédente n'est supprimée **qu'ensuite**. Une panne au milieu laisse un doublon récupérable, jamais
un contenu perdu. IMAP seul : **jamais bloqué par `ENABLE_SENDING`**.

```jsonc
{ "folder": "Drafts", "uid": 91, "replacedUid": 87 }
```

---

### `send_draft`

Envoie un brouillon existant, puis fait le ménage.

| Paramètre | Type | Défaut | Description |
|---|---|---|---|
| `uid` | number | *(requis)* | UID du brouillon à envoyer, dans le dossier Drafts |

En séquence : lire la source du brouillon → l'envoyer par le **même chemin SMTP que `send_message`**
(coupe-circuit `ENABLE_SENDING` et garde-fous d'envoi inclus) → la recopier dans `Sent` → supprimer
le brouillon. Si l'envoi échoue, **le brouillon reste intact** (rien n'est copié ni supprimé).

```jsonc
{
  "send": { "messageId": "<…@icloud.com>", "accepted": ["dest@exemple.fr"], "rejected": [] },
  "copiedToSent": true,
  "draftDeleted": true
}
```

Pour seulement **supprimer** un brouillon, utiliser `delete_message` sur le dossier Drafts ; pour
les **lister**, `list_messages` sur ce même dossier.

---

## Organisation

### `move_message`

| Paramètre | Type | Défaut | Description |
|---|---|---|---|
| `folder` | string | *(requis)* | Dossier source |
| `uid` | number | *(l'un des deux)* | UID unique dans le dossier source |
| `uids` | number[] | *(l'un des deux)* | Jusqu'à 200 UID, déplacés en **une seule commande IMAP** |
| `destination` | string | *(requis)* | Dossier de destination |

Fournir **exactement un** de `uid` ou `uids`.

```jsonc
// move_message avec uid
{ "uid": 10432, "from": "INBOX", "to": "Archive", "newUid": 553 }

// move_message avec uids : retour par UID, un échec partiel reste lisible
{
  "from": "INBOX",
  "to": "Archive",
  "results": [
    { "uid": 10432, "ok": true },
    { "uid": 10433, "ok": false, "error": "Message UID 10433 introuvable dans \"INBOX\"" }
  ]
}
```

`newUid` (forme `uid`) est l'UID du message dans son nouveau dossier, quand le serveur le communique
(`UIDPLUS`). L'ancien UID n'est plus valable.

---

### `delete_message`

| Paramètre | Type | Défaut | Description |
|---|---|---|---|
| `folder` | string | *(requis)* | Dossier contenant le(s) message(s) |
| `uid` | number | *(l'un des deux)* | UID unique |
| `uids` | number[] | *(l'un des deux)* | Jusqu'à 200 UID, traités en **une seule commande IMAP** |

Fournir **exactement un** de `uid` ou `uids`. Suit la convention iCloud, en deux temps :

1. si le message **n'est pas** dans la corbeille, il y est déplacé — récupérable ;
2. s'il **y est déjà**, il est marqué `\Deleted` puis expurgé — **définitif**.

La corbeille est trouvée par son flag `\Trash`, pas par son nom : le code fonctionne quelle que
soit la langue du compte.

```jsonc
// delete_message avec uid
{ "uid": 10432, "folder": "INBOX", "action": "moved_to_trash", "destination": "Deleted Messages" }

// delete_message avec uids
{
  "folder": "INBOX",
  "action": "moved_to_trash",
  "destination": "Deleted Messages",
  "results": [{ "uid": 10432, "ok": true }, { "uid": 10433, "ok": true }]
}
```

---

### `flag_message`

| Paramètre | Type | Défaut | Description |
|---|---|---|---|
| `folder` | string | `INBOX` | Dossier contenant le(s) message(s) |
| `uid` | number | *(l'un des deux)* | UID unique |
| `uids` | number[] | *(l'un des deux)* | Jusqu'à 200 UID, traités en **une seule commande IMAP** |
| `actions` | string[] | *(requis)* | Une ou plusieurs parmi `read`, `unread`, `flagged`, `unflagged` |

Fournir **exactement un** de `uid` ou `uids`. Les actions sont combinables : `["read", "flagged"]`
marque lu **et** favori en un seul appel. Les ajouts de flags sont appliqués avant les retraits,
quel que soit l'ordre de la liste : passer `["read", "unread"]` laisse donc le message **non lu**.

```jsonc
// flag_message avec uid
{ "uid": 10432, "folder": "INBOX", "applied": ["read", "flagged"] }

// flag_message avec uids
{ "folder": "INBOX", "applied": ["read"], "results": [{ "uid": 10432, "ok": true }] }
```

---

### `manage_folder`

Crée, renomme ou supprime un dossier IMAP.

| Paramètre | Type | Défaut | Description |
|---|---|---|---|
| `action` | string | *(requis)* | `create`, `rename` ou `delete` |
| `path` | string | *(requis)* | Chemin du dossier concerné |
| `newPath` | string | — | Chemin cible, **requis** pour `rename` |

**Garde-fou** — renommer ou supprimer un dossier à rôle système (INBOX, Sent, Trash, Drafts,
Archive, Junk) est **refusé** : la suppression d'un dossier IMAP est irréversible et emporte tout
son contenu.

```jsonc
{ "action": "create", "path": "Factures 2026" }
{ "action": "rename", "path": "Vieux nom", "newPath": "Nouveau nom" }
{ "action": "delete", "path": "Dossier obsolète" }
```
