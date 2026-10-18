import type { ControlType } from "@/shared/contracts/fieldMap";

/** Get the native value setter from the element's own prototype chain */
function getNativeValueSetter(
  el: HTMLElement
): ((v: string) => void) | undefined {
  let proto: object | null = Object.getPrototypeOf(el) as object | null;
  while (proto !== null) {
    const desc = Object.getOwnPropertyDescriptor(proto, "value");
    if (desc?.set) {
      return desc.set as (v: string) => void;
    }
    proto = Object.getPrototypeOf(proto) as object | null;
  }
  return undefined;
}

function getNativeCheckedSetter(
  el: HTMLElement
): ((v: boolean) => void) | undefined {
  let proto: object | null = Object.getPrototypeOf(el) as object | null;
  while (proto !== null) {
    const desc = Object.getOwnPropertyDescriptor(proto, "checked");
    if (desc?.set) {
      return desc.set as (v: boolean) => void;
    }
    proto = Object.getPrototypeOf(proto) as object | null;
  }
  return undefined;
}

/** Check if an element is an input element by tag name */
function isInput(el: HTMLElement): boolean {
  return el.tagName.toLowerCase() === "input";
}

function isSelect(el: HTMLElement): boolean {
  return el.tagName.toLowerCase() === "select";
}

function isTextArea(el: HTMLElement): boolean {
  return el.tagName.toLowerCase() === "textarea";
}

function getInputType(el: HTMLElement): string {
  return (el as HTMLInputElement).type?.toLowerCase() ?? "text";
}

/** Dispatch synthetic events to trigger React/Vue/Angular change detection */
function dispatchEvents(el: HTMLElement): void {
  el.dispatchEvent(new Event("input", { bubbles: true }));
  el.dispatchEvent(new Event("change", { bubbles: true }));
  el.dispatchEvent(new Event("blur", { bubbles: true }));
}

function dispatchChangeOnly(el: HTMLElement): void {
  el.dispatchEvent(new Event("change", { bubbles: true }));
}

/** Ensure the value looks like YYYY-MM-DD */
function formatDateValue(value: string): string {
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  const d = new Date(value);
  if (!isNaN(d.getTime())) {
    const yyyy = d.getUTCFullYear().toString();
    const mm = String(d.getUTCMonth() + 1).padStart(2, "0");
    const dd = String(d.getUTCDate()).padStart(2, "0");
    return `${yyyy}-${mm}-${dd}`;
  }
  return value;
}

/** Fill a text or textarea input */
function fillText(el: HTMLElement, value: string): boolean {
  if (!isInput(el) && !isTextArea(el)) return false;
  const setter = getNativeValueSetter(el);
  if (!setter) {
    // Fallback: direct assignment
    (el as HTMLInputElement).value = value;
    dispatchEvents(el);
    return true;
  }
  setter.call(el, value);
  dispatchEvents(el);
  return true;
}

/** Fill a date input */
function fillDate(el: HTMLElement, value: string): boolean {
  if (!isInput(el)) return false;
  const setter = getNativeValueSetter(el);
  const formatted = formatDateValue(value);
  if (!setter) {
    (el as HTMLInputElement).value = formatted;
    dispatchEvents(el);
    return true;
  }
  setter.call(el, formatted);
  dispatchEvents(el);
  return true;
}

/** Fill a select element by matching option text then value */
function fillSelect(el: HTMLElement, value: string): boolean {
  if (!isSelect(el)) return false;
  const selectEl = el as HTMLSelectElement;
  const normalizedValue = value.trim().toLowerCase();

  // Try to match by visible text first
  for (const opt of Array.from(selectEl.options)) {
    if (opt.text.trim().toLowerCase() === normalizedValue) {
      const setter = getNativeValueSetter(el);
      if (setter) {
        setter.call(el, opt.value);
      } else {
        selectEl.value = opt.value;
      }
      dispatchEvents(el);
      return true;
    }
  }

  // Try to match by option value
  for (const opt of Array.from(selectEl.options)) {
    if (opt.value.trim().toLowerCase() === normalizedValue) {
      const setter = getNativeValueSetter(el);
      if (setter) {
        setter.call(el, opt.value);
      } else {
        selectEl.value = opt.value;
      }
      dispatchEvents(el);
      return true;
    }
  }

  return false;
}

/** Fill a radio group: find the radio with matching value, check it */
function fillRadio(el: HTMLElement, value: string): boolean {
  if (!isInput(el) || getInputType(el) !== "radio") {
    // el might not be a radio itself — try to find radios with matching name in the document
    return false;
  }
  const inputEl = el as HTMLInputElement;
  const name = inputEl.getAttribute("name");
  if (!name) return false;

  // Find all radios with this name in the document
  const doc = el.ownerDocument;
  if (!doc) return false;

  const escapedName = name.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
  const radios = doc.querySelectorAll<HTMLInputElement>(
    `input[type="radio"][name="${escapedName}"]`
  );
  for (const radio of Array.from(radios)) {
    if (radio.value === value) {
      const setter = getNativeCheckedSetter(radio);
      if (setter) {
        setter.call(radio, true);
      } else {
        radio.checked = true;
      }
      dispatchChangeOnly(radio);
      return true;
    }
  }

  // Case-insensitive fallback
  for (const radio of Array.from(radios)) {
    if (radio.value.toLowerCase() === value.toLowerCase()) {
      const setter = getNativeCheckedSetter(radio);
      if (setter) {
        setter.call(radio, true);
      } else {
        radio.checked = true;
      }
      dispatchChangeOnly(radio);
      return true;
    }
  }

  return false;
}

/** Fill a checkbox */
function fillCheckbox(el: HTMLElement, value: string): boolean {
  if (!isInput(el) || getInputType(el) !== "checkbox") return false;
  const inputEl = el as HTMLInputElement;
  const setter = getNativeCheckedSetter(el);
  const checked = value === "true";
  if (setter) {
    setter.call(el, checked);
  } else {
    inputEl.checked = checked;
  }
  dispatchChangeOnly(el);
  return true;
}

/**
 * Set the value of a form control.
 * Returns true on success, false if the element type is unsupported or option not found.
 */
export function setValue(
  el: HTMLElement,
  value: string,
  control: ControlType
): boolean {
  switch (control) {
    case "text":
    case "textarea":
      return fillText(el, value);
    case "date":
      return fillDate(el, value);
    case "select":
      return fillSelect(el, value);
    case "radio":
      return fillRadio(el, value);
    case "checkbox":
      return fillCheckbox(el, value);
    default: {
      const _exhaustive: never = control;
      void _exhaustive;
      return false;
    }
  }
}

/** Check if an element already has a non-empty value */
export function hasValue(el: HTMLElement): boolean {
  if (isInput(el)) {
    const type = getInputType(el);
    if (type === "radio" || type === "checkbox") {
      return (el as HTMLInputElement).checked;
    }
    return (el as HTMLInputElement).value.trim() !== "";
  }
  if (isSelect(el)) {
    return (el as HTMLSelectElement).value !== "";
  }
  if (isTextArea(el)) {
    return (el as HTMLTextAreaElement).value.trim() !== "";
  }
  return false;
}
