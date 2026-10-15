export const DEFAULT_STT_MODEL = "xai/grok-stt";
export const DEFAULT_LLM_MODEL = "@cf/meta/llama-3.1-8b-instruct-fast";
const PREVIOUS_DEFAULT_STT_MODEL = "@cf/openai/whisper-large-v3-turbo";

// Models deprecated by Cloudflare → their official replacements.
const DEPRECATED_MODELS: Record<string, string> = {
  "@cf/meta/llama-3.1-8b-instruct": "@cf/meta/llama-3.1-8b-instruct-fast",
  "@cf/meta/llama-3.1-8b-instruct-awq": "@cf/meta/llama-3.1-8b-instruct-fast",
};

export function migrateModel(model: string): string {
  return DEPRECATED_MODELS[model.trim()] ?? model;
}

export interface CloudSettings {
  accountId: string;
  apiToken: string;
  sttModel: string;
  llmModel: string;
  language: string; // "" = auto, or e.g. "en", "fr"
}

const KEY = "notula.settings.v1";

export function loadSettings(): CloudSettings {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const p = JSON.parse(raw);
      const storedStt: string = p.sttModel || DEFAULT_STT_MODEL;
      return {
        accountId: p.accountId ?? "",
        apiToken: p.apiToken ?? "",
        // Users who never changed the old Whisper default follow the switch to Grok.
        sttModel:
          storedStt === PREVIOUS_DEFAULT_STT_MODEL
            ? DEFAULT_STT_MODEL
            : migrateModel(storedStt),
        llmModel: migrateModel(p.llmModel || DEFAULT_LLM_MODEL),
        language: p.language ?? "",
      };
    }
  } catch {
    /* ignore */
  }
  return {
    accountId: "",
    apiToken: "",
    sttModel: DEFAULT_STT_MODEL,
    llmModel: DEFAULT_LLM_MODEL,
    language: "",
  };
}

export function saveSettings(s: CloudSettings) {
  localStorage.setItem(KEY, JSON.stringify(s));
}
