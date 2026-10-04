/**
 * MoveSubstancesToChemistry.gs — a one-off job.
 *
 * The substances from AddSubstances.gs went into "General". This moves them
 * into the A Level chemistry folder, and settles the words that ended up in
 * both: the most recent copy stays, every older one goes.
 *
 * Which words it touches is not a guess — it is the SUBSTANCES list in
 * AddSubstances.gs, the same list that put them in General. Nothing else in
 * either folder is read, moved or deleted.
 *
 * How to run it:
 *
 *   1. Run previewSubstanceMove() first. It changes nothing and writes the
 *      whole plan to the log: what moves, what is replaced by what, and the
 *      date on each copy it is choosing between.
 *   2. Read that log. If it is what you meant, run moveSubstancesToChemistry().
 *
 * The preview exists because this job deletes rows, and a row deleted from a
 * spreadsheet is gone. Reading a plan takes a few seconds; rebuilding a
 * folder by hand does not.
 */

/**
 * The folder to move into, by any name it might be under. The first one that
 * exists wins; the job stops rather than creating one, because a folder that
 * is missing usually means it was renamed, and creating a second one would
 * split the deck in half.
 */
var CHEM_TARGET_CANDIDATES = ['A Level Chem', 'A Level Chemistry', 'A-Level Chemistry'];

/** The folder the substances are being moved out of. */
var CHEM_SOURCE_FOLDER = 'General';

function moveTargetFolder_() {
  var folders = listFolders_();

  for (var c = 0; c < CHEM_TARGET_CANDIDATES.length; c++) {
    var wanted = CHEM_TARGET_CANDIDATES[c].toLowerCase();
    for (var f = 0; f < folders.length; f++) {
      if (folders[f].name.toLowerCase() === wanted) return folders[f].name;
    }
  }

  var names = [];
  for (var i = 0; i < folders.length; i++) names.push('"' + folders[i].name + '"');
  Logger.log('No chemistry folder found. Looked for: %s.', CHEM_TARGET_CANDIDATES.join(', '));
  Logger.log('The sheet has: %s.', names.length ? names.join(', ') : '(no folders at all)');
  Logger.log('Add the right name to CHEM_TARGET_CANDIDATES and run again.');
  return null;
}

/** The substance words, lower-cased, from the list that added them. */
function moveSubstanceSet_() {
  var set = {};
  if (typeof SUBSTANCES === 'undefined') return set;
  for (var i = 0; i < SUBSTANCES.length; i++) {
    set[String(SUBSTANCES[i][0]).trim().toLowerCase()] = true;
  }
  return set;
}

/**
 * How recent a row is. createdAt is when the word was added, which is what
 * "the newer one" means here; updatedAt only breaks a tie between two rows
 * written in the same import.
 */
function moveTimestampOf_(row) {
  return String(row.createdAt || '') + '|' + String(row.updatedAt || '');
}

/**
 * Works out what would happen, touching nothing.
 *
 * Returns { target, keep: [...], drop: [...] } where each entry carries the
 * sheet row it lives on, so the caller can write and delete by row number.
 */
function planSubstanceMove_() {
  var target = moveTargetFolder_();
  if (!target) return null;

  var substances = moveSubstanceSet_();
  if (!Object.keys(substances).length) {
    Logger.log('SUBSTANCES is empty or missing — is AddSubstances.gs still in this project?');
    return null;
  }

  var sheet = getSheet_();
  var schema = ensureHeaders_(sheet);
  var map = schema.map;

  var lastRow = sheet.getLastRow();
  if (lastRow < 2) {
    Logger.log('The sheet has no words.');
    return null;
  }

  var values = sheet.getRange(2, 1, lastRow - 1, schema.width).getValues();

  // Group every copy of a substance word that sits in either folder. Rows
  // anywhere else are not part of this job and are never looked at again.
  var groups = {};
  var sourceLower = CHEM_SOURCE_FOLDER.toLowerCase();
  var targetLower = target.toLowerCase();

  for (var i = 0; i < values.length; i++) {
    if (!values[i][map.id]) continue;

    var word = rowToWord_(values[i], map);
    var key = String(word.word || '').trim().toLowerCase();
    if (!substances[key]) continue;

    var folder = String(word.folder || '').toLowerCase();
    var inSource = folder === sourceLower;
    if (!inSource && folder !== targetLower) continue;

    if (!groups[key]) groups[key] = [];
    groups[key].push({
      row: i + 2,
      word: word,
      inSource: inSource,
      stamp: moveTimestampOf_(word)
    });
  }

  var keep = [];
  var drop = [];

  Object.keys(groups).forEach(function (key) {
    var copies = groups[key];

    // Nothing of this word is in General, so this job has no business with
    // it — a duplicate already in the chemistry folder is not ours to settle.
    var moving = false;
    for (var m = 0; m < copies.length; m++) {
      if (copies[m].inSource) moving = true;
    }
    if (!moving) return;

    // The most recent copy stays. A later row wins a tie, since that is the
    // order they were written in.
    var winner = copies[0];
    for (var c = 1; c < copies.length; c++) {
      if (copies[c].stamp >= winner.stamp) winner = copies[c];
    }

    keep.push(winner);
    for (var d = 0; d < copies.length; d++) {
      if (copies[d] !== winner) drop.push(copies[d]);
    }
  });

  return { target: target, map: map, width: schema.width, keep: keep, drop: drop };
}

/** Writes the plan to the log and changes nothing. */
function previewSubstanceMove() {
  var plan = planSubstanceMove_();
  if (!plan) return;

  var moves = 0;
  var already = 0;

  Logger.log('Target folder: "%s".', plan.target);
  Logger.log('--- Keeping ---');

  for (var k = 0; k < plan.keep.length; k++) {
    var row = plan.keep[k];
    if (row.inSource) {
      moves += 1;
      Logger.log('  "%s" — row %s, moving from "%s" (added %s)',
        row.word.word, row.row, CHEM_SOURCE_FOLDER, row.word.createdAt || 'no date');
    } else {
      already += 1;
      Logger.log('  "%s" — row %s, already in "%s" and newer (added %s)',
        row.word.word, row.row, plan.target, row.word.createdAt || 'no date');
    }
  }

  Logger.log('--- Deleting ---');
  if (!plan.drop.length) Logger.log('  (nothing — no duplicates)');
  for (var d = 0; d < plan.drop.length; d++) {
    var gone = plan.drop[d];
    Logger.log('  "%s" — row %s, in "%s" (added %s)',
      gone.word.word, gone.row, gone.word.folder || '(unsorted)',
      gone.word.createdAt || 'no date');
  }

  Logger.log('--- Summary ---');
  Logger.log('%s to move, %s already newer in "%s", %s to delete.',
    moves, already, plan.target, plan.drop.length);
  Logger.log('Nothing has been changed. Run moveSubstancesToChemistry() to apply this.');
}

/** Does it. Run previewSubstanceMove() first. */
function moveSubstancesToChemistry() {
  var plan = planSubstanceMove_();
  if (!plan) return;

  if (!plan.keep.length && !plan.drop.length) {
    Logger.log('Nothing to do.');
    return;
  }

  withLock_(function () {
    var sheet = getSheet_();
    var schema = ensureHeaders_(sheet);
    var map = schema.map;
    var width = schema.width;

    var lastRow = sheet.getLastRow();
    var range = sheet.getRange(2, 1, lastRow - 1, width);
    var values = range.getValues();

    // The folder column first, in one write. Deleting rows afterwards cannot
    // disturb it: the values are already on the sheet.
    var now = new Date().toISOString();
    var moved = 0;

    for (var k = 0; k < plan.keep.length; k++) {
      var row = plan.keep[k];
      if (!row.inSource) continue;

      var at = row.row - 2;
      // The row has not moved: nothing has been deleted yet.
      values[at][map.folder] = escapeCell_(plan.target);
      if (map.updatedAt !== undefined) values[at][map.updatedAt] = escapeCell_(now);
      moved += 1;
    }

    if (moved) range.setValues(protectFormulas_(values));

    // Bottom row first, so deleting one never shifts the next one's number.
    var rows = [];
    for (var d = 0; d < plan.drop.length; d++) rows.push(plan.drop[d].row);
    rows.sort(function (a, b) { return b - a; });

    for (var r = 0; r < rows.length; r++) sheet.deleteRow(rows[r]);

    Logger.log('Moved %s word(s) into "%s".', moved, plan.target);
    Logger.log('Deleted %s older duplicate(s).', rows.length);
    Logger.log('Done. The app picks this up on its next sync.');
    return null;
  });
}
