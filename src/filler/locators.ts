import type { LocatorStrategy } from "@/shared/contracts/fieldMap";

/** Normalize whitespace and lowercase a string for comparison */
function normalizeText(text: string): string {
  return text.replace(/\s+/g, " ").trim().toLowerCase();
}

const FORM_CONTROL_TAGS = new Set(["input", "select", "textarea"]);

function isFormControlElement(el: Element): boolean {
  return FORM_CONTROL_TAGS.has(el.tagName.toLowerCase());
}

/** Find the first form control descendant of an element */
function firstControlDescendant(el: Element): HTMLElement | null {
  const found = el.querySelector("input, select, textarea");
  if (found && isFormControlElement(found)) return found as HTMLElement;
  return null;
}

/** Check if a node is a Document (nodeType 9) without using instanceof */
function isDocumentNode(node: Document | Element): node is Document {
  return node.nodeType === 9;
}

/** Get the owning Document from a Document or Element */
function getDocument(root: Document | Element): Document {
  if (isDocumentNode(root)) return root;
  // ownerDocument is always non-null for any Element
  // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
  return root.ownerDocument!;
}

/** Resolve using label text matching */
function resolveByLabel(
  value: string,
  root: Document | Element
): HTMLElement | null {
  const normalized = normalizeText(value);
  const doc = getDocument(root);

  // Collect all labels in root
  const labels = Array.from(root.querySelectorAll("label"));

  for (const label of labels) {
    const labelText = normalizeText(label.textContent ?? "");
    if (labelText === normalized) {
      // Check for[for] attribute
      const forAttr = label.getAttribute("for");
      if (forAttr) {
        const el = doc.getElementById(forAttr);
        if (el && isFormControlElement(el)) return el as HTMLElement;
      }
      // Check for descendant control
      const descendant = firstControlDescendant(label);
      if (descendant) return descendant;
    }
  }

  // Check adjacent <td> cells (table-based layouts)
  for (const label of labels) {
    const labelText = normalizeText(label.textContent ?? "");
    if (labelText === normalized) {
      const td = label.closest("td");
      if (td) {
        const nextTd = td.nextElementSibling;
        if (nextTd) {
          const control = firstControlDescendant(nextTd);
          if (control) return control;
        }
      }
    }
  }

  // Also check legend text inside fieldsets (for radio groups)
  const fieldsets = Array.from(root.querySelectorAll("fieldset"));

  for (const fieldset of fieldsets) {
    const legend = fieldset.querySelector("legend");
    if (!legend) continue;
    const legendText = normalizeText(legend.textContent ?? "");
    if (legendText === normalized) {
      // Return the first input inside the fieldset
      const firstInput = fieldset.querySelector("input");
      if (firstInput) return firstInput as HTMLElement;
    }
  }

  return null;
}

/** Resolve using aria-label or aria-labelledby */
function resolveByAriaLabel(
  value: string,
  root: Document | Element
): HTMLElement | null {
  const normalized = normalizeText(value);
  const doc = getDocument(root);

  const candidates = Array.from(
    root.querySelectorAll("[aria-label], [aria-labelledby]")
  );

  for (const el of candidates) {
    if (!isFormControlElement(el)) continue;

    // Check aria-label
    const ariaLabel = el.getAttribute("aria-label");
    if (ariaLabel && normalizeText(ariaLabel) === normalized) {
      return el as HTMLElement;
    }

    // Check aria-labelledby
    const labelledBy = el.getAttribute("aria-labelledby");
    if (labelledBy) {
      const labelEl = doc.getElementById(labelledBy);
      if (labelEl && normalizeText(labelEl.textContent ?? "") === normalized) {
        return el as HTMLElement;
      }
    }
  }

  return null;
}

/** Resolve using name or id attribute — last resort */
function resolveByNameId(
  value: string,
  root: Document | Element
): HTMLElement | null {
  const el = root.querySelector<HTMLElement>(
    `[name="${CSS.escape(value)}"], #${CSS.escape(value)}`
  );
  return el ?? null;
}

/**
 * Resolves a LocatorStrategy to an HTMLElement (form control), or null if not found.
 * Try order: label → aria-label → name-id
 */
export function resolveElement(
  locator: LocatorStrategy,
  root: Document | Element = document
): HTMLElement | null {
  switch (locator.type) {
    case "label":
      return resolveByLabel(locator.value, root);
    case "aria-label":
      return resolveByAriaLabel(locator.value, root);
    case "name-id":
      return resolveByNameId(locator.value, root);
  }
}
