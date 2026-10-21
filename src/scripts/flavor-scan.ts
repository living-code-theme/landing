// The old palette is clipped away behind the scan. If the visitor scrolls, drop
// the viewport snapshots but let the live scan finish over the scrolling page.
import { interruptOnScroll } from "./transitions.ts";

let stop: (() => void) | undefined;

export function cancelFlavorScan() {
  stop?.();
}

export function scanFlavor(id: string, update: () => void) {
  cancelFlavorScan();
  const root = document.documentElement;
  const scan = document.createElement("div");
  scan.className = "scan";
  scan.setAttribute("aria-hidden", "true");
  const command = document.createElement("code");
  command.textContent = `:colorscheme living-code-${id}`;
  scan.append(command);
  root.dataset.flavorSwitch = "";
  root.dataset.flavorTarget = id;

  let animation: Animation | undefined;
  let transition: ViewTransition | undefined;
  let cleaned = false, updated = false;
  const updateOnce = () => {
    if (updated) return;
    updated = true;
    update();
  };
  const cleanup = () => {
    if (cleaned) return;
    cleaned = true;
    // Even a scan replaced before its first frame must commit its selection.
    updateOnce();
    transition?.skipTransition();
    animation?.cancel();
    scan.remove();
    delete root.dataset.flavorSwitch;
    delete root.dataset.flavorTarget;
    stop = undefined;
  };
  stop = cleanup;

  const repaint = () => {
    if (cleaned) return;
    updateOnce();
    document.body.append(scan);
  };
  const start = () => {
    if (cleaned || animation) return;
    // The snapshot's wipe and scan use this same duration and easing in site.css.
    animation = scan.animate(
      [{ transform: "translateY(0)" }, { transform: "translateY(100dvh)" }],
      { duration: 1000, easing: "cubic-bezier(0.65, 0, 0.35, 1)", fill: "both" },
    );
    animation.finished.then(cleanup, cleanup);
  };

  if (!document.startViewTransition) {
    repaint();
    start();
    return;
  }

  transition = document.startViewTransition(repaint);
  interruptOnScroll(transition);
  transition.ready.then(start, () => {
    // A skipped snapshot still runs its update; start the live fallback afterward.
    transition!.updateCallbackDone.then(start, cleanup);
  });
}
