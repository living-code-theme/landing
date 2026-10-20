// Class lists the components share, so a button or a heading looks the same on every page.

const button = "inline-flex min-h-[52px] items-center justify-between gap-8 px-[22px] text-[0.8125rem] font-medium whitespace-nowrap no-underline transition-[background-color,color,scale] duration-200 active:scale-[0.97]";
export const fill = `${button} bg-accent text-bg hover:bg-accent-2`;
export const quiet = `${button} border border-line bg-bg text-fg hover:bg-surface`;

export const h2 = "text-h2 font-semibold text-balance";
export const h3 = "text-h3 font-semibold";
export const lead = "text-lead text-fg-alt max-w-[34em] text-pretty";
export const meta = "text-sm text-muted";
export const link = "draw inline-flex items-center gap-2.5 pb-0.5 font-medium text-accent no-underline";
export const back = "inline-flex items-center gap-2.5 text-sm text-muted no-underline transition-colors hover:text-fg";

// A section's opening: a large two-line title on the left, a short paragraph on the right.
export const split = "grid items-end gap-x-[clamp(40px,6vw,96px)] gap-y-8 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)] mb-[clamp(48px,6vw,88px)]";
export const section = "shell pt-(--section)";
