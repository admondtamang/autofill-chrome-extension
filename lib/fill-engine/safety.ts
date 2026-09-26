/** Elements the engine must never write to, click, or dispatch events on. */
// Deliberately broad. A false positive costs one visible `not_found`; a false negative
// lodges an unreviewed visa application. ImmiAccount's own verb is "Lodge".
const DANGER =
  /\b(submit|next|pay|payment|declar\w*|continue|confirm\w*|agree\w*|consent|accept\w*|acknowledg\w*|proceed|finish|complete[sd]?|lodge\w*|send|save|apply|ok)\b/i;

const textOf = (el: Element): string =>
  [
    el.id,
    el.getAttribute('name') ?? '',
    el.getAttribute('value') ?? '',
    el.getAttribute('aria-label') ?? '',
    el.textContent ?? '',
    el.closest('label')?.textContent ?? '', // catches "I declare ..." wrapping a bare checkbox
  ].join(' ');

/**
 * Hard refusal. Two independent gates: structure (what the element *is*, regardless of
 * wording) and vocabulary (`DANGER`). Either one refusing is a refusal.
 */
export function isUnsafe(el: Element): boolean {
  if (el instanceof HTMLFormElement) return true;
  // formaction/formmethod only exist to submit a form, whatever the element is called.
  if (el.hasAttribute('formaction') || el.hasAttribute('formmethod')) return true;
  // `type` is the IDL property: a <button> with no type attribute reports 'submit'.
  if (el instanceof HTMLButtonElement && el.type === 'submit') return true;
  if (el instanceof HTMLInputElement && (el.type === 'submit' || el.type === 'image')) return true;
  return DANGER.test(textOf(el));
}
