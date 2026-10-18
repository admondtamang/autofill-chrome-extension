import { useState, useEffect, useCallback } from "react";

export type AiProvider = "claude" | "openai" | "openrouter" | "gemini";

export type AiSettings = {
  provider: AiProvider;
  apiKey: string;
  model: string;
};

export type AiUsage = {
  count: number;
  lastUsed: string | null; // ISO date string
};

export const DEFAULT_MODELS: Record<AiProvider, string> = {
  claude: "claude-haiku-4-5-20251001",
  openai: "gpt-4o-mini",
  openrouter: "anthropic/claude-haiku",
  gemini: "gemini-2.0-flash-exp",
};

const STORAGE_KEY = "immifill_ai_settings";
const USAGE_KEY = "immifill_ai_usage";

export function useAiSettings() {
  const [settings, setSettings] = useState<AiSettings>({
    provider: "claude",
    apiKey: "",
    model: DEFAULT_MODELS.claude,
  });
  const [usage, setUsage] = useState<AiUsage>({ count: 0, lastUsed: null });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    chrome.storage.local.get([STORAGE_KEY, USAGE_KEY], (result) => {
      const saved = result[STORAGE_KEY] as AiSettings | undefined;
      if (saved) {
        setSettings({
          provider: saved.provider ?? "claude",
          apiKey: saved.apiKey ?? "",
          model: saved.model || DEFAULT_MODELS[saved.provider ?? "claude"],
        });
      }
      const savedUsage = result[USAGE_KEY] as AiUsage | undefined;
      if (savedUsage) setUsage(savedUsage);
      setLoading(false);
    });
  }, []);

  const saveSettings = useCallback((next: AiSettings) => {
    chrome.storage.local.set({ [STORAGE_KEY]: next }, () => {
      setSettings(next);
    });
  }, []);

  const incrementUsage = useCallback(() => {
    setUsage((prev) => {
      const next: AiUsage = { count: prev.count + 1, lastUsed: new Date().toISOString() };
      chrome.storage.local.set({ [USAGE_KEY]: next });
      return next;
    });
  }, []);

  return { settings, loading, saveSettings, usage, incrementUsage };
}
