import { createContext, useContext, useEffect, useState, type ReactNode } from "react";

export type UILang = "en" | "pt";

const KEY = "notula.ui-lang.v1";

const dict: Record<UILang, Record<string, string>> = {
  en: {
    "app.subtitle": "Record → Tasks",
    "app.footer": "Local 16 kHz mono WAV · Whisper + LLM via Cloudflare Workers AI",
    "tabs.record": "Record",
    "tabs.transcribe": "Transcribe",
    "tabs.summary": "Resume",
    "tabs.tasks": "Tasks",

    "gallery.title": "Tasks",
    "gallery.desc": "Past recordings with their transcripts and summaries",
    "gallery.empty": "No tasks yet — record your first meeting.",
    "gallery.audio": "Audio",
    "gallery.transcript": "Transcript",
    "gallery.summary": "Summary",
    "gallery.badgeTranscript": "Transcript",
    "gallery.badgeSummary": "Summary",
    "gallery.missingTranscript": "No transcript yet — pick this recording in Transcribe.",
    "gallery.missingSummary": "No summary yet — generate it in Resume.",
    "gallery.confirmDelete": "Delete this task with its transcript and summary?",
    "gallery.transcribeHere": "Transcribe this recording",
    "gallery.retranscribe": "Redo transcription",
    "gallery.resummary": "Redo summary",
    "gallery.summarizeHere": "Generate summary",
    "resume.kindMeeting": "Meeting",
    "resume.kindClass": "Class",

    "settings.trigger": "Cloudflare settings",
    "settings.title": "Cloudflare Workers AI",
    "settings.desc":
      "Credentials are stored locally in this app only, and requests go straight from the desktop backend to api.cloudflare.com.",
    "settings.accountId": "Account ID",
    "settings.apiToken": "API token",
    "settings.showToken": "Show token",
    "settings.hideToken": "Hide token",
    "settings.tokenHint": "Dashboard → My Profile → API Tokens → “Create Workers AI token”.",
    "settings.sttModel": "Transcription model",
    "settings.sttGrok": "Grok STT — speakers, ~3× pricier",
    "settings.sttWhisper": "Whisper turbo — cheaper, no speakers",
    "settings.sttCustom": "Custom",
    "settings.trimSilence": "Skip long pauses (cuts billed minutes)",
    "settings.speed": "Speed-up before transcribing",
    "settings.speedHint": "Billed per audio minute. Above 1.25× accuracy drops.",
    "gallery.confirmRetranscribe": "Transcribe again? The whole recording is billed again.",
    "settings.llmModel": "Summary LLM (cheap)",
    "settings.outputLang": "Output language",
    "settings.langAuto": "Auto (same as transcript)",
    "lang.english": "English",
    "lang.french": "French",
    "lang.spanish": "Spanish",
    "lang.german": "German",
    "lang.portuguese": "Portuguese",

    "record.title": "Record meeting audio",
    "record.descRecording": "Capturing system + mic — press stop when done",
    "record.descIdle": "Press the button to start capturing",
    "record.start": "Start recording",
    "record.stop": "Stop recording",
    "record.badgeRecording": "Recording",
    "record.badgeIdle": "Idle",
    "record.modeBoth": "System + mic",
    "record.modeSystem": "System only",
    "record.modeMic": "Mic only",
    "record.tabSystem": "System",
    "record.tabMic": "Mic",
    "record.tabBoth": "Both",
    "record.sysLabel": "System device",
    "record.micLabel": "Microphone",
    "record.sysPlaceholder": "Select monitor source",
    "record.micPlaceholder": "Select microphone",
    "record.refresh": "Refresh devices",
    "record.winHintTitle": "Windows: system audio needs Stereo Mix or a virtual cable",
    "record.winHintBody":
      "Enable Stereo Mix (Sound settings → Recording → Show Disabled Devices) or install VB-CABLE, then pick it as the System device. Microphone works out of the box.",
    "record.nameLabel": "Recording name",
    "record.namePlaceholder": "e.g. Weekly sync",
    "record.nameTitle": "Name this recording",
    "record.rename": "Rename",
    "record.renameSave": "Save name",
    "record.renameCancel": "Cancel rename",
    "record.renamed": "Recording renamed",
    "record.renameEmpty": "Name cannot be empty",
    "record.renameExists": "A recording with that name already exists",
    "record.deleted": "Recording deleted",
    "record.delete": "Delete recording",    "record.errTitle": "Recording error",
    "record.errDevices": "Audio devices: {err}",
    "record.errFiles": "Recordings: {err}",
    "record.listTitle": "Recordings",
    "record.listDesc": "16 kHz mono WAV, ready to transcribe",
    "record.empty": "No recordings yet — hit the big red button above.",
    "record.started": "Recording started",
    "record.saved": "Recording saved ({dur})",
    "record.openExternally": "Open externally",
        "record.preparing": "Preparing audio…",
    "record.playAudio": "Play",
    "record.pauseAudio": "Pause",
    "record.restartAudio": "Restart from beginning",
    "record.audioLoadFailed": "Couldn't load audio for in-app playback.",    "record.playbackFailed": "Built-in playback failed (media {kind} error) — try opening in an external player",
    "record.kind.network": "network",
    "record.kind.decode": "decode",
    "record.kind.format": "format",
    "record.kind.unknown": "unknown",
    "record.openFailed": "Cannot open file: {err}",
    "record.asset200":
      "File is served by the app (HTTP 200) — if sound still fails, check system volume / output device.",
    "record.asset403":
      "File blocked by the app backend (HTTP 403) — fully quit the app and re-run npm run tauri dev (hot-reload is not enough for this fix).",
    "record.asset404": "File not found at this path (HTTP 404) — it may have been moved or deleted.",
    "record.assetUnreachable":
      "File not reachable — are you running inside the Tauri app (not plain npm run dev)?",

    "transcribe.title": "Transcribe audio",
    "transcribe.desc": "Whisper speech-to-text via Cloudflare Workers AI",
    "transcribe.empty": "No recordings yet — record one in the Record tab first.",
    "transcribe.choose": "Recording",
    "transcribe.choosePlaceholder": "Choose a recording",
    "transcribe.run": "Transcribe selected audio",
    "transcribe.busy": "Transcribing…",
    "transcribe.chunkProgress": "Chunk {current} of {total}…",
    "transcribe.failed": "Transcription failed",
    "transcribe.label": "Transcript",
    "transcribe.words": "{n} words",
    "transcribe.chunks": "{n} chunks",
    "transcribe.copy": "Copy",
    "transcribe.copied": "Transcript copied",
    "transcribe.done": "Transcribed in {n} chunk(s)",
    "transcribe.savedNote": "Transcript saved alongside the audio.",
    "transcribe.placeholder": "Transcription will appear here… (editable)",

    "resume.title": "Key points & summary",
    "resume.desc": "Decisions, action items and a concise resume",
    "resume.empty": "Nothing to summarize yet — transcribe audio in the previous tab first.",
    "resume.run": "Generate key points + resume",
    "resume.busy": "Generating…",
    "resume.failed": "Summarization failed",
    "resume.generated": "Generated",
    "resume.raw": "Raw",
    "resume.rendered": "Rendered",
    "resume.copy": "Copy",
    "resume.copied": "Summary copied",
    "resume.done": "Summary generated",
    "resume.savedNote": "Summary saved alongside the audio.",
    "resume.unlinked": "Not linked to a recording — transcribe from the Transcribe tab to attach it.",
  },
  pt: {
    "app.subtitle": "Gravar → Galeria",
    "app.footer": "WAV mono local 16 kHz · Whisper + LLM via Cloudflare Workers AI",
    "tabs.record": "Gravar",
    "tabs.transcribe": "Transcrever",
    "tabs.summary": "Resumir",
    "tabs.tasks": "Galeria",

    "gallery.title": "Galeria",
    "gallery.desc": "Gravações anteriores com transcrições e resumos",
    "gallery.empty": "Sem tarefas — grave sua primeira reunião.",
    "gallery.audio": "Áudio",
    "gallery.transcript": "Transcrição",
    "gallery.summary": "Resumo",
    "gallery.badgeTranscript": "Transcrição",
    "gallery.badgeSummary": "Resumo",
    "gallery.missingTranscript": "Sem transcrição — selecione esta gravação em Transcrever.",
    "gallery.missingSummary": "Sem resumo — gere um em Resumir.",
    "gallery.confirmDelete": "Excluir esta tarefa com transcrição e resumo?",
    "gallery.transcribeHere": "Transcrever esta gravação",
    "gallery.retranscribe": "Refazer transcrição",
    "gallery.resummary": "Refazer resumo",
    "gallery.summarizeHere": "Gerar resumo",
    "resume.kindMeeting": "Reunião",
    "resume.kindClass": "Aula",

    "settings.trigger": "Configurações Cloudflare",
    "settings.title": "Cloudflare Workers AI",
    "settings.desc":
      "As credenciais ficam salvas apenas neste app, e as requisições vão direto do backend para api.cloudflare.com.",
    "settings.accountId": "ID da conta",
    "settings.apiToken": "Token API",
    "settings.showToken": "Mostrar token",
    "settings.hideToken": "Ocultar token",
    "settings.tokenHint": "Painel → My Profile → API Tokens → “Create Workers AI token”.",
    "settings.sttModel": "Modelo de transcrição",
    "settings.sttGrok": "Grok STT — falantes, ~3× mais caro",
    "settings.sttWhisper": "Whisper turbo — mais barato, sem falantes",
    "settings.sttCustom": "Personalizado",
    "settings.trimSilence": "Pular pausas longas (reduz minutos cobrados)",
    "settings.speed": "Acelerar antes de transcrever",
    "settings.speedHint": "Cobrança por minuto de áudio. Acima de 1,25× a precisão cai.",
    "gallery.confirmRetranscribe": "Transcrever de novo? A gravação inteira será cobrada novamente.",
    "settings.llmModel": "LLM de resumo (barato)",
    "settings.outputLang": "Idioma de saída",
    "settings.langAuto": "Auto (igual à transcrição)",
    "lang.english": "Inglês",
    "lang.french": "Francês",
    "lang.spanish": "Espanhol",
    "lang.german": "Alemão",
    "lang.portuguese": "Português",

    "record.title": "Gravar áudio da reunião",
    "record.descRecording": "Capturando sistema + microfone — clique em parar ao terminar",
    "record.descIdle": "Clique no botão para começar a gravar",
    "record.start": "Começar gravação",
    "record.stop": "Parar gravação",
    "record.badgeRecording": "Gravando",
    "record.badgeIdle": "Parado",
    "record.modeBoth": "Sistema + micro",
    "record.modeSystem": "Só sistema",
    "record.modeMic": "Só micro",
    "record.tabSystem": "Sistema",
    "record.tabMic": "Micro",
    "record.tabBoth": "Ambos",
    "record.sysLabel": "Dispositivo do sistema",
    "record.micLabel": "Microfone",
    "record.sysPlaceholder": "Selecionar fonte do sistema",
    "record.micPlaceholder": "Selecionar microfone",
    "record.refresh": "Atualizar dispositivos",
    "record.winHintTitle": "Windows: o áudio do sistema precisa de Stereo Mix ou cabo virtual",
    "record.winHintBody":
      "Ative o Stereo Mix (Configurações de Som → Gravação → Mostrar Dispositivos Desabilitados) ou instale o VB-CABLE e escolha-o como dispositivo do Sistema. O microfone funciona direto.",
    "record.nameLabel": "Nome da gravação",
    "record.namePlaceholder": "ex.: Reunião semanal",
    "record.nameTitle": "Dê um nome a esta gravação",
    "record.rename": "Renomear",
    "record.renameSave": "Salvar nome",
    "record.renameCancel": "Cancelar",
    "record.renamed": "Gravação renomeada",
    "record.renameEmpty": "O nome não pode estar vazio",
    "record.renameExists": "Já existe uma gravação com esse nome",
    "record.deleted": "Gravação excluída",
    "record.delete": "Excluir gravação",
    "record.errTitle": "Erro de gravação",
    "record.errDevices": "Dispositivos de áudio: {err}",
    "record.errFiles": "Gravações: {err}",
    "record.listTitle": "Gravações",
    "record.listDesc": "WAV mono 16 kHz, pronto para transcrever",
    "record.empty": "Sem gravações — clique no grande botão vermelho acima.",
    "record.started": "Gravação iniciada",
    "record.saved": "Gravação salva ({dur})",
    "record.openExternally": "Abrir em outro programa",
    "record.preparing": "Preparando áudio…",
    "record.playAudio": "Ouvir",
    "record.pauseAudio": "Pausar",
    "record.restartAudio": "Voltar ao início",
    "record.audioLoadFailed": "Não foi possível carregar o áudio para reprodução interna.",
    "record.playbackFailed":
      "Falha na reprodução interna (erro de {kind}) — tente abrir em outro programa",
    "record.kind.network": "rede",
    "record.kind.decode": "decodificação",
    "record.kind.format": "formato",
    "record.kind.unknown": "desconhecido",
    "record.openFailed": "Não foi possível abrir o arquivo: {err}",
    "record.asset200":
      "Arquivo servido pelo app (HTTP 200) — se continuar sem som, verifique o volume / dispositivo de saída.",
    "record.asset403":
      "Arquivo bloqueado pelo backend (HTTP 403) — feche totalmente o app e rode npm run tauri dev novamente (hot-reload não basta).",
    "record.asset404": "Arquivo não encontrado (HTTP 404) — pode ter sido movido ou excluído.",
    "record.assetUnreachable":
      "Arquivo inacessível — o app está rodando dentro do Tauri (e não apenas com npm run dev)?",

    "transcribe.title": "Transcrever áudio",
    "transcribe.desc": "Whisper (fala-para-texto) via Cloudflare Workers AI",
    "transcribe.empty": "Sem gravações por enquanto — grave uma na aba Gravar.",
    "transcribe.choose": "Gravação",
    "transcribe.choosePlaceholder": "Selecionar gravação",
    "transcribe.run": "Transcrever áudio selecionado",
    "transcribe.busy": "Transcrevendo…",
    "transcribe.chunkProgress": "Parte {current} de {total}…",
    "transcribe.failed": "Falha na transcrição",
    "transcribe.label": "Transcrição",
    "transcribe.words": "{n} palavras",
    "transcribe.chunks": "{n} partes",
    "transcribe.copy": "Copiar",
    "transcribe.copied": "Transcrição copiada",
    "transcribe.done": "Transcrito em {n} parte(s)",
    "transcribe.savedNote": "Transcrição salva junto ao áudio.",
    "transcribe.placeholder": "A transcrição aparece aqui… (editável)",

    "resume.title": "Pontos-chave e resumo",
    "resume.desc": "Decisões, ações e um resumo conciso",
    "resume.empty": "Nada para resumir — transcreva o áudio na aba anterior.",
    "resume.run": "Gerar pontos-chave + resumo",
    "resume.busy": "Gerando…",
    "resume.failed": "Falha ao gerar o resumo",
    "resume.generated": "Gerado",
    "resume.raw": "Markdown",
    "resume.rendered": "Formatado",
    "resume.copy": "Copiar",
    "resume.copied": "Resumo copiado",
    "resume.done": "Resumo gerado",
    "resume.savedNote": "Resumo salvo junto ao áudio.",
    "resume.unlinked": "Não vinculado a nenhuma gravação — transcreva na aba Transcrever para anexar.",
  },
};

interface LangCtx {
  lang: UILang;
  setLang: (l: UILang) => void;
  t: (key: string, vars?: Record<string, string | number>) => string;
}

const Ctx = createContext<LangCtx>({
  lang: "en",
  setLang: () => {},
  t: (key) => key,
});

export function LanguageProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<UILang>(() => {
    try {
      const saved = localStorage.getItem(KEY);
      if (saved === "pt" || saved === "en") return saved;
    } catch {
      /* ignore */
    }
    return "pt";
  });

  function setLang(l: UILang) {
    setLangState(l);
    try {
      localStorage.setItem(KEY, l);
    } catch {
      /* ignore */
    }
  }

  useEffect(() => {
    document.documentElement.lang = lang === "pt" ? "pt" : "en";
  }, [lang ]);

  function t(key: string, vars?: Record<string, string | number>): string {
    let s: string = dict[lang][key] ?? dict.en[key] ?? key;
    if (vars) {
      for (const [k, v] of Object.entries(vars)) {
        s = s.split(`{${k}}`).join(String(v));
      }
    }
    return s;
  }

  return <Ctx.Provider value={{ lang, setLang, t }}>{children}</Ctx.Provider>;
}

export function useLang(): LangCtx {
  return useContext(Ctx);
}
