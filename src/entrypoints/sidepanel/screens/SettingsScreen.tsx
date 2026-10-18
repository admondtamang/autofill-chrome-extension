import { useState, useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { DEFAULT_MODELS } from "../hooks/useAiSettings";
import type { AiProvider, AiSettings, AiUsage } from "../hooks/useAiSettings";

// ── provider config ────────────────────────────────────────────────────────────

const PROVIDERS: Array<{ value: AiProvider; label: string; placeholder: string }> = [
  { value: "claude",      label: "Claude (Anthropic)", placeholder: "sk-ant-..." },
  { value: "openai",      label: "ChatGPT (OpenAI)",   placeholder: "sk-..."     },
  { value: "openrouter",  label: "OpenRouter",          placeholder: "sk-or-..."  },
  { value: "gemini",      label: "Gemini (Google)",     placeholder: "AIza..."    },
];

// ── OpenRouter model list ──────────────────────────────────────────────────────

type OpenRouterModel = { id: string; name: string };

async function fetchOpenRouterModels(apiKey: string): Promise<OpenRouterModel[]> {
  const res = await fetch("https://openrouter.ai/api/v1/models", {
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "HTTP-Referer": "https://immifill.extension",
      "X-Title": "ImmiFill",
    },
  });
  if (!res.ok) throw new Error(`Failed to load models (${res.status})`);
  const json = await res.json() as { data: Array<{ id: string; name: string }> };
  return json.data
    .map((m) => ({ id: m.id, name: m.name || m.id }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

// ── simple searchable combobox ─────────────────────────────────────────────────

type ModelComboboxProps = {
  models: OpenRouterModel[];
  value: string;
  onChange: (v: string) => void;
  loading: boolean;
  error: string | null;
  onRetry: () => void;
};

function ModelCombobox({ models, value, onChange, loading, error, onRetry }: ModelComboboxProps) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const containerRef = useRef<HTMLDivElement>(null);

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    function handle(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handle);
    return () => document.removeEventListener("mousedown", handle);
  }, [open]);

  const selected = models.find((m) => m.id === value);
  const filtered = search.trim()
    ? models.filter(
        (m) =>
          m.name.toLowerCase().includes(search.toLowerCase()) ||
          m.id.toLowerCase().includes(search.toLowerCase()),
      )
    : models;

  if (loading) {
    return (
      <div className="h-8 flex items-center px-3 rounded-md border text-xs text-muted-foreground">
        Loading models…
      </div>
    );
  }

  if (error) {
    return (
      <div className="space-y-1">
        <p className="text-xs text-destructive">{error}</p>
        <Button variant="outline" size="sm" className="h-7 text-xs" onClick={onRetry}>
          Retry
        </Button>
      </div>
    );
  }

  return (
    <div ref={containerRef} className="relative">
      {/* Trigger */}
      <button
        type="button"
        onClick={() => { setOpen((o) => !o); setSearch(""); }}
        className="w-full h-8 px-3 flex items-center justify-between rounded-md border border-input bg-background text-xs text-left hover:border-primary/50 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
      >
        <span className={selected ? "text-foreground font-mono" : "text-muted-foreground"}>
          {selected ? selected.id : "Select a model…"}
        </span>
        <span className="text-muted-foreground ml-2">▾</span>
      </button>

      {/* Dropdown */}
      {open && (
        <div className="absolute z-50 mt-1 w-full rounded-md border bg-popover shadow-md">
          <div className="p-1.5 border-b">
            <Input
              autoFocus
              type="search"
              placeholder="Search models…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="h-7 text-xs"
            />
          </div>
          <ul className="max-h-48 overflow-y-auto py-1">
            {filtered.length === 0 ? (
              <li className="px-3 py-2 text-xs text-muted-foreground">No models found.</li>
            ) : (
              filtered.map((m) => (
                <li key={m.id}>
                  <button
                    type="button"
                    onClick={() => { onChange(m.id); setOpen(false); }}
                    className={`w-full text-left px-3 py-1.5 text-xs hover:bg-accent ${
                      m.id === value ? "bg-accent/50 font-medium" : ""
                    }`}
                  >
                    <span className="block font-mono">{m.id}</span>
                    {m.name !== m.id && (
                      <span className="block text-muted-foreground">{m.name}</span>
                    )}
                  </button>
                </li>
              ))
            )}
          </ul>
        </div>
      )}
    </div>
  );
}

// ── main settings screen ───────────────────────────────────────────────────────

type SettingsScreenProps = {
  settings: AiSettings;
  usage: AiUsage;
  onSave: (settings: AiSettings) => void;
  onClose: () => void;
};

export function SettingsScreen({ settings, usage, onSave, onClose }: SettingsScreenProps) {
  const [provider, setProvider] = useState<AiProvider>(settings.provider);
  const [apiKey, setApiKey]     = useState(settings.apiKey);
  const [model, setModel]       = useState(settings.model || DEFAULT_MODELS[settings.provider]);
  const [saved, setSaved]       = useState(false);

  // OpenRouter model list state
  const [orModels, setOrModels]       = useState<OpenRouterModel[]>([]);
  const [orLoading, setOrLoading]     = useState(false);
  const [orError, setOrError]         = useState<string | null>(null);

  const loadOpenRouterModels = (key: string) => {
    if (!key.trim()) return;
    setOrLoading(true);
    setOrError(null);
    fetchOpenRouterModels(key)
      .then((list) => { setOrModels(list); setOrLoading(false); })
      .catch((err: unknown) => {
        setOrError(err instanceof Error ? err.message : "Failed to load models");
        setOrLoading(false);
      });
  };

  // Auto-load OpenRouter models when provider is openrouter and key is present
  useEffect(() => {
    if (provider === "openrouter" && apiKey.trim() && orModels.length === 0 && !orLoading) {
      loadOpenRouterModels(apiKey);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [provider]);

  const handleProviderChange = (p: AiProvider) => {
    setProvider(p);
    setModel(DEFAULT_MODELS[p]);
    setSaved(false);
  };

  const handleApiKeyChange = (key: string) => {
    setApiKey(key);
    setSaved(false);
    // Reload OpenRouter models when key changes
    if (provider === "openrouter") {
      setOrModels([]);
      setOrError(null);
    }
  };

  const handleSave = () => {
    onSave({ provider, apiKey, model: model || DEFAULT_MODELS[provider] });
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
    // Load OR models after saving key if not already loaded
    if (provider === "openrouter" && orModels.length === 0) {
      loadOpenRouterModels(apiKey);
    }
  };

  const providerInfo = PROVIDERS.find((p) => p.value === provider)!;

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between p-3 border-b">
        <span className="text-sm font-semibold">AI Settings</span>
        <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={onClose}>
          Back
        </Button>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-5">
        {/* Provider */}
        <div className="space-y-2">
          <Label className="text-xs font-medium">AI Provider</Label>
          <div className="flex flex-col gap-2">
            {PROVIDERS.map((p) => (
              <button
                key={p.value}
                type="button"
                onClick={() => handleProviderChange(p.value)}
                className={`text-left px-3 py-2 rounded-md border text-sm transition-colors ${
                  provider === p.value
                    ? "border-primary bg-primary/5 font-medium"
                    : "border-border hover:border-primary/50"
                }`}
              >
                {p.label}
              </button>
            ))}
          </div>
        </div>

        {/* API Key */}
        <div className="space-y-1.5">
          <Label htmlFor="api-key" className="text-xs font-medium">
            API Key
          </Label>
          <Input
            id="api-key"
            type="password"
            placeholder={providerInfo.placeholder}
            value={apiKey}
            onChange={(e) => handleApiKeyChange(e.target.value)}
            className="h-8 text-xs font-mono"
          />
          <p className="text-xs text-muted-foreground">Stored locally in your browser only.</p>
        </div>

        {/* Model — combobox for OpenRouter, text input for others */}
        <div className="space-y-1.5">
          <Label htmlFor="ai-model" className="text-xs font-medium">Model</Label>

          {provider === "openrouter" ? (
            <ModelCombobox
              models={orModels}
              value={model}
              onChange={(v) => { setModel(v); setSaved(false); }}
              loading={orLoading}
              error={orError}
              onRetry={() => loadOpenRouterModels(apiKey)}
            />
          ) : (
            <Input
              id="ai-model"
              type="text"
              value={model}
              onChange={(e) => { setModel(e.target.value); setSaved(false); }}
              className="h-8 text-xs font-mono"
            />
          )}

          {provider === "gemini" && (
            <p className="text-xs text-muted-foreground">
              e.g. gemini-2.0-flash-exp, gemini-1.5-pro
            </p>
          )}
          {provider === "openrouter" && orModels.length === 0 && !orLoading && !orError && (
            <p className="text-xs text-muted-foreground">
              Save your API key to load the model list.
            </p>
          )}
        </div>

        {/* Usage */}
        <div className="rounded-md border px-3 py-2 space-y-1">
          <p className="text-xs font-medium">Usage</p>
          <div className="flex justify-between text-xs text-muted-foreground">
            <span>AI fills run</span>
            <span className="font-mono">{usage.count}</span>
          </div>
          {usage.lastUsed && (
            <div className="flex justify-between text-xs text-muted-foreground">
              <span>Last used</span>
              <span>{new Date(usage.lastUsed).toLocaleDateString()}</span>
            </div>
          )}
        </div>

        <Button
          size="sm"
          className="w-full"
          onClick={handleSave}
          disabled={!apiKey.trim()}
        >
          {saved ? "Saved!" : "Save Settings"}
        </Button>
      </div>
    </div>
  );
}
