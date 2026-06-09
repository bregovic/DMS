# DMS – Backlog

Stavy přehazujeme přesouváním řádků mezi sekcemi (✅ Hotovo / 🔨 Probíhá / 📋 Backlog).
Zdroj: původně `2do.txt`.

## 🔨 Probíhá

- [ ] **Cloudflare R2 úložiště** – privátní bucket `dms`, soubory servírovat přes `/api/documents` (řeší dočasnost souborů na Railway). *Čeká na S3 Access Key + Secret.*

## 📋 Backlog

### Práva a účet
- [ ] Aktivní dodavatel uvidí v projektu **jen svoje výdaje**
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
