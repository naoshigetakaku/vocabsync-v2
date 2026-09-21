/**
 * config.js — constants shared across the app.
 */

/**
 * Leave this empty when the repository is public.
 *
 * With an empty value the deployment URL is asked for on first run and kept in
 * localStorage, so it never appears in the source at all. Filling it in trades
 * that protection for one less field during setup.
 */
export const DEFAULT_API_URL = '';

/** Fixed vocabulary of the part-of-speech selector. */
export const PARTS_OF_SPEECH = ['Verb', 'Adj', 'Adv', 'Noun', 'Idiom', 'Expression', 'Acronym'];

/**
 * Word colours. The key is what gets stored, never the hex, so the same word
 * picks up the right shade in light and dark.
 */
export const WORD_COLORS = [
  { value: 'default', label: 'Default' },
  { value: 'red', label: 'Red' },
  { value: 'orange', label: 'Orange' },
  { value: 'amber', label: 'Amber' },
  { value: 'yellow', label: 'Yellow' },
  { value: 'lime', label: 'Lime' },
  { value: 'green', label: 'Green' },
  { value: 'teal', label: 'Teal' },
  { value: 'cyan', label: 'Cyan' },
  { value: 'blue', label: 'Blue' },
  { value: 'indigo', label: 'Indigo' },
  { value: 'violet', label: 'Violet' },
  { value: 'purple', label: 'Purple' },
  { value: 'magenta', label: 'Magenta' },
  { value: 'pink', label: 'Pink' },
  { value: 'grey', label: 'Grey' },
];

export const DEFAULT_COLOR = 'default';

/** Pronunciation clips for a word, searched across real videos. */
export const YOUGLISH_BASE = 'https://youglish.com/pronounce/';
export const YOUGLISH_LANGUAGE = 'english';

/** Everything else about a word: definitions, usage, images. */
export const DUCKDUCKGO_BASE = 'https://duckduckgo.com/?q=';

export const STORAGE_KEYS = {
  credentials: 'vocabsync.credentials.v1',
  words: 'vocabsync.words.v1',
  outbox: 'vocabsync.outbox.v1',
  installHint: 'vocabsync.install-hint.v1',
  sort: 'vocabsync.sort.v1',
  filter: 'vocabsync.filter.v2',
  folder: 'vocabsync.folder.v1',
  folders: 'vocabsync.folders.v2',
  backendVersion: 'vocabsync.backend-version.v1',
};

/**
 * The "don't know this" label, as stored in the sheet's status column. A
 * word without it has a blank status.
 *
 * Nothing on screen shows this. It survives as the input to the scheduler: a
 * missed word is labelled, a labelled word comes round at a fraction of its
 * usual gap, and LABEL_CLEAR_STREAK right answers clear it. Keeping it out of
 * sight is deliberate — it is a detail of how often a word is asked, not a
 * verdict on the reader.
 */
export const STATUS_UNKNOWN = 'unknown';

/**
 * Archived, as stored in the sheet's own archived column. It is deliberately
 * not a status: a word can be archived and still carry the quiz label.
 *
 * Archiving never touches the folder column, so restoring a word puts it back
 * where it came from without anything having to remember where that was.
 */
export const ARCHIVED_ON = '1';

/** The tabs on the list. 'all' is a view, never anything stored. */
export const FILTER_ARCHIVED = 'archived';

export const FILTERS = [
  { value: 'all', label: 'All' },
  { value: FILTER_ARCHIVED, label: 'Archived' },
];

/** The menu entry for words that are in no folder at all. */
export const UNSORTED_LABEL = 'Unsorted';

export const MAX_FOLDER_NAME_LENGTH = 60;

/** Correct answers in a row that take the "don't know this" label off. */
export const LABEL_CLEAR_STREAK = 3;

/**
 * While there are words waiting to be asked again, a word never asked before
 * is let in at most once in this many questions.
 */
export const NEW_WORD_EVERY = 4;

/** Quiz answers are sent to the sheet this many at a time. */
export const QUIZ_FLUSH_EVERY = 5;

/**
 * The Code.gs version this build needs. Anything lower means the deployment
 * predates a feature the app is already using — quiz progress, for instance,
 * gets written nowhere.
 */
export const REQUIRED_BACKEND_VERSION = 9;

/**
 * Apps Script is slow to wake and slow to write. A cold start alone can take
 * several seconds, so this is generous on purpose: a request cut short is
 * queued and sent again, which costs more than waiting would have.
 */
export const REQUEST_TIMEOUT_MS = 45000;
