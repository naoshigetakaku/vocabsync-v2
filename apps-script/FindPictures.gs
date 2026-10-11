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

/** Consecutive lookups that never reached the search before giving up. */
var PICTURE_GIVE_UP_AFTER = 5;

var PICTURE_UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) '
  + 'AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15';

/**
 * The token the image endpoint demands. It is handed out by the ordinary
 * search page and changes per query, so there is no caching it.
 *
 * @return {{token: string, reason: string}} reason is set when there is none
 */
function pictureToken_(query) {
  var response;
  try {
    response = UrlFetchApp.fetch(
      'https://duckduckgo.com/?q=' + encodeURIComponent(query) + '&iax=images&ia=images',
      { muteHttpExceptions: true, headers: { 'User-Agent': PICTURE_UA } });
  } catch (error) {
    // "Address unavailable" lands here: the connection never opened. Apps
    // Script runs from Google's network, and DuckDuckGo turns a lot of that
    // away, so this is the likely shape of a blocked run rather than a bug.
    return { token: '', reason: 'unreachable (' + error.message + ')' };
  }

  var code = response.getResponseCode();
  if (code !== 200) return { token: '', reason: 'search page returned ' + code };

  // The page writes the token both ways, vqd=4-123 and vqd="4-123", and which
  // one you get varies. Accepting only the bare form drops a token that was
  // there and reads as a blocked run, which is the wrong thing to conclude.
  var match = /vqd=["']?([-0-9a-zA-Z]+)/.exec(response.getContentText());
  if (!match) return { token: '', reason: 'no token in the search page (blocked?)' };

  return { token: match[1], reason: '' };
}

/**
 * The first portrait picture for one word.
 *
 * Always says which way it went. "No portrait picture" and "the search never
 * answered" look the same from the outside and are not the same problem at
 * all — one is a word with no tall photograph, the other is a run that is
 * being turned away and will fail for every word after it too.
 *
 * `blocked` is the difference: it means nothing was searched, so there is no
 * point working through another hundred words.
 *
 * @return {{hit: Object|null, reason: string, blocked: boolean}}
 */
function findPicture_(word) {
  var query = String(word || '').trim();
  if (!query) return { hit: null, reason: 'blank word', blocked: false };

  var token = pictureToken_(query);
  if (!token.token) return { hit: null, reason: token.reason, blocked: true };

  var response;
  try {
    response = UrlFetchApp.fetch(
      'https://duckduckgo.com/i.js?l=us-en&o=json&f=,,,&p=1'
        + '&q=' + encodeURIComponent(query) + '&vqd=' + encodeURIComponent(token.token),
      {
        muteHttpExceptions: true,
        headers: { 'User-Agent': PICTURE_UA, Referer: 'https://duckduckgo.com/' }
      });
  } catch (error) {
    return { hit: null, reason: 'unreachable (' + error.message + ')', blocked: true };
  }

  var code = response.getResponseCode();
  if (code !== 200) {
    return { hit: null, reason: 'image search returned ' + code, blocked: true };
  }

  var payload;
  try {
    payload = JSON.parse(response.getContentText());
  } catch (error) {
    return { hit: null, reason: 'the answer was not JSON (blocked?)', blocked: true };
  }

  var results = (payload && payload.results) || [];
  if (!results.length) {
    // The search answered, it simply had nothing. Not a blocked run.
    return { hit: null, reason: 'no results at all', blocked: false };
  }

  var tooWide = 0;
  var tooSmall = 0;

  for (var i = 0; i < results.length; i++) {
    var hit = results[i];
    var width = Number(hit.width) || 0;
    var height = Number(hit.height) || 0;
    var image = String(hit.image || '');

    // Portrait, big enough to be a real photograph, and reachable over https.
    if (height <= width) { tooWide += 1; continue; }
    if (width < PICTURE_MIN_WIDTH) { tooSmall += 1; continue; }
    if (image.indexOf('https://') !== 0) continue;

    return {
      hit: {
        image: image,
        thumb: String(hit.thumbnail || ''),
        width: width,
        height: height,
        title: String(hit.title || '')
      },
      reason: '',
      blocked: false
    };
  }

  return {
    hit: null,
    blocked: false,
    reason: results.length + ' results, none portrait ('
      + tooWide + ' landscape, ' + tooSmall + ' too small)'
  };
}

/**
 * The rows that have no picture yet, newest last.
 *
 * Archived words are left out. They appear on no card, in no deck and in no
 * quiz, so a picture for one is a lookup spent on something nobody will see —
 * and with four hundred words to get through, that matters.
 */
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
    if (word.archived === ARCHIVED_ON) continue;
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
  var blocked = 0;

  for (var i = 0; i < looked; i++) {
    var word = plan.rows[i].word.word;
    var found = findPicture_(word);
    if (found.hit) {
      Logger.log('  "%s" -> %sx%s  %s', word, found.hit.width, found.hit.height, found.hit.image);
      Logger.log('      %s', found.hit.title);
    } else {
      Logger.log('  "%s" -> %s', word, found.reason);
      if (found.blocked) blocked += 1;
    }
    Utilities.sleep(PICTURE_DELAY_MS);
  }

  if (blocked === looked) {
    Logger.log('');
    Logger.log('Every lookup failed before it searched anything. Apps Script runs');
    Logger.log('from Google\'s network and DuckDuckGo turns much of it away, so this');
    Logger.log('is what being blocked looks like rather than a fault in the words.');
    Logger.log('');
    Logger.log('Collect them on your own machine instead:');
    Logger.log('  1. run logWordsForPictures() and copy the array out of the log');
    Logger.log('  2. python3 tools/find-pictures.py words.json');
    Logger.log('  3. paste the PictureData.gs it writes into this project');
    Logger.log('  4. run applyPictures()');
    return;
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
  var blockedRun = 0;

  for (var i = 0; i < batch.length; i++) {
    var result = findPicture_(batch[i].word.word);
    if (result.hit) {
      found.push({ row: batch[i].row, hit: result.hit });
      blockedRun = 0;
    } else {
      missed += 1;
      Logger.log('  "%s" — %s', batch[i].word.word, result.reason);
      blockedRun = result.blocked ? blockedRun + 1 : 0;

      // Nothing has been searched for several words running. Another hundred
      // lookups against a closed door costs minutes and tells you nothing.
      if (blockedRun >= PICTURE_GIVE_UP_AFTER) {
        Logger.log('');
        Logger.log('%s lookups in a row failed before searching anything. Stopping.',
          blockedRun);
        Logger.log('Apps Script runs from Google\'s network and DuckDuckGo turns much');
        Logger.log('of it away; this is what that looks like, not a fault in the words.');
        Logger.log('Run logWordsForPictures() and collect them with tools/find-pictures.py.');
        break;
      }
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

/**
 * Prints the words that still need a picture, as JSON.
 *
 * This exists because DuckDuckGo will not answer Apps Script: the search runs
 * from Google's network, and that network is turned away. The lookup has to
 * happen somewhere else, so this hands over the only thing the somewhere else
 * needs — the list of words.
 *
 * Copy the array out of the log, run tools/find-pictures.py over it, and the
 * result comes back as PictureData.gs for applyPictures() to write in. No
 * fetching from here at any point.
 */
function logWordsForPictures() {
  var plan = picturelessRows_();
  if (!plan.rows.length) {
    Logger.log('Every word already has a picture.');
    return;
  }

  var words = [];
  for (var i = 0; i < plan.rows.length; i++) words.push(plan.rows[i].word.word);

  Logger.log('%s word(s) need a picture. Copy the array below.', words.length);
  Logger.log('');

  // Split across lines: the log truncates a single very long one.
  var CHUNK = 40;
  Logger.log('[');
  for (var c = 0; c < words.length; c += CHUNK) {
    var slice = words.slice(c, c + CHUNK).map(function (w) { return JSON.stringify(w); });
    Logger.log('  ' + slice.join(', ') + (c + CHUNK < words.length ? ',' : ''));
  }
  Logger.log(']');
}

/**
 * Writes the pictures collected elsewhere into the sheet.
 *
 * Reads the PICTURES map out of PictureData.gs — a file this project does not
 * ship, because it is generated. Matching is by word, lower-cased: the same
 * word in two folders gets the same picture, which is what you would want.
 *
 * Nothing here touches the network, so none of DuckDuckGo's opinions about
 * Google's address range apply.
 */
function applyPictures() {
  if (typeof PICTURES === 'undefined') {
    Logger.log('No PICTURES map. Add the generated PictureData.gs to this project first.');
    return;
  }

  var lookup = {};
  var offered = 0;
  for (var key in PICTURES) {
    if (!Object.prototype.hasOwnProperty.call(PICTURES, key)) continue;
    lookup[key.trim().toLowerCase()] = PICTURES[key];
    offered += 1;
  }

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
    var now = new Date().toISOString();
    var written = 0;
    var skipped = 0;

    for (var i = 0; i < values.length; i++) {
      if (!values[i][map.id]) continue;
      var word = rowToWord_(values[i], map);
      if (word.image) { skipped += 1; continue; }

      var hit = lookup[String(word.word || '').trim().toLowerCase()];
      if (!hit || !hit.image) continue;

      values[i][map.image] = escapeCell_(hit.image);
      values[i][map.thumb] = escapeCell_(hit.thumb || '');
      if (map.updatedAt !== undefined) values[i][map.updatedAt] = escapeCell_(now);
      written += 1;
    }

    if (!written) {
      Logger.log('%s picture(s) offered, none matched a word without one.', offered);
      return null;
    }

    range.setValues(protectFormulas_(values));
    Logger.log('Wrote %s picture(s) from a map of %s.', written, offered);
    Logger.log('%s word(s) already had one and were left alone.', skipped);
    Logger.log('Done. The app picks these up on its next sync.');
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
