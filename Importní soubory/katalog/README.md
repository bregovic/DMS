# Datová sada pro modul stavebních procesů a materiálů

Tato sada obsahuje reálná data k naplnění modulu: měrné jednotky, materiály, stavební
procesy a spotřebu materiálu na procesy. Pokrývá kompletní průřez stavbou rodinného domu
od zemních prací a základů přes hrubou stavbu, zateplení a izolace až po dokončovací práce
(omítky, potěry, obklady, podlahy, malby).

## Soubory

| Soubor | Obsah | Počet záznamů |
|--------|-------|----------------|
| `units.csv` | Měrné jednotky | 11 |
| `materials.csv` | Materiály vč. orientačních cen | ~50 |
| `tasks.csv` | Stavební procesy / úkony | ~28 |
| `task_materials.csv` | Spotřeba materiálu na proces | ~70 vazeb |

## Pokryté kategorie procesů

1. **Zemní práce a základy** — výkop rýh, betonáž pásů a desky, hydroizolace spodní stavby
2. **Svislé konstrukce** — nosné zdivo Porotherm 30/24, příčky Porotherm 11.5, Ytong, SDK příčky
3. **Vodorovné konstrukce** — strop Porotherm (nosníky + MIAKO), nadbetonávka, ztužující věnec
4. **Zateplení a fasáda** — ETICS, fasádní omítka, zateplení střechy
5. **Vnitřní úpravy povrchů** — jádrová omítka + štuk, litý potěr, podlahová izolace
6. **Obklady, dlažby, podlahy** — keramika, plovoucí podlahy
7. **Malby a dokončení** — interiérová malba, finální úprava SDK

## Zdroj a platnost cen

Ceny jsou **orientační, bez DPH**, k datu cca červen 2026. Hlavní referenční body byly
ověřeny z veřejných zdrojů:

- **Cihly Porotherm 30 Profi** — cca 65 Kč/ks, spotřeba 16 ks/m² (dek.cz, červen 2026)
- **Cihly Porotherm 24 Profi** — cca 42 Kč/ks, spotřeba 10,7 ks/m²
- **Ytong Klasik 100** — spotřeba 6,7 ks/m² (dek.cz)
- **Beton C20/25** — cca 2 500–4 000 Kč/m³, v datech použito 2 900 Kč/m³ (transportbeton.cz)
- **Beton C16/20** — cca 2 650 Kč/m³

Ceny ostatních materiálů (SDK, izolace, dlažby, omítky, malby) vycházejí z běžné tržní
úrovně roku 2026. U těchto položek se cena liší podle konkrétního výrobku a dodavatele
více než u komoditních materiálů, proto je ber jako rozumný výchozí odhad.

> **Doporučení:** ceny u klíčových/objemově významných materiálů aktualizuj podle aktuálního
> ceníku DEK (nebo vašeho dodavatele) před ostrým použitím. Sloupec `price_updated` slouží
> ke sledování stáří ceny.

## Důležitá upozornění k importu

1. **Komentářové řádky** — soubory `materials.csv`, `tasks.csv` a `task_materials.csv`
   obsahují pro přehlednost řádky začínající znakem `#` (oddělovače kategorií).
   Tyto řádky je nutné při importu **přeskočit**, nebo je před importem smazat.

2. **Oddělovač** — středník (`;`), kódování UTF-8, desetinná tečka.

3. **Pořadí importu** — nejdříve `units.csv`, poté `materials.csv` a `tasks.csv`,
   nakonec `task_materials.csv` (kvůli vazbám přes `code`).

4. **Vztažná základna spotřeby (`consumption_basis`)**:
   - `AREA` — spotřeba na m² plochy (většina případů)
   - `BASE_LENGTH` — spotřeba na bm spodní řady (zakládací malta)
   - `FIXED` — pevná spotřeba, násobí se 1× (objemové položky: pásy, věnce)
   - `PER_COURSE` — na každou řadu (v této sadě zatím nevyužito)

5. **Položky typu FIXED s objemem** — u `ZAK-PASY` a `VENEC-ZB` se spotřeba betonu zadává
   přes objem/délku v položce projektu (`quantity`), protože závisí na konkrétním průřezu
   konstrukce. Hodnota `consumption` u FIXED je vztažena na jednotku zadanou v projektu.

## Upozornění k přesnosti spotřeb

Hodnoty spotřeb a normohodin odpovídají běžným stavebním zvyklostem a technickým listům
výrobců, ale konkrétní spotřeba se liší podle technologie, formátu materiálu, zkušenosti
party a podmínek stavby. Před nasazením na reálné zakázky doporučuji hodnoty zkalibrovat
podle vlastních zkušeností z dokončených staveb — k tomu modul přímo vybízí (data se dají
kdykoli přepsat importem).

Normohodiny (`labor_hours`) a hodinové sazby (`labor_rate`) jsou orientační; sazby se
výrazně liší podle regionu a typu firmy (subdodávka vs. vlastní parta).
