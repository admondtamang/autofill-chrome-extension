import type { ApplicantProfile } from "../types/applicantProfile";
import type { FillReport } from "./fillReport";
import type { RecordType } from "./recordType";

// --- Requests: Side panel → Background ---

export type AuthLoginRequest = {
  type: "auth.login";
  payload: { email: string; password: string };
};

export type AuthLogoutRequest = { type: "auth.logout" };

export type AuthSessionRequest = { type: "auth.session" };

export type RecordsSearchRequest = {
  type: "records.search";
  payload: { recordType: RecordType; q: string; page: number; filters: Record<string, string> };
};

export type RecordsGetRequest = {
  type: "records.get";
  payload: { recordType: RecordType; id: number };
};

// --- Relay: Background → Content script ---

export type FillAllRequest = {
  type: "fill.all";
  payload: { profile: ApplicantProfile; overwrite: boolean };
};

export type ClickToFillRequest = {
  type: "fill.click";
  payload: { profilePath: string; value: string };
};

export type ScanPageRequest = { type: "fill.scan" };

export type EnterPickModeRequest = {
  type: "fill.pickMode";
  payload: { profilePath: string; value: string };
};

// Enhanced scan result per field
export type ScannedField = {
  id: string;
  name: string;
  tag: string;
  type: string;
  placeholder: string;
  label: string;
  ariaLabel: string;
  value: string;
};

// Fill by field ids/names
export type FillByIdsRequest = {
  type: "fill.byIds";
  payload: { fields: Array<{ id?: string; name?: string; value: string }> };
};

// --- Content script → Background (drag relay) ---

export type DragStartMessage = {
  type: "fill.dragStart";
  payload: { profilePath: string; value: string };
};

// --- Union types ---

export type BackgroundRequest =
  | AuthLoginRequest
  | AuthLogoutRequest
  | AuthSessionRequest
  | RecordsSearchRequest
  | RecordsGetRequest;

export type ContentScriptRequest =
  | FillAllRequest
  | ClickToFillRequest
  | ScanPageRequest
  | EnterPickModeRequest
  | FillByIdsRequest;

export type AnyMessage = BackgroundRequest | ContentScriptRequest | DragStartMessage;

// --- Response wrapper ---

export type MessageResponse<T> = { ok: true; data: T } | { ok: false; error: string };

// --- Session data stored in chrome.storage.session ---

export type SessionUser = {
  id: number;
  firstName: string;
  lastName: string;
  email: string;
  roleId: number;
  branchId: number | null;
};

export type SessionData = {
  token: string;
  expiry: number;
  user: SessionUser;
};

// --- Search response ---

export type SearchResponse<R> = {
  count: number;
  rows: R[];
};

// --- Fill result from content script ---

export type FillResultMessage = {
  type: "fill.result";
  payload: FillReport;
};
