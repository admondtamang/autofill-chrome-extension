import { useState, useCallback } from "react";
import type { ApplicantProfile } from "@/shared/types/applicantProfile";
import type { RecordType } from "@/shared/contracts/recordType";
import type {
  MessageResponse,
  RecordsGetRequest,
} from "@/shared/contracts/messages";

type UseProfileReturn = {
  profile: ApplicantProfile | null;
  rawRow: unknown | null;
  recordType: RecordType | null;
  loading: boolean;
  error: string | null;
  selectClient: (
    recordType: RecordType,
    id: number,
    transform: (row: unknown) => ApplicantProfile,
  ) => Promise<void>;
  clearClient: () => void;
};

export function useProfile(): UseProfileReturn {
  const [profile, setProfile] = useState<ApplicantProfile | null>(null);
  const [rawRow, setRawRow] = useState<unknown | null>(null);
  const [recordType, setRecordType] = useState<RecordType | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const selectClient = useCallback(
    async (
      rt: RecordType,
      id: number,
      transform: (row: unknown) => ApplicantProfile,
    ): Promise<void> => {
      setLoading(true);
      setError(null);

      return new Promise<void>((resolve, reject) => {
        const msg: RecordsGetRequest = {
          type: "records.get",
          payload: { recordType: rt, id },
        };

        chrome.runtime.sendMessage(
          msg,
          (response: MessageResponse<unknown> | undefined) => {
            setLoading(false);

            if (chrome.runtime.lastError) {
              const err =
                chrome.runtime.lastError.message ?? "Failed to load client";
              setError(err);
              reject(new Error(err));
              return;
            }

            if (response?.ok) {
              const row = response.data;
              setRawRow(row);
              setRecordType(rt);
              try {
                const p = transform(row);
                setProfile(p);
                resolve();
              } catch (e) {
                const err =
                  e instanceof Error ? e.message : "Transform failed";
                setError(err);
                reject(new Error(err));
              }
            } else {
              const err = response?.error ?? "Failed to load client";
              setError(err);
              reject(new Error(err));
            }
          },
        );
      });
    },
    [],
  );

  const clearClient = useCallback(() => {
    setProfile(null);
    setRawRow(null);
    setRecordType(null);
    setError(null);
  }, []);

  return { profile, rawRow, recordType, loading, error, selectClient, clearClient };
}
