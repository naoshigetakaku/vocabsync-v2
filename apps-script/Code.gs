/**
 * VocabSync — Apps Script backend.
 *
 * Setup
 *   1. Open the target spreadsheet, then Extensions > Apps Script.
 *   2. Replace the default Code.gs with this file.
 *   3. Change PASSPHRASE below to something long and random.
 *        Do this IN THE APPS SCRIPT EDITOR ONLY. This file is checked into a
 *        public repository, so the real passphrase must never be written into
 *        the local copy.
 *   4. Run setup() once and approve the permission prompt.
 *   5. Deploy > New deployment > Web app.
 *        Execute as:  Me
 *        Who has access:  Anyone
 *   6. Copy the /exec URL into the app's Connect sheet.
 *
 * Redeploying after a code change: Deploy > Manage deployments > edit the
 * existing entry > Version: New version. That keeps the same URL. Choosing
 * "New deployment" instead mints a different URL and the app stops working.
 *
 * Why the app posts text/plain: Apps Script cannot answer a CORS preflight, so
 * every request has to stay inside the "simple request" set. The body is JSON
 * regardless and is parsed by hand below.
 *
 * Upgrading an existing sheet: columns are only ever added, at the end.
 * Running setup() appends any header this version expects without touching an
 * existing row; words saved before a column existed read back with its
 * default (no colour, no status).
 */

/**
 * CHANGE THIS — in the Apps Script editor, never in the repository copy.
 * It is the only thing standing between the sheet and the web.
 */
var PASSPHRASE = 'change-me-to-something-long-and-random';

/**
 * Bumped whenever this file gains a feature the front end depends on. The app
 * compares it against its own expectation and says so when the deployment is
 * behind — silently writing rows without a column the user asked for is the
 * worst possible failure mode.
 *
 *   1  original schema
 *   2  colour column
 *   3  folder column and the Folders sheet
 *   4  folder photos
 *   5  archivedFrom, so unarchiving can put a word back where it was
 *   6  Acronym joins the parts of speech
 *   7  status (known / unknown); all sixteen colours; folders retired
 *   8  folders return; status is only the "don't know this" label; quiz
 *      scheduling columns; updateMany for saving quiz answers in one go
 *   9  archived is a column of its own rather than a status, so a word can be
 *      archived and labelled at the same time; lapses counts missed answers
 */
var BACKEND_VERSION = 9;

var SHEET_NAME = 'Words';
var FOLDER_SHEET_NAME = 'Folders';

/**
 * Column order. New fields go on the END of this list — inserting one in the
 * middle would shift every existing row's data into the wrong column.
 *
 * archivedFrom is the folder a word sat in when it was archived. Restoring
 * reads folder, which is never cleared, so archivedFrom only matters when that
 * folder has since been deleted.
 *
 * reviews … dueTick are the quiz schedule; see js/scheduler.js. They count
 * answers rather than days, so there are no dates among them.
 */
var HEADERS = [
  'id', 'word', 'pos', 'definition', 'note',
  'createdAt', 'updatedAt', 'color', 'folder', 'archivedFrom', 'status',
  'reviews', 'streak', 'labelStreak', 'gap', 'ease', 'dueTick',
  'archived', 'lapses'
];

/** The photo column is kept so existing rows stay aligned; nothing reads it. */
var FOLDER_HEADERS = ['id', 'name', 'createdAt', 'photo'];

var MAX_FOLDER_NAME_LENGTH = 60;

var PARTS_OF_SPEECH = ['Verb', 'Adj', 'Adv', 'Noun', 'Idiom', 'Expression', 'Acronym'];

/** Must match WORD_COLORS in js/config.js. */
var WORD_COLORS = [
  'default', 'red', 'orange', 'amber', 'yellow', 'lime', 'green', 'teal',
  'cyan', 'blue', 'indigo', 'violet', 'purple', 'magenta', 'pink', 'grey'
];

/**
 * 'unknown' is the "don't know this" label; blank is no label. 'known' was a
 * status in v7 and now means the same as blank — setup() clears it out.
 */
var STATUSES = ['', 'unknown'];

/** The archived flag, as stored. Blank is a word in the ordinary list. */
var ARCHIVED_ON = '1';

var DEFAULT_EASE = 2.5;
var MIN_EASE = 1.3;
var MAX_EASE = 5;
var MAX_COUNT = 10000000;

/** Quiz answers are saved a handful at a time; this is the backstop. */
var MAX_BATCH = 50;

var MAX_WORD_LENGTH = 200;
var MAX_TEXT_LENGTH = 2000;
var LOCK_TIMEOUT_MS = 20000;

/* --- Entry points --------------------------------------------------------- */

function doGet(e) {
  return handle_(e);
}

function doPost(e) {
  return handle_(e);
}

function handle_(e) {
  try {
    var request = parseRequest_(e);

    if (!constantTimeEquals_(String(request.passphrase || ''), PASSPHRASE)) {
      return json_({ ok: false, error: 'UNAUTHORIZED' });
    }

    switch (request.action) {
      case 'list':
        return json_({
          ok: true,
          version: BACKEND_VERSION,
          words: listWords_(),
          folders: listFolders_()
        });
      case 'updateMany':
        return json_(merge_({ ok: true, version: BACKEND_VERSION }, updateMany_(request.words)));
      case 'createFolder':
        return json_({ ok: true, version: BACKEND_VERSION, folder: createFolder_(request.name) });
      case 'renameFolder':
        return json_({ ok: true, version: BACKEND_VERSION, folder: renameFolder_(request.id, request.name) });
      case 'deleteFolder':
        return json_({ ok: true, version: BACKEND_VERSION, id: deleteFolder_(request.id) });
      case 'create':
        return json_({ ok: true, version: BACKEND_VERSION, word: createWord_(request.word) });
      case 'update':
        return json_({ ok: true, version: BACKEND_VERSION, word: updateWord_(request.word) });
      case 'delete':
        return json_({ ok: true, version: BACKEND_VERSION, id: deleteWord_(request.id) });
      default:
        return json_({ ok: false, error: 'BAD_REQUEST' });
    }
  } catch (error) {
    return json_({
      ok: false,
      error: (error && error.code) || 'SERVER',
      detail: String((error && error.message) || error)
    });
  }
}

/* --- Request plumbing ----------------------------------------------------- */

function parseRequest_(e) {
  if (e && e.postData && e.postData.contents) {
    return JSON.parse(e.postData.contents);
  }
  return (e && e.parameter) || {};
}

function json_(payload) {
  return ContentService
    .createTextOutput(JSON.stringify(payload))
    .setMimeType(ContentService.MimeType.JSON);
}

function merge_(target, source) {
  for (var key in source) target[key] = source[key];
  return target;
}

function fail_(code, message) {
  var error = new Error(message || code);
  error.code = code;
  throw error;
}

/** Compares without an early exit, so a wrong guess takes the same time. */
function constantTimeEquals_(a, b) {
  if (a.length !== b.length) return false;
  var diff = 0;
  for (var i = 0; i < a.length; i++) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}

/* --- Sheet access --------------------------------------------------------- */

function getSheet_() {
  var spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = spreadsheet.getSheetByName(SHEET_NAME);

  if (!sheet) {
    sheet = spreadsheet.insertSheet(SHEET_NAME);
  }

  if (sheet.getLastRow() === 0) {
    sheet.getRange(1, 1, 1, HEADERS.length).setValues([HEADERS]);
    sheet.setFrozenRows(1);
    // Plain text everywhere, so Sheets never reinterprets a word or a
    // timestamp as a number or a date.
    sheet.getRange(1, 1, sheet.getMaxRows(), HEADERS.length).setNumberFormat('@');
  }

  return sheet;
}

/**
 * Reads the header row and appends any column this version expects but the
 * sheet does not have yet. Existing columns keep their position, so data
 * written by an older version stays readable.
 *
 * Returns the column map AND the width to read and write with. The width is
 * derived from the map rather than from getLastColumn(), which can still
 * report the old value for a column this same execution just created — that
 * lag silently dropped the colour off the end of every row.
 *
 * @return {{map: Object, width: number}}
 */
function ensureHeaders_(sheet) {
  var read = Math.max(sheet.getLastColumn(), 1);
  var header = sheet.getRange(1, 1, 1, read).getValues()[0];

  var map = {};
  for (var i = 0; i < header.length; i++) {
    var name = String(header[i]).trim();
    if (name) map[name] = i;
  }

  var missing = [];
  for (var h = 0; h < HEADERS.length; h++) {
    if (!(HEADERS[h] in map)) missing.push(HEADERS[h]);
  }

  if (missing.length) {
    var start = header.length + 1;
    var needed = start + missing.length - 1;
    if (needed > sheet.getMaxColumns()) {
      sheet.insertColumnsAfter(sheet.getMaxColumns(), needed - sheet.getMaxColumns());
    }

    sheet.getRange(1, start, 1, missing.length).setValues([missing]);
    sheet.getRange(1, start, sheet.getMaxRows(), missing.length).setNumberFormat('@');

    for (var m = 0; m < missing.length; m++) {
      map[missing[m]] = header.length + m;
    }
    // Make the new column real before anything measures the sheet again.
    SpreadsheetApp.flush();
  }

  var width = 0;
  for (var key in map) {
    if (map[key] + 1 > width) width = map[key] + 1;
  }

  return { map: map, width: width };
}

/**
 * A value starting with "=" would be stored as a formula. The leading
 * apostrophe forces text; Sheets strips it again on read, so the round trip
 * is lossless.
 */
function escapeCell_(value) {
  var text = value === null || value === undefined ? '' : String(value);
  return text.charAt(0) === '=' ? "'" + text : text;
}

function toText_(value) {
  if (value instanceof Date) return value.toISOString();
  return value === null || value === undefined ? '' : String(value);
}

/** A whole number from a cell, or the fallback when the cell is blank. */
function toInt_(value, fallback) {
  var number = parseInt(value, 10);
  return isFinite(number) ? number : fallback;
}

function toNumber_(value, fallback) {
  var number = parseFloat(value);
  return isFinite(number) ? number : fallback;
}

function findRow_(sheet, map, id) {
  var lastRow = sheet.getLastRow();
  if (lastRow < 2) return -1;

  var column = map.id + 1;
  var ids = sheet.getRange(2, column, lastRow - 1, 1).getValues();
  for (var i = 0; i < ids.length; i++) {
    if (String(ids[i][0]) === id) return i + 2;
  }
  return -1;
}

function rowToWord_(row, map) {
  var read = function (field) {
    var index = map[field];
    return index === undefined ? '' : toText_(row[index]);
  };

  var colour = read('color');
  var status = read('status');

  return {
    id: read('id'),
    word: read('word'),
    pos: read('pos'),
    definition: read('definition'),
    note: read('note'),
    // Rows written before the colour column existed come back blank.
    color: WORD_COLORS.indexOf(colour) === -1 ? 'default' : colour,
    // Blank means the word is unsorted; the app shows those together.
    folder: read('folder'),
    // Retired with the archive, carried through so a rewrite does not lose it.
    archivedFrom: read('archivedFrom'),
    status: STATUSES.indexOf(status) === -1 ? '' : status,
    // A column of its own, so archiving never disturbs the quiz label.
    archived: read('archived') === ARCHIVED_ON ? ARCHIVED_ON : '',
    lapses: toInt_(read('lapses'), 0),
    // Blank on every row written before the quiz existed: a word never asked.
    reviews: toInt_(read('reviews'), 0),
    streak: toInt_(read('streak'), 0),
    labelStreak: toInt_(read('labelStreak'), 0),
    gap: toInt_(read('gap'), 0),
    ease: toNumber_(read('ease'), DEFAULT_EASE),
    dueTick: toInt_(read('dueTick'), 0),
    createdAt: read('createdAt'),
    updatedAt: read('updatedAt')
  };
}

/** Builds a full-width row so no neighbouring column is overwritten. */
function wordToRow_(word, map, width) {
  var row = [];
  for (var i = 0; i < width; i++) row.push('');

  for (var h = 0; h < HEADERS.length; h++) {
    var field = HEADERS[h];
    var index = map[field];
    if (index !== undefined && index < width) {
      row[index] = escapeCell_(word[field]);
    }
  }
  return row;
}

/* --- Validation ----------------------------------------------------------- */

function validate_(input) {
  if (!input || typeof input !== 'object') fail_('BAD_REQUEST', 'Missing word payload.');

  var word = String(input.word || '').trim();
  var pos = String(input.pos || '').trim();
  var definition = String(input.definition || '').trim();
  var note = String(input.note || '').trim();
  var color = String(input.color || 'default').trim();
  var folder = String(input.folder || '').trim();
  var archivedFrom = String(input.archivedFrom || '').trim();
  var status = String(input.status || '').trim();
  if (status === 'known') status = '';
  var archived = String(input.archived || '').trim() === ARCHIVED_ON ? ARCHIVED_ON : '';

  if (!word) fail_('BAD_REQUEST', 'Word is required.');
  if (word.length > MAX_WORD_LENGTH) fail_('BAD_REQUEST', 'Word is too long.');
  if (PARTS_OF_SPEECH.indexOf(pos) === -1) fail_('BAD_REQUEST', 'Unknown part of speech.');
  if (definition.length > MAX_TEXT_LENGTH) fail_('BAD_REQUEST', 'Definition is too long.');
  if (note.length > MAX_TEXT_LENGTH) fail_('BAD_REQUEST', 'Note is too long.');
  if (WORD_COLORS.indexOf(color) === -1) fail_('BAD_REQUEST', 'Unknown colour.');
  if (folder.length > MAX_FOLDER_NAME_LENGTH) fail_('BAD_REQUEST', 'Folder name is too long.');
  if (archivedFrom.length > MAX_FOLDER_NAME_LENGTH) fail_('BAD_REQUEST', 'Folder name is too long.');
  if (STATUSES.indexOf(status) === -1) fail_('BAD_REQUEST', 'Unknown status.');

  var ease = input.ease === undefined || input.ease === '' ? DEFAULT_EASE : Number(input.ease);
  if (!isFinite(ease) || ease < MIN_EASE || ease > MAX_EASE) fail_('BAD_REQUEST', 'Bad ease.');

  return {
    word: word, pos: pos, definition: definition, note: note,
    color: color, folder: folder, archivedFrom: archivedFrom, status: status,
    archived: archived,
    lapses: count_(input.lapses, 'lapses'),
    reviews: count_(input.reviews, 'reviews'),
    streak: count_(input.streak, 'streak'),
    labelStreak: count_(input.labelStreak, 'labelStreak'),
    gap: count_(input.gap, 'gap'),
    ease: Math.round(ease * 100) / 100,
    dueTick: count_(input.dueTick, 'dueTick')
  };
}

/** A non-negative whole number, or 0 when the field was not sent at all. */
function count_(value, name) {
  if (value === undefined || value === null || value === '') return 0;
  var number = Number(value);
  if (!isFinite(number) || number < 0 || number > MAX_COUNT || Math.floor(number) !== number) {
    fail_('BAD_REQUEST', 'Bad ' + name + '.');
  }
  return number;
}

/** Every stored field of a word, plus the three the server owns. */
function buildRecord_(fields, id, createdAt, updatedAt) {
  return merge_({ id: id, createdAt: createdAt, updatedAt: updatedAt }, fields);
}

/* --- Operations ----------------------------------------------------------- */
/* Writes take a script lock: two devices saving at once would otherwise be
   able to append to the same row or renumber rows under each other. */

function withLock_(operation) {
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(LOCK_TIMEOUT_MS)) fail_('BUSY', 'The sheet is busy.');
  try {
    return operation();
  } finally {
    lock.releaseLock();
  }
}

function listWords_() {
  var sheet = getSheet_();
  var schema = ensureHeaders_(sheet);
  var map = schema.map;

  var lastRow = sheet.getLastRow();
  if (lastRow < 2) return [];

  var values = sheet.getRange(2, 1, lastRow - 1, schema.width).getValues();
  var words = [];

  for (var i = 0; i < values.length; i++) {
    if (!values[i][map.id]) continue; // blank row
    words.push(rowToWord_(values[i], map));
  }
  return words;
}

function createWord_(input) {
  var fields = validate_(input);

  return withLock_(function () {
    var sheet = getSheet_();
    var schema = ensureHeaders_(sheet);
    var now = new Date().toISOString();

    var record = buildRecord_(fields, Utilities.getUuid(), now, now);

    sheet.appendRow(wordToRow_(record, schema.map, schema.width));
    return record;
  });
}

function updateWord_(input) {
  if (!input || !input.id) fail_('BAD_REQUEST', 'Missing id.');
  var fields = validate_(input);
  var id = String(input.id);

  return withLock_(function () {
    var sheet = getSheet_();
    var schema = ensureHeaders_(sheet);
    var width = schema.width;

    var row = findRow_(sheet, schema.map, id);
    if (row === -1) fail_('NOT_FOUND', 'No row with that id.');

    var existing = rowToWord_(sheet.getRange(row, 1, 1, width).getValues()[0], schema.map);

    var now = new Date().toISOString();
    var record = buildRecord_(fields, id, existing.createdAt || now, now);

    sheet.getRange(row, 1, 1, width).setValues([wordToRow_(record, schema.map, width)]);
    return record;
  });
}

/**
 * Several rewrites under one lock, in one read and one write.
 *
 * The rows a batch touches are scattered, and a setValues per row costs a
 * round trip each — twenty-five of them ran past the app's timeout on a
 * phone. Reading the whole block, changing it in memory and writing it back
 * once is flat in the size of the batch instead.
 *
 * A word deleted on another device in the meantime is skipped rather than
 * failing the batch; its id comes back in `missing` so the app can drop it.
 */
function updateMany_(inputs) {
  if (!inputs || !inputs.length) fail_('BAD_REQUEST', 'Nothing to update.');
  if (inputs.length > MAX_BATCH) fail_('BAD_REQUEST', 'Too many updates at once.');

  // Validated before the lock, so a bad entry costs nobody else a wait.
  var prepared = [];
  for (var i = 0; i < inputs.length; i++) {
    if (!inputs[i] || !inputs[i].id) fail_('BAD_REQUEST', 'Missing id.');
    prepared.push({ id: String(inputs[i].id), fields: validate_(inputs[i]) });
  }

  return withLock_(function () {
    var sheet = getSheet_();
    var schema = ensureHeaders_(sheet);
    var width = schema.width;
    var lastRow = sheet.getLastRow();

    var now = new Date().toISOString();
    var saved = [];
    var missing = [];

    if (lastRow < 2) {
      for (var m = 0; m < prepared.length; m++) missing.push(prepared[m].id);
      return { words: saved, missing: missing };
    }

    var range = sheet.getRange(2, 1, lastRow - 1, width);
    var values = range.getValues();

    var index = {};
    for (var r = 0; r < values.length; r++) {
      var id = values[r][schema.map.id];
      if (id) index[String(id)] = r;
    }

    var touched = false;
    for (var p = 0; p < prepared.length; p++) {
      var entry = prepared[p];
      var at = index[entry.id];
      if (at === undefined) {
        missing.push(entry.id);
        continue;
      }
      var createdAt = toText_(values[at][schema.map.createdAt]) || now;
      var record = buildRecord_(entry.fields, entry.id, createdAt, now);
      values[at] = wordToRow_(record, schema.map, width);
      saved.push(record);
      touched = true;
    }

    if (touched) range.setValues(protectFormulas_(values));
    return { words: saved, missing: missing };
  });
}

/**
 * Every row of a block about to be written back, with any text that starts
 * with "=" neutralised.
 *
 * getValues() hands back what a cell displays, so the apostrophe escapeCell_
 * added is gone; writing that straight back would turn the text into a
 * formula. Values that are not strings — a date, a number — are left alone.
 */
function protectFormulas_(values) {
  for (var r = 0; r < values.length; r++) {
    for (var c = 0; c < values[r].length; c++) {
      var value = values[r][c];
      if (typeof value === 'string' && value.charAt(0) === '=') values[r][c] = "'" + value;
    }
  }
  return values;
}

/** Clears the v7 "known" status, which no longer means anything. */
function clearKnownStatus_() {
  var sheet = getSheet_();
  var schema = ensureHeaders_(sheet);
  var lastRow = sheet.getLastRow();
  if (lastRow < 2) return 0;

  var range = sheet.getRange(2, schema.map.status + 1, lastRow - 1, 1);
  var values = range.getValues();
  var touched = 0;
  for (var i = 0; i < values.length; i++) {
    if (String(values[i][0]).trim() === 'known') {
      values[i][0] = '';
      touched += 1;
    }
  }
  if (touched) range.setValues(values);
  return touched;
}

function deleteWord_(id) {
  if (!id) fail_('BAD_REQUEST', 'Missing id.');
  var target = String(id);

  return withLock_(function () {
    var sheet = getSheet_();
    var schema = ensureHeaders_(sheet);

    var row = findRow_(sheet, schema.map, target);
    if (row === -1) fail_('NOT_FOUND', 'No row with that id.');

    sheet.deleteRow(row);
    return target;
  });
}

/* --- Folders -------------------------------------------------------------- */

function getFolderSheet_() {
  var spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = spreadsheet.getSheetByName(FOLDER_SHEET_NAME);

  if (!sheet) {
    sheet = spreadsheet.insertSheet(FOLDER_SHEET_NAME);
    sheet.getRange(1, 1, 1, FOLDER_HEADERS.length).setValues([FOLDER_HEADERS]);
    sheet.setFrozenRows(1);
    sheet.getRange(1, 1, sheet.getMaxRows(), FOLDER_HEADERS.length).setNumberFormat('@');
  }

  return sheet;
}

/** Same additive migration as the Words sheet; see ensureHeaders_. */
function ensureFolderHeaders_(sheet) {
  var read = Math.max(sheet.getLastColumn(), 1);
  var header = sheet.getRange(1, 1, 1, read).getValues()[0];

  var map = {};
  for (var i = 0; i < header.length; i++) {
    var name = String(header[i]).trim();
    if (name) map[name] = i;
  }

  var missing = [];
  for (var h = 0; h < FOLDER_HEADERS.length; h++) {
    if (!(FOLDER_HEADERS[h] in map)) missing.push(FOLDER_HEADERS[h]);
  }

  if (missing.length) {
    var start = header.length + 1;
    var needed = start + missing.length - 1;
    if (needed > sheet.getMaxColumns()) {
      sheet.insertColumnsAfter(sheet.getMaxColumns(), needed - sheet.getMaxColumns());
    }
    sheet.getRange(1, start, 1, missing.length).setValues([missing]);
    sheet.getRange(1, start, sheet.getMaxRows(), missing.length).setNumberFormat('@');
    for (var m = 0; m < missing.length; m++) map[missing[m]] = header.length + m;
    SpreadsheetApp.flush();
  }

  var width = 0;
  for (var key in map) {
    if (map[key] + 1 > width) width = map[key] + 1;
  }

  return { map: map, width: width };
}

/** Oldest first, so the app can show folders in the order they were made. */
function listFolders_() {
  var sheet = getFolderSheet_();
  var schema = ensureFolderHeaders_(sheet);

  var lastRow = sheet.getLastRow();
  if (lastRow < 2) return [];

  var values = sheet.getRange(2, 1, lastRow - 1, schema.width).getValues();
  var folders = [];

  for (var i = 0; i < values.length; i++) {
    var row = values[i];
    var read = function (field) {
      var index = schema.map[field];
      return index === undefined ? '' : toText_(row[index]);
    };
    if (!read('id')) continue;
    // The photo column is left out: those data URLs run to tens of kilobytes
    // each, and nothing shows them any more.
    folders.push({
      id: read('id'),
      name: read('name'),
      createdAt: read('createdAt')
    });
  }
  return folders;
}

function findFolderRow_(sheet, id) {
  var lastRow = sheet.getLastRow();
  if (lastRow < 2) return -1;

  var ids = sheet.getRange(2, 1, lastRow - 1, 1).getValues();
  for (var i = 0; i < ids.length; i++) {
    if (String(ids[i][0]) === id) return i + 2;
  }
  return -1;
}

function validFolderName_(input) {
  var name = String(input || '').trim();
  if (!name) fail_('BAD_REQUEST', 'Folder name is required.');
  if (name.length > MAX_FOLDER_NAME_LENGTH) fail_('BAD_REQUEST', 'Folder name is too long.');
  return name;
}

/** Names are the link between a word and its folder, so they must be unique. */
function folderNameTaken_(folders, name, exceptId) {
  var target = name.toLowerCase();
  for (var i = 0; i < folders.length; i++) {
    if (folders[i].id === exceptId) continue;
    if (folders[i].name.toLowerCase() === target) return true;
  }
  return false;
}

function createFolder_(input) {
  var name = validFolderName_(input);

  return withLock_(function () {
    var sheet = getFolderSheet_();
    if (folderNameTaken_(listFolders_(), name, null)) {
      fail_('DUPLICATE', 'A folder with that name already exists.');
    }

    var schema = ensureFolderHeaders_(sheet);
    var record = { id: Utilities.getUuid(), name: name, createdAt: new Date().toISOString() };

    var row = [];
    for (var i = 0; i < schema.width; i++) row.push('');
    for (var h = 0; h < FOLDER_HEADERS.length; h++) {
      var index = schema.map[FOLDER_HEADERS[h]];
      if (index !== undefined) row[index] = escapeCell_(record[FOLDER_HEADERS[h]]);
    }

    sheet.appendRow(row);
    return record;
  });
}

function renameFolder_(id, input) {
  if (!id) fail_('BAD_REQUEST', 'Missing folder id.');
  var name = validFolderName_(input);
  var target = String(id);

  return withLock_(function () {
    var sheet = getFolderSheet_();
    var folders = listFolders_();

    var current = null;
    for (var i = 0; i < folders.length; i++) {
      if (folders[i].id === target) current = folders[i];
    }
    if (!current) fail_('NOT_FOUND', 'No folder with that id.');

    if (folderNameTaken_(folders, name, target)) {
      fail_('DUPLICATE', 'A folder with that name already exists.');
    }

    var schema = ensureFolderHeaders_(sheet);
    var row = findFolderRow_(sheet, target);
    sheet.getRange(row, schema.map.name + 1).setValue(escapeCell_(name));

    // Words point at the folder by name, so they all have to follow.
    if (current.name !== name) relabelWords_(current.name, name);

    return { id: target, name: name, createdAt: current.createdAt };
  });
}

function deleteFolder_(id) {
  if (!id) fail_('BAD_REQUEST', 'Missing folder id.');
  var target = String(id);

  return withLock_(function () {
    var sheet = getFolderSheet_();
    var folders = listFolders_();

    var current = null;
    for (var i = 0; i < folders.length; i++) {
      if (folders[i].id === target) current = folders[i];
    }
    if (!current) fail_('NOT_FOUND', 'No folder with that id.');

    // The words survive; they just stop belonging anywhere.
    relabelWords_(current.name, '');

    sheet.deleteRow(findFolderRow_(sheet, target));
    return target;
  });
}

/** Rewrites the folder column for every word currently in `from`. */
function relabelWords_(from, to) {
  var sheet = getSheet_();
  var schema = ensureHeaders_(sheet);
  var lastRow = sheet.getLastRow();
  if (lastRow < 2) return 0;

  var column = schema.map.folder + 1;
  var range = sheet.getRange(2, column, lastRow - 1, 1);
  var values = range.getValues();

  var touched = 0;
  for (var i = 0; i < values.length; i++) {
    if (String(values[i][0]) === from) {
      values[i][0] = to;
      touched += 1;
    }
  }

  if (touched) range.setValues(values);
  return touched;
}

/* --- One-time setup ------------------------------------------------------- */
/* --- One-time setup ------------------------------------------------------- */

/**
 * Run this once from the editor after pasting or updating this file.
 *
 * It creates the sheet if needed, adds any column this version expects,
 * and triggers the authorization prompt, so the first real request is not the
 * one that has to deal with it.
 */
function setup() {
  var sheet = getSheet_();
  var before = sheet.getLastColumn();
  var schema = ensureHeaders_(sheet);
  var after = schema.width;

  Logger.log('Backend version %s.', BACKEND_VERSION);
  Logger.log('Sheet "%s": %s data row(s).', SHEET_NAME, Math.max(0, sheet.getLastRow() - 1));
  Logger.log('Columns: %s', HEADERS.join(', '));

  if (after > before) {
    Logger.log('Added %s new column(s). Existing rows were not modified.', after - before);
  } else {
    Logger.log('No new columns needed.');
  }

  getFolderSheet_();
  Logger.log('Folders: %s', listFolders_().map(function (f) { return f.name; }).join(', ') || '(none)');

  var cleared = clearKnownStatus_();
  if (cleared) Logger.log('Cleared the old "known" status from %s word(s).', cleared);

  if (PASSPHRASE === 'change-me-to-something-long-and-random') {
    Logger.log('WARNING: PASSPHRASE is still the default. Change it before deploying.');
  }

  Logger.log('Remember: saving this file is not deploying it. Deploy > Manage '
    + 'deployments > edit the existing entry > Version: New version.');
}
