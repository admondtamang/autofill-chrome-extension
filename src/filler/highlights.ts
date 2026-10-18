const CLASS_FILLED = "immifill-filled";
const CLASS_UNFILLED = "immifill-unfilled";

const STYLE_FILLED = "outline: 2px solid #16a34a; outline-offset: 2px;";
const STYLE_UNFILLED = "outline: 2px solid #d97706; outline-offset: 2px;";

function applyOutline(el: Element, color: string): void {
  const htmlEl = el as HTMLElement;
  if (htmlEl.style !== undefined) {
    htmlEl.style.outline = `2px solid ${color}`;
    htmlEl.style.outlineOffset = "2px";
  }
}

function removeOutline(el: Element): void {
  const htmlEl = el as HTMLElement;
  if (htmlEl.style !== undefined) {
    htmlEl.style.removeProperty("outline");
    htmlEl.style.removeProperty("outline-offset");
  }
}

/**
 * Highlights an element that was successfully filled (green outline).
 * Uses inline styles — no extension CSS required.
 */
export function highlightFilled(el: Element): void {
  el.classList.add(CLASS_FILLED);
  el.classList.remove(CLASS_UNFILLED);
  applyOutline(el, "#16a34a");
}

/**
 * Highlights an element that could not be filled (amber outline).
 */
export function highlightUnfilled(el: Element): void {
  el.classList.add(CLASS_UNFILLED);
  el.classList.remove(CLASS_FILLED);
  applyOutline(el, "#d97706");
}

/**
 * Removes all immifill highlight classes and inline styles from the document.
 * Accepts any Document-like object (works across JSDOM instances).
 */
export function clearHighlights(root?: Document): void {
  // Use the passed document, or the global document as fallback
  // Check nodeType to avoid instanceof across JSDOM contexts
  const doc: Document =
    root !== undefined && root !== null ? root : document;

  const filled = Array.from(doc.querySelectorAll(`.${CLASS_FILLED}`));
  const unfilled = Array.from(doc.querySelectorAll(`.${CLASS_UNFILLED}`));

  for (const el of [...filled, ...unfilled]) {
    el.classList.remove(CLASS_FILLED, CLASS_UNFILLED);
    removeOutline(el);
  }
}

// Expose style constants for testing
export { STYLE_FILLED, STYLE_UNFILLED };
