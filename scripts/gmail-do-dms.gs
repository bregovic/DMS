/**
 * Gmail → DMS (issue #41)
 *
 * Skript běží pod účtem schránky, takže nepotřebuje heslo aplikace ani IMAP.
 *
 * ── Jak se to používá ──────────────────────────────────────────────────
 * Ke každému projektu – nebo i ke složce uvnitř projektu – si v Gmailu
 * založíš **stejnojmenný štítek** (např. „Dům" nebo „Garáž", což je složka
 * projektu Dům). Co do štítku přetáhneš, to se zpracuje a zařadí se tam.
 * Skript se na nic jiného ve schránce nepodívá, takže ho jde bez obav
 * pustit i ve vlastní běžné poště.
 *
 * Seznam projektů i složek si skript stahuje z DMS sám. Když v DMS přibude
 * projekt nebo složka, stačí založit štítek téhož jména – do kódu se nesahá.
 *
 * Štítky můžou být i vnořené („DMS/Dům"); porovnává se poslední část,
 * bez ohledu na velikost písmen a diakritiku.
 *
 * ── Nastavení (jednou) ─────────────────────────────────────────────────
 *  1. script.google.com → Nový projekt, přihlášený pod tou schránkou,
 *     ze které se má číst
 *  2. Sem vložit tenhle soubor
 *  3. Projekt → Nastavení projektu → Vlastnosti skriptu, přidat:
 *       DMS_URL     = https://dokumenty.up.railway.app
 *       DMS_SECRET  = <hodnota CRON_SECRET ze služby DMS na Railway>
 *  4. V Gmailu založit štítky pojmenované jako projekty nebo složky v DMS
 *  5. Spustit jednou ručně `otestujSpojeni` → Google se zeptá na oprávnění
 *     (čtení Gmailu a odesílání požadavků), potvrdit; v Protokolu spuštění
 *     se vypíše, jaká místa DMS vrátil a které štítky k nim v Gmailu jsou
 *  6. Spouštěče (ikona budíku) → Přidat spouštěč:
 *       funkce `zpracujPostu`, časový, každých 5 minut
 *
 * Zpracovaná zpráva dostane štítek „DMS hotovo" a projektový štítek se jí
 * sundá – ve štítku projektu tak zůstane jen to, co ještě neprošlo.
 * Druhou pojistkou proti dvojímu odeslání je Message-ID, které si hlídá DMS.
 */

/** Štítek, kterým se značí hotové zprávy. */
var STITEK_HOTOVO = 'DMS hotovo';
/** Kolik zpráv nejvýš za jeden běh (spouštěč má limit 6 minut). */
var MAX_ZPRAV = 10;
/** Přílohy nad tenhle limit se nepošlou – DMS je stejně nezpracuje. */
var MAX_PRILOHA_MB = 20;

function nastaveni() {
  var v = PropertiesService.getScriptProperties();
  var zaklad = (v.getProperty('DMS_URL') || '').replace(/\/+$/, '');
  var secret = v.getProperty('DMS_SECRET');
  if (!zaklad || !secret) {
    throw new Error('Chybí DMS_URL nebo DMS_SECRET ve vlastnostech skriptu.');
  }
  // Starší nastavení mířilo rovnou na endpoint – ať to nerozbije upgrade.
  zaklad = zaklad.replace(/\/api\/mail\/inbound$/, '');
  return { zaklad: zaklad, secret: secret };
}

/** Názvy projektů i složek z DMS – podle nich se hledají štítky. */
function nactiProjekty(n) {
  var odpoved = UrlFetchApp.fetch(n.zaklad + '/api/mail/projects', {
    method: 'get',
    headers: { Authorization: 'Bearer ' + n.secret },
    muteHttpExceptions: true,
  });
  if (odpoved.getResponseCode() !== 200) {
    throw new Error('Seznam projektů se nepodařilo načíst: ' + odpoved.getContentText());
  }
  var j = JSON.parse(odpoved.getContentText());
  // Štítkem může být projekt i složka uvnitř něj („Garáž" pod „Dům").
  return (j.projects || []).concat(j.folders || []);
}

/** Štítky v Gmailu, jejichž název odpovídá některému projektu. */
function najdiStitky(projekty) {
  var klic = function (s) {
    return s.split('/').pop().normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
  };
  var hledane = {};
  for (var i = 0; i < projekty.length; i++) hledane[klic(projekty[i])] = true;

  var vysledek = [];
  var vsechny = GmailApp.getUserLabels();
  for (var j = 0; j < vsechny.length; j++) {
    var jmeno = vsechny[j].getName();
    if (jmeno === STITEK_HOTOVO) continue;
    if (hledane[klic(jmeno)]) vysledek.push(jmeno);
  }
  return vysledek;
}

function zpracujPostu() {
  var n = nastaveni();
  var stitky = najdiStitky(nactiProjekty(n));
  if (!stitky.length) {
    Logger.log('Žádný štítek neodpovídá projektu ani složce v DMS – není co zpracovat.');
    return;
  }

  var hotovo = GmailApp.getUserLabelByName(STITEK_HOTOVO) || GmailApp.createLabel(STITEK_HOTOVO);
  // Jen zprávy pod projektovými štítky, které ještě nejsou hotové.
  var dotaz =
    '(' + stitky.map(function (s) { return 'label:"' + s + '"'; }).join(' OR ') + ')' +
    ' -label:"' + STITEK_HOTOVO + '"';
  var vlakna = GmailApp.search(dotaz, 0, MAX_ZPRAV);
  Logger.log('Štítky: ' + stitky.join(', ') + ' → vláken ke zpracování: ' + vlakna.length);

  for (var i = 0; i < vlakna.length; i++) {
    var vlakno = vlakna[i];
    var stitkyVlakna = vlakno.getLabels();
    var jmenaStitku = stitkyVlakna.map(function (l) { return l.getName(); });
    var zpravy = vlakno.getMessages();
    var vseOk = true;

    for (var j = 0; j < zpravy.length; j++) {
      if (!posliZpravu(zpravy[j], jmenaStitku, n)) vseOk = false;
    }
    // Štítky až když prošly všechny zprávy vlákna – jinak se to zkusí znovu.
    if (vseOk) {
      vlakno.addLabel(hotovo);
      // Projektový štítek sundat, ať v něm zůstane jen nevyřízená pošta.
      // Názvy míst chodí z DMS, proto se porovnávají proti nim, ne napevno.
      for (var k = 0; k < stitkyVlakna.length; k++) {
        if (stitky.indexOf(stitkyVlakna[k].getName()) !== -1) vlakno.removeLabel(stitkyVlakna[k]);
      }
    }
  }
}

function posliZpravu(zprava, stitky, n) {
  try {
    var prilohy = [];
    var soubory = zprava.getAttachments({ includeInlineImages: false });
    for (var i = 0; i < soubory.length; i++) {
      var s = soubory[i];
      if (s.getSize() > MAX_PRILOHA_MB * 1024 * 1024) continue;
      prilohy.push({
        name: s.getName(),
        mimeType: s.getContentType(),
        data: Utilities.base64Encode(s.getBytes()),
      });
    }

    var telo = {
      messageId: zprava.getId(),
      from: zprava.getFrom(),
      subject: zprava.getSubject(),
      date: zprava.getDate().toISOString(),
      labels: stitky,
      // Přeposlaný e-mail má původní nabídku v těle – pošleme prostý text.
      body: zprava.getPlainBody().slice(0, 40000),
      attachments: prilohy,
    };

    var odpoved = UrlFetchApp.fetch(n.zaklad + '/api/mail/inbound', {
      method: 'post',
      contentType: 'application/json',
      headers: { Authorization: 'Bearer ' + n.secret },
      payload: JSON.stringify(telo),
      muteHttpExceptions: true,
    });

    var kod = odpoved.getResponseCode();
    if (kod >= 200 && kod < 300) {
      Logger.log('OK: ' + zprava.getSubject() + ' → ' + odpoved.getContentText());
      return true;
    }
    Logger.log('CHYBA ' + kod + ' u „' + zprava.getSubject() + '": ' + odpoved.getContentText());
    return false;
  } catch (e) {
    Logger.log('VÝJIMKA u „' + zprava.getSubject() + '": ' + e);
    return false;
  }
}

/**
 * Ověření nastavení. Vypíše projekty z DMS a štítky, které jim v Gmailu
 * odpovídají – hned je vidět, jestli se někde liší název. Nic neodesílá.
 */
function otestujSpojeni() {
  var n = nastaveni();
  var projekty = nactiProjekty(n);
  var stitky = najdiStitky(projekty);
  Logger.log('Projekty a složky v DMS: ' + (projekty.join(', ') || '(žádné)'));
  Logger.log('Štítky v Gmailu, které jim odpovídají: ' + (stitky.join(', ') || '(žádné)'));

  var chybi = projekty.filter(function (p) {
    return stitky.map(function (s) { return s.split('/').pop().toLowerCase(); })
      .indexOf(p.toLowerCase()) === -1;
  });
  if (chybi.length) Logger.log('Bez štítku v Gmailu: ' + chybi.join(', '));
}
