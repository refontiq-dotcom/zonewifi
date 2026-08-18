# ZoneWifi — Portail Captif Hotspot Wi-Fi

Solution complète d'accès Hotspot Wi-Fi avec paiement Wave, validation Telegram et connexion automatique MikroTik.

## Stack technique

| Couche | Technologie |
|---|---|
| Frontend + API | Next.js 14 (App Router) |
| Base de données | Supabase (PostgreSQL + Realtime) |
| Paiement | Wave Business (liens à montant fixe) |
| Validation admin | Bot Telegram |
| Réseau | MikroTik Hotspot (HTTP PAP + MAC Cookie) |
| Déploiement | Vercel |

## Structure du projet

```
zonewifi/
├── supabase/migrations/001_init.sql   ← Schéma DB + fonction atomique
├── scripts/
│   └── register-telegram-webhook.mjs ← Enregistrement webhook
├── src/
│   ├── app/
│   │   ├── page.tsx                   ← Portail captif (UI client)
│   │   ├── globals.css                ← Design system vanilla CSS
│   │   └── api/
│   │       ├── transactions/route.ts  ← POST: créer demande
│   │       ├── transactions/[id]/route.ts ← GET: statut
│   │       └── telegram/webhook/route.ts  ← POST: boutons Telegram
│   └── lib/
│       ├── types.ts                   ← Types + config forfaits
│       ├── supabase.ts                ← Client admin (server)
│       ├── supabase-browser.ts        ← Client browser (Realtime)
│       └── telegram.ts                ← Helper Bot Telegram
```

## Installation

### 1. Installer les dépendances

```bash
npm install
```

### 2. Configurer les variables d'environnement

```bash
cp .env.local.example .env.local
# Éditez .env.local avec vos clés
```

### 3. Initialiser la base de données Supabase

Dans l'interface Supabase → SQL Editor, exécutez le fichier :
```
supabase/migrations/001_init.sql
```

### 4. Déployer sur Vercel

```bash
# Pousser sur GitHub, puis connecter le repo à Vercel
# Ou via CLI :
npx vercel --prod
```

### 5. Enregistrer le webhook Telegram

```bash
# Après déploiement, avec les variables d'env chargées :
node scripts/register-telegram-webhook.mjs
```

---

## Parcours client (résumé)

```
1. Client saisit son numéro + choisit un forfait
2. Redirigé vers le lien Wave Business (paiement)
3. Revient sur le portail, clique "J'ai payé"
4. API crée la transaction + alerte l'admin Telegram
5. Admin clique [✅ Valider] ou [❌ Refuser] sur Telegram
6. Si validé → fonction SQL atomique attribue un ticket
7. Supabase Realtime notifie le navigateur client
8. Formulaire MikroTik auto-soumis → connexion automatique !
```

---

## Configuration MikroTik

Sur le routeur MikroTik (IP: 192.168.88.1) :

### Hotspot Profile
- Authentication: `HTTP PAP` ✅ (obligatoire pour l'auto-connexion JS)
- Cookie: `MAC Cookie` ✅ (reconnexion automatique)
- Trial: ❌ désactivé

### Walled Garden (IP List — accès sans authentification)
Ajouter les domaines suivants :
```
*.supabase.co
*.vercel.app
*.wave.com
pay.wave.com
```

### Users
Les codes Wi-Fi dans Supabase doivent correspondre exactement aux usernames/passwords
créés dans MikroTik → IP → Hotspot → Users.

> **Note :** Le username ET le password MikroTik doivent être identiques au `code` dans la table `tickets`.

---

## Variables d'environnement

| Variable | Description |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | URL du projet Supabase |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Clé publique Supabase |
| `SUPABASE_SERVICE_ROLE_KEY` | Clé service (server-only) |
| `TELEGRAM_BOT_TOKEN` | Token du bot @BotFather |
| `TELEGRAM_CHAT_ID` | ID du groupe/canal admin |
| `TELEGRAM_WEBHOOK_SECRET` | Secret de validation du webhook |
| `NEXT_PUBLIC_WAVE_URL_1J` | Lien Wave pass 1 jour (500 FCFA) |
| `NEXT_PUBLIC_WAVE_URL_3J` | Lien Wave pass 3 jours (1200 FCFA) |
| `NEXT_PUBLIC_WAVE_URL_7J` | Lien Wave pass 7 jours (2500 FCFA) |
| `NEXT_PUBLIC_APP_URL` | URL de déploiement (ex: https://zonewifi.vercel.app) |

---

## Sécurité

- ✅ Webhook Telegram validé par signature secrète (`X-Telegram-Bot-Api-Secret-Token`)
- ✅ Attribution de ticket atomique (PostgreSQL `FOR UPDATE SKIP LOCKED`)
- ✅ `SUPABASE_SERVICE_ROLE_KEY` jamais exposée côté client
- ✅ RLS activé sur toutes les tables
- ✅ Validation du numéro de téléphone côté serveur
- ✅ Transactions avec expiration automatique (30 min)
