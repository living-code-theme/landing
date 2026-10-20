// Keep the native modal (and its backdrop/focus trap) alive until its exit finishes.
// Native close() removes it immediately in browsers without discrete overlay transitions.
const exits = new WeakMap<HTMLDialogElement, Animation>();

export function cancelFinderClose(dialog: HTMLDialogElement) {
  const exit = exits.get(dialog);
  exits.delete(dialog);
  delete dialog.dataset.closing;
  exit?.cancel();
}

export function closeFinder(dialog: HTMLDialogElement) {
  if (!dialog.open || exits.has(dialog)) return;
  if (matchMedia("(prefers-reduced-motion: reduce)").matches || typeof dialog.animate !== "function") {
    dialog.close();
    return;
  }

  // Start at the current pose, including when dismissed partway through its entrance.
  const pose = getComputedStyle(dialog);
  const exit = dialog.animate([
    { opacity: pose.opacity, transform: pose.transform },
    { opacity: 0, transform: "translateY(12px) scale(0.98)" },
  ], { duration: 180, easing: "ease-in", fill: "forwards" });
  exits.set(dialog, exit);
  dialog.dataset.closing = "";
  exit.finished.then(() => {
    if (exits.get(dialog) !== exit) return;
    dialog.close();
    cancelFinderClose(dialog);
  }, () => {
    // Reopening cancels the exit; its old completion must not close the reopened finder.
    if (exits.get(dialog) === exit) cancelFinderClose(dialog);
  });
}
