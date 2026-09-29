/**
 * Gmail → DMS
 *
 * Skript běží pod účtem schránky, takže nepotřebuje heslo aplikace ani IMAP.
 *
 * ── Jak se to používá ──────────────────────────────────────────────────
 * V Gmailu je jeden štítek **DMS**. Co pod něj přetáhneš, to se pošle do
 * DMS jako jeden balíček – e-mail i s přílohami pohromadě. Uvnitř si můžeš
 * dělat vnořené štítky („DMS/Dům", „DMS/Garáž"); posílají se taky a jejich
 * název jde do DMS jako nápověda, kam zpráva patří. Rozhoduje se až v DMS.
 *
 * Skript sám nic nepoznává a nic nezakládá. Druh dokladu, dodavatele,
 * projekt i žádanku určí až čtení dokladů v DMS, kde to jde projít hromadně
 * a potvrdit. Díky tomu je jedno, jak má kdo projekty pojmenované.
 *
 * Hotová zpráva dostane štítek **DMS/Hotovo** a ostatní DMS štítky se jí
 * sundají, takže pod DMS zůstane jen to, co ještě neodešlo. Druhou pojistkou
 * proti dvojímu odeslání je Message-ID, které si hlídá DMS.
 *
 * ── Nastavení (jednou) ─────────────────────────────────────────────────
 *  1. script.google.com → Nový projekt, přihlášený pod tou schránkou,
 *     ze které se má číst
 *  2. Sem vložit tenhle soubor
 *  3. Projekt → Nastavení projektu → Vlastnosti skriptu, přidat:
 *       DMS_URL     = https://dokumenty.up.railway.app
 *       DMS_SECRET  = <hodnota CRON_SECRET ze služby DMS na Railway>
 *     Volitelně DMS_STITEK, když se kořenový štítek nemá jmenovat „DMS".
 *  4. V Gmailu založit štítek DMS (vnořené uvnitř podle chuti)
 *  5. Spustit jednou ručně `otestujSpojeni` → Google se zeptá na oprávnění,
 *     potvrdit; v Protokolu spuštění se vypíše, co by se poslalo
 *  6. Spouštěče (ikona budíku) → Přidat spouštěč:
 *       funkce `zpracujPostu`, časový, každých 5 minut
 */

/** Kořenový štítek; vnořené („DMS/Dům") se berou taky. */
var STITEK = PropertiesService.getScriptProperties().getProperty('DMS_STITEK') || 'DMS';
/** Sem se zpráva přehodí, až projde. */
var STITEK_HOTOVO = STITEK + '/Hotovo';
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

/**
 * Štítky, ze kterých se posílá: kořenový a všechny vnořené, kromě Hotovo.
 * Nic se nikam nepřekládá – názvy jsou věc uživatele.
 */
function zdrojoveStitky() {
  var vysledek = [];
  var vsechny = GmailApp.getUserLabels();
  for (var i = 0; i < vsechny.length; i++) {
    var jmeno = vsechny[i].getName();
    if (jmeno !== STITEK && jmeno.indexOf(STITEK + '/') !== 0) continue;
    if (jmeno === STITEK_HOTOVO || jmeno.indexOf(STITEK_HOTOVO + '/') === 0) continue;
    vysledek.push(jmeno);
  }
  return vysledek;
}

function zpracujPostu() {
  var n = nastaveni();
  var stitky = zdrojoveStitky();
  if (!stitky.length) {
    Logger.log('Štítek „' + STITEK + '" v Gmailu není – není odkud brát.');
    return;
  }

  var hotovo = GmailApp.getUserLabelByName(STITEK_HOTOVO) || GmailApp.createLabel(STITEK_HOTOVO);
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
      // Vnořený štítek je jen nápověda, kam zpráva patří – rozhodne DMS.
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

/** Ověření nastavení: vypíše, odkud by se bralo a kolik toho čeká. Nic neodesílá. */
function otestujSpojeni() {
  var n = nastaveni();
  var stitky = zdrojoveStitky();
  Logger.log('DMS: ' + n.zaklad);
  Logger.log('Štítky, ze kterých se posílá: ' + (stitky.join(', ') || '(žádné – založ štítek „' + STITEK + '")'));
  if (!stitky.length) return;

  var dotaz =
    '(' + stitky.map(function (s) { return 'label:"' + s + '"'; }).join(' OR ') + ')' +
    ' -label:"' + STITEK_HOTOVO + '"';
  var vlakna = GmailApp.search(dotaz, 0, MAX_ZPRAV);
  Logger.log('Čeká na odeslání: ' + vlakna.length + ' vláken');
  for (var i = 0; i < vlakna.length; i++) {
    var z = vlakna[i].getMessages()[0];
    Logger.log('  · ' + z.getSubject() + ' (příloh: ' + z.getAttachments({ includeInlineImages: false }).length + ')');
  }
}
