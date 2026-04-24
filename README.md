# E-Tafakna — Module de Facturation (Backend)

> Node.js 22 · TypeScript · Express · Prisma · PostgreSQL  
> PFE-DEV-01 — Sprint 1 & 2

## Prérequis

- Node.js ≥ 22
- PostgreSQL ≥ 15 (local ou Azure SQL)
- npm ≥ 10

## Installation

```bash
# 1. Cloner et installer les dépendances
cd etafakna-billing
npm install

# 2. Configurer l'environnement
cp .env.example .env
# → Éditer .env avec vos valeurs (DATABASE_URL, JWT_SECRET, etc.)

# 3. Générer le client Prisma
npm run db:generate

# 4. Créer la base de données et appliquer les migrations
npm run db:migrate

# 5. Peupler avec des données de test
npm run db:seed

# 6. Démarrer le serveur de développement
npm run dev
```

L'API est disponible sur `http://localhost:3001/api`

## Structure du projet

```
etafakna-billing/
├── prisma/
│   ├── schema.prisma        # Modèle de données (Invoice, Client, AuditLog)
│   └── seed.ts              # Données de test
├── src/
│   ├── config/
│   │   ├── env.ts           # Variables d'env (validation Zod)
│   │   ├── prisma.ts        # Client Prisma singleton
│   │   └── logger.ts        # Winston logger
│   ├── controllers/         # Logique HTTP (sprint 3)
│   ├── services/            # Logique métier (sprint 3)
│   ├── routes/              # Express Router (sprint 3)
│   ├── middlewares/
│   │   ├── auth.middleware.ts    # JWT Bearer token
│   │   └── error.middleware.ts   # Gestionnaire d'erreurs global
│   ├── utils/
│   │   ├── fiscalCalculator.ts   # ⭐ Calculs fiscaux tunisiens
│   │   ├── invoiceNumber.ts      # Générateur numéros FAC-YYYY-NNN
│   │   └── validators.ts         # Schémas Zod
│   ├── types/
│   │   └── index.ts         # Types TypeScript partagés
│   ├── app.ts               # Configuration Express
│   └── index.ts             # Point d'entrée
└── tests/
    └── unit/
        └── fiscalCalculator.test.ts  # Tests TVA, timbre, retenue
```

## Commandes utiles

| Commande | Description |
|---|---|
| `npm run dev` | Serveur dev avec hot-reload |
| `npm run build` | Compilation TypeScript |
| `npm test` | Tous les tests Jest |
| `npm run test:coverage` | Tests + rapport de couverture |
| `npm run db:migrate` | Nouvelle migration Prisma |
| `npm run db:studio` | Prisma Studio (UI BDD) |
| `npm run db:seed` | Données de test |
| `npm run type-check` | Vérification TS sans compilation |
| `npm run lint` | ESLint |

## Fiscalité tunisienne — Règles implémentées

| Règle | Valeur | Fichier |
|---|---|---|
| TVA taux zéro | 0% — exportations | `fiscalCalculator.ts` |
| TVA réduite | 7% — produits nécessité | `fiscalCalculator.ts` |
| TVA intermédiaire | 13% — services bancaires | `fiscalCalculator.ts` |
| TVA standard | 19% — services informatiques | `fiscalCalculator.ts` |
| Timbre fiscal | 1 TND si HT > 1 000 TND | `fiscalCalculator.ts` |
| RAS Honoraires | 15% du montant HT | `fiscalCalculator.ts` |
| RAS Loyers | 15% du montant HT | `fiscalCalculator.ts` |
| RAS Marchés | 1.5% du montant HT | `fiscalCalculator.ts` |

## Prochaines étapes (Sprint 3)

- [ ] `invoiceService.ts` — logique CRUD complète
- [ ] `invoiceController.ts` — endpoints REST
- [ ] `invoices.routes.ts` — routing Express
- [ ] `clientService.ts` + `clientController.ts`
- [ ] Tests d'intégration (Supertest)
