/** Shared Tailwind class strings for the public UI. */
const buttonBase =
  "inline-flex min-h-11 items-center justify-center gap-2 rounded-lg py-2 text-base font-semibold no-underline transition-colors hover:no-underline disabled:cursor-not-allowed disabled:opacity-50";

export const buttonClass = {
  primary: `${buttonBase} bg-accent px-5 text-accent-ink hover:bg-accent/90`,
  secondary: `${buttonBase} border border-line bg-surface px-5 text-ink hover:bg-accent-soft`,
  quiet: `${buttonBase} px-3 text-accent hover:bg-accent-soft`,
} as const;

export const cardClass = "rounded-2xl border border-line bg-surface p-5 shadow-sm sm:p-6";

export const fieldClass =
  "min-h-11 w-full rounded-lg border border-line bg-surface px-3 py-2 text-base text-ink sm:w-auto";

export const choiceClass =
  "flex min-h-11 cursor-pointer items-center gap-3 rounded-lg border border-line bg-surface px-4 py-2 transition-colors hover:bg-accent-soft has-checked:border-accent has-checked:bg-accent-soft";

export const noticeClass = {
  info: "rounded-lg bg-accent-soft px-4 py-3 text-sm",
  warn: "rounded-lg bg-warn-soft px-4 py-3 text-sm text-warn-ink",
} as const;

export const headingClass = "text-2xl font-bold tracking-tight sm:text-3xl";
