import { useState, useCallback } from "react";
import type { FillReport } from "@/shared/contracts/fillReport";
import type { ApplicantProfile } from "@/shared/types/applicantProfile";
import type {
  MessageResponse,
  FillAllRequest,
  ClickToFillRequest,
  DragStartMessage,
} from "@/shared/contracts/messages";

type UseFillReturn = {
  fillReport: FillReport | null;
  filling: boolean;
  error: string | null;
  fillAll: (profile: ApplicantProfile, overwrite: boolean) => Promise<void>;
  clickToFill: (profilePath: string, value: string) => void;
  startDrag: (profilePath: string, value: string) => void;
};

export function useFill(): UseFillReturn {
  const [fillReport, setFillReport] = useState<FillReport | null>(null);
  const [filling, setFilling] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fillAll = useCallback(
    async (profile: ApplicantProfile, overwrite: boolean): Promise<void> => {
      setFilling(true);
      setError(null);

      return new Promise<void>((resolve, reject) => {
        const msg: FillAllRequest = {
          type: "fill.all",
          payload: { profile, overwrite },
        };

        chrome.runtime.sendMessage(
          msg,
          (response: MessageResponse<FillReport> | undefined) => {
            setFilling(false);

            if (chrome.runtime.lastError) {
              const err = chrome.runtime.lastError.message ?? "Fill failed";
              setError(err);
              reject(new Error(err));
              return;
            }

            if (response?.ok) {
              setFillReport(response.data);
              resolve();
            } else {
              const err = response?.error ?? "Fill failed";
              setError(err);
              reject(new Error(err));
            }
          },
        );
      });
    },
    [],
  );

  const clickToFill = useCallback(
    (profilePath: string, value: string): void => {
      const msg: ClickToFillRequest = {
        type: "fill.click",
        payload: { profilePath, value },
      };
      chrome.runtime.sendMessage(msg, () => {
        // Fire and forget; response handled elsewhere if needed
      });
    },
    [],
  );

  const startDrag = useCallback(
    (profilePath: string, value: string): void => {
      const msg: DragStartMessage = {
        type: "fill.dragStart",
        payload: { profilePath, value },
      };
      chrome.runtime.sendMessage(msg, () => {
        // Fire and forget
      });
    },
    [],
  );

  return { fillReport, filling, error, fillAll, clickToFill, startDrag };
}
