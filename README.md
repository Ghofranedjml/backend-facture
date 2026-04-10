# E-Tafakna — Backend facturation (`backend-facture`)

API REST de facturation pour **E-Tafakna** : clients, factures, devis, calculs fiscaux tunisiens, PDF, relances et analyses.

> **Stack** : Node.js 22 · TypeScript · Express · Prisma · PostgreSQL · Jest

Ce dépôt correspond au module **etafakna-billing** (dossier local). Le dépôt GitHub `**backend-facture`** héberge l’intégralité du code source, pas seulement un README vide.

## Prérequis

- Node.js ≥ 22  
- PostgreSQL ≥ 15  
- npm ≥ 10

## Installation

```bash
git clone https://github.com/Ghofranedjml/backend-facture.git
cd backend-facture
npm install

# 2. Configurer l'environnement
cp .env.example .env
# → Éditer .env (DATABASE_URL, JWT_SECRET, etc.)

# 3. Client Prisma
npm run db:generate

# 4. Migrations
npm run db:migrate

# 5. Données de test (optionnel)
npm run db:seed

# 6. Développement
npm run dev
```

L’API est exposée sous le préfixe configuré (par défaut `http://localhost:3001/api`).

## Fonctionnalités principales


| Domaine       | Description                                                         |
| ------------- | ------------------------------------------------------------------- |
| **Clients**   | CRUD multi-tenant (`userId`)                                        |
| **Factures**  | Brouillon → émise → payée / annulée, statistiques dashboard         |
| **Devis**     | Création, envoi, acceptation/refus, conversion en facture           |
| **Fiscalité** | TVA multi-taux, timbre fiscal, retenue à la source (factures)       |
| **PDF**       | Génération et envoi par e-mail                                      |
| **Scheduler** | Factures en retard, relances, expiration des devis                  |
| **Services**  | Moteur fiscal (`fiscalEngine`), assistant d’analyse (`aiAssistant`) |


## API (aperçu)

Toutes les routes sous `API_PREFIX` (ex. `/api`), sauf `/health`.


| Ressource | Exemples                                                                                                                                 |
| --------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| Clients   | `GET/POST /clients`, `GET/PUT/DELETE /clients/:id`                                                                                       |
| Factures  | `GET /invoices`, `POST /invoices`, `GET /invoices/stats`, transitions `validate`, `pay`, `cancel`, `/:id/analyze`, `/:id/validate-taxes` |
| Devis     | `GET/POST /quotations`, `PUT/DELETE /quotations/:id`, `send`, `accept`, `refuse`, `convert`                                              |


Authentification : **JWT Bearer** sur les routes protégées.

## Structure du projet

```
backend-facture/
├── prisma/
│   ├── schema.prisma        # Modèles (Client, Invoice, Quotation, …)
│   ├── migrations/
│   └── seed.ts
├── src/
│   ├── config/              # env, prisma, logger
│   ├── controllers/         # clients, invoices, pdf, quotations
│   ├── middlewares/         # auth JWT, erreurs
│   ├── routes/
│   ├── services/            # métier, email, PDF, scheduler, fiscalEngine, aiAssistant
│   ├── utils/               # fiscalCalculator, validators, numéros FAC-/DEV-
│   ├── types/
│   ├── app.ts
│   └── index.ts
└── tests/
    ├── unit/
    └── integration/
```

## Commandes utiles


| Commande                | Description             |
| ----------------------- | ----------------------- |
| `npm run dev`           | Serveur dev (tsx watch) |
| `npm run build`         | Compilation TypeScript  |
| `npm test`              | Tests Jest              |
| `npm run test:coverage` | Couverture              |
| `npm run db:migrate`    | Migrations Prisma       |
| `npm run db:studio`     | Prisma Studio           |
| `npm run type-check`    | Vérification TS         |
| `npm run lint`          | ESLint                  |


## Fiscalité tunisienne (rappel)


| Règle               | Détail                                      |
| ------------------- | ------------------------------------------- |
| TVA                 | 0 %, 7 %, 13 %, 19 % selon `VatRate`        |
| Timbre fiscal       | 1 TND si HT > 1 000 TND (factures)          |
| Retenue à la source | Selon `WithholdingTaxType` sur les factures |


Les devis utilisent le même moteur de lignes/TVA ; le timbre fiscal n’est pas appliqué sur les devis comme sur les factures (voir `calcTaxBreakdown` avec `applyStampDuty`).

## Licence / contexte

Projet **PFE-DEV-01** — module de facturation E-Tafakna.