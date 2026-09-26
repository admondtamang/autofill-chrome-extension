/** Elements the engine must never write to, click, or dispatch events on. */
const DANGER = /submit|next|pay|declar|continue/i;

const textOf = (el: Element): string =>
  [
    el.id,
    el.getAttribute('name') ?? '',
    el.getAttribute('value') ?? '',
    el.getAttribute('aria-label') ?? '',
    el.textContent ?? '',
    el.closest('label')?.textContent ?? '', // catches "I declare ..." wrapping a bare checkbox
  ].join(' ');

/** Hard refusal: submit/next/pay/declaration semantics, or a form itself. */
export function isUnsafe(el: Element): boolean {
  if (el instanceof HTMLFormElement) return true;
  if (el instanceof HTMLInputElement && el.type === 'submit') return true;
  if (el instanceof HTMLButtonElement && el.type === 'submit') return true; // bare <button> defaults to submit
  return DANGER.test(textOf(el));
}
