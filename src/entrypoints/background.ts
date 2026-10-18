import type { AnyMessage, FillByIdsRequest } from "@/shared/contracts/messages";
import type { ScannedField } from "@/shared/contracts/messages";
import { handleGetSession, handleLogin, handleLogout } from "../background/handlers/authHandlers";
import { handleGet, handleSearch } from "../background/handlers/recordHandlers";

// ── helpers ───────────────────────────────────────────────────────────────────

/**
 * Get the active tab in the last focused normal browser window.
 * Using getLastFocused because the background service worker has no "current window",
 * so `currentWindow: true` in tabs.query returns unreliable results.
 */
async function getActiveTab(): Promise<chrome.tabs.Tab | null> {
  try {
    const win = await chrome.windows.getLastFocused({ populate: false, windowTypes: ["normal"] });
    if (!win.id) return null;
    const tabs = await chrome.tabs.query({ active: true, windowId: win.id });
    return tabs[0] ?? null;
  } catch {
    // Fallback for environments where windows API is unavailable
    const tabs = await chrome.tabs.query({ active: true });
    return tabs[0] ?? null;
  }
}

/**
 * Relay a fill.* message to the content script on the active tab.
 * Used for fill.all / fill.click / fill.pickMode which need the
 * full content-script engine (highlights, pick-mode cursor, etc.).
 */
async function relayToContentScript(msg: unknown): Promise<unknown> {
  const tab = await getActiveTab();
  if (!tab?.id) return { ok: false, error: "No active tab found" };
  try {
    return await chrome.tabs.sendMessage(tab.id, msg);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { ok: false, error: message };
  }
}

/**
 * Scan the active tab's form fields using chrome.scripting.executeScript.
 * Works on any page — does NOT require the content script to be running.
 */
async function scanPageWithScripting(): Promise<{ ok: true; data: ScannedField[] } | { ok: false; error: string }> {
  const tab = await getActiveTab();
  if (!tab?.id) return { ok: false, error: "No active tab found" };

  try {
    const results = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      // NOTE: this function runs in the page context — no TS types, no imports.
      func: () => {
        type FieldEntry = {
          id: string; name: string; tag: string; type: string;
          placeholder: string; label: string; ariaLabel: string; value: string;
          options?: Array<{ value: string; label: string }>;
        };

        function getLabel(el: Element): string {
          const id = el.id;
          // 1. Standard label[for=id]
          if (id) {
            const lbl = document.querySelector(`label[for="${id}"]`);
            if (lbl) return (lbl.textContent ?? "").trim();
          }
          // 2. WC pattern: label[for="${name}_input"] (when id has _input suffix)
          const inp = el as HTMLInputElement;
          if (inp.name) {
            const lbl = document.querySelector(`label[for="${inp.name}_input"]`);
            if (lbl) return (lbl.textContent ?? "").trim();
          }
          // 3. aria-labelledby
          const labelledBy = el.getAttribute("aria-labelledby");
          if (labelledBy) {
            const lbl = document.getElementById(labelledBy);
            if (lbl) return (lbl.textContent ?? "").trim();
          }
          // 4. Wrapping label
          const parentLabel = el.closest("label");
          if (parentLabel) return (parentLabel.textContent ?? "").trim();
          // 5. Fieldset legend (for radio/checkbox groups)
          const fieldset = el.closest("fieldset");
          if (fieldset) {
            const legend = fieldset.querySelector("legend");
            if (legend) return (legend.textContent ?? "").trim();
          }
          return "";
        }

        const fields: FieldEntry[] = [];
        const seenRadioNames = new Set<string>();

        // Handle radio/checkbox groups first — one entry per name group
        document.querySelectorAll("input[type=radio], input[type=checkbox]").forEach((el) => {
          const inp = el as HTMLInputElement;
          if (!inp.name || seenRadioNames.has(inp.name)) return;
          seenRadioNames.add(inp.name);

          // Find label from fieldset legend
          const fieldset = el.closest("fieldset");
          const legend = fieldset ? fieldset.querySelector("legend") : null;
          const groupLabel = legend ? (legend.textContent ?? "").trim() : "";

          // Collect options
          const siblings = document.querySelectorAll(`input[type=${inp.type}][name="${inp.name}"]`);
          const options: Array<{ value: string; label: string }> = [];
          let currentValue = "";
          siblings.forEach((sib) => {
            const s = sib as HTMLInputElement;
            const optLabel = s.id ? ((document.querySelector(`label[for="${s.id}"]`)?.textContent ?? "").trim()) : s.value;
            options.push({ value: s.value, label: optLabel || s.value });
            if (s.checked) currentValue = s.value;
          });

          fields.push({
            id: "",
            name: inp.name,
            tag: "input",
            type: inp.type,
            placeholder: "",
            label: groupLabel,
            ariaLabel: inp.getAttribute("aria-label") ?? "",
            value: currentValue,
            options,
          });
        });

        // Handle non-radio/checkbox controls
        document.querySelectorAll("input:not([type=hidden]):not([type=radio]):not([type=checkbox]), select, textarea").forEach((el) => {
          const inputEl = el as HTMLInputElement;
          fields.push({
            id: el.id ?? "",
            name: inputEl.name ?? "",
            tag: el.tagName.toLowerCase(),
            type: inputEl.type ?? el.tagName.toLowerCase(),
            placeholder: inputEl.placeholder ?? "",
            label: getLabel(el),
            ariaLabel: el.getAttribute("aria-label") ?? "",
            value: inputEl.value ?? "",
          });
        });

        return fields;
      },
    });
    return { ok: true, data: (results[0]?.result as ScannedField[]) ?? [] };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { ok: false, error: message };
  }
}

/**
 * Fill specific fields by id/name on the active tab using chrome.scripting.executeScript.
 * Works on any page — does NOT require the content script to be running.
 */
async function fillByIdsWithScripting(
  payload: FillByIdsRequest["payload"]
): Promise<{ ok: true; data: { filled: string[]; skipped: string[]; notFound: string[]; failed: string[] } } | { ok: false; error: string }> {
  const tab = await getActiveTab();
  if (!tab?.id) return { ok: false, error: "No active tab found" };

  try {
    const results = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      args: [payload.fields],
      // NOTE: runs in page context — no TS, no imports
      func: (fields: Array<{ id?: string; name?: string; value: string; type?: string }>) => {
        const filled: string[] = [];
        const notFound: string[] = [];
        const failed: string[] = [];

        function highlight(el: HTMLElement) {
          el.style.outline = "2px solid #16a34a";
          el.style.backgroundColor = "#f0fdf4";
          setTimeout(() => { el.style.outline = ""; el.style.backgroundColor = ""; }, 3000);
        }

        function fillInput(el: HTMLElement, value: string) {
          // Try React/Vue native setter first, fall back to direct assignment
          const nativeInputSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value")?.set;
          const nativeTextareaSetter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, "value")?.set;

          if (el instanceof HTMLSelectElement) {
            el.value = value;
            el.dispatchEvent(new Event("change", { bubbles: true }));
            el.dispatchEvent(new Event("blur", { bubbles: true }));
          } else if (el instanceof HTMLTextAreaElement) {
            if (nativeTextareaSetter) nativeTextareaSetter.call(el, value);
            else el.value = value;
            el.dispatchEvent(new Event("input", { bubbles: true }));
            el.dispatchEvent(new Event("change", { bubbles: true }));
            el.dispatchEvent(new Event("blur", { bubbles: true }));
          } else {
            const inp = el as HTMLInputElement;
            if (nativeInputSetter) nativeInputSetter.call(inp, value);
            else inp.value = value;
            el.dispatchEvent(new Event("input", { bubbles: true }));
            el.dispatchEvent(new Event("change", { bubbles: true }));
            el.dispatchEvent(new Event("blur", { bubbles: true }));
          }
        }

        for (const f of fields) {
          const key = f.id ?? f.name ?? "";

          // ── Radio/checkbox group: select by name + value ──────────────────
          if (f.name && !f.id) {
            const radios = document.querySelectorAll<HTMLInputElement>(
              `input[type=radio][name="${f.name}"], input[type=checkbox][name="${f.name}"]`
            );
            if (radios.length > 0) {
              // Match by exact value, then by label text (case-insensitive)
              let target: HTMLInputElement | null = null;
              radios.forEach((r) => { if (r.value === f.value) target = r; });
              if (!target) {
                const lv = f.value.toLowerCase();
                radios.forEach((r) => {
                  const lbl = r.id ? document.querySelector(`label[for="${r.id}"]`) : null;
                  if (lbl && (lbl.textContent ?? "").trim().toLowerCase() === lv) target = r;
                });
              }
              if (target) {
                try {
                  (target as HTMLInputElement).click();
                  highlight(target as HTMLElement);
                  filled.push(key);
                } catch { failed.push(key); }
              } else {
                notFound.push(key);
              }
              continue;
            }
          }

          // ── Regular input/select/textarea ─────────────────────────────────
          let el: HTMLElement | null = null;
          if (f.id) el = document.getElementById(f.id);
          // WC fallback: try name-based lookup (covers _xxx_input style IDs)
          if (!el && f.name) el = document.querySelector(`[name="${f.name}"]`);

          if (!el) { notFound.push(key); continue; }

          try {
            fillInput(el, f.value);
            highlight(el);
            filled.push(key);
          } catch { failed.push(key); }
        }

        return { filled, skipped: [], notFound, failed };
      },
    });
    return { ok: true, data: results[0]?.result as { filled: string[]; skipped: string[]; notFound: string[]; failed: string[] } };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { ok: false, error: message };
  }
}

// ── background entry ───────────────────────────────────────────────────────────

export default defineBackground(() => {
  chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }).catch(() => {
    // ignore — older Chrome versions may not support this
  });

  chrome.runtime.onMessage.addListener(
    (
      msg: AnyMessage,
      sender: chrome.runtime.MessageSender,
      sendResponse: (response: unknown) => void,
    ) => {
      if (sender.id !== chrome.runtime.id) {
        sendResponse({ ok: false, error: "Unauthorized" });
        return false;
      }

      const handle = async (): Promise<void> => {
        switch (msg.type) {
          case "auth.login":
            sendResponse(await handleLogin(msg.payload));
            break;
          case "auth.logout":
            sendResponse(await handleLogout());
            break;
          case "auth.session":
            sendResponse(await handleGetSession());
            break;
          case "records.search":
            sendResponse(await handleSearch(msg.payload));
            break;
          case "records.get":
            sendResponse(await handleGet(msg.payload));
            break;

          // AI fill — use scripting API (works on any tab, no content script needed)
          case "fill.scan":
            sendResponse(await scanPageWithScripting());
            break;
          case "fill.byIds":
            sendResponse(await fillByIdsWithScripting(msg.payload));
            break;

          // Standard fill — relay to content script (needs immi.gov.au content script)
          case "fill.all":
          case "fill.click":
          case "fill.pickMode":
            sendResponse(await relayToContentScript(msg));
            break;

          case "fill.dragStart":
            await relayToContentScript(msg).catch(() => {});
            sendResponse({ ok: true, data: null });
            break;

          default:
            sendResponse({ ok: false, error: "Unknown message type" });
            break;
        }
      };

      handle().catch((err: unknown) => {
        const message = err instanceof Error ? err.message : "Unknown error";
        sendResponse({ ok: false, error: message });
      });

      return true;
    },
  );
});
