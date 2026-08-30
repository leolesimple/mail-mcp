# Référence des outils

Les dix outils exposés par le serveur MCP (onze avec `wait_for_new_message`, désactivé par
défaut), plus ses [resources et prompts](#resources-et-prompts). Les descriptions transmises à
Claude sont en anglais (c'est ce que le modèle lit) ; cette page en donne la version détaillée.

Conventions communes :

- **Sorties structurées.** Chaque outil déclare un `outputSchema` et renvoie sa réponse en
  `structuredContent` (objet validé contre le schéma) **et** dans un bloc texte JSON (pour les
  clients qui ne lisent pas le structuré).
- **Outils qui renvoient une liste** (`list_folders`, `list_messages`, `search_messages`) :
  `structuredContent` porte **toujours** la forme enveloppée sous une clé (`{ "folders": [...] }`,
  `{ "messages": [...] }`) — le protocole impose un objet. Le bloc texte, lui, reste le **tableau
  nu** par défaut ; passer `envelope: true` pour qu'il porte aussi la forme enveloppée.
- **Erreurs applicatives.** Les validations d'entrée qui échouent (critère de recherche manquant,
  corps de message vide…) reviennent avec `isError` et un message français, sans `structuredContent`.

- **`folder`** est un chemin IMAP tel que renvoyé par `list_folders` : `INBOX`, `Archive`,
  `Sent Messages`, `Deleted Messages`… Les chemins iCloud contiennent des espaces et sont sensibles
  à la casse.
- **`uid`** est l'identifiant IMAP d'un message *dans un dossier donné*. Un message qui change de
  dossier change d'UID : toujours re-lister après un `move_message`.
- Une erreur IMAP/SMTP remonte classifiée, avec un message explicite (voir
  [architecture.md](architecture.md#gestion-des-erreurs)).

---

## Lecture

### `list_folders`

Liste tous les dossiers IMAP du compte.

| Paramètre | Type | Défaut | Description |
|---|---|---|---|
| `envelope` | boolean | `false` | Envelopper aussi le bloc texte sous la clé `folders` |

À appeler en premier quand on ne connaît pas les noms exacts des dossiers, notamment pour trouver
l'archive et la corbeille via leur `specialUse`.

Bloc texte (défaut) — `structuredContent` porte la même liste sous `{ "folders": [...] }` :

```jsonc
[
  {
    "path": "INBOX",
    "name": "INBOX",
    "delimiter": "/",
    "parentPath": "",
    "flags": ["\\HasNoChildren"],
    "subscribed": true
  },
  {
    "path": "Deleted Messages",
    "name": "Deleted Messages",
    "delimiter": "/",
    "parentPath": "",
    "specialUse": "\\Trash",   // rôle standard, indépendant du nom affiché
    "flags": ["\\HasNoChildren", "\\Trash"],
    "subscribed": true
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
| `limit` | number | `50` | Nombre max de messages (200 maximum) |
| `envelope` | boolean | `false` | Envelopper aussi le bloc texte sous la clé `messages` |

`since` et `before` acceptent une date seule (`2026-07-01`) ou un instant complet
(`2026-07-01T08:00:00Z`).

Le filtrage est fait par le serveur IMAP, pas en local : demander les non-lus d'un dossier de
50 000 messages reste rapide.

Bloc texte (défaut) — `structuredContent` porte la même liste sous `{ "messages": [...] }` :

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

Le corps des messages n'est pas chargé : c'est un résumé d'enveloppe, volontairement léger. Pour
lire un message, enchaîner sur `get_message` avec son `uid`.

---

### `search_messages`

Recherche IMAP native. Les critères fournis sont **combinés en ET**.

| Paramètre | Type | Défaut | Description |
|---|---|---|---|
| `folder` | string | `INBOX` | Dossier où chercher |
| `subject` | string | — | Sous-chaîne dans le sujet |
| `body` | string | — | Sous-chaîne dans le corps |
| `from` | string | — | Sous-chaîne dans l'expéditeur |
| `to` | string | — | Sous-chaîne dans le destinataire |
| `limit` | number | `50` | Nombre max de résultats (200 maximum) |
| `envelope` | boolean | `false` | Envelopper aussi le bloc texte sous la clé `messages` |

Retour identique à `list_messages`, trié du plus récent au plus ancien.

La recherche porte sur **un seul dossier à la fois** : il n'y a pas de recherche multi-dossiers en
IMAP standard. Pour chercher partout, itérer sur `list_folders`.

---

### `get_message`

Contenu complet d'un message, avec **maîtrise de la taille renvoyée**.

| Paramètre | Type | Défaut | Description |
|---|---|---|---|
| `folder` | string | `INBOX` | Dossier contenant le message |
| `uid` | number | *(requis)* | UID IMAP du message |
| `maxBodyChars` | number | `MAX_BODY_CHARS` (20000) | Longueur max de chaque partie de corps renvoyée |
| `includeHtml` | boolean | `false` | Inclure la partie HTML brute (volumineuse, hors contexte par défaut) |
| `includeRawHeaders` | boolean | `false` | Inclure le bloc d'en-têtes brut (`List-Unsubscribe`, DKIM, débogage) |

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
  "text": "Bonjour,\n\nVeuillez trouver…",  // partie texte, ou texte dérivé du HTML si absente
  "html": false,                            // string seulement si includeHtml: true
  "bodyTruncated": false,                    // true dès qu'une partie a été coupée à maxBodyChars
  "attachments": [
    { "filename": "facture.pdf", "contentType": "application/pdf", "size": 18234 }
  ],
  "rawHeaders": "From: …\r\nSubject: …"      // présent seulement si includeRawHeaders: true
}
```

Points clés :

- **`includeHtml` est à `false` par défaut.** Le HTML brut était jusqu'ici déversé intégralement
  dans le contexte du client — c'était le premier poste de gaspillage du serveur.
- Si le message n'a **pas de partie texte**, `text` est dérivé du HTML (via `html-to-text`).
- La troncature est **toujours explicite** : `bodyTruncated: true`, jamais silencieuse.
- `includeRawHeaders` ne renvoie que le bloc d'en-têtes, **pas** le corps brut.
- **Le contenu binaire des pièces jointes n'est pas renvoyé**, seulement leurs métadonnées.

Lire un message le marque comme lu du côté iCloud uniquement si le serveur le décide : le dossier
est ouvert en lecture seule, donc en pratique le flag `\Seen` n'est pas posé. Utiliser
`flag_message` pour le faire explicitement.

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

## Organisation

### `move_message`

| Paramètre | Type | Défaut | Description |
|---|---|---|---|
| `folder` | string | *(requis)* | Dossier source |
| `uid` | number | *(requis)* | UID dans le dossier source |
| `destination` | string | *(requis)* | Dossier de destination |

```jsonc
{ "uid": 10432, "from": "INBOX", "to": "Archive", "newUid": 553 }
```

`newUid` est l'UID du message dans son nouveau dossier, quand le serveur le communique
(`UIDPLUS`). L'ancien UID n'est plus valable.

---

### `delete_message`

| Paramètre | Type | Défaut | Description |
|---|---|---|---|
| `folder` | string | *(requis)* | Dossier contenant le message |
| `uid` | number | *(requis)* | UID du message |

Suit la convention iCloud, en deux temps :

1. si le message **n'est pas** dans la corbeille, il y est déplacé — récupérable ;
2. s'il **y est déjà**, il est marqué `\Deleted` puis expurgé — **définitif**.

La corbeille est trouvée par son flag `\Trash`, pas par son nom : le code fonctionne quelle que
soit la langue du compte.

```jsonc
{ "uid": 10432, "folder": "INBOX", "action": "moved_to_trash", "destination": "Deleted Messages" }
{ "uid": 553, "folder": "Deleted Messages", "action": "expunged" }
```

---

### `flag_message`

| Paramètre | Type | Défaut | Description |
|---|---|---|---|
| `folder` | string | `INBOX` | Dossier contenant le message |
| `uid` | number | *(requis)* | UID du message |
| `actions` | string[] | *(requis)* | Une ou plusieurs parmi `read`, `unread`, `flagged`, `unflagged` |

Les actions sont combinables : `["read", "flagged"]` marque lu **et** favori en un seul appel.
Les ajouts de flags sont appliqués avant les retraits, quel que soit l'ordre de la liste : passer
`["read", "unread"]` laisse donc le message **non lu**.

```jsonc
{ "uid": 10432, "folder": "INBOX", "applied": ["read", "flagged"] }
```

---

## Attente

### `wait_for_new_message`

> **Désactivé par défaut.** L'outil n'est enregistré que si `ENABLE_IDLE_WATCH=true` (voir
> [configuration.md](configuration.md#attente-de-nouveaux-messages-idle)). Sans reconnexion, une
> coupure iCloud pendant l'attente est manquée silencieusement.

Bloque jusqu'à l'arrivée d'un nouveau message dans un dossier, ou jusqu'à expiration du délai.

| Paramètre | Type | Défaut | Description |
|---|---|---|---|
| `folder` | string | `INBOX` | Dossier surveillé |
| `timeoutSec` | number | `60` | Délai d'attente en secondes (300 maximum) |

Ouvre une connexion IMAP **dédiée, hors du pool** (le pool ne fait que deux connexions et une
attente longue les monopoliserait), et la referme systématiquement à la fin.

Un délai atteint **n'est pas une erreur** : `timedOut: true` et `newMessages: []`.

```jsonc
{
  "folder": "INBOX",
  "timedOut": false,
  "newMessages": [
    { "uid": 10440, "subject": "Nouveau message", "from": [ /* … */ ], "seen": false, "flagged": false }
  ]
}
```

C'est une version minimale du push MCP : pas de reconnexion automatique, pas de notification
`resources/updated`. Pour un suivi durable, ré-appeler l'outil.

---

## Resources et prompts

En plus des outils, le serveur expose des **resources** (lecture seule, référençables par URI) et
des **prompts** (points de départ guidés, en français).

### Resources

| URI | Contenu |
|---|---|
| `mail://folders` | La liste des dossiers (même donnée que `list_folders`) |
| `mail://folder/{path}/message/{uid}` | Un message complet (même donnée que `get_message`, sans les options de taille) |

L'argument `{path}` du gabarit propose une **complétion** sur les dossiers du compte (liste mise en
cache 60 s pour ne pas multiplier les commandes `LIST`).

### Prompts

| Prompt | Arguments | Rôle |
|---|---|---|
| `triage-inbox` | `folder?` | Passer en revue les non-lus et proposer une action par message |
| `summarize-thread` | `folder`, `uid` | Résumer le fil auquel appartient un message |
| `draft-reply` | `folder`, `uid`, `instructions?` | Rédiger un brouillon de réponse et l'enregistrer (sans l'envoyer) |

L'argument `folder` de chaque prompt propose la même complétion que la resource.
