# DMS – správa výdajů a dokumentů

Jednoduchý nástroj na evidenci **projektů** (dům, auto, garáž…), jejich **výdajů**,
**dokumentů/scanů** a **reportů**. Postaveno na moderním stacku s automatickým
nasazením na Railway.

## Stack

- **Next.js 16** (App Router) + **React 19** + **TypeScript**
- **Tailwind CSS v4** + vlastní UI komponenty
- **PostgreSQL** (Railway) + **Prisma 7** (driver adapter `@prisma/adapter-pg`)
- **Auth.js (NextAuth v5)** – přihlášení přes Google i e-mail/heslo
- **Recharts** – grafy v reportech
- Přepínatelná **storage vrstva** pro soubory (dnes lokální disk, později R2/S3)

> Naše tabulky žijí v odděleném Postgres schématu **`dms`**, takže nekolidují
> s ostatními daty ve stejné databázi.

## Lokální vývoj

```bash
npm install
# vyplň .env (viz níže), pak:
npx prisma migrate dev   # aplikuje migrace do schématu dms
npm run dev              # http://localhost:3000
```

### Proměnné prostředí (`.env`)

| Proměnná | Popis |
|----------|-------|
| `DATABASE_URL` | Postgres connection string s `?schema=dms` |
| `AUTH_SECRET` | náhodný tajný klíč (`node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"`) |
| `AUTH_URL` | veřejná URL aplikace (lokálně `http://localhost:3000`) |
| `AUTH_TRUST_HOST` | `true` při běhu za proxy (Railway) |
| `AUTH_GOOGLE_ID` / `AUTH_GOOGLE_SECRET` | Google OAuth (volitelné) |
| `STORAGE_DRIVER` | `local` (default) |
| `STORAGE_LOCAL_DIR` | složka pro uploady (`./.uploads` lokálně) |

## Nasazení na Railway

1. Railway projekt je napojený na GitHub repo → **push do `main` = automatický deploy**.
2. V Railway → service → **Variables → Raw Editor** vlož proměnné (viz `DEPLOY.md`).
3. Build i start řídí `railway.json`:
   - build: `npm run build` (spustí `prisma generate` + `next build`)
   - start: `npm run db:deploy && npm run start` (aplikuje migrace, pak server)

### Důležité: úložiště souborů na Railway

Filesystem kontejneru je **dočasný** – nahrané soubory se po redeployi ztratí.
Pro trvalé uložení buď přidej v Railway **Volume** a nastav `STORAGE_LOCAL_DIR`
na jeho mount path (např. `/data`), nebo přejdi na **Cloudflare R2 / S3**
(připraveno v `src/lib/storage.ts` jako další driver).

## Datový model

`User` · `Project` · `Expense` · `Document` (+ Auth.js: `Account`, `Session`, `VerificationToken`)

## Roadmapa (další etapy)

- [ ] Sdílení projektů s dalšími uživateli + role (např. dodavatel nahrává účtenky)
- [ ] Napojení Google Disku a podadresáře per projekt
- [ ] Skenování z mobilu
- [ ] Pokročilejší reporty a export
