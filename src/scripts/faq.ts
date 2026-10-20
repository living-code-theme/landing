// Animate native disclosures without relying on ::details-content/interpolate-size browser support.
// Keep details open through its closing animation, then let the browser hide the answer normally.
export function faqAccordions() {
  const reduced = matchMedia("(prefers-reduced-motion: reduce)");
  const controllers: { close: () => void; expanded: () => boolean; cleanup: () => void }[] = [];
  document.querySelectorAll<HTMLDetailsElement>("#faq details").forEach((details) => {
    const summary = details.querySelector<HTMLElement>("summary")!;
    const answer = details.querySelector<HTMLElement>("p")!;
    if (typeof details.animate !== "function") return;
    const name = details.getAttribute("name");
    // Native grouping closes siblings instantly. Coordinate them here so their exits can finish.
    details.removeAttribute("name");
    let expanded = details.open;
    let panelMotion: Animation | undefined, textMotion: Animation | undefined;
    const overflow = details.style.overflow;
    const cancel = () => {
      panelMotion?.cancel();
      textMotion?.cancel();
      panelMotion = textMotion = undefined;
    };
    const settle = () => {
      cancel();
      details.open = expanded;
      details.removeAttribute("data-closing");
      details.style.overflow = overflow;
    };
    const change = (open: boolean) => {
      const from = details.getBoundingClientRect().height;
      const opacity = details.open ? getComputedStyle(answer).opacity : "0";
      cancel();
      expanded = open;
      summary.setAttribute("aria-expanded", String(open));
      details.toggleAttribute("data-closing", !open);
      if (reduced.matches) { settle(); return; }
      details.open = true;
      const style = getComputedStyle(details);
      const border = parseFloat(style.borderTopWidth) + parseFloat(style.borderBottomWidth);
      const to = summary.getBoundingClientRect().height + border + (open ? answer.getBoundingClientRect().height : 0);
      details.style.overflow = "hidden";
      panelMotion = details.animate([{ height: `${from}px` }, { height: `${to}px` }], {
        duration: open ? 420 : 300, easing: "cubic-bezier(0.22, 1, 0.36, 1)", fill: "both",
      });
      textMotion = answer.animate([{ opacity }, { opacity: open ? 1 : 0 }], {
        duration: open ? 280 : 180, easing: "ease-out", fill: "both",
      });
      const current = panelMotion;
      current.onfinish = () => { if (panelMotion === current) settle(); };
    };
    const click = (event: MouseEvent) => {
      event.preventDefault();
      if (!expanded) controllers.forEach((item) => { if (item.expanded()) item.close(); });
      change(!expanded);
    };
    summary.setAttribute("aria-expanded", String(expanded));
    summary.addEventListener("click", click);
    const preference = () => { if (reduced.matches) settle(); };
    reduced.addEventListener("change", preference);
    controllers.push({
      close: () => change(false), expanded: () => expanded,
      cleanup: () => {
        settle();
        summary.removeEventListener("click", click);
        summary.removeAttribute("aria-expanded");
        reduced.removeEventListener("change", preference);
        if (name !== null) details.setAttribute("name", name);
      },
    });
  });
  return () => controllers.forEach((item) => item.cleanup());
}
