import { useState, useEffect, useCallback } from "react";

export type AiProvider = "claude" | "openai" | "openrouter";

export type AiSettings = {
  provider: AiProvider;
  apiKey: string;
  model: string;
};

const DEFAULT_MODELS: Record<AiProvider, string> = {
  claude: "claude-haiku-4-5-20251001",
  openai: "gpt-4o-mini",
  openrouter: "anthropic/claude-haiku",
};

const STORAGE_KEY = "immifill_ai_settings";

export function useAiSettings() {
  const [settings, setSettings] = useState<AiSettings>({
    provider: "claude",
    apiKey: "",
    model: DEFAULT_MODELS.claude,
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    chrome.storage.local.get(STORAGE_KEY, (result) => {
      const saved = result[STORAGE_KEY] as AiSettings | undefined;
      if (saved) {
        setSettings({
          provider: saved.provider ?? "claude",
          apiKey: saved.apiKey ?? "",
          model: saved.model || DEFAULT_MODELS[saved.provider ?? "claude"],
        });
      }
      setLoading(false);
    });
  }, []);

  const saveSettings = useCallback((next: AiSettings) => {
    chrome.storage.local.set({ [STORAGE_KEY]: next }, () => {
      setSettings(next);
    });
  }, []);

  const getDefaultModel = useCallback((provider: AiProvider) => DEFAULT_MODELS[provider], []);

  return { settings, loading, saveSettings, getDefaultModel };
}
