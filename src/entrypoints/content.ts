import type { ContentScriptRequest, DragStartMessage, ScannedField } from "@/shared/contracts/messages";
import type { FillReport } from "@/shared/contracts/fillReport";
import type { ControlType } from "@/shared/contracts/fieldMap";
import { emptyFillReport } from "@/shared/contracts/fillReport";
import { PICK_MODE_TIMEOUT_MS } from "@/shared/config";
import { fillAll, clickToFill, dropFill } from "@/filler/engine";
import { clearHighlights, highlightFilled } from "@/filler/highlights";
import { setValue } from "@/filler/controls";
import { getMapForPage, ALL_FIELD_MAPS } from "@/field-maps/index";

// ─── State ────────────────────────────────────────────────────────────────────

let lastFocused: HTMLElement | null = null;
let inPickMode = false;
let pickModeProfilePath = "";
let pickModeValue = "";
let pickModeControl: ControlType = "text";
let pickModeTimeout: ReturnType<typeof setTimeout> | null = null;
let lastDragProfilePath = "";
let lastDragTimestamp = 0;

// ─── Helpers ─────────────────────────────────────────────────────────────────

function isFormControl(el: EventTarget | null): el is HTMLElement {
  return (
    el instanceof HTMLInputElement ||
    el instanceof HTMLSelectElement ||
    el instanceof HTMLTextAreaElement
  );
}

function syntheticFallback() {
  return (
    ALL_FIELD_MAPS[0] ?? {
      id: "fallback",
      pageMatcher: /./,
      verified: false,
      fields: [],
    }
  );
}

function collectFormControls(): ScannedField[] {
  const controls = document.querySelectorAll<HTMLElement>(
    "input:not([type=hidden]), select, textarea"
  );
  return Array.from(controls).map((el) => {
    const id = el.id ?? "";
    const name = (el as HTMLInputElement).name ?? "";
    // Find associated label
    let label = "";
    if (id) {
      const labelEl = document.querySelector<HTMLLabelElement>(`label[for="${id}"]`);
      if (labelEl) label = labelEl.textContent?.trim() ?? "";
    }
    if (!label) {
      const parentLabel = el.closest("label");
      if (parentLabel) label = parentLabel.textContent?.trim() ?? "";
    }
    return {
      id,
      name,
      tag: el.tagName.toLowerCase(),
      type: el instanceof HTMLInputElement ? el.type : el.tagName.toLowerCase(),
      placeholder: (el as HTMLInputElement).placeholder ?? "",
      label,
      ariaLabel: el.getAttribute("aria-label") ?? "",
      value:
        el instanceof HTMLInputElement ||
        el instanceof HTMLSelectElement ||
        el instanceof HTMLTextAreaElement
          ? el.value
          : "",
    };
  });
}

// ─── Pick mode ────────────────────────────────────────────────────────────────

function exitPickMode(): void {
  if (!inPickMode) return;
  inPickMode = false;
  if (pickModeTimeout !== null) {
    clearTimeout(pickModeTimeout);
    pickModeTimeout = null;
  }
  document.body.style.removeProperty("cursor");
  document.removeEventListener("mouseover", handlePickModeMouseOver);
  document.removeEventListener("click", handlePickModeClick, true);
  document.removeEventListener("keydown", handlePickModeKeyDown);
}

function handlePickModeMouseOver(e: MouseEvent): void {
  if (!(e.target instanceof HTMLElement)) return;
  if (isFormControl(e.target)) {
    e.target.style.outline = "2px dashed #2563eb";
  }
}

function handlePickModeClick(e: MouseEvent): void {
  if (!(e.target instanceof HTMLElement)) return;
  if (!isFormControl(e.target)) return;
  e.preventDefault();
  e.stopPropagation();

  const el = e.target;
  const success = setValue(el, pickModeValue, pickModeControl);
  if (success) {
    highlightFilled(el);
    chrome.runtime.sendMessage({
      type: "fill.result",
      payload: {
        filled: [pickModeProfilePath],
        skipped: [],
        notFound: [],
        failed: [],
      } satisfies FillReport,
    });
  }
  exitPickMode();
}

function handlePickModeKeyDown(e: KeyboardEvent): void {
  if (e.key === "Escape") {
    exitPickMode();
  }
}

function enterPickMode(
  profilePath: string,
  value: string,
  control: ControlType = "text"
): void {
  if (inPickMode) exitPickMode();
  inPickMode = true;
  pickModeProfilePath = profilePath;
  pickModeValue = value;
  pickModeControl = control;

  document.body.style.cursor = "crosshair";
  document.addEventListener("mouseover", handlePickModeMouseOver);
  document.addEventListener("click", handlePickModeClick, true);
  document.addEventListener("keydown", handlePickModeKeyDown);

  pickModeTimeout = setTimeout(() => {
    exitPickMode();
  }, PICK_MODE_TIMEOUT_MS);
}

// ─── WXT default export ───────────────────────────────────────────────────────

export default defineContentScript({
  matches: ["https://online.immi.gov.au/*"],
  allFrames: true,
  main() {
    // ─── Drag handling ──────────────────────────────────────────────────
    document.addEventListener("dragover", (e: DragEvent) => {
      if (e.target instanceof HTMLElement && isFormControl(e.target)) {
        e.preventDefault();
      }
    });

    document.addEventListener(
      "drop",
      (e: DragEvent) => {
        if (!(e.target instanceof HTMLElement)) return;
        if (!isFormControl(e.target)) return;
        e.preventDefault();

        const dt = e.dataTransfer;
        if (!dt) return;

        // Try custom MIME first
        const customData = dt.getData("application/x-immifill+json");
        if (customData) {
          try {
            const parsed = JSON.parse(customData) as {
              profilePath: string;
              value: string;
              control?: ControlType;
            };
            const control: ControlType = parsed.control ?? "text";
            void dropFill(parsed.profilePath, parsed.value, e.target, control);
            return;
          } catch {
            // fall through
          }
        }

        // Fallback to text/plain + lastDragProfilePath (only if set within last 5 seconds)
        const textData = dt.getData("text/plain");
        const DRAG_STALE_MS = 5000;
        const dragIsRecent = Date.now() - lastDragTimestamp < DRAG_STALE_MS;
        if (textData && lastDragProfilePath && dragIsRecent) {
          void dropFill(lastDragProfilePath, textData, e.target, "text");
          return;
        }

        // External or stale drop — skip fill rather than filling with wrong path
      },
      { capture: true }
    );

    // ─── Focus tracking ─────────────────────────────────────────────────
    document.addEventListener("focusin", (e: FocusEvent) => {
      if (e.target instanceof HTMLElement && isFormControl(e.target)) {
        lastFocused = e.target;
      }
    });

    // ─── Message handler ────────────────────────────────────────────────
    chrome.runtime.onMessage.addListener(
      (msg: ContentScriptRequest, _sender, sendResponse) => {
        (async () => {
          switch (msg.type) {
            case "fill.all": {
              const { profile, overwrite } = msg.payload;
              const fieldMap =
                getMapForPage(location.href) ?? syntheticFallback();
              const report = await fillAll(profile, overwrite, fieldMap);
              sendResponse({ ok: true, data: report });
              break;
            }

            case "fill.click": {
              const { profilePath, value } = msg.payload;
              if (lastFocused) {
                const report = await clickToFill(
                  profilePath,
                  value,
                  lastFocused,
                  "text"
                );
                sendResponse({ ok: true, data: report });
              } else {
                // Enter pick mode; report sent via chrome.runtime.sendMessage
                enterPickMode(profilePath, value, "text");
                sendResponse({ ok: true, data: emptyFillReport() });
              }
              break;
            }

            case "fill.scan": {
              const controls = collectFormControls();
              sendResponse({ ok: true, data: controls });
              break;
            }

            case "fill.pickMode": {
              const { profilePath, value } = msg.payload;
              enterPickMode(profilePath, value, "text");
              sendResponse({ ok: true, data: emptyFillReport() });
              break;
            }

            case "fill.byIds": {
              const { fields } = msg.payload;
              const filled: string[] = [];
              const failed: Array<{ field: string; reason: string }> = [];
              for (const f of fields) {
                let el: HTMLElement | null = null;
                if (f.id) el = document.getElementById(f.id);
                if (!el && f.name) el = document.querySelector<HTMLElement>(`[name="${f.name}"]`);
                if (el) {
                  const ok = setValue(el, f.value, "text");
                  if (ok) {
                    highlightFilled(el);
                    filled.push(f.id ?? f.name ?? "");
                  } else {
                    failed.push({ field: f.id ?? f.name ?? "", reason: "setValue returned false" });
                  }
                } else {
                  failed.push({ field: f.id ?? f.name ?? "", reason: "element not found" });
                }
              }
              sendResponse({ ok: true, data: { filled, skipped: [], notFound: [], failed } satisfies FillReport });
              break;
            }

            default: {
              sendResponse({ ok: false, error: "unknown message type" });
            }
          }
        })().catch((err: unknown) => {
          const message = err instanceof Error ? err.message : String(err);
          sendResponse({ ok: false, error: message });
        });

        // Return true to indicate async response
        return true;
      }
    );

    // ─── dragstart relay ────────────────────────────────────────────────
    document.addEventListener("dragstart", (e: DragEvent) => {
      const target = e.target;
      if (!(target instanceof HTMLElement)) return;

      const profilePath = target.dataset["immifillPath"];
      const value = target.dataset["immifillValue"];
      if (!profilePath || !value) return;

      lastDragProfilePath = profilePath;
      lastDragTimestamp = Date.now();

      // Set custom MIME on the data transfer
      if (e.dataTransfer) {
        e.dataTransfer.setData(
          "application/x-immifill+json",
          JSON.stringify({ profilePath, value })
        );
        e.dataTransfer.setData("text/plain", value);
      }

      // Relay to background
      const dragMsg: DragStartMessage = {
        type: "fill.dragStart",
        payload: { profilePath, value },
      };
      chrome.runtime.sendMessage(dragMsg);
    });

    // ─── Cleanup on unload ──────────────────────────────────────────────
    window.addEventListener("unload", () => {
      exitPickMode();
      clearHighlights(document);
    });
  },
});
