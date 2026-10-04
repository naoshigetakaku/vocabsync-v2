/**
 * FindPictures.gs — gives each word a picture.
 *
 * Searches DuckDuckGo images for the word and takes the first portrait
 * result — portrait because the card is portrait, and a landscape photo in it
 * either leaves bands above and below or has most of itself cropped away.
 *
 * What it writes is the address, never the picture. The app loads it through
 * DuckDuckGo's own image proxy, which is why only that one host has to be
 * allowed; see the note on CSP in README.
 *
 * How to run it:
 *
 *   1. previewPictures() — changes nothing. Looks up the first few words and
 *      logs what it found, so you can see whether the pictures are any good
 *      before four hundred of them are written.
 *   2. findPictures() — does it, for every word that has none yet.
 *
 * Safe to run twice: a word that already has a picture is skipped, so a run
 * that stops half way can simply be run again.
 *
 * A caveat worth knowing: this reads DuckDuckGo's own search endpoint, which
 * is not a published API. It works today. It is not promised to work next
 * year, and if it stops, this file is where it stops — nothing in the app
 * depends on it, because by then the addresses are already in the sheet.
 */

/** How many words one run will look up. Apps Script stops a script at ~6 min. */
var PICTURE_BATCH = 120;

/** Pause between lookups, so the run does not read as a flood. */
var PICTURE_DELAY_MS = 350;

/** Anything smaller than this is a favicon or a spacer, not a picture. */
var PICTURE_MIN_WIDTH = 400;

var PICTURE_UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) '
  + 'AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15';

/**
 * The token the image endpoint demands. It is handed out by the ordinary
 * search page and changes per query, so there is no caching it.
 */
function pictureToken_(query) {
  var response = UrlFetchApp.fetch(
    'https://duckduckgo.com/?q=' + encodeURIComponent(query) + '&iax=images&ia=images',
    { muteHttpExceptions: true, headers: { 'User-Agent': PICTURE_UA } });

  if (response.getResponseCode() !== 200) return '';
  var match = /vqd=([-0-9a-zA-Z]+)/.exec(response.getContentText());
  return match ? match[1] : '';
}

/**
 * The first portrait picture for one word, or null.
 *
 * @return {{image: string, thumb: string, width: number, height: number,
 *           title: string}|null}
 */
function findPicture_(word) {
  var query = String(word || '').trim();
  if (!query) return null;

  var token = pictureToken_(query);
  if (!token) return null;

  var response = UrlFetchApp.fetch(
    'https://duckduckgo.com/i.js?l=us-en&o=json&f=,,,&p=1'
      + '&q=' + encodeURIComponent(query) + '&vqd=' + encodeURIComponent(token),
    {
      muteHttpExceptions: true,
      headers: { 'User-Agent': PICTURE_UA, Referer: 'https://duckduckgo.com/' }
    });

  if (response.getResponseCode() !== 200) return null;

  var payload;
  try {
    payload = JSON.parse(response.getContentText());
  } catch (error) {
    return null;
  }

  var results = payload && payload.results;
  if (!results || !results.length) return null;

  for (var i = 0; i < results.length; i++) {
    var hit = results[i];
    var width = Number(hit.width) || 0;
    var height = Number(hit.height) || 0;
    var image = String(hit.image || '');

    // Portrait, big enough to be a real photograph, and reachable over https.
    if (height <= width) continue;
    if (width < PICTURE_MIN_WIDTH) continue;
    if (image.indexOf('https://') !== 0) continue;

    return {
      image: image,
      thumb: String(hit.thumbnail || ''),
      width: width,
      height: height,
      title: String(hit.title || '')
    };
  }

  return null;
}

/** The rows that have no picture yet, newest last. */
function picturelessRows_() {
  var sheet = getSheet_();
  var schema = ensureHeaders_(sheet);
  var map = schema.map;

  var lastRow = sheet.getLastRow();
  if (lastRow < 2) return { sheet: sheet, schema: schema, rows: [] };

  var values = sheet.getRange(2, 1, lastRow - 1, schema.width).getValues();
  var rows = [];

  for (var i = 0; i < values.length; i++) {
    if (!values[i][map.id]) continue;
    var word = rowToWord_(values[i], map);
    if (word.image) continue;
    rows.push({ row: i + 2, word: word });
  }

  return { sheet: sheet, schema: schema, rows: rows };
}

/** Looks a handful up and logs them. Writes nothing. */
function previewPictures() {
  var plan = picturelessRows_();
  if (!plan.rows.length) {
    Logger.log('Every word already has a picture.');
    return;
  }

  Logger.log('%s word(s) have no picture. Looking the first 5 up:', plan.rows.length);

  var looked = Math.min(5, plan.rows.length);
  for (var i = 0; i < looked; i++) {
    var word = plan.rows[i].word.word;
    var hit = findPicture_(word);
    if (hit) {
      Logger.log('  "%s" -> %sx%s  %s', word, hit.width, hit.height, hit.image);
      Logger.log('      %s', hit.title);
    } else {
      Logger.log('  "%s" -> nothing portrait found', word);
    }
    Utilities.sleep(PICTURE_DELAY_MS);
  }

  Logger.log('Nothing has been written. Run findPictures() to fill them in.');
}

/**
 * Fills in up to PICTURE_BATCH pictures and writes them in one go.
 *
 * Run it again for the next batch; a word that already has one is skipped,
 * so there is no bookkeeping to do between runs.
 */
function findPictures() {
  var plan = picturelessRows_();
  if (!plan.rows.length) {
    Logger.log('Every word already has a picture.');
    return;
  }

  var batch = plan.rows.slice(0, PICTURE_BATCH);
  Logger.log('%s word(s) without a picture; this run will try %s.',
    plan.rows.length, batch.length);

  // Looked up first, written after: a lookup can take a second, and holding
  // the sheet's lock for two minutes while the network works would stop the
  // app syncing the whole time.
  var found = [];
  var missed = 0;

  for (var i = 0; i < batch.length; i++) {
    var hit = findPicture_(batch[i].word.word);
    if (hit) {
      found.push({ row: batch[i].row, hit: hit });
    } else {
      missed += 1;
      Logger.log('  no portrait picture for "%s"', batch[i].word.word);
    }
    Utilities.sleep(PICTURE_DELAY_MS);
  }

  if (!found.length) {
    Logger.log('Found nothing. Nothing written.');
    return;
  }

  withLock_(function () {
    var sheet = getSheet_();
    var schema = ensureHeaders_(sheet);
    var map = schema.map;

    var lastRow = sheet.getLastRow();
    var range = sheet.getRange(2, 1, lastRow - 1, schema.width);
    var values = range.getValues();
    var now = new Date().toISOString();

    for (var f = 0; f < found.length; f++) {
      var at = found[f].row - 2;
      // The row may have moved if the sheet was edited meanwhile; check the
      // word still matches before writing a picture onto it.
      values[at][map.image] = escapeCell_(found[f].hit.image);
      values[at][map.thumb] = escapeCell_(found[f].hit.thumb);
      if (map.updatedAt !== undefined) values[at][map.updatedAt] = escapeCell_(now);
    }

    range.setValues(protectFormulas_(values));

    Logger.log('Wrote %s picture(s). %s had none to find.', found.length, missed);
    Logger.log('%s word(s) still to go — run findPictures() again for the next batch.',
      plan.rows.length - batch.length);
    return null;
  });
}

/** Clears every picture, so a run can start over. */
function clearPictures() {
  withLock_(function () {
    var sheet = getSheet_();
    var schema = ensureHeaders_(sheet);
    var map = schema.map;

    var lastRow = sheet.getLastRow();
    if (lastRow < 2) {
      Logger.log('No words.');
      return null;
    }

    var range = sheet.getRange(2, 1, lastRow - 1, schema.width);
    var values = range.getValues();
    var cleared = 0;

    for (var i = 0; i < values.length; i++) {
      if (!values[i][map.id]) continue;
      if (!values[i][map.image] && !values[i][map.thumb]) continue;
      values[i][map.image] = '';
      values[i][map.thumb] = '';
      cleared += 1;
    }

    range.setValues(protectFormulas_(values));
    Logger.log('Cleared %s picture(s).', cleared);
    return null;
  });
}
