import { invoke } from "@tauri-apps/api/core";

export interface AudioSource {
  name: string;
  description: string;
  driver: string;
  format: string;
  state: string;
  kind: string; // "system" | "mic"
  isDefaultSystem: boolean;
  isDefaultMic: boolean;
}

export type RecordMode = "system" | "mic" | "both";

export interface RecordingStarted {
  path: string;
  startedAt: number;
  mode: string;
  systemSource?: string;
  micSource?: string;
}

export interface RecordingStatus {
  isRecording: boolean;
  elapsedSecs: number;
  outputPath?: string;
  mode?: string;
}

export interface StoppedRecording {
  path: string;
  durationSecs: number;
  sizeBytes: number;
}

export interface RecordingFile {
  name: string;
  path: string;
  sizeBytes: number;
  modified: number;
  hasTranscript: boolean;
  hasSummary: boolean;
}

export interface TaskArtifacts {
  transcript: string | null;
  summary: string | null;
}

/** Display name for a recording file (strips the .wav extension). */
export function displayStem(name: string): string {
  const base = name.split(/[\\/]/).pop() ?? name;
  return base.replace(/\.wav$/i, "");
}

/** Map the settings output-language label to a Whisper language code. */
export function whisperLang(language: string): string {
  switch (language) {
    case "English":
      return "en";
    case "French":
      return "fr";
    case "Spanish":
      return "es";
    case "German":
      return "de";
    case "Portuguese":
      return "pt";
    default:
      return "";
  }
}

export interface TranscribeResult {
  text: string;
  chunks: number;
  model: string;
}

export interface SummarizeResult {
  markdown: string;
  model: string;
}

export type SummaryKind = "meeting" | "class";

export const api = {
  platform: () => invoke<string>("get_platform"),
  listSources: () => invoke<AudioSource[]>("list_audio_sources"),
  startRecording: (
    mode: RecordMode,
    systemSource?: string,
    micSource?: string,
    name?: string
  ) =>
    invoke<RecordingStarted>("start_recording", {
      mode,
      systemSource: systemSource || null,
      micSource: micSource || null,
      name: name?.trim() || null,
    }),
  stopRecording: () => invoke<StoppedRecording>("stop_recording"),
  status: () => invoke<RecordingStatus>("get_recording_status"),
  listRecordings: () => invoke<RecordingFile[]>("list_recordings"),
  deleteRecording: (path: string) => invoke<void>("delete_recording", { path }),
  renameRecording: (oldPath: string, newName: string) =>
    invoke<string>("rename_recording", { oldPath, newName }),
  getTaskArtifacts: (path: string) => invoke<TaskArtifacts>("get_task_artifacts", { path }),
  transcribe: (p: {
    filePath: string;
    accountId: string;
    apiToken: string;
    model: string;
    language?: string;
    trimSilence?: boolean;
    speed?: number;
  }) =>
    invoke<TranscribeResult>("transcribe_audio", {
      filePath: p.filePath,
      accountId: p.accountId,
      apiToken: p.apiToken,
      model: p.model,
      language: p.language || null,
      trimSilence: p.trimSilence ?? false,
      speed: p.speed ?? 1,
    }),
  summarize: (p: {
    transcript: string;
    accountId: string;
    apiToken: string;
    model: string;
    language: string;
    filePath?: string | null;
    kind?: SummaryKind;
  }) =>
    invoke<SummarizeResult>("summarize_transcript", {
      transcript: p.transcript,
      accountId: p.accountId,
      apiToken: p.apiToken,
      model: p.model,
      language: p.language,
      filePath: p.filePath || null,
      kind: p.kind ?? "meeting",
    }),
};

export function formatSecs(s: number): string {
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = Math.floor(s % 60);
  const mm = h > 0 ? String(m).padStart(2, "0") : String(m);
  const ss = String(sec).padStart(2, "0");
  return h > 0 ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
}

export function formatBytes(b: number): string {
  if (b < 1024) return `${b} B`;
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(1)} KB`;
  return `${(b / 1024 / 1024).toFixed(1)} MB`;
}
