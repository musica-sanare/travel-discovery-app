/** Shared Tailwind class strings for the public UI. */
const buttonBase =
  "inline-flex min-h-11 items-center justify-center gap-2 rounded-full py-2 text-base font-semibold no-underline transition-colors hover:no-underline disabled:cursor-not-allowed";

export const buttonClass = {
  primary: `${buttonBase} bg-sun px-6 text-sun-ink shadow-sm hover:not-disabled:bg-sun/85 disabled:bg-line disabled:text-muted disabled:shadow-none`,
  secondary: `${buttonBase} border border-line bg-surface px-5 text-ink hover:border-accent hover:bg-accent-soft disabled:opacity-50`,
  quiet: `${buttonBase} px-3 text-accent hover:bg-accent-soft disabled:opacity-50`,
} as const;

export const cardClass = "rounded-2xl border border-line bg-surface p-5 shadow-sm sm:p-6";

/** Text and select fields; callers set the width. */
export const fieldClass =
  "min-h-11 rounded-lg border border-line bg-surface px-3 py-2 text-base text-ink aria-invalid:border-warn-ink aria-invalid:bg-warn-soft";

export const choiceClass =
  "flex min-h-14 cursor-pointer items-center gap-3 rounded-xl border border-line bg-surface px-4 py-3 font-medium transition-colors hover:border-accent hover:bg-accent-soft has-checked:border-accent has-checked:bg-accent-soft has-checked:ring-1 has-checked:ring-accent";

/** Compact pill-shaped checkbox choice, such as a travel month. */
export const chipClass =
  "flex min-h-11 cursor-pointer items-center gap-2 rounded-full border border-line bg-surface px-4 py-2 text-sm font-medium transition-colors hover:border-accent hover:bg-accent-soft has-checked:border-accent has-checked:bg-accent-soft has-checked:text-ink";

export const noticeClass = {
  info: "rounded-lg bg-accent-soft px-4 py-3 text-sm",
  warn: "rounded-lg bg-warn-soft px-4 py-3 text-sm text-warn-ink",
} as const;

export const headingClass = "text-2xl font-bold tracking-tight sm:text-3xl";

/** Small monospaced caption in the style of a boarding pass or departure board. */
export const ticketLabelClass = "font-mono text-xs font-semibold tracking-[0.18em] uppercase";
