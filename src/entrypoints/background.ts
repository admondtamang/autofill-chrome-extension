import type { BackgroundRequest } from "@/shared/contracts/messages";
import { handleGetSession, handleLogin, handleLogout } from "../background/handlers/authHandlers";
import { handleGet, handleSearch } from "../background/handlers/recordHandlers";

export default defineBackground(() => {
  chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }).catch(() => {
    // ignore — older Chrome versions may not support this
  });

  chrome.runtime.onMessage.addListener(
    (
      msg: BackgroundRequest,
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
          default:
            sendResponse({ ok: false, error: "Unknown message type" });
            break;
        }
      };

      handle().catch((err: unknown) => {
        const message = err instanceof Error ? err.message : "Unknown error";
        sendResponse({ ok: false, error: message });
      });

      // Return true to keep the message channel open for async responses
      return true;
    },
  );
});
