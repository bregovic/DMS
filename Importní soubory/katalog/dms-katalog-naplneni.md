# Katalog Procesních tabulek (DMS) – naplnění (ROZŠÍŘENÉ + balíčky)

Vyplněná verze šablony katalogu k importu do DMS. Obsahuje šest bloků:
units, materials, tasks, task_materials a navíc packages + package_items (balíčky procesů).
Ceny orientační bez DPH k cca červnu 2026. Řádky začínající `#` jsou oddělovače kategorií –
při importu je přeskoč. Podrobnosti viz README.md.

## units.csv

```csv
code;name
m;metr běžný
m2;metr čtvereční
m3;metr krychlový
ks;kus
kg;kilogram
t;tuna
bm;běžný metr
h;hodina
pytel;pytel
bal;balení
l;litr
den;den (pronájem)
mesic;měsíc (pronájem)
```

## materials.csv

```csv
code;name;unit_code;weight_per_unit;price;supplier;price_updated;note
# ZDIVO A MALTY
CIH-PTH30;Cihla Porotherm 30 Profi P10;ks;14.700;65.00;DEK;2026-06-01;nosné zdivo tl. 300 mm, spotřeba 16 ks/m2
CIH-PTH24;Cihla Porotherm 24 Profi P10;ks;9.800;42.00;DEK;2026-06-01;nosné zdivo tl. 240 mm, spotřeba 10.7 ks/m2
CIH-PTH115;Cihla Porotherm 11.5 Profi;ks;6.400;22.00;DEK;2026-06-01;příčka tl. 115 mm, spotřeba 8 ks/m2
YT-100;Ytong Klasik 100 P2-500;ks;10.000;38.00;DEK;2026-06-01;příčka tl. 100 mm, spotřeba 6.7 ks/m2
YT-150;Ytong Klasik 150 P2-500;ks;15.000;58.00;DEK;2026-06-01;příčka tl. 150 mm, spotřeba 6.7 ks/m2
MAL-TS;Malta pro tenké spáry Porotherm Profi;pytel;25.000;235.00;DEK;2026-06-01;vydatnost cca 1 pytel/m2 zdiva
MAL-ZAK;Malta zakládací;kg;1.000;9.50;DEK;2026-06-01;zakládací vrstva pod první řadu
LEP-YT;Zdicí malta Ytong;pytel;17.000;185.00;DEK;2026-06-01;tenkovrstvá malta na pórobeton
# BETON A VÝZTUŽ
BET-C2025;Beton C20/25 transportbeton;m3;2400.000;2900.00;Transportbeton;2026-06-01;základové desky, stropy
BET-C1620;Beton C16/20 transportbeton;m3;2350.000;2650.00;Transportbeton;2026-06-01;základové pásy, podkladní beton
KARI-6;Kari síť 6 mm 150x150 mm;m2;4.700;78.00;DEK;2026-06-01;výztuž desek, oka 150x150
VYZT-R10;Betonářská výztuž R10 (ocel B500B);kg;1.000;26.00;DEK;2026-06-01;pruty do věnců a základů
BED-OSB;OSB deska 18 mm (bednění);m2;11.500;245.00;DEK;2026-06-01;ztracené/systémové bednění
ZTR-BED;Tvárnice ztraceného bednění 300 mm;ks;18.000;52.00;DEK;2026-06-01;cca 5 ks/m2 stěny
# STROPY
STROP-NOS;Stropní nosník POT (Porotherm);bm;5.000;195.00;DEK;2026-06-01;nosníky stropu Porotherm
STROP-MIAKO;Stropní vložka MIAKO 19/50;ks;11.000;52.00;DEK;2026-06-01;cca 8 ks/m2 stropu
# IZOLACE
IZO-EPS100;Polystyren EPS 100 tl. 100 mm;m2;2.000;165.00;DEK;2026-06-01;podlahová/soklová izolace, na 1 m2 plochy
IZO-EPS-FAS;Polystyren EPS 70F fasádní tl. 140 mm;m2;2.300;235.00;DEK;2026-06-01;zateplení fasády ETICS
IZO-MIN;Minerální vata tl. 160 mm;m2;6.400;215.00;DEK;2026-06-01;izolace střechy/podkroví
IZO-HYDRO;Hydroizolační pás SBS modifikovaný;m2;4.500;145.00;DEK;2026-06-01;spodní stavba, natavovací
IZO-PE;PE fólie parozábrana;m2;0.200;28.00;DEK;2026-06-01;parozábrana pod skladby
LEP-ETICS;Lepicí a stěrková hmota ETICS;pytel;25.000;215.00;DEK;2026-06-01;cca 6 kg/m2 lepení + 4 kg/m2 stěrka
HMOZD-ETICS;Talířová hmoždinka fasádní;ks;0.050;6.50;DEK;2026-06-01;cca 6 ks/m2 fasády
SIT-PERLINKA;Armovací síťovina perlinka;m2;0.160;42.00;DEK;2026-06-01;do stěrky ETICS, přesah cca 1.1 m2/m2
# OMÍTKY A POTĚRY
OM-JADRO;Jádrová omítka vápenocementová;pytel;30.000;185.00;DEK;2026-06-01;cca 1.5 pytle/m2 při 15 mm
OM-STERK;Štuková omítka jemná;pytel;25.000;245.00;DEK;2026-06-01;cca 0.4 pytle/m2 při 3 mm
STER-PEN;Penetrace pod omítky/stěrky;l;1.000;42.00;DEK;2026-06-01;vydatnost cca 8-10 m2/l
POT-CEM;Cementový potěr (litý);m3;2100.000;3200.00;Transportbeton;2026-06-01;podlahový potěr, na m3
POT-ANHY;Anhydritový potěr litý;m3;2000.000;3400.00;Transportbeton;2026-06-01;samonivelační podlahový potěr
NIV-STER;Nivelační stěrka samonivelační;pytel;25.000;320.00;DEK;2026-06-01;cca 1.5 kg/m2 na 1 mm tloušťky
# OBKLADY A DLAŽBY
DLAZ-KER;Dlažba keramická (standard);m2;22.000;420.00;DEK;2026-06-01;orientační střední cena
OBKL-KER;Obklad keramický (standard);m2;15.000;380.00;DEK;2026-06-01;orientační střední cena
LEP-FLEX;Lepidlo flexibilní C2TE;pytel;25.000;295.00;DEK;2026-06-01;cca 4-6 kg/m2 dle formátu
SPAR-HM;Spárovací hmota;kg;1.000;48.00;DEK;2026-06-01;cca 0.5 kg/m2
HYDRO-STER;Hydroizolační stěrka (koupelny);kg;1.000;95.00;DEK;2026-06-01;cca 1.5 kg/m2 ve 2 vrstvách
HYDRO-PAS;Těsnicí pás do koutů (hydroizolace);bm;0.080;38.00;DEK;2026-06-01;do koutů a rohů sprch
# SÁDROKARTON
SDK-DESKA;Sádrokartonová deska 12.5 mm;m2;9.000;95.00;DEK;2026-06-01;běžná deska, cca 2 m2/m2 příčky
SDK-DESKA-IMP;SDK deska impregnovaná (zelená) 12.5 mm;m2;9.500;125.00;DEK;2026-06-01;do vlhka, koupelny
SDK-PROFIL-CW;Profil CW 75;bm;1.100;42.00;DEK;2026-06-01;svislý profil příčky
SDK-PROFIL-UW;Profil UW 75;bm;1.000;38.00;DEK;2026-06-01;vodorovný profil (obvod)
SDK-IZO;Izolace do příčky minerální 60 mm;m2;1.800;65.00;DEK;2026-06-01;akustická výplň příčky
SDK-SROUB;Šroub TN do SDK;ks;0.005;0.40;DEK;2026-06-01;cca 25 ks/m2 příčky
SDK-TMEL;Spárovací tmel SDK;kg;1.000;28.00;DEK;2026-06-01;cca 0.4 kg/m2
SDK-PASKA;Výztužná páska sklotextilní;bm;0.020;3.50;DEK;2026-06-01;na spáry desek
# PODLAHY
POD-LAMINAT;Laminátová podlaha (standard);m2;8.000;320.00;DEK;2026-06-01;orientační střední cena
POD-VINYL;Vinylová podlaha SPC;m2;9.500;480.00;DEK;2026-06-01;orientační střední cena
POD-PARKET;Dřevěná parketa třívrstvá;m2;9.000;850.00;DEK;2026-06-01;orientační střední cena
POD-PODLOZ;Podložka pod plovoucí podlahu;m2;0.300;45.00;DEK;2026-06-01;tlumicí podložka
POD-LISTA;Soklová lišta;bm;0.300;55.00;DEK;2026-06-01;obvodová lišta podlahy
# MALBY A NÁTĚRY
MAL-INTER;Malířská barva interiérová;l;1.300;38.00;DEK;2026-06-01;vydatnost cca 7-8 m2/l na 1 nátěr
PEN-PODKLAD;Penetrace univerzální;l;1.000;42.00;DEK;2026-06-01;vydatnost cca 8-10 m2/l
# BOURACÍ PRÁCE A ODVOZ SUTI
KONT-SUT;Kontejner na suť 5 m3 (přistavení + odvoz);ks;0.000;4200.00;Odpady;2026-06-01;sut cihly/beton, cena vč. odvozu a likvidace, bez DPH
KONT-SMES;Kontejner směsný odpad 9 m3 (přistavení + odvoz);ks;0.000;6500.00;Odpady;2026-06-01;objemný/směsný odpad, vč. odvozu
PYTEL-SUT;Big bag na suť 1 m3 (vč. odvozu);ks;0.000;1100.00;Odpady;2026-06-01;malé množství suti
# OKNA A DVEŘE
OKNO-PVC-100;Plastové okno 100x100 trojsklo;ks;25.000;4470.00;VPO;2026-06-01;jednokřídlé, bez montáže
OKNO-PVC-120;Plastové okno 120x120 trojsklo;ks;35.000;5590.00;VPO;2026-06-01;jednokřídlé, bez montáže
OKNO-PVC-150;Plastové okno 150x150 trojsklo dvoukřídlé;ks;55.000;10050.00;VPO;2026-06-01;dvoukřídlé, bez montáže
OKNO-MONT-MAT;Montážní materiál okna (PUR pěna, kotvy, pásky);ks;1.500;450.00;DEK;2026-06-01;na 1 okno
PARAPET-VEN;Parapet venkovní hliníkový;bm;1.200;320.00;DEK;2026-06-01;dle šířky okna
PARAPET-VNI;Parapet vnitřní;bm;1.500;280.00;DEK;2026-06-01;dle šířky okna
STRECH-OKNO;Střešní okno (standard cca 78x118);ks;28.000;9500.00;Velux;2026-06-01;vč. lemování, bez montáže, orientačně
DVE-INT-KR;Interiérové dveře křídlo (standard);ks;22.000;3290.00;DEK;2026-06-01;dveřní křídlo
DVE-INT-ZAR;Obložková zárubeň;ks;18.000;2880.00;DEK;2026-06-01;k interiérovým dveřím
DVE-INT-KLI;Kování (klika) interiérové;ks;0.800;650.00;DEK;2026-06-01;na 1 dveře
DVE-VCHOD;Vchodové dveře bezpečnostní;ks;45.000;18500.00;DEK;2026-06-01;vč. zárubně, bez montáže, orientačně
# KROV A STŘECHA
REZ-KVH;Řezivo KVH hranol konstrukční;m3;520.000;7200.00;DEK;2026-06-01;krov, nosné konstrukce
REZ-LAT;Střešní lať 40x60 mm;bm;1.200;22.00;DEK;2026-06-01;cca 3-3.5 bm/m2 střechy dle latění
TASK-BRAMAC;Střešní taška betonová Bramac Classic;ks;4.300;75.00;DEK;2026-06-01;cca 10 ks/m2, 43 kg/m2
TASK-HREB;Hřebenáč betonový;ks;5.000;120.00;DEK;2026-06-01;cca 2.5 ks/bm hřebene
FOLIE-DIF;Difuzní fólie podstřešní;m2;0.180;42.00;DEK;2026-06-01;pojistná hydroizolace pod latě
LEPENKA-ASF;Asfaltová lepenka (těžká natavovací);m2;3.500;65.00;DEK;2026-06-01;ploché střechy, bednění
ASF-NATER;Asfaltový penetrační nátěr;l;1.000;85.00;DEK;2026-06-01;vydatnost cca 3-4 m2/l
HREBIK-STR;Hřebíky/vruty střešní;kg;1.000;75.00;DEK;2026-06-01;spotřební
# ELEKTROINSTALACE
EL-CYKY-15;Kabel CYKY 3x1.5 (světla);bm;0.100;10.00;DEK;2026-06-01;světelné okruhy
EL-CYKY-25;Kabel CYKY 3x2.5 (zásuvky);bm;0.150;18.00;DEK;2026-06-01;zásuvkové okruhy
EL-CYKY-54;Kabel CYKY 5x4 (sporák/přívod);bm;0.350;48.00;DEK;2026-06-01;silové přívody
EL-KRABICE;Instalační krabice pod omítku;ks;0.080;18.00;DEK;2026-06-01;pod zásuvky/vypínače
EL-ZASUVKA;Zásuvka vč. rámečku (standard);ks;0.150;120.00;DEK;2026-06-01;design standard
EL-VYPINAC;Vypínač vč. rámečku (standard);ks;0.120;110.00;DEK;2026-06-01;design standard
EL-CHRANIC;Husí krk / chránička;bm;0.050;8.00;DEK;2026-06-01;ochrana kabelů
EL-ROZVAD;Rozvaděč bytový vč. jističů;ks;8.000;6500.00;DEK;2026-06-01;na dům, orientačně
EL-DATA;Datová zásuvka + UTP rozvod;ks;0.200;320.00;DEK;2026-06-01;slaboproud
EL-ANTENA;Anténní rozvod + zásuvka;ks;0.200;280.00;DEK;2026-06-01;koaxiál + zásuvka
# PODLAHOVÉ TOPENÍ
PT-TRUBKA;Trubka podlahového topení PEX;bm;0.100;28.00;DEK;2026-06-01;cca 6-7 bm/m2 plochy
PT-SYSDESKA;Systémová deska podlahového topení;m2;1.200;180.00;DEK;2026-06-01;nopová deska pod trubky
PT-ROZDEL;Rozdělovač podlahového topení;ks;5.000;4500.00;DEK;2026-06-01;na okruh/podlaží, orientačně
# SANITA A KOUPELNY
WC-ZAVES;WC závěsné vč. sedátka;ks;28.000;3500.00;DEK;2026-06-01;keramika, orientačně
WC-MODUL;Podomítkový modul WC vč. tlačítka;ks;12.000;3200.00;DEK;2026-06-01;instalační prvek
UMYV-SET;Umyvadlo vč. baterie a sifonu;ks;18.000;3200.00;DEK;2026-06-01;orientačně
SPRCHA-KOUT;Sprchový kout (standard);ks;35.000;8500.00;DEK;2026-06-01;vč. dveří, bez vaničky
SPRCHA-VAN;Sprchová vanička;ks;25.000;3200.00;DEK;2026-06-01;akrylát/litý mramor
SPRCHA-BAT;Sprchová baterie vč. setu;ks;3.500;2800.00;DEK;2026-06-01;orientačně
VANA-AKRYL;Vana akrylátová vč. nožiček;ks;25.000;4500.00;DEK;2026-06-01;orientačně
# ROZVODY VODY A ODPADU
VOD-PPR;Trubka vody PPR + tvarovky;bm;0.150;55.00;DEK;2026-06-01;rozvod studené/teplé vody
ODPAD-HT;Odpadní potrubí HT DN50/DN110;bm;0.500;95.00;DEK;2026-06-01;kanalizace vnitřní
# PRONÁJEM STROJŮ A NÁŘADÍ (jednotka = den, tržní průměr Boels/DEK/půjčovny)
PRON-MICHACKA;Pronájem míchačky 150 l;den;0.000;350.00;Půjčovna;2026-06-01;tržní průměr, bez DPH, bez dopravy a paliva
PRON-BOURAK;Pronájem bouracího kladiva (10-12 kg);den;0.000;450.00;Půjčovna;2026-06-01;tržní průměr Boels/DEK, sekáč v ceně
PRON-VRTACKA;Pronájem vrtacího kladiva SDS-max;den;0.000;350.00;Půjčovna;2026-06-01;tržní průměr
PRON-VIBDESKA;Pronájem vibrační desky (150-220 kg);den;0.000;650.00;Půjčovna;2026-06-01;hutnění základů/podkladů
PRON-VIBLISTA;Pronájem vibrační lišty na beton;den;0.000;450.00;Půjčovna;2026-06-01;hlazení betonových desek
PRON-PONORVIB;Pronájem ponorného vibrátoru betonu;den;0.000;400.00;Půjčovna;2026-06-01;hutnění betonu
PRON-RYPADLO;Pronájem minibagru (1.5-3 t) bez obsluhy;den;0.000;3200.00;Půjčovna;2026-06-01;tržní průměr, bez dopravy a obsluhy
PRON-LESENI;Pronájem fasádního lešení;m2;0.000;25.00;Půjčovna;2026-06-01;cena za m2 a měsíc, orientačně
PRON-STOJ-PILA;Pronájem stolní pily/okružní pily;den;0.000;300.00;Půjčovna;2026-06-01;řezání řeziva/dlažby
PRON-MICHADLO;Pronájem ručního míchadla;den;0.000;200.00;Půjčovna;2026-06-01;míchání lepidel/malt
PRON-VYSUSEC;Pronájem stavebního vysoušeče;den;0.000;250.00;Půjčovna;2026-06-01;vysoušení po mokrých procesech
# DOPRAVA
DOPRAVA-MAT;Doprava materiálu (sklápěč/valník);ks;0.000;1200.00;Doprava;2026-06-01;1 závoz v rámci okresu, orientačně, bez DPH
DOPRAVA-KM;Doprava materiálu za km;m;0.000;35.00;Doprava;2026-06-01;cena za 1 km nad rámec závozu
# SPOJOVACÍ A SPOTŘEBNÍ
PUR-PENA;PUR pěna montážní;ks;0.900;185.00;DEK;2026-06-01;dóza 750 ml
SILIKON;Silikon sanitární;ks;0.310;145.00;DEK;2026-06-01;kartuše 310 ml
KOTVY-RAMOVE;Rámové hmoždinky/kotvy oken;bal;0.500;220.00;DEK;2026-06-01;balení na okno
```

## tasks.csv

```csv
code;name;unit_code;labor_hours;labor_rate;course_height;note
# BOURACÍ PRÁCE A PŘÍPRAVA
BOUR-PRICKA;Bourání příčky (zděné);m2;0.700;350.00;;ruční bourání příčky tl. do 150 mm
BOUR-NOSNA;Bourání nosné stěny;m3;3.500;450.00;;náročné, vč. zajištění
BOUR-OMITKA;Otlučení omítky;m2;0.350;320.00;;ruční otlučení vč. očištění
BOUR-DLAZBA;Demontáž dlažby/obkladu;m2;0.450;320.00;;vč. otlučení lepidla
BOUR-PODLAHA;Demontáž podlahové krytiny;m2;0.250;300.00;;laminát/koberec/PVC
ODVOZ-SUT;Odvoz a likvidace suti (kontejner);ks;0.500;350.00;;manipulace + objednání kontejneru
# ZEMNÍ PRÁCE A ZÁKLADY
ZEM-VYKOP;Výkop základových rýh (strojně);m3;0.350;450.00;;hloubení rýh rypadlem vč. ručního dočištění
ZEM-VYKOP-RUC;Výkop ručně (nepřístupná místa);m3;2.500;350.00;;ruční hloubení
ZAK-PASY;Betonáž základových pásů;m3;1.200;400.00;;beton do rýh vč. urovnání
ZAK-DESKA;Betonáž základové desky;m2;0.450;400.00;;deska tl. 150 mm vč. kari sítě
ZAK-HYDRO;Položení hydroizolace spodní stavby;m2;0.250;380.00;;natavení SBS pásu vč. penetrace
ZTR-BEDNENI;Zdění ztraceného bednění vč. zálivky;m2;0.700;400.00;;tvárnice + výztuž + beton
# SVISLÉ KONSTRUKCE
ZED-PTH30;Vyzdění nosné stěny Porotherm 30;m2;0.900;380.00;0.249;obvodové/nosné zdivo tl. 300 mm
ZED-PTH24;Vyzdění nosné stěny Porotherm 24;m2;0.850;380.00;0.249;nosné zdivo tl. 240 mm
ZED-PTH115;Vyzdění příčky Porotherm 11.5;m2;0.700;350.00;0.249;příčka tl. 115 mm
ZED-YT100;Vyzdění příčky Ytong 100;m2;0.600;350.00;0.249;pórobetonová příčka tl. 100 mm
SDK-PRICKA;Montáž SDK příčky (jednoduché opláštění);m2;0.750;390.00;;příčka CW75, oboustranně 1x deska, vč. izolace
# VODOROVNÉ KONSTRUKCE
STROP-PTH;Montáž stropu Porotherm (nosníky + MIAKO);m2;1.100;420.00;;vč. uložení nosníků a vložek, bez nadbetonávky
STROP-BET;Nadbetonávka stropu;m2;0.350;400.00;;betonová deska tl. 60 mm vč. kari sítě
VENEC-ZB;Betonáž ztužujícího věnce;bm;0.600;400.00;;vč. výztuže a bednění
# KROV, STŘECHA, POKRÝVÁNÍ
KROV-MONT;Montáž krovu (tesařské práce);m2;1.800;480.00;;vázaný krov vč. spojů, na m2 půdorysu střechy
STR-FOLIE;Pokládka difuzní fólie + kontralatě;m2;0.250;420.00;;pojistná hydroizolace
STR-LATE;Laťování střechy;m2;0.350;420.00;;montáž střešních latí
STR-KRYTI;Pokrývání betonovou taškou;m2;0.600;450.00;;pokládka tašek vč. hřebene
STR-LEPENKA;Natavení asfaltové lepenky;m2;0.400;430.00;;vč. asfaltového nátěru, ploché střechy
STR-OKNO-MONT;Montáž střešního okna;ks;4.000;480.00;;vč. lemování a napojení
# ZATEPLENÍ A FASÁDA
FAS-ETICS;Zateplení fasády ETICS;m2;0.850;420.00;;lepení + kotvení + stěrka + perlinka EPS 140
FAS-OMITKA;Fasádní omítka tenkovrstvá;m2;0.450;420.00;;probarvená silikonová omítka vč. penetrace
STRECHA-IZO;Zateplení střechy minerální vatou;m2;0.500;400.00;;mezi/pod krokve vč. parozábrany
# OKNA A DVEŘE
OKNO-MONT;Montáž plastového okna;ks;2.500;450.00;;vč. ukotvení, pěnění, parapetů
DVE-INT-MONT;Montáž interiérových dveří se zárubní;ks;2.000;420.00;;obložková zárubeň + křídlo + kování
DVE-VCHOD-MONT;Montáž vchodových dveří;ks;3.500;480.00;;vč. ukotvení a seřízení
# VNITŘNÍ ÚPRAVY POVRCHŮ
OM-VNITR;Vnitřní omítka jádrová + štuk;m2;0.650;380.00;;dvouvrstvá omítka stěn vč. štuku
STER-VNITR;Stěrkování a broušení stěn;m2;0.350;360.00;;finální stěrka pod malbu
POT-LITY;Litý potěr podlahový;m2;0.250;350.00;;anhydritový/cementový potěr tl. 50 mm
POD-IZO-EPS;Položení podlahové izolace EPS;m2;0.200;320.00;;EPS 100 tl. 100 mm vč. PE fólie
# PODLAHOVÉ TOPENÍ
PT-MONT;Montáž podlahového topení (teplovodní);m2;0.400;420.00;;systémová deska + trubky, bez potěru a rozdělovače
# ELEKTROINSTALACE
EL-ROZVOD;Elektroinstalace - hrubé rozvody;m2;0.450;420.00;;sekání drážek, krabice, tahání kabelů, na m2 podlahy
EL-KOMPLET;Kompletace zásuvek a vypínačů;ks;0.300;380.00;;osazení přístrojů
EL-BOD;Elektroinstalační bod (zásuvka/vypínač/vývod);ks;0.600;400.00;;1 bod vč. krabice, kabelu a přístroje
EL-ROZVAD-MONT;Montáž a zapojení rozvaděče;ks;8.000;480.00;;vč. jištění a zapojení
EL-DATA-MONT;Montáž datového/anténního rozvodu;ks;0.500;400.00;;1 bod slaboproud
# ROZVODY VODY A KANALIZACE
VOD-ROZVOD;Rozvod vody (vnitřní);bm;0.300;450.00;;PPR potrubí vč. tvarovek
ODPAD-ROZVOD;Rozvod kanalizace (vnitřní);bm;0.350;450.00;;HT potrubí vč. spádování
# OBKLADY, DLAŽBY, KOUPELNY
KOUP-HYDRO;Hydroizolace koupelny (stěrka + pásy);m2;0.350;400.00;;2 vrstvy stěrky + těsnicí pásy do koutů
OBKL-MONT;Obložení stěn keramickým obkladem;m2;0.900;420.00;;vč. lepidla a spárování
DLAZ-MONT;Pokládka keramické dlažby;m2;0.800;420.00;;vč. lepidla a spárování
WC-MONT;Montáž WC vč. modulu;ks;3.000;480.00;;podomítkový modul + závěsné WC
UMYV-MONT;Montáž umyvadla vč. baterie;ks;1.500;480.00;;vč. napojení vody a odpadu
SPRCHA-MONT;Montáž sprchového koutu vč. vaničky;ks;4.000;480.00;;kout + vanička + baterie
VANA-MONT;Montáž vany vč. baterie;ks;3.500;480.00;;vč. napojení a obezdění
# PODLAHY
POD-LAM-MONT;Pokládka laminátové/vinylové podlahy;m2;0.300;350.00;;plovoucí podlaha vč. podložky a lišt
POD-PARKET-MONT;Pokládka dřevěných parket;m2;0.450;420.00;;třívrstvá parketa, plovoucí nebo lepená
NIV-MONT;Nivelace podlahy stěrkou;m2;0.200;350.00;;vyrovnání podkladu před pokládkou
# MALBY A DOKONČENÍ
MALBA-INT;Malba interiéru (2 vrstvy);m2;0.150;280.00;;vč. penetrace a 2x nátěr
SDK-FINISH;Finální úprava SDK (tmelení spár);m2;0.250;320.00;;tmelení, páskování, přebroušení
# PRONÁJEM JAKO POLOŽKA (jednotka = den/m2, materiál nese vlastní cenu pronájmu)
PRON-MICHACKA-P;Pronájem míchačky (položka);den;0.000;0.00;;přenese cenu pronájmu, množství = počet dní
PRON-BOURAK-P;Pronájem bouracího kladiva (položka);den;0.000;0.00;;množství = počet dní
PRON-VIBDESKA-P;Pronájem vibrační desky (položka);den;0.000;0.00;;množství = počet dní
PRON-RYPADLO-P;Pronájem minibagru (položka);den;0.000;0.00;;množství = počet dní
PRON-LESENI-P;Pronájem lešení (položka);m2;0.000;0.00;;množství = m2 lešení (cena za měsíc)
# HUTNĚNÍ A POMOCNÉ ZEMNÍ
ZEM-HUTNENI;Hutnění podkladu vibrační deskou;m2;0.120;350.00;;zhutnění štěrkového polštáře
ZEM-STERK;Rozprostření a urovnání štěrku;m3;0.400;350.00;;podkladní vrstva pod desku
# STROPNÍ A BETONÁŽ DOPLŇKY
BET-VIBR;Betonáž s vibrováním (ponorný vibrátor);m3;0.800;400.00;;hutnění čerstvého betonu
# KOMÍN
KOMIN-MONT;Montáž komínového systému;bm;1.200;480.00;;cca na bm výšky komínu vč. tvárnic a vložky
# PARAPETY A DOKONČENÍ OKEN
PARAPET-MONT;Montáž parapetů (vnitřní + venkovní);ks;0.800;400.00;;na 1 okno
# SCHODIŠTĚ
SCHOD-BET;Betonáž železobetonového schodiště;m2;2.500;480.00;;vč. bednění a výztuže, na m2 půdorysu
```

## task_materials.csv

```csv
task_code;material_code;consumption;consumption_basis;waste_factor;note
# BOURÁNÍ - jen práce + odvoz, materiál minimální
ODVOZ-SUT;KONT-SUT;1.000;FIXED;1.000;1 kontejner na zadané množství odvozů
# ZÁKLADY
ZAK-PASY;BET-C1620;1.000;FIXED;1.030;1 m3 betonu na 1 m3 pásu (zadává se objem)
ZAK-DESKA;BET-C2025;0.150;AREA;1.030;deska tl. 150 mm
ZAK-DESKA;KARI-6;1.000;AREA;1.150;1 vrstva kari, přesahy
ZAK-HYDRO;IZO-HYDRO;1.000;AREA;1.150;přesahy pásů
ZAK-HYDRO;STER-PEN;0.120;AREA;1.000;penetrace 0.12 l/m2
ZTR-BEDNENI;ZTR-BED;5.000;AREA;1.030;5 ks/m2 stěny
ZTR-BEDNENI;BET-C2025;0.140;AREA;1.030;zálivka tvárnic
ZTR-BEDNENI;VYZT-R10;6.000;AREA;1.050;svislá+vodorovná výztuž
# ZDIVO POROTHERM 30
ZED-PTH30;CIH-PTH30;16.000;AREA;1.020;16 ks/m2
ZED-PTH30;MAL-TS;1.000;AREA;1.050;cca 1 pytel/m2
ZED-PTH30;MAL-ZAK;12.000;BASE_LENGTH;1.000;zakládací malta spodní řady, kg/bm
# ZDIVO POROTHERM 24
ZED-PTH24;CIH-PTH24;10.700;AREA;1.020;10.7 ks/m2
ZED-PTH24;MAL-TS;0.800;AREA;1.050;
ZED-PTH24;MAL-ZAK;10.000;BASE_LENGTH;1.000;kg/bm spodní řady
# PŘÍČKA POROTHERM 11.5
ZED-PTH115;CIH-PTH115;8.000;AREA;1.020;8 ks/m2
ZED-PTH115;MAL-TS;0.500;AREA;1.050;
ZED-PTH115;MAL-ZAK;6.000;BASE_LENGTH;1.000;kg/bm
# PŘÍČKA YTONG 100
ZED-YT100;YT-100;6.700;AREA;1.020;6.7 ks/m2
ZED-YT100;LEP-YT;0.400;AREA;1.050;cca 0.4 pytle/m2
ZED-YT100;MAL-ZAK;5.000;BASE_LENGTH;1.000;kg/bm
# SDK PŘÍČKA
SDK-PRICKA;SDK-DESKA;2.000;AREA;1.100;oboustranně, 2 m2 desky/m2 příčky
SDK-PRICKA;SDK-PROFIL-CW;2.800;AREA;1.050;svislé profily á 0.625 m
SDK-PRICKA;SDK-PROFIL-UW;0.800;AREA;1.050;obvodové profily
SDK-PRICKA;SDK-IZO;1.000;AREA;1.050;výplň
SDK-PRICKA;SDK-SROUB;25.000;AREA;1.050;cca 25 ks/m2
# STROP
STROP-PTH;STROP-NOS;1.250;AREA;1.020;cca 1.25 bm nosníku/m2
STROP-PTH;STROP-MIAKO;8.000;AREA;1.020;8 vložek/m2
STROP-BET;BET-C2025;0.060;AREA;1.030;nadbetonávka 60 mm
STROP-BET;KARI-6;1.000;AREA;1.150;
VENEC-ZB;BET-C2025;0.030;FIXED;1.030;objem dle průřezu věnce (zadat za bm v quantity)
VENEC-ZB;VYZT-R10;8.000;FIXED;1.050;cca 8 kg oceli na bm věnce
# KROV A STŘECHA
KROV-MONT;REZ-KVH;0.045;AREA;1.080;cca 0.045 m3 řeziva na m2 střechy
KROV-MONT;HREBIK-STR;0.300;AREA;1.050;spojovací materiál
STR-FOLIE;FOLIE-DIF;1.150;AREA;1.100;přesahy fólie
STR-FOLIE;REZ-LAT;1.700;AREA;1.050;kontralatě
STR-LATE;REZ-LAT;3.300;AREA;1.050;cca 3.3 bm latí/m2
STR-KRYTI;TASK-BRAMAC;10.000;AREA;1.050;10 ks/m2
STR-KRYTI;TASK-HREB;2.500;BASE_LENGTH;1.050;hřebenáče na bm hřebene
STR-KRYTI;HREBIK-STR;0.150;AREA;1.050;příchytky
STR-LEPENKA;LEPENKA-ASF;1.150;AREA;1.100;přesahy pásů
STR-LEPENKA;ASF-NATER;0.300;AREA;1.000;penetrace 0.3 l/m2
STR-OKNO-MONT;STRECH-OKNO;1.000;FIXED;1.000;1 okno (zadává se počet)
# ZATEPLENÍ FASÁDY ETICS
FAS-ETICS;IZO-EPS-FAS;1.000;AREA;1.050;desky EPS
FAS-ETICS;LEP-ETICS;1.700;AREA;1.050;lepení+stěrka cca 1.7 pytle/m2 (10 kg/m2)
FAS-ETICS;HMOZD-ETICS;6.000;AREA;1.050;6 ks/m2
FAS-ETICS;SIT-PERLINKA;1.100;AREA;1.100;přesahy
FAS-OMITKA;OM-STERK;0.400;AREA;1.050;tenkovrstvá omítka
FAS-OMITKA;STER-PEN;0.150;AREA;1.000;
# STŘECHA - IZOLACE
STRECHA-IZO;IZO-MIN;1.000;AREA;1.100;minerální vata
STRECHA-IZO;IZO-PE;1.150;AREA;1.100;parozábrana s přesahy
# OKNA A DVEŘE
OKNO-MONT;OKNO-MONT-MAT;1.000;FIXED;1.000;montážní materiál na okno
OKNO-MONT;PARAPET-VNI;1.200;FIXED;1.050;vnitřní parapet, bm na okno
OKNO-MONT;PARAPET-VEN;1.200;FIXED;1.050;venkovní parapet, bm na okno
DVE-INT-MONT;DVE-INT-KR;1.000;FIXED;1.000;křídlo
DVE-INT-MONT;DVE-INT-ZAR;1.000;FIXED;1.000;zárubeň
DVE-INT-MONT;DVE-INT-KLI;1.000;FIXED;1.000;kování
DVE-VCHOD-MONT;DVE-VCHOD;1.000;FIXED;1.000;vchodové dveře
DVE-VCHOD-MONT;OKNO-MONT-MAT;1.000;FIXED;1.000;montážní materiál
# VNITŘNÍ OMÍTKY A STĚRKY
OM-VNITR;OM-JADRO;1.500;AREA;1.050;cca 1.5 pytle/m2 (15 mm)
OM-VNITR;OM-STERK;0.400;AREA;1.050;štuk 3 mm
STER-VNITR;NIV-STER;0.500;AREA;1.050;cca 0.5 pytle/m2
STER-VNITR;STER-PEN;0.120;AREA;1.000;penetrace
# POTĚR
POT-LITY;POT-ANHY;0.050;AREA;1.030;tl. 50 mm
# PODLAHOVÁ IZOLACE
POD-IZO-EPS;IZO-EPS100;1.000;AREA;1.050;EPS 100
POD-IZO-EPS;IZO-PE;1.100;AREA;1.100;PE fólie
# PODLAHOVÉ TOPENÍ
PT-MONT;PT-TRUBKA;6.500;AREA;1.050;cca 6.5 bm trubky/m2
PT-MONT;PT-SYSDESKA;1.000;AREA;1.050;systémová deska
# ELEKTROINSTALACE
EL-ROZVOD;EL-CYKY-25;3.000;AREA;1.100;cca 3 bm kabelu zásuvky/m2
EL-ROZVOD;EL-CYKY-15;2.000;AREA;1.100;cca 2 bm kabelu světla/m2
EL-ROZVOD;EL-KRABICE;0.800;AREA;1.050;cca 0.8 krabice/m2
EL-ROZVOD;EL-CHRANIC;1.500;AREA;1.050;chránička
EL-BOD;EL-ZASUVKA;1.000;FIXED;1.000;1 přístroj na bod (orientačně zásuvka)
EL-BOD;EL-KRABICE;1.000;FIXED;1.000;krabice
EL-BOD;EL-CYKY-25;4.000;FIXED;1.100;cca 4 bm kabelu na bod
EL-ROZVAD-MONT;EL-ROZVAD;1.000;FIXED;1.000;rozvaděč
EL-DATA-MONT;EL-DATA;1.000;FIXED;1.000;datový bod
# VODA A KANALIZACE
VOD-ROZVOD;VOD-PPR;1.050;AREA;1.100;bm potrubí na bm rozvodu (zadat délku)
ODPAD-ROZVOD;ODPAD-HT;1.050;AREA;1.100;bm potrubí na bm rozvodu (zadat délku)
# KOUPELNY - HYDROIZOLACE A OBKLADY
KOUP-HYDRO;HYDRO-STER;3.000;AREA;1.050;cca 3 kg/m2 ve 2 vrstvách
KOUP-HYDRO;HYDRO-PAS;0.500;AREA;1.100;těsnicí pásy do koutů, bm/m2
OBKL-MONT;OBKL-KER;1.000;AREA;1.100;ztratné na řezání
OBKL-MONT;LEP-FLEX;0.200;AREA;1.050;cca 5 kg/m2 = 0.2 pytle
OBKL-MONT;SPAR-HM;0.500;AREA;1.050;
DLAZ-MONT;DLAZ-KER;1.000;AREA;1.100;
DLAZ-MONT;LEP-FLEX;0.240;AREA;1.050;cca 6 kg/m2
DLAZ-MONT;SPAR-HM;0.500;AREA;1.050;
# SANITA
WC-MONT;WC-ZAVES;1.000;FIXED;1.000;WC
WC-MONT;WC-MODUL;1.000;FIXED;1.000;podomítkový modul
UMYV-MONT;UMYV-SET;1.000;FIXED;1.000;umyvadlo set
SPRCHA-MONT;SPRCHA-KOUT;1.000;FIXED;1.000;kout
SPRCHA-MONT;SPRCHA-VAN;1.000;FIXED;1.000;vanička
SPRCHA-MONT;SPRCHA-BAT;1.000;FIXED;1.000;baterie
VANA-MONT;VANA-AKRYL;1.000;FIXED;1.000;vana
VANA-MONT;SPRCHA-BAT;1.000;FIXED;1.000;baterie
# PODLAHY PLOVOUCÍ
POD-LAM-MONT;POD-LAMINAT;1.000;AREA;1.080;ztratné
POD-LAM-MONT;POD-PODLOZ;1.000;AREA;1.050;
POD-LAM-MONT;POD-LISTA;0.450;AREA;1.100;soklová lišta bm/m2
POD-PARKET-MONT;POD-PARKET;1.000;AREA;1.080;
POD-PARKET-MONT;POD-PODLOZ;1.000;AREA;1.050;
POD-PARKET-MONT;POD-LISTA;0.450;AREA;1.100;
NIV-MONT;NIV-STER;1.500;AREA;1.050;cca 1.5 pytle/m2 dle tloušťky
# MALBY
MALBA-INT;MAL-INTER;0.280;AREA;1.050;2 vrstvy, cca 0.28 l/m2
MALBA-INT;PEN-PODKLAD;0.110;AREA;1.000;penetrace
# SDK FINISH
SDK-FINISH;SDK-TMEL;0.400;AREA;1.050;kg/m2
SDK-FINISH;SDK-PASKA;1.700;AREA;1.100;bm pásky na m2
# PRONÁJMY - položka přenáší cenu pronájmu z materiálu (FIXED, množství = dny/m2)
PRON-MICHACKA-P;PRON-MICHACKA;1.000;FIXED;1.000;1 den pronájmu na jednotku množství
PRON-BOURAK-P;PRON-BOURAK;1.000;FIXED;1.000;1 den pronájmu
PRON-VIBDESKA-P;PRON-VIBDESKA;1.000;FIXED;1.000;1 den pronájmu
PRON-RYPADLO-P;PRON-RYPADLO;1.000;FIXED;1.000;1 den pronájmu
PRON-LESENI-P;PRON-LESENI;1.000;AREA;1.000;m2 lešení (cena za měsíc)
# HUTNĚNÍ A ŠTĚRK
ZEM-STERK;DOPRAVA-MAT;0.000;FIXED;1.000;volitelná doprava štěrku (zadat ručně dle potřeby)
# KOMÍN (orientačně - tvárnice a vložka jako paušál na bm)
KOMIN-MONT;BET-C2025;0.020;AREA;1.030;zálivka, na bm výšky
# PARAPETY
PARAPET-MONT;PARAPET-VNI;1.200;FIXED;1.050;vnitřní parapet bm/okno
PARAPET-MONT;PARAPET-VEN;1.200;FIXED;1.050;venkovní parapet bm/okno
PARAPET-MONT;SILIKON;0.500;FIXED;1.000;těsnění
# SCHODIŠTĚ
SCHOD-BET;BET-C2025;0.180;AREA;1.050;beton schodiště
SCHOD-BET;VYZT-R10;18.000;AREA;1.050;výztuž schodiště kg/m2
SCHOD-BET;BED-OSB;1.200;AREA;1.100;bednění
# DOPLNĚK: okno - montážní pěna a kotvy navázané na montáž okna
OKNO-MONT;PUR-PENA;1.500;FIXED;1.050;cca 1.5 dózy na okno
OKNO-MONT;KOTVY-RAMOVE;1.000;FIXED;1.000;kotvy na okno
```

## packages.csv

```csv
code;name;unit_code;note
# HRUBÁ STAVBA
PKG-ZAKLADY;Základy na klíč (výkop, pásy, deska, hydroizolace);m2;komplet spodní stavba na m2 desky
PKG-OBVOD-STENA;Obvodová stěna na klíč (zdivo + věnec);m2;nosné zdivo vč. věnce
PKG-STROP;Strop na klíč (nosníky, vložky, nadbetonávka);m2;kompletní strop
# STŘECHA
PKG-STRECHA;Střecha na klíč (krov, fólie, latě, krytina);m2;šikmá střecha vč. pokrytí
PKG-STRECHA-IZO;Zateplená střecha (krov + izolace + krytina + SDK);m2;vč. zateplení a podhledu
# OKNA A DVEŘE
PKG-OKNO;Okno na klíč (okno + montáž + parapety);ks;dodávka a montáž okna vč. parapetů
PKG-DVERE-INT;Interiérové dveře na klíč;ks;dveře + zárubeň + kování + montáž
# FASÁDA
PKG-FASADA;Zateplená fasáda na klíč (ETICS + omítka);m2;kompletní zateplení vč. finální omítky
# VNITŘNÍ POVRCHY
PKG-OMITKY;Vnitřní omítky a malby (omítka + štuk + malba);m2;komplet stěny na malbu
PKG-PODLAHA;Skladba podlahy (izolace + potěr + krytina);m2;komplet podlaha vč. krytiny
PKG-PODLAHA-PT;Podlaha s podlahovým topením (izolace + PT + potěr + krytina);m2;komplet vč. topení
# KOUPELNA
PKG-KOUPELNA;Koupelna na klíč (hydroizolace + obklad + dlažba + sanita);m2;kompletní realizace koupelny na m2
# ELEKTRO
PKG-ELEKTRO;Elektroinstalace na klíč (rozvody + kompletace + rozvaděč);m2;komplet elektro na m2 podlahy
```

## package_items.csv

```csv
package_code;task_code;qty_per_unit;note
# ZÁKLADY (na m2 desky)
PKG-ZAKLADY;ZEM-VYKOP;0.300;výkop rýh, m3 na m2 desky (orientačně)
PKG-ZAKLADY;ZAK-PASY;0.150;pásy, m3 na m2 desky
PKG-ZAKLADY;ZAK-DESKA;1.000;deska 1:1
PKG-ZAKLADY;ZAK-HYDRO;1.000;hydroizolace 1:1
# OBVODOVÁ STĚNA (na m2 stěny)
PKG-OBVOD-STENA;ZED-PTH30;1.000;zdivo 1:1
PKG-OBVOD-STENA;VENEC-ZB;0.300;věnec, bm na m2 stěny (orientačně)
# STROP (na m2)
PKG-STROP;STROP-PTH;1.000;
PKG-STROP;STROP-BET;1.000;
# STŘECHA (na m2)
PKG-STRECHA;KROV-MONT;1.000;
PKG-STRECHA;STR-FOLIE;1.000;
PKG-STRECHA;STR-LATE;1.000;
PKG-STRECHA;STR-KRYTI;1.000;
# ZATEPLENÁ STŘECHA (na m2)
PKG-STRECHA-IZO;KROV-MONT;1.000;
PKG-STRECHA-IZO;STR-FOLIE;1.000;
PKG-STRECHA-IZO;STR-LATE;1.000;
PKG-STRECHA-IZO;STR-KRYTI;1.000;
PKG-STRECHA-IZO;STRECHA-IZO;1.000;
PKG-STRECHA-IZO;SDK-PRICKA;0.500;podhled, orientačně poloviční plocha
# OKNO NA KLÍČ (na ks)
PKG-OKNO;OKNO-MONT;1.000;montáž vč. materiálu a parapetů (okno samostatně jako materiál)
# INTERIÉROVÉ DVEŘE (na ks)
PKG-DVERE-INT;DVE-INT-MONT;1.000;
# FASÁDA (na m2)
PKG-FASADA;FAS-ETICS;1.000;
PKG-FASADA;FAS-OMITKA;1.000;
# VNITŘNÍ OMÍTKY A MALBY (na m2)
PKG-OMITKY;OM-VNITR;1.000;
PKG-OMITKY;MALBA-INT;1.000;
# SKLADBA PODLAHY (na m2)
PKG-PODLAHA;POD-IZO-EPS;1.000;
PKG-PODLAHA;POT-LITY;1.000;
PKG-PODLAHA;POD-LAM-MONT;1.000;
# PODLAHA S TOPENÍM (na m2)
PKG-PODLAHA-PT;POD-IZO-EPS;1.000;
PKG-PODLAHA-PT;PT-MONT;1.000;
PKG-PODLAHA-PT;POT-LITY;1.000;
PKG-PODLAHA-PT;POD-LAM-MONT;1.000;
# KOUPELNA (na m2 - kombinace ploch, orientačně)
PKG-KOUPELNA;KOUP-HYDRO;1.000;hydroizolace podlahy+stěn
PKG-KOUPELNA;DLAZ-MONT;1.000;dlažba podlaha
PKG-KOUPELNA;OBKL-MONT;2.000;obklad stěn cca 2x plocha podlahy
# ELEKTRO (na m2 podlahy)
PKG-ELEKTRO;EL-ROZVOD;1.000;
PKG-ELEKTRO;EL-KOMPLET;0.300;kompletace, cca 0.3 ks/m2
```
