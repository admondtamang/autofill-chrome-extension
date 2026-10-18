import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { AiProvider, AiSettings } from "../hooks/useAiSettings";

type SettingsScreenProps = {
  settings: AiSettings;
  onSave: (settings: AiSettings) => void;
  onClose: () => void;
};

const PROVIDERS: Array<{ value: AiProvider; label: string; placeholder: string }> = [
  { value: "claude", label: "Claude (Anthropic)", placeholder: "sk-ant-..." },
  { value: "openai", label: "ChatGPT (OpenAI)", placeholder: "sk-..." },
  { value: "openrouter", label: "OpenRouter", placeholder: "sk-or-..." },
];

const DEFAULT_MODELS: Record<AiProvider, string> = {
  claude: "claude-haiku-4-5-20251001",
  openai: "gpt-4o-mini",
  openrouter: "anthropic/claude-haiku",
};

export function SettingsScreen({ settings, onSave, onClose }: SettingsScreenProps) {
  const [provider, setProvider] = useState<AiProvider>(settings.provider);
  const [apiKey, setApiKey] = useState(settings.apiKey);
  const [model, setModel] = useState(settings.model || DEFAULT_MODELS[settings.provider]);
  const [saved, setSaved] = useState(false);

  const handleProviderChange = (p: AiProvider) => {
    setProvider(p);
    setModel(DEFAULT_MODELS[p]);
    setSaved(false);
  };

  const handleSave = () => {
    onSave({ provider, apiKey, model: model || DEFAULT_MODELS[provider] });
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
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
            onChange={(e) => { setApiKey(e.target.value); setSaved(false); }}
            className="h-8 text-xs font-mono"
          />
          <p className="text-xs text-muted-foreground">
            Stored locally in your browser only.
          </p>
        </div>

        {/* Model */}
        <div className="space-y-1.5">
          <Label htmlFor="ai-model" className="text-xs font-medium">
            Model
          </Label>
          <Input
            id="ai-model"
            type="text"
            value={model}
            onChange={(e) => { setModel(e.target.value); setSaved(false); }}
            className="h-8 text-xs font-mono"
          />
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
