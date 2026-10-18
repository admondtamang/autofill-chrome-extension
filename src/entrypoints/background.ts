import type { AnyMessage, FillByIdsRequest } from "@/shared/contracts/messages";
import type { ScannedField } from "@/shared/contracts/messages";
import { handleGetSession, handleLogin, handleLogout } from "../background/handlers/authHandlers";
import { handleGet, handleSearch } from "../background/handlers/recordHandlers";

// ── helpers ───────────────────────────────────────────────────────────────────

/** Get the active tab in the current window. */
async function getActiveTab(): Promise<chrome.tabs.Tab | null> {
  const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
  return tabs[0] ?? null;
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
        const controls = document.querySelectorAll(
          "input:not([type=hidden]), select, textarea"
        );
        return Array.from(controls).map((el) => {
          const inputEl = el as HTMLInputElement;
          const id = el.id ?? "";
          let label = "";
          if (id) {
            const labelEl = document.querySelector(`label[for="${id}"]`);
            if (labelEl) label = (labelEl.textContent ?? "").trim();
          }
          if (!label) {
            const parentLabel = el.closest("label");
            if (parentLabel) label = (parentLabel.textContent ?? "").trim();
          }
          return {
            id,
            name: inputEl.name ?? "",
            tag: el.tagName.toLowerCase(),
            type: inputEl.type ?? el.tagName.toLowerCase(),
            placeholder: inputEl.placeholder ?? "",
            label,
            ariaLabel: el.getAttribute("aria-label") ?? "",
            value: inputEl.value ?? "",
          };
        });
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
      func: (fields: Array<{ id?: string; name?: string; value: string }>) => {
        const filled: string[] = [];
        const notFound: string[] = [];
        const failed: string[] = [];

        for (const f of fields) {
          let el: HTMLElement | null = null;
          if (f.id) el = document.getElementById(f.id);
          if (!el && f.name) el = document.querySelector(`[name="${f.name}"]`);

          const key = f.id ?? f.name ?? "";
          if (!el) { notFound.push(key); continue; }

          const input = el as HTMLInputElement;
          try {
            // Use native input value setter to trigger React/Vue change events
            const nativeInputValueSetter = Object.getOwnPropertyDescriptor(
              window.HTMLInputElement.prototype, "value"
            )?.set;
            const nativeTextAreaSetter = Object.getOwnPropertyDescriptor(
              window.HTMLTextAreaElement.prototype, "value"
            )?.set;

            if (el instanceof HTMLSelectElement) {
              el.value = f.value;
              el.dispatchEvent(new Event("change", { bubbles: true }));
            } else if (el instanceof HTMLTextAreaElement && nativeTextAreaSetter) {
              nativeTextAreaSetter.call(el, f.value);
              el.dispatchEvent(new Event("input", { bubbles: true }));
              el.dispatchEvent(new Event("change", { bubbles: true }));
            } else if (nativeInputValueSetter) {
              nativeInputValueSetter.call(input, f.value);
              el.dispatchEvent(new Event("input", { bubbles: true }));
              el.dispatchEvent(new Event("change", { bubbles: true }));
            } else {
              input.value = f.value;
              el.dispatchEvent(new Event("change", { bubbles: true }));
            }

            // Visual highlight
            el.style.outline = "2px solid #16a34a";
            el.style.backgroundColor = "#f0fdf4";
            setTimeout(() => {
              el!.style.outline = "";
              el!.style.backgroundColor = "";
            }, 3000);

            filled.push(key);
          } catch {
            failed.push(key);
          }
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
