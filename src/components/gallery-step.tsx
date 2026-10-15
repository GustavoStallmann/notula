import { useEffect, useState } from "react";
import { toast } from "sonner";
import { AudioLines, Check, FileAudio, FileText, Loader2, Pencil, RotateCcw, Sparkles, Trash2, Volume2, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { AudioPlayer } from "@/components/audio-player";
import { api, displayStem, formatBytes, whisperLang, type RecordingFile } from "@/lib/tauri";
import { renderMarkdown } from "@/lib/markdown";
import { useLang } from "@/lib/i18n";
import type { CloudSettings } from "@/lib/settings";

interface GalleryProps {
  settings: CloudSettings;
  initialOpenPath?: string | null;
}

export default function GalleryStep({ settings, initialOpenPath }: GalleryProps) {
  const { t } = useLang();
  const [files, setFiles] = useState<RecordingFile[]>([]);
  const [openPath, setOpenPath] = useState<string | null>(null);
  const [transcript, setTranscript] = useState<string | null>(null);
  const [summary, setSummary] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [transcribing, setTranscribing] = useState(false);
  const [summarizing, setSummarizing] = useState(false);
  const [editing, setEditing] = useState(false);
  const [editValue, setEditValue] = useState("");

  function refresh() {
    api
      .listRecordings()
      .then(setFiles)
      .catch((e) => toast.error(String(e)));
  }

  useEffect(() => {
    (async () => {
      try {
        const list = await api.listRecordings();
        setFiles(list);
        // Deep-link: open the just-recorded task when coming from Record.
        if (initialOpenPath && list.some((f) => f.path === initialOpenPath)) {
          open(initialOpenPath);
        }
      } catch (e) {
        toast.error(String(e));
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function open(path: string) {
    setOpenPath(path);
    setEditing(false);
    setTranscript(null);
    setSummary(null);
    setLoading(true);
    try {
      const a = await api.getTaskArtifacts(path);
      setTranscript(a.transcript);
      setSummary(a.summary);
    } catch (e) {
      toast.error(String(e));
    } finally {
      setLoading(false);
    }
  }

  async function saveRename() {
    if (!openPath) return;
    const value = editValue.trim();
    if (!value) {
      toast.error(t("record.renameEmpty"));
      return;
    }
    const clash = files.some(
      (f) => f.path !== openPath && f.name.toLowerCase() === `${value.toLowerCase()}.wav`
    );
    if (clash) {
      toast.error(t("record.renameExists"));
      return;
    }
    try {
      const newPath = await api.renameRecording(openPath, value);
      setOpenPath(newPath);
      setEditing(false);
      toast.success(t("record.renamed"));
      refresh();
    } catch (e) {
      toast.error(String(e));
    }
  }

  async function removeTask(path: string) {
    try {
      await api.deleteRecording(path);
      setOpenPath(null);
      toast.success(t("record.deleted"));
      refresh();
    } catch (e) {
      toast.error(String(e));
    }
  }

  async function transcribeHere() {
    if (!openPath) return;
    setTranscribing(true);
    try {
      const r = await api.transcribe({
        filePath: openPath,
        accountId: settings.accountId,
        apiToken: settings.apiToken,
        model: settings.sttModel,
        language: whisperLang(settings.language),
      });
      setTranscript(r.text);
      toast.success(t("transcribe.done", { n: r.chunks }));
      refresh();
    } catch (e) {
      toast.error(String(e));
    } finally {
      setTranscribing(false);
    }
  }

  async function summarizeHere() {
    if (!openPath || !transcript) return;
    setSummarizing(true);
    try {
      const r = await api.summarize({
        transcript,
        accountId: settings.accountId,
        apiToken: settings.apiToken,
        model: settings.llmModel,
        language: settings.language,
        filePath: openPath,
      });
      setSummary(r.markdown);
      toast.success(t("resume.done"));
      refresh();
    } catch (e) {
      toast.error(String(e));
    } finally {
      setSummarizing(false);
    }
  }

  const openFile = files.find((f) => f.path === openPath) ?? null;

  return (
    <>
      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <CardTitle>{t("gallery.title")}</CardTitle>
              <CardDescription>{t("gallery.desc")}</CardDescription>
            </div>
            <Badge variant="secondary">{files.length}</Badge>
          </div>
        </CardHeader>
        <CardContent>
          {files.length === 0 ? (
            <div className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
              {t("gallery.empty")}
            </div>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2">
              {files.map((f) => (
                <div
                  key={f.path}
                  role="button"
                  tabIndex={0}
                  onClick={() => open(f.path)}
                  onKeyDown={(e) => e.key === "Enter" && open(f.path)}
                  className="cursor-pointer rounded-xl border bg-card p-4 text-left shadow-sm transition-all hover:border-primary hover:shadow"
                >
                  <div className="flex items-start gap-3">
                    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-secondary text-secondary-foreground">
                      <FileAudio />
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold">{displayStem(f.name)}</p>
                      <p className="text-xs text-muted-foreground">
                        {new Date(f.modified * 1000).toLocaleString()} · {formatBytes(f.sizeBytes)}
                      </p>
                      <div className="mt-2 flex flex-wrap gap-1.5">
                        {f.hasTranscript && (
                          <Badge variant="secondary">
                            <FileText /> {t("gallery.badgeTranscript")}
                          </Badge>
                        )}
                        {f.hasSummary && (
                          <Badge variant="secondary">
                            <Sparkles /> {t("gallery.badgeSummary")}
                          </Badge>
                        )}
                        {!f.hasTranscript && !f.hasSummary && (
                          <Badge variant="outline">{t("gallery.audio")}</Badge>
                        )}
                      </div>
                    </div>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="shrink-0"
                      aria-label={t("record.delete")}
                      onClick={(e) => {
                        e.stopPropagation();
                        if (window.confirm(t("gallery.confirmDelete"))) {
                          api
                            .deleteRecording(f.path)
                            .then(() => {
                              toast.success(t("record.deleted"));
                              refresh();
                            })
                            .catch((err) => toast.error(String(err)));
                        }
                      }}
                    >
                      <Trash2 />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={openPath !== null} onOpenChange={(o) => !o && setOpenPath(null)}>
        <DialogContent className="max-w-2xl">
          {openFile && (
            <>
              <DialogHeader>
                {editing ? (
                  <div className="flex items-center gap-2 pr-8">
                    <Input
                      value={editValue}
                      onChange={(e) => setEditValue(e.target.value)}
                      maxLength={80}
                      autoFocus
                      onKeyDown={(e) => {
                        if (e.key === "Enter") saveRename();
                        if (e.key === "Escape") setEditing(false);
                      }}
                      className="h-8 min-w-0 flex-1"
                    />
                    <Button
                      variant="ghost"
                      size="icon"
                      aria-label={t("record.renameSave")}
                      onClick={saveRename}
                    >
                      <Check />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      aria-label={t("record.renameCancel")}
                      onClick={() => setEditing(false)}
                    >
                      <X />
                    </Button>
                  </div>
                ) : (
                  <DialogTitle className="pr-8">{displayStem(openFile.name)}</DialogTitle>
                )}
              </DialogHeader>
              {!editing && (
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      setEditValue(displayStem(openFile.name));
                      setEditing(true);
                    }}
                  >
                    <Pencil /> {t("record.rename")}
                  </Button>
                  <Button variant="outline" size="sm" onClick={() => removeTask(openFile.path)}>
                    <Trash2 /> {t("record.delete")}
                  </Button>
                </div>
              )}
              <Tabs defaultValue="audio">
                <TabsList className="grid w-full grid-cols-3">
                  <TabsTrigger value="audio">
                    <Volume2 /> {t("gallery.audio")}
                  </TabsTrigger>
                  <TabsTrigger value="transcript">
                    <FileText /> {t("gallery.transcript")}
                  </TabsTrigger>
                  <TabsTrigger value="summary">
                    <Sparkles /> {t("gallery.summary")}
                  </TabsTrigger>
                </TabsList>
                <TabsContent value="audio">
                  <div className="rounded-lg border bg-muted/40 p-3">
                    <AudioPlayer path={openFile.path} showPath={false} />
                  </div>
                </TabsContent>
                <TabsContent value="transcript" className="space-y-2">
                  {transcript && !loading && (
                    <div className="flex justify-end">
                      <Button
                        variant="ghost"
                        size="sm"
                        disabled={transcribing}
                        onClick={transcribeHere}
                      >
                        {transcribing ? (
                          <Loader2 className="animate-spin" />
                        ) : (
                          <RotateCcw />
                        )}
                        {t("gallery.retranscribe")}
                      </Button>
                    </div>
                  )}
                  {loading ? (
                    <p className="text-sm text-muted-foreground">…</p>
                  ) : transcript ? (
                    <div className="max-h-72 overflow-y-auto rounded-lg border bg-muted/40 p-4">
                      <p className="whitespace-pre-wrap text-sm leading-relaxed">{transcript}</p>
                    </div>
                  ) : (
                    <div className="space-y-2 rounded-lg border border-dashed p-4">
                      <p className="text-sm text-muted-foreground">
                        {t("gallery.missingTranscript")}
                      </p>
                      <Button size="sm" disabled={transcribing} onClick={transcribeHere}>
                        {transcribing ? (
                          <Loader2 className="animate-spin" />
                        ) : (
                          <AudioLines />
                        )}
                        {transcribing ? t("transcribe.busy") : t("gallery.transcribeHere")}
                      </Button>
                    </div>
                  )}
                </TabsContent>
                <TabsContent value="summary" className="space-y-2">
                  {summary && !loading && (
                    <div className="flex justify-end">
                      <Button
                        variant="ghost"
                        size="sm"
                        disabled={summarizing || !transcript}
                        onClick={summarizeHere}
                      >
                        {summarizing ? (
                          <Loader2 className="animate-spin" />
                        ) : (
                          <RotateCcw />
                        )}
                        {t("gallery.resummary")}
                      </Button>
                    </div>
                  )}
                  {!loading && summary ? (
                    <div
                      className="prose-notes max-h-[380px] overflow-y-auto rounded-lg border bg-muted/40 p-5"
                      dangerouslySetInnerHTML={{ __html: renderMarkdown(summary) }}
                    />
                  ) : (
                    !loading && (
                      <div className="space-y-2 rounded-lg border border-dashed p-4">
                        <p className="text-sm text-muted-foreground">
                          {t("gallery.missingSummary")}
                        </p>
                        <Button
                          size="sm"
                          disabled={summarizing || !transcript}
                          onClick={summarizeHere}
                        >
                          {summarizing ? (
                            <Loader2 className="animate-spin" />
                          ) : (
                            <Sparkles />
                          )}
                          {summarizing ? t("resume.busy") : t("gallery.summarizeHere")}
                        </Button>
                      </div>
                    )
                  )}
                </TabsContent>
              </Tabs>
            </>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
