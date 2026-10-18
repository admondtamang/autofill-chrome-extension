import {
  DOM_SETTLE_QUIET_MS,
  DOM_SETTLE_HARD_TIMEOUT_MS,
} from "@/shared/config";

/**
 * Waits until the DOM is "settled" — no mutations for DOM_SETTLE_QUIET_MS.
 * Hard timeout at DOM_SETTLE_HARD_TIMEOUT_MS (resolves, does not reject).
 */
export function waitForSettle(root?: Node): Promise<void> {
  return new Promise<void>((resolve) => {
    const observedRoot = root ?? document;
    let quietTimer: ReturnType<typeof setTimeout> | null = null;
    let hardTimer: ReturnType<typeof setTimeout> | null = null;

    function cleanup(): void {
      observer.disconnect();
      if (quietTimer !== null) clearTimeout(quietTimer);
      if (hardTimer !== null) clearTimeout(hardTimer);
    }

    function done(): void {
      cleanup();
      resolve();
    }

    function resetQuietTimer(): void {
      if (quietTimer !== null) clearTimeout(quietTimer);
      quietTimer = setTimeout(done, DOM_SETTLE_QUIET_MS);
    }

    const observer = new MutationObserver(() => {
      resetQuietTimer();
    });

    observer.observe(observedRoot, {
      childList: true,
      subtree: true,
      attributes: true,
      characterData: true,
    });

    // Hard timeout — always resolve, never reject
    hardTimer = setTimeout(done, DOM_SETTLE_HARD_TIMEOUT_MS);

    // Start quiet timer immediately in case there are no mutations at all
    resetQuietTimer();
  });
}
