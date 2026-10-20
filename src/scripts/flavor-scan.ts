// Flavor changes stay on the live document. A view-transition snapshot cannot
// follow scrolling: cancelling it cuts the scan short, while keeping it misaligns
// the frozen old page with the scrolling new one.
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
  document.body.append(scan);
  update();

  const animation = scan.animate(
    [{ transform: "translateY(0)" }, { transform: "translateY(100dvh)" }],
    { duration: 1000, easing: "cubic-bezier(0.65, 0, 0.35, 1)", fill: "both" },
  );
  let cleaned = false;
  const cleanup = () => {
    if (cleaned) return;
    cleaned = true;
    animation.cancel();
    scan.remove();
    delete root.dataset.flavorSwitch;
    stop = undefined;
  };
  stop = cleanup;
  animation.finished.then(cleanup, cleanup);
}
