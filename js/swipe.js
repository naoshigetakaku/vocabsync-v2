/**
 * swipe.js — drag a bottom sheet downwards to dismiss it.
 *
 * Touch only. A pointer-events version would have to fight `touch-action`
 * against the sheet's own scrolling; on desktop the close button and the
 * backdrop already cover dismissal.
 */

/** Fraction of the sheet's height that counts as a dismissal. */
const DISMISS_RATIO = 0.25;
/** A flick this fast dismisses regardless of distance (px per ms). */
const DISMISS_VELOCITY = 0.55;
/** Movement before the gesture commits to a direction. */
const START_SLOP = 6;

export function enableSwipeToDismiss(dialog, onDismiss) {
  const body = dialog.querySelector('.sheet__body');
  // Anything outside the scroller counts as a handle, so a pinned title is
  // somewhere you can always start the gesture from.
  const handles = dialog.querySelectorAll('.sheet__grip, .sheet__head');

  let tracking = false; // finger down, direction undecided
  let dragging = false; // committed to a downward drag
  let startX = 0;
  let startY = 0;
  let lastY = 0;
  let lastTime = 0;
  let velocity = 0;

  function clear() {
    tracking = false;
    dragging = false;
    dialog.classList.remove('is-grabbed');
    dialog.style.removeProperty('--drag-y');
  }

  function settle(target, done) {
    dialog.classList.add('is-settling');
    dialog.style.setProperty('--drag-y', target + 'px');

    let finished = false;
    const finish = () => {
      if (finished) return;
      finished = true;
      dialog.classList.remove('is-settling');
      done();
    };

    dialog.addEventListener('transitionend', finish, { once: true });
    // Safety net if the transition never fires.
    setTimeout(finish, 420);
  }

  function onStart(event) {
    if (event.touches.length !== 1) return;
    if (dialog.classList.contains('is-closing') || dialog.classList.contains('is-settling')) return;

    const touch = event.touches[0];
    let fromGrip = false;
    handles.forEach((handle) => {
      if (handle.contains(event.target)) fromGrip = true;
    });

    // Mid-scroll content keeps scrolling; only the top edge starts a drag.
    if (!fromGrip && body && body.scrollTop > 0) return;
    // Never hijack a gesture that begins on a control.
    if (!fromGrip && event.target.closest('button, input, textarea, a')) return;

    tracking = true;
    startX = touch.clientX;
    startY = touch.clientY;
    lastY = touch.clientY;
    lastTime = event.timeStamp;
    velocity = 0;
  }

  function onMove(event) {
    if (!tracking) return;

    const touch = event.touches[0];
    const dx = touch.clientX - startX;
    const dy = touch.clientY - startY;

    if (!dragging) {
      if (Math.abs(dx) < START_SLOP && Math.abs(dy) < START_SLOP) return;
      // Sideways or upward gestures belong to the content, not the sheet.
      if (Math.abs(dx) > Math.abs(dy) || dy <= 0) {
        tracking = false;
        return;
      }
      dragging = true;
      // Cancel an entrance still in flight, otherwise it would replay when the
      // drag ends.
      dialog.classList.remove('is-open');
      dialog.classList.add('is-grabbed');
    }

    const elapsed = Math.max(1, event.timeStamp - lastTime);
    velocity = (touch.clientY - lastY) / elapsed;
    lastY = touch.clientY;
    lastTime = event.timeStamp;

    // Keeps the sheet body and everything behind it from scrolling along.
    event.preventDefault();
    dialog.style.setProperty('--drag-y', Math.max(0, dy) + 'px');
  }

  function onEnd() {
    if (!dragging) {
      tracking = false;
      return;
    }

    const travelled = lastY - startY;
    const height = dialog.getBoundingClientRect().height || 1;
    const dismiss = travelled > height * DISMISS_RATIO || velocity > DISMISS_VELOCITY;

    tracking = false;
    dragging = false;

    if (dismiss) {
      // Carry the sheet the rest of the way down, then close without
      // replaying the standard exit animation.
      settle(height + 48, () => {
        onDismiss();
        clear();
      });
    } else {
      settle(0, clear);
    }
  }

  function onCancel() {
    if (dragging) settle(0, clear);
    else clear();
  }

  dialog.addEventListener('touchstart', onStart, { passive: true });
  dialog.addEventListener('touchmove', onMove, { passive: false });
  dialog.addEventListener('touchend', onEnd);
  dialog.addEventListener('touchcancel', onCancel);
}
