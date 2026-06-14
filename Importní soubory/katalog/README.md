# Datová sada pro modul stavebních procesů a materiálů (ROZŠÍŘENÁ verze)

Kompletní průřez stavbou rodinného domu i rekonstrukcí: od bouracích prací a odvozu suti,
přes základy, hrubou stavbu, krov a střechu, okna a dveře, zateplení, rozvody (elektro,
voda, kanalizace, podlahové topení) až po koupelny, podlahy, obklady a malby.

## Soubory

| Soubor | Obsah | Počet záznamů |
|--------|-------|----------------|
| `units.csv` | Měrné jednotky | 13 |
| `materials.csv` | Materiály vč. orientačních cen | 111 |
| `tasks.csv` | Stavební procesy / úkony | 67 |
| `task_materials.csv` | Spotřeba materiálu na proces (recepty) | 121 vazeb |
| `packages.csv` | Balíčky procesů (složené sestavy „na klíč") | 13 |
| `package_items.csv` | Obsah balíčků (které procesy je tvoří) | 36 vazeb |
| `dms-katalog-naplneni.md` | Vše v jednom, ve formátu DMS šablony k importu | — |

## Balíčky procesů (packages)

Balíček je pojmenovaná sestava procesů, která se počítá jako celek „na klíč" — např.
`PKG-KOUPELNA` (hydroizolace + dlažba + obklad), `PKG-PODLAHA` (izolace + potěr + krytina),
`PKG-STRECHA` (krov + fólie + latě + krytina), `PKG-OKNO` (montáž + parapety). Tabulka
`package_items` určuje, které úkony balíček obsahuje a v jakém poměru (`qty_per_unit` =
množství úkonu na 1 měrnou jednotku balíčku).

Výpočet balíčku = pro každý jeho úkon spočítej množství (`qty_per_unit × množství balíčku`),
dosaď do běžného výpočtu úkonu (materiál + práce) a sečti. Kontrolní propočty: koupelna 4 m²
vyšla ~12 500 Kč bez sanity, skladba podlahy ~1 060 Kč/m² — odpovídá tržní realitě.

Balíčky jsou volitelná nadstavba: model funguje i bez nich, jen umožňují rychle nacenit
typické celky místo skládání jednotlivých procesů ručně.

## Pronájem strojů (jednotka = den)

Doplněny položky pronájmu s jednotkou času (`den`, příp. `m2/měsíc` u lešení) — míchačka,
bourací a vrtací kladivo, vibrační deska/lišta, ponorný vibrátor, minibagr, lešení, pila,
vysoušeč. Ceny jsou **tržní průměr** z viditelných ceníků (Boels uvádí ceny až po přihlášení,
proto průměr z DEK/izomat/menších půjčoven): bourací kladivo ~450 Kč/den, vibrační deska
~650 Kč/den, minibagr ~3 200 Kč/den, lešení ~25 Kč/m²/měsíc.

Pronájem se zadává buď jako materiál v receptu úkonu, nebo přes samostatné „položkové" úkony
(`PRON-*-P`), kde množství = počet dní. Ceny jsou bez DPH, bez dopravy, paliva a kauce.

## Pokryté kategorie

**Materiály:** zdivo a malty, beton a výztuž, stropy, izolace, omítky a potěry, obklady a
dlažby, sádrokarton, podlahy, malby, bourání/kontejnery, okna a dveře, krov a střecha
(taška Bramac, lepenka, asfaltový nátěr, řezivo KVH, latě, střešní okna), elektroinstalace
(kabely, zásuvky, rozvaděč, anténa, data), podlahové topení, sanita a koupelny (WC, sprcha,
vana, umyvadlo), rozvody vody a kanalizace.

**Procesy:** bourací práce, výkopy (strojně i ručně), základy a ztracené bednění, zdění,
SDK příčky, stropy a věnce, krov a pokrývání, natavení lepenky, montáž oken/dveří/střešních
oken, zateplení ETICS, omítky a stěrky, potěry, podlahové topení, elektroinstalace (rozvody,
body, kompletace, rozvaděč), rozvody vody a kanalizace, hydroizolace koupelen, obklady a
dlažby, montáž sanity, pokládka podlah (laminát, vinyl, parkety), malby.

## Zdroj a platnost cen

Ceny jsou **orientační, bez DPH**, k cca červnu 2026. Ověřené referenční body z veřejných
zdrojů (DEK a další dodavatelé/ceníky):

- Porotherm 30 Profi ~65 Kč/ks (16 ks/m²), Porotherm 24 ~42 Kč/ks (10,7 ks/m²)
- Ytong Klasik 100 ~38 Kč/ks (6,7 ks/m²)
- Beton C20/25 ~2 900 Kč/m³, C16/20 ~2 650 Kč/m³ (transportbeton)
- Plastová okna trojsklo: 100×100 ~4 470 Kč, 120×120 ~5 590 Kč, 150×150 dvoukřídlé ~10 050 Kč (VPO)
- Interiérové dveře křídlo ~3 290 Kč, obložková zárubeň ~2 880 Kč (DEK/Hornbach)
- Taška Bramac Classic ~75 Kč/ks (10 ks/m², 43 kg/m²)
- Řezivo KVH ~7 200 Kč/m³
- Kontejner na suť 5 m³ vč. odvozu ~4 200 Kč (firmy na odvoz odpadu)
- Kabel CYKY 3×2,5 ~18 Kč/m, 3×1,5 ~10 Kč/m

Položky bez tvrdého referenčního bodu (část sanity, střešní okna, vchodové dveře,
rozvaděč, podlahové topení) jsou označeny jako "orientačně" a vycházejí z běžné tržní
úrovně 2026. U nich očekávej největší rozptyl.

> **Upozornění:** ceny oken, dveří, sanity a střešních oken silně závisí na konkrétním
> výrobku, rozměru a provedení. Ber je jako výchozí odhad a u reálných zakázek nahraď
> cenou z konkrétní nabídky.

## Důležité k importu

1. **Komentářové řádky `#`** — slouží jako oddělovače kategorií, při importu je přeskoč.
2. **Oddělovač** středník `;`, kódování UTF-8, desetinná tečka.
3. **Pořadí importu:** units → materials + tasks → task_materials.
4. **`consumption_basis`:** `AREA` (na m²), `BASE_LENGTH` (na bm spodní řady), `FIXED`
   (na zadané množství/kus), `PER_COURSE` (na řadu).
5. **Položky FIXED za kus** (okna, dveře, sanita, střešní okna, kontejnery) — množství se
   zadává jako počet kusů v položce projektu. Cena za montáž je v normohodinách úkonu.

## Poznámky k rozsahu

- **Pronájem strojů a lešení** — nově zahrnut s jednotkou času (den / m²-měsíc). Ber jako
  tržní průměr; u konkrétní zakázky nahraď cenou své půjčovny. Kauce, doprava stroje a palivo
  nejsou v ceně.
- **Doprava materiálu** — přidána jako položka (závoz + cena za km); uprav dle vzdálenosti.
- **Komplexní celky „na klíč"** — řešeny přes balíčky (packages), které skládají dílčí
  procesy. To dává přesnější odhad než paušál, ale vyžaduje zadat reálné množství (m², ks, bm).
- **Revize, projektová dokumentace, správní poplatky** — nejsou stavební proces se spotřebou,
  veď je mimo katalog.
- Ceny oken, dveří, sanity a střešních oken nejvíc kolísají podle provedení — jsou to tržní
  průměry k pozdější aktualizaci reálnou nabídkou, přesně jak jsi chtěl.

## Kalibrace

Normohodiny a sazby jsou orientační a liší se podle regionu, party a podmínek. Sazby práce
(`labor_rate`) jsou v rozmezí 280–480 Kč/h podle náročnosti profese. Doporučuji po prvních
dokončených zakázkách hodnoty přepsat podle vlastní reality — k tomu modul přímo slouží.
