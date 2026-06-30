# DMS – Backlog

Stavy přehazujeme přesouváním řádků mezi sekcemi (✅ Hotovo / 🔨 Probíhá / 📋 Backlog).
Zdroj: původně `2do.txt`.

## 🔨 Probíhá

- [ ] **Sdílení dodavatelů napříč uživateli** — merge podle **IČO** (e-mail fallback);
  při zakládání duplicitu nezakládat, upozornit „už v systému existuje" a jen
  zpřístupnit uživateli. Vyžaduje změnu modelu (per-user viditelnost) + migraci
  (dedup + přepojení Expense/Offer/Task/VendorAvailability/ProjectVendors).
  Stav DB: 38 vendorů / 5 vlastníků → 33 unikátních (5 duplicit).

## 📋 Backlog (nově nahlášené)

- [ ] **BUG: editace výdaje po vytvoření nejde** — prověřit a opravit.
- [ ] **Export výdajů do CSV dle filtru** (datum, název, hodiny, sazba) → po exportu
  nastavit stav **„exportováno"**.
- [ ] **Hromadné stažení příloh (obrázky/PDF) z R2** — vybrat vše / filtr → hromadně
  stáhnout (ZIP) → po stažení automaticky **„exportováno"**.
- [ ] **QR platba – agregace více výdajů do jedné QR** (seskupit podle bankovního
  účtu dodavatele). Per-výdaj QR na /payments už existuje.

## 📋 Backlog

### Práva a účet
- [ ] **Změna hesla** v nastavení uživatele
- [ ] Přidávání účastníků do projektu podle e-mailu (rozšíření rolí)

### Dodavatelé a kategorie
- [ ] **Editace dodavatele a kategorie** (úprava existujících)
- [ ] **Bankovní účet** u dodavatele

### Platby
- [ ] Stav **k úhradě → QR platba → uhrazeno**
- [ ] Generování **QR platby** (česká QR platba)

### Dokumenty / scany
- [ ] Zlepšení skenování – **zarovnání** skenu
- [ ] **OCR účtenky** přes API – rozpársování a automatické založení detailu

### Procurement / plánování
- [ ] Sekce **Výběrové řízení** (napojení na poptávky)
- [ ] **Plánování prací** – činnosti, vazba na předchozí krok, posun a evidence času, projektová mapa, barevné označení po splatnosti
- [ ] **Kalendář dovolených**
- [ ] **Úkoly a delegování**

### UX / mobil
- [ ] **Mobilní optimalizace** + PWA „nainstalovat aplikaci" (Android) z nastavení
- [ ] **Kalkulačka** pro pomocné výpočty u zadávání

## ✅ Hotovo

- [x] **Aktivní dodavatel vidí v projektu jen svoje záznamy** (výdaje/poptávky/dokumenty dle createdById)
- [x] **R2 úložiště po složkách** `<účet>/<projekt>/…`
- [x] **Cloudflare R2 úložiště** – privátní bucket `dms` přes S3 API, soubory servírované přes `/api/documents` (soubory přežijí redeploy)
- [x] Favicon (logo složky) v záložce prohlížeče
- [x] Moderní monochromatický design + font (Bricolage Grotesque)
- [x] Typy projektů (Nemovitosti, Vozidla, Elektronika…) + editovatelný číselník
- [x] Odebrání popisků nad nadpisy
- [x] Evidence dodavatelů (e-mail = identifikátor, název, popis, kategorie, telefon)
- [x] Propojení dodavatel ↔ výdaj ↔ projekt
- [x] CSV Import/Export (UTF-8 i Win-1250), šablona, export výdajů, **reimport přes ID**, mapování kategorií
- [x] **Fáze 1** – role (Owner/Aktivní dodavatel/Reader/Dodavatel) + přihlášení podle e-mailu
- [x] **Fáze 2** – zadávání záznamů (Výdaj/Práce/Nákup), schvalování (For Approval → Owner ✓), hodiny×sazba, sken k položce, zadání za dodavatele, našeptávač, pamatování voleb, datum dnes
- [x] **Fáze 3** – Poptávky (množství+jednotka, požadované datum, stavy Nová→Schváleno→Vybráno→Koupeno)
