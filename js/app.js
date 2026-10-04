/**
 * app.js — bootstrap and event wiring.
 */

import { hasCredentials } from './auth.js';
import { isRetryable, isBackendStale, getBackendVersion } from './api.js';
import { subscribe, refresh, reset, getWord, setArchived, isArchived, flush } from './store.js';
import { FILTERS } from './config.js';
import {
  subscribeView, getFilter, setFilter, getTab, setTab, setSelection,
  selectionLabel, isSelected, FOLDER,
} from './view.js';
import {
  initList, render as renderList, highlightNew, animateNextReflow, hideEmpty,
} from './list.js';
import { initFolderMenu, renderFolderMenu, isFolderMenuOpen, closeFolderMenu } from './folder-menu.js';
import { initFolderForm, openRenameFolder } from './folder-form.js';
import { initCards, renderCards, shuffleCards } from './cards.js';
import { initQuiz, renderQuizHome, isQuizRunning } from './quiz.js';
import { initDetail, openDetail, syncDetail } from './detail.js';
import { initForm, openCreateForm, openEditForm } from './form.js';
import { initSetup, openSetup } from './setup.js';
import { initInstallHint } from './install-hint.js';
import { initSort, cycleSort, getSortLabel } from './sort.js';
import { initPicker } from './picker.js';
import { initConfirm, confirmArchive } from './confirm.js';
import { enableRowSwipe, LEFT } from './swipe-row.js';
import { toast } from './toast.js';

const addButton = document.getElementById('add-button');
const settingsButton = document.getElementById('settings-button');
const sortLabel = document.getElementById('tab-list-label');
const folderName = document.getElementById('folder-name');
const wordListElement = document.getElementById('word-list');
const cardsElement = document.getElementById('cards');
const quizHomeElement = document.getElementById('quiz-home');
const mainElement = document.querySelector('.app-main');
const filterElement = document.getElementById('filter');
const tabbarElement = document.getElementById('tabbar');

const VIEW_ANIMATION_MS = 420;

let syncing = false;
let staleWarningShown = false;
let renamingOpenFolder = false;
let previousFilter = getFilter();
let previousTab = getTab();
let previousFolder = selectionLabel();

/**
 * Saving Code.gs in the editor is not the same as deploying it, and a stale
 * deployment fails quietly: the row is written without the columns it does not
 * know about. Say so rather than letting the user wonder.
 */
function warnIfBackendStale() {
  if (staleWarningShown || !isBackendStale()) return;
  staleWarningShown = true;
  // Versions belong to a deployment, not to the script, so the likeliest
  // cause after an update is this device still using an older URL.
  toast('This device is connected to an older Apps Script (v' + getBackendVersion() + '). See Connection.');
}

/**
 * Pull from the sheet.
 *
 * `quiet` suppresses only the offline-style failures; anything the server
 * actively rejected is always surfaced, because it needs the user to act.
 */
async function sync(quiet) {
  if (syncing || !hasCredentials()) return;
  syncing = true;

  try {
    await refresh();
    warnIfBackendStale();
  } catch (error) {
    if (error.code === 'UNAUTHORIZED' || error.code === 'NOT_CONFIGURED') {
      reset();
      toast(error.message);
      openSetup();
    } else if (!quiet || !isRetryable(error)) {
      toast(error.message);
    }
  } finally {
    syncing = false;
  }
}

/* --- Screen --------------------------------------------------------------- */

function filterIndex(value) {
  return Math.max(0, FILTERS.findIndex((entry) => entry.value === value));
}

function paintHeader() {
  const tab = getTab();
  const quiz = tab === 'quiz';

  folderName.textContent = selectionLabel();
  filterElement.hidden = quiz;

  // The List tab's label is the order the list is in; see js/sort.js.
  sortLabel.textContent = getSortLabel();

  const filter = getFilter();
  filterElement.dataset.active = filter;
  filterElement.style.setProperty('--filter-index', String(filterIndex(filter)));
  filterElement.querySelectorAll('.filter__tab').forEach((tab) => {
    tab.setAttribute('aria-selected', tab.dataset.filter === filter ? 'true' : 'false');
  });

  tabbarElement.querySelectorAll('.tabbar__tab').forEach((tab) => {
    const active = tab.dataset.tab === getTab();
    tab.classList.toggle('is-active', active);
    tab.setAttribute('aria-pressed', active ? 'true' : 'false');
  });

  // Only the list has somewhere to put a new word, and on the other tabs the
  // button would sit on top of a card.
  addButton.hidden = tab !== 'list';
}

/** Slides the arriving content in from the side it came from. */
function animateView(element, kind) {
  const classes = ['view-in-forward', 'view-in-back', 'view-in-fade'];
  element.classList.remove(...classes);
  // Force a reflow so the animation restarts even on a rapid back-and-forth.
  void element.offsetWidth;
  element.classList.add('view-in-' + kind);
  setTimeout(() => element.classList.remove(...classes), VIEW_ANIMATION_MS);
}

function renderCurrent() {
  const tab = getTab();
  const filter = getFilter();
  const folder = selectionLabel();

  // A different tab or folder is a different screen: start it at the top,
  // and enter it from the side of the control that was tapped.
  let entrance = null;
  if (folder !== previousFolder || tab !== previousTab) {
    entrance = 'fade';
  } else if (filter !== previousFilter) {
    entrance = filterIndex(filter) > filterIndex(previousFilter) ? 'forward' : 'back';
  }
  previousFilter = filter;
  previousTab = tab;
  previousFolder = folder;

  wordListElement.hidden = tab !== 'list';
  cardsElement.hidden = tab !== 'cards';
  quizHomeElement.hidden = tab !== 'quiz';
  // The deck does its own snap scrolling, so the page must stop scrolling.
  mainElement.classList.toggle('is-cards', tab === 'cards');
  // Both of these centre their content on the screen, which needs the room
  // kept clear for the add button back; see components.css.
  mainElement.classList.toggle('is-quiz-home', tab === 'quiz');

  if (tab === 'quiz') {
    hideEmpty();
    renderQuizHome();
  } else if (tab === 'cards') {
    renderCards();
  } else {
    renderList();
  }

  if (isFolderMenuOpen()) renderFolderMenu();
  paintHeader();

  if (entrance) {
    mainElement.scrollTop = 0;
    cardsElement.scrollTop = 0;
    const arriving = tab === 'quiz' ? quizHomeElement : tab === 'cards' ? cardsElement : wordListElement;
    animateView(arriving, entrance);
  }
}

/* --- Archiving ------------------------------------------------------------ */

/**
 * Left archives, right restores. Only the swipe that would change something
 * is offered, so a word already archived cannot be archived again.
 */
function allowsSwipe(id, direction) {
  const word = getWord(id);
  if (!word) return false;
  return direction === LEFT ? !isArchived(word) : isArchived(word);
}

/** Either way the word leaves the tab it was on, so the rows close up. */
function staysAfterSwipe() {
  return false;
}

/**
 * Archives or restores one word.
 *
 * Returns as soon as the change is on screen, not when the sheet has it. The
 * store applies it locally and commits before it sends, so the row has
 * already gone by then; waiting for the network would only mean the next row
 * could not be swiped until this one came back. Several can now be on their
 * way at once, which is what the outbox was for.
 *
 * The confirmation is the one thing still waited on — two of those at once
 * would be two dialogs over each other.
 */
async function performSwipe(id, direction) {
  const archiving = direction === LEFT;
  const word = getWord(id);
  if (!word) return;

  // Archiving takes a word off three screens at once, so it asks first.
  // Restoring only undoes that.
  if (archiving && !(await confirmArchive(word))) {
    // Nothing changed, so nothing re-renders on its own; put the row back.
    renderCurrent();
    return;
  }

  // The rows after it glide up into the gap it leaves.
  animateNextReflow();

  setArchived(id, archiving)
    .then(() => toast(archiving ? 'Archived.' : 'Restored.'))
    .catch((error) => {
      // The store has already put the word back where it was; the list just
      // has to be told.
      toast(error.message);
      renderCurrent();
    });
}

/* --- Service worker ------------------------------------------------------- */

/**
 * A new worker installs, activates and claims this page on its own; all that
 * is left here is to reload once so the running code matches the shell that
 * has just taken over.
 */
function initServiceWorker() {
  if (!('serviceWorker' in navigator)) return;

  navigator.serviceWorker.register('./sw.js').catch(() => {
    // Offline support is a bonus; the app works fine without it.
  });

  // On the very first install the worker claims the page without an update
  // having happened; reloading then would be a pointless flash.
  const hadController = Boolean(navigator.serviceWorker.controller);
  let reloading = false;

  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (!hadController || reloading) return;
    reloading = true;

    // Never yank the page out from under someone mid-entry, or mid-quiz.
    if (document.querySelector('dialog[open]') || isQuizRunning()) {
      const retry = setInterval(() => {
        if (!document.querySelector('dialog[open]') && !isQuizRunning()) {
          clearInterval(retry);
          window.location.reload();
        }
      }, 1000);
      return;
    }

    window.location.reload();
  });
}

/* --- Start ---------------------------------------------------------------- */

function wireUi() {
  subscribe(renderCurrent);
  subscribeView(renderCurrent);

  // Shared dialogs first: the views below open them.
  initPicker();
  initConfirm();

  initList(openDetail);
  initCards();
  initQuiz({ onChange: renderCurrent });
  initDetail({ onEdit: openEditForm });
  initForm({
    afterSave: (saved) => {
      if (saved) highlightNew(saved.id);
      renderCurrent();
      syncDetail();
    },
  });
  initFolderMenu({
    onRename: (folder) => {
      renamingOpenFolder = isSelected({ kind: FOLDER, name: folder.name });
      openRenameFolder(folder);
    },
  });
  initFolderForm({
    afterSave: (saved) => {
      // The view holds the folder by name, so it has to follow the rename or
      // it points at nothing.
      if (renamingOpenFolder) setSelection({ kind: FOLDER, name: saved.name });
      renamingOpenFolder = false;
      renderCurrent();
    },
  });
  initSetup({
    onConnected: () => {
      toast('Connected.');
      sync(false);
    },
  });
  initSort(renderCurrent);
  initInstallHint();

  addButton.addEventListener('click', openCreateForm);
  settingsButton.addEventListener('click', () => openSetup({ manual: true }));

  filterElement.addEventListener('click', (event) => {
    const tab = event.target.closest('.filter__tab');
    if (tab) setFilter(tab.dataset.filter);
  });

  // Tapping the tab you are already on does the thing that tab is for again:
  // the list steps to the next order, the deck deals a fresh hand.
  tabbarElement.addEventListener('click', (event) => {
    const tab = event.target.closest('.tabbar__tab');
    if (!tab) return;
    closeFolderMenu();

    const wanted = tab.dataset.tab;
    const already = getTab() === wanted;

    if (wanted === 'cards') {
      shuffleCards();
      if (already) renderCurrent();
    } else if (wanted === 'list' && already) {
      cycleSort();
      sortLabel.classList.remove('is-changed');
      // Restart the swap even on a quick second tap.
      void sortLabel.offsetWidth;
      sortLabel.classList.add('is-changed');
    }

    setTab(wanted);
  });

  // Left puts a word aside, right brings it back. Only the list has rows.
  enableRowSwipe(wordListElement, {
    canSwipe: () => getTab() === 'list' && !isFolderMenuOpen(),
    allows: allowsSwipe,
    stays: staysAfterSwipe,
    perform: performSwipe,
  });

  // iOS suspends standalone web apps aggressively; re-sync whenever the app
  // comes back to the foreground rather than polling on a timer. Going away
  // is the last chance to push quiz answers before the app is frozen.
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') sync(true);
    else flush().catch(() => {});
  });
  window.addEventListener('online', () => sync(true));

  // Paint the cached data first, then reconcile with the sheet.
  renderCurrent();

  if (hasCredentials()) sync(true);
  else openSetup();
}

function start() {
  // The updater has to run even when the interface fails to come up. Without
  // this, one bad release can never be replaced by a good one: the code that
  // fetches the fix is the same code that just crashed.
  try {
    wireUi();
  } catch (error) {
    console.error('VocabSync: interface failed to initialise.', error);
  }

  initServiceWorker();
}

start();
