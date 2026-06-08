# Nasazení na Railway

## 1) Proměnné prostředí – Railway Raw Editor

V Railway otevři svoji **app service** (ne databázi) → záložka **Variables** →
tlačítko **Raw Editor** → vlož tohle a ulož:

```env
DATABASE_URL="postgresql://postgres:KkRlymmzDfBZpZKYFvNwNGNsOYdpFTHN@postgres-cjaq.railway.internal:5432/railway?schema=dms"
AUTH_SECRET="WwCg6sHUqDYczUScJv+TqzX+d/vKKkBgvD/WuWZzyMY="
AUTH_TRUST_HOST="true"
AUTH_URL="https://ZMEN-NA-SVOJI-DOMENU.up.railway.app"
AUTH_GOOGLE_ID=""
AUTH_GOOGLE_SECRET=""
STORAGE_DRIVER="local"
STORAGE_LOCAL_DIR="./.uploads"
```

### Co případně upravit

- **`AUTH_URL`** – po prvním deployi zjisti veřejnou doménu (Railway → Settings →
  Networking → *Generate Domain*) a nahraď jí placeholder. Bez správné domény
  nebude fungovat přihlášení přes Google (callback URL).
- **`DATABASE_URL`** – používá **internal** adresu databáze (rychlejší, neopouští
  privátní síť Railway). Pokud appka a DB nejsou ve stejném projektu/prostředí,
  použij místo ní public proxy URL.
- **Google OAuth** – až budeš chtít přihlašování Googlem, vyplň `AUTH_GOOGLE_ID`
  a `AUTH_GOOGLE_SECRET` z Google Cloud Console. V Google nastav redirect URI:
  `https://TVOJE-DOMENA/api/auth/callback/google`.

## 2) Build & start

Řídí `railway.json` automaticky:

- **Build:** `npm run build` → `prisma generate && next build`
- **Start:** `npm run db:deploy && npm run start` → aplikuje migrace do schématu
  `dms`, pak spustí Next.js (poslouchá na `PORT`, který Railway nastaví sám)

## 3) Úložiště souborů (důležité!)

Kontejner na Railway má **dočasný disk** – nahrané scany/dokumenty se po každém
redeployi ztratí. Trvalé řešení:

**A) Railway Volume (rychlé):**
1. Service → **Volumes** → *New Volume*, mount path např. `/data`.
2. Změň proměnnou `STORAGE_LOCAL_DIR="/data"`.

**B) Cloudflare R2 / S3 (doporučeno pro produkci):**
Přidat nový driver do `src/lib/storage.ts` (vrstva je na to připravená) a
přepnout `STORAGE_DRIVER`.

## 4) Hotovo

Po pushnutí do `main` Railway sám sestaví a nasadí. Sleduj **Deployments → Logs**.
Pokud start hlásí chybu migrací, zkontroluj `DATABASE_URL`.
