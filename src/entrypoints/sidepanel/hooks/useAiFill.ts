import { useState, useCallback } from "react";
import type { AiSettings } from "./useAiSettings";
import type { ApplicantProfile } from "@/shared/types/applicantProfile";
import type { MessageResponse } from "@/shared/contracts/messages";
import type { ScannedField, ScanPageRequest, FillByIdsRequest } from "@/shared/contracts/messages";
import type { FillReport } from "@/shared/contracts/fillReport";

type UseAiFillReturn = {
  aiFilling: boolean;
  aiError: string | null;
  aiFill: (profile: ApplicantProfile, settings: AiSettings) => Promise<FillReport | null>;
};

export function useAiFill(): UseAiFillReturn {
  const [aiFilling, setAiFilling] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);

  const scanPage = (): Promise<ScannedField[]> =>
    new Promise((resolve, reject) => {
      const msg: ScanPageRequest = { type: "fill.scan" };
      chrome.runtime.sendMessage(msg, (response: MessageResponse<ScannedField[]> | undefined) => {
        if (chrome.runtime.lastError) return reject(new Error(chrome.runtime.lastError.message));
        if (response?.ok) resolve(response.data);
        else reject(new Error(response?.error ?? "Scan failed"));
      });
    });

  const callAi = async (
    settings: AiSettings,
    fields: ScannedField[],
    profile: ApplicantProfile,
  ): Promise<Record<string, string>> => {
    const prompt = buildPrompt(fields, profile);

    if (settings.provider === "claude") {
      const res = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "x-api-key": settings.apiKey,
          "anthropic-version": "2023-06-01",
          "anthropic-dangerous-direct-browser-access": "true",
          "content-type": "application/json",
        },
        body: JSON.stringify({
          model: settings.model,
          max_tokens: 1024,
          messages: [{ role: "user", content: prompt }],
        }),
      });
      if (!res.ok) throw new Error(`Claude API error: ${res.status}`);
      const data = await res.json() as { content: Array<{ text: string }> };
      return parseAiResponse(data.content[0]?.text ?? "{}");
    }

    // OpenAI or OpenRouter (same API shape)
    const baseUrl = settings.provider === "openrouter"
      ? "https://openrouter.ai/api/v1/chat/completions"
      : "https://api.openai.com/v1/chat/completions";

    const res = await fetch(baseUrl, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${settings.apiKey}`,
        "content-type": "application/json",
        ...(settings.provider === "openrouter" && {
          "HTTP-Referer": "https://immifill.extension",
          "X-Title": "ImmiFill",
        }),
      },
      body: JSON.stringify({
        model: settings.model,
        messages: [{ role: "user", content: prompt }],
      }),
    });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new Error(`AI API error ${res.status}: ${body || res.statusText}`);
    }
    const data = await res.json() as { choices: Array<{ message: { content: string } }> };
    return parseAiResponse(data.choices[0]?.message.content ?? "{}");
  };

  const aiFill = useCallback(
    async (profile: ApplicantProfile, settings: AiSettings): Promise<FillReport | null> => {
      if (!settings.apiKey) {
        setAiError("No API key configured. Open Settings to add one.");
        return null;
      }

      setAiFilling(true);
      setAiError(null);

      try {
        const fields = await scanPage();
        if (fields.length === 0) {
          setAiError("No form fields detected on the current page.");
          return null;
        }

        const mapping = await callAi(settings, fields, profile);
        const toFill = Object.entries(mapping).map(([key, value]) => {
          // key may be id or name
          const byId = fields.find((f) => f.id === key);
          const byName = fields.find((f) => f.name === key);
          const field = byId ?? byName;
          return field
            ? { id: field.id || undefined, name: field.name || undefined, value: String(value) }
            : { name: key, value: String(value) };
        });

        const report = await new Promise<FillReport>((resolve, reject) => {
          const msg: FillByIdsRequest = { type: "fill.byIds", payload: { fields: toFill } };
          chrome.runtime.sendMessage(msg, (response: MessageResponse<FillReport> | undefined) => {
            if (chrome.runtime.lastError) return reject(new Error(chrome.runtime.lastError.message));
            if (response?.ok) resolve(response.data);
            else reject(new Error(response?.error ?? "Fill failed"));
          });
        });

        return report;
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        setAiError(message);
        return null;
      } finally {
        setAiFilling(false);
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  return { aiFilling, aiError, aiFill };
}

function buildPrompt(fields: ScannedField[], profile: ApplicantProfile): string {
  const fieldList = fields.map((f) => ({
    id: f.id,
    name: f.name,
    type: f.type,
    placeholder: f.placeholder,
    label: f.label || f.ariaLabel,
  }));

  return `You are helping fill an immigration form automatically.

Below are the form fields detected on the current page, and the applicant's profile data.

Your task: Return a JSON object mapping each field identifier to the correct value from the profile. Only include fields you are confident about. Use the field "id" as the key if non-empty, otherwise use "name". Skip fields where the profile has no relevant data.

FORM FIELDS:
${JSON.stringify(fieldList, null, 2)}

APPLICANT PROFILE:
${JSON.stringify(profile, null, 2)}

Return ONLY valid JSON, no explanation, no markdown code blocks. Example:
{"given_name": "John", "family_name": "Smith"}`;
}

function parseAiResponse(text: string): Record<string, string> {
  // Strip markdown code blocks if any
  const cleaned = text.replace(/^```(?:json)?\n?/m, "").replace(/\n?```$/m, "").trim();
  try {
    return JSON.parse(cleaned) as Record<string, string>;
  } catch {
    return {};
  }
}
