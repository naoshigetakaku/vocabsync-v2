/**
 * DeleteMunFolder.gs — a one-off job.
 *
 * Removes the MUN folder. Two ways, because "delete the folder" can mean two
 * different things and only one of them can be undone:
 *
 *   deleteMunFolderKeepWords()  the folder goes, its words become Unsorted.
 *                               Nothing is lost. This is what the app's own
 *                               folder menu does.
 *
 *   deleteMunFolderAndWords()   the folder and every word in it are deleted
 *                               from the sheet. There is no undo. Rows removed
 *                               from a spreadsheet are gone.
 *
 * How to run it:
 *
 *   1. Run previewMunDelete() first. It changes nothing and logs exactly
 *      which folder it found and every word that would be destroyed.
 *   2. Read that log. Then run whichever of the two you meant.
 *
 * If you are not sure which you want: run deleteMunFolderKeepWords(). The
 * words end up in Unsorted, where you can look at them and delete them from
 * the app at your own pace. Nothing about that is irreversible.
 */

/**
 * The folder to remove, by any name it might be under. The first that exists
 * wins. Nothing is matched by prefix or guesswork — a job that deletes words
 * does not get to be clever about which ones.
 */
var MUN_FOLDER_CANDIDATES = ['MUN Child Labour', 'MUN', 'MUN 児童労働'];

function munTargetFolder_() {
  var folders = listFolders_();

  for (var c = 0; c < MUN_FOLDER_CANDIDATES.length; c++) {
    var wanted = MUN_FOLDER_CANDIDATES[c].toLowerCase();
    for (var f = 0; f < folders.length; f++) {
      if (folders[f].name.toLowerCase() === wanted) return folders[f];
    }
  }

  var all = [];
  var near = [];
  for (var i = 0; i < folders.length; i++) {
    all.push('"' + folders[i].name + '"');
    if (folders[i].name.toLowerCase().indexOf('mun') === 0) {
      near.push('"' + folders[i].name + '"');
    }
  }

  Logger.log('No MUN folder found. Looked for: %s.', MUN_FOLDER_CANDIDATES.join(', '));
  Logger.log('The sheet has: %s.', all.length ? all.join(', ') : '(no folders at all)');
  if (near.length) {
    Logger.log('Did you mean %s? Add the exact name to MUN_FOLDER_CANDIDATES and run again.',
      near.join(' or '));
  }
  return null;
}

/**
 * The folder and the rows that belong to it, or null if there is no such
 * folder. Reads only.
 */
function planMunDelete_() {
  var folder = munTargetFolder_();
  if (!folder) return null;

  var sheet = getSheet_();
  var schema = ensureHeaders_(sheet);
  var map = schema.map;

  var lastRow = sheet.getLastRow();
  var rows = [];

  if (lastRow >= 2) {
    var values = sheet.getRange(2, 1, lastRow - 1, schema.width).getValues();
    var wanted = folder.name.toLowerCase();

    for (var i = 0; i < values.length; i++) {
      if (!values[i][map.id]) continue;
      var word = rowToWord_(values[i], map);
      if (String(word.folder || '').toLowerCase() !== wanted) continue;
      rows.push({ row: i + 2, word: word });
    }
  }

  return { folder: folder, rows: rows };
}

/** Writes the plan to the log and changes nothing. */
function previewMunDelete() {
  var plan = planMunDelete_();
  if (!plan) return;

  Logger.log('Folder: "%s" (id %s).', plan.folder.name, plan.folder.id);
  Logger.log('It holds %s word(s):', plan.rows.length);

  for (var i = 0; i < plan.rows.length; i++) {
    Logger.log('  row %s — "%s"', plan.rows[i].row, plan.rows[i].word.word);
  }

  Logger.log('--- What each option would do ---');
  Logger.log('deleteMunFolderKeepWords() — removes the folder; those %s word(s) '
    + 'become Unsorted and stay in the sheet.', plan.rows.length);
  Logger.log('deleteMunFolderAndWords()  — removes the folder AND deletes those '
    + '%s word(s) from the sheet. This cannot be undone.', plan.rows.length);
  Logger.log('Nothing has been changed.');
}

/** Removes the folder. Its words survive, with no folder. */
function deleteMunFolderKeepWords() {
  var plan = planMunDelete_();
  if (!plan) return;

  withLock_(function () {
    var folderSheet = getFolderSheet_();
    var row = findFolderRow_(folderSheet, plan.folder.id);
    if (row === -1) {
      Logger.log('The folder row has gone since the plan was made. Nothing done.');
      return null;
    }

    // Blanks the folder column on every word that named it.
    relabelWords_(plan.folder.name, '');
    folderSheet.deleteRow(row);

    Logger.log('Removed the folder "%s".', plan.folder.name);
    Logger.log('%s word(s) are now Unsorted; none were deleted.', plan.rows.length);
    Logger.log('Done. The app picks this up on its next sync.');
    return null;
  });
}

/** Removes the folder and every word in it. There is no undo. */
function deleteMunFolderAndWords() {
  var plan = planMunDelete_();
  if (!plan) return;

  withLock_(function () {
    var sheet = getSheet_();

    // Bottom row first, so deleting one never shifts the next one's number.
    var rows = [];
    for (var i = 0; i < plan.rows.length; i++) rows.push(plan.rows[i].row);
    rows.sort(function (a, b) { return b - a; });

    for (var r = 0; r < rows.length; r++) sheet.deleteRow(rows[r]);

    var folderSheet = getFolderSheet_();
    var folderRow = findFolderRow_(folderSheet, plan.folder.id);
    if (folderRow !== -1) folderSheet.deleteRow(folderRow);

    Logger.log('Deleted %s word(s) and the folder "%s".', rows.length, plan.folder.name);
    Logger.log('Done. The app picks this up on its next sync.');
    return null;
  });
}
