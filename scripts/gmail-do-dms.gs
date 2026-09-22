/**
 * Gmail → DMS (issue #41)
 *
 * Skript běží pod účtem schránky, takže nepotřebuje heslo aplikace ani IMAP.
 * Vezme označené zprávy a pošle je i s přílohami do DMS, kde spadnou do
 * Doručené pošty a počkají na potvrzení zařazení.
 *
 * Jde ho pustit i ve vlastní běžné schránce – bere jen zprávy se štítkem
 * „Do DMS" (viz DOTAZ níž), takže se osobní pošty nedotkne.
 *
 * ── Nastavení (jednou) ─────────────────────────────────────────────────
 *  1. script.google.com → Nový projekt, přihlášený pod tou schránkou,
 *     ze které se má číst
 *  2. Sem vložit tenhle soubor
 *  3. Projekt → Nastavení projektu → Vlastnosti skriptu, přidat:
 *       DMS_URL     = https://dokumenty.up.railway.app/api/mail/inbound
 *       DMS_SECRET  = <hodnota CRON_SECRET ze služby DMS na Railway>
 *  4. Spustit jednou ručně funkci `zpracujPostu` → Google se zeptá na
 *     oprávnění (čtení Gmailu a odesílání požadavků), potvrdit
 *  5. Spouštěče (ikona budíku) → Přidat spouštěč:
 *       funkce `zpracujPostu`, časový, každých 5 minut
 *  6. V Gmailu založit štítek „Do DMS" a označovat jím, co se má zpracovat
 *     (nebo si na to udělat filtr – např. od konkrétních dodavatelů)
 *
 * Zpracované zprávy dostanou štítek „DMS", takže se neposílají podruhé;
 * druhou pojistkou je Message-ID, které si DMS hlídá u sebe.
 */

/** Štítek, kterým se značí hotové zprávy. */
var STITEK = 'DMS';
/**
 * Které zprávy skript vůbec bere. Výchozí nastavení je **bezpečné pro běžnou
 * schránku**: jde jen o to, co sám označíš štítkem „Do DMS".
 *
 *   'label:Do-DMS'  – jen ručně (nebo filtrem) označené zprávy  ← výchozí
 *   'in:inbox'      – všechno v doručené poště; POUŽÍVAT JEN ve vyhrazené
 *                     schránce, kam nechodí nic jiného než nabídky a faktury
 *
 * Ve své běžné poště tohle neměň. Do DMS by pak šly i výpisy z banky,
 * osobní pošta a přihlašovací kódy – obsah by se sice u neznámých
 * odesílatelů zahodil, ale zbytečně by se přenesl a předměty by ti chodily
 * v souhrnné zprávě.
 */
var DOTAZ = 'label:Do-DMS';
/** Kolik zpráv nejvýš za jeden běh (spouštěč má limit 6 minut). */
var MAX_ZPRAV = 10;
/** Přílohy nad tenhle limit se nepošlou – DMS je stejně nezpracuje. */
var MAX_PRILOHA_MB = 20;

function zpracujPostu() {
  var v = PropertiesService.getScriptProperties();
  var url = v.getProperty('DMS_URL');
  var secret = v.getProperty('DMS_SECRET');
  if (!url || !secret) {
    throw new Error('Chybí DMS_URL nebo DMS_SECRET ve vlastnostech skriptu.');
  }

  var stitek = GmailApp.getUserLabelByName(STITEK) || GmailApp.createLabel(STITEK);
  // Vybrané zprávy, které ještě nemají štítek hotovo.
  var vlakna = GmailApp.search(DOTAZ + ' -label:' + STITEK, 0, MAX_ZPRAV);

  for (var i = 0; i < vlakna.length; i++) {
    var vlakno = vlakna[i];
    var zpravy = vlakno.getMessages();
    var vseOk = true;

    for (var j = 0; j < zpravy.length; j++) {
      if (!posliZpravu(zpravy[j], url, secret)) vseOk = false;
    }
    // Štítek až když prošly všechny zprávy vlákna – jinak se to zkusí znovu.
    if (vseOk) vlakno.addLabel(stitek);
  }
}

function posliZpravu(zprava, url, secret) {
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
      // Přeposlaný e-mail má původní nabídku v těle – pošleme prostý text.
      body: zprava.getPlainBody().slice(0, 40000),
      attachments: prilohy,
    };

    var odpoved = UrlFetchApp.fetch(url, {
      method: 'post',
      contentType: 'application/json',
      headers: { Authorization: 'Bearer ' + secret },
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
 * Pomůcka na ruční ověření, že spojení a tajemství sedí. Spusť ji z editoru
 * a koukni do Protokolu spuštění – nic se přitom neposílá do evidence.
 */
function otestujSpojeni() {
  var v = PropertiesService.getScriptProperties();
  var odpoved = UrlFetchApp.fetch(v.getProperty('DMS_URL'), {
    method: 'post',
    contentType: 'application/json',
    headers: { Authorization: 'Bearer ' + v.getProperty('DMS_SECRET') },
    payload: JSON.stringify({
      messageId: 'test-' + new Date().getTime(),
      from: 'test@example.com',
      subject: 'Test spojení',
      date: new Date().toISOString(),
      body: 'Zkouška.',
      attachments: [],
    }),
    muteHttpExceptions: true,
  });
  // Očekávaná odpověď: 200 a ve skipped „neznámý odesílatel test@example.com".
  Logger.log(odpoved.getResponseCode() + ': ' + odpoved.getContentText());
}
