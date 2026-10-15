import { useEffect, useState } from "react";
import { toast } from "sonner";
import {
  AudioLines,
  Info,
  Mic,
  MonitorSpeaker,
  RefreshCw,
  Square,
  TriangleAlert,
} from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
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
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import {
  api,
  formatSecs,
  type AudioSource,
  type RecordMode,
} from "@/lib/tauri";
import { useLang } from "@/lib/i18n";

interface Props {
  onStopped: (path: string) => void;
}

export default function RecordStep({ onStopped }: Props) {
  const { t } = useLang();
  const [sources, setSources] = useState<AudioSource[]>([]);
  const [mode, setMode] = useState<RecordMode>("both");
  const [sysSrc, setSysSrc] = useState("");
  const [micSrc, setMicSrc] = useState("");
  const [recName, setRecName] = useState("");
  const [recording, setRecording] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [nameDialogOpen, setNameDialogOpen] = useState(false);
  const [isWindows, setIsWindows] = useState(false);

  async function refreshSources() {
    try {
      const list = await api.listSources();
      setSources(list);
      if (!sysSrc) {
        const d = list.find((s) => s.isDefaultSystem) ?? list.find((s) => s.kind === "system");
        if (d) setSysSrc(d.name);
      }
      if (!micSrc) {
        const d = list.find((s) => s.isDefaultMic) ?? list.find((s) => s.kind === "mic");
        if (d) setMicSrc(d.name);
      }
    } catch (e) {
      setError(t("record.errDevices", { err: String(e) }));
    }
  }

  useEffect(() => {
    refreshSources();
    api
      .platform()
      .then((p) => setIsWindows(p === "windows"))
      .catch(() => {});
    api
      .status()
      .then((s) => {
        setRecording(s.isRecording);
        setElapsed(s.elapsedSecs);
      })
      .catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!recording) return;
    const timer = setInterval(async () => {
      try {
        const s = await api.status();
        setElapsed(s.elapsedSecs);
        if (!s.isRecording) setRecording(false);
      } catch {
        /* ignore */
      }
    }, 1000);
    return () => clearInterval(timer);
  }, [recording]);

  async function stopCurrent() {
    setBusy(true);
    try {
      const r = await api.stopRecording();
      setRecording(false);
      toast.success(t("record.saved", { dur: formatSecs(r.durationSecs) }));
      onStopped(r.path);
    } catch (e) {
      const msg = String(e);
      setError(msg);
      toast.error(msg);
    } finally {
      setBusy(false);
    }
  }

  async function startWithName() {
    setNameDialogOpen(false);
    setBusy(true);
    setError("");
    try {
      await api.startRecording(
        mode,
        mode === "mic" ? undefined : sysSrc || undefined,
        mode === "system" ? undefined : micSrc || undefined,
        recName.trim() || undefined
      );
      setRecording(true);
      setElapsed(0);
      toast.success(t("record.started"));
    } catch (e) {
      const msg = String(e);
      setError(msg);
      toast.error(msg);
    } finally {
      setBusy(false);
    }
  }

  const sysList = sources.filter((s) => s.kind === "system");
  const micList = sources.filter((s) => s.kind === "mic");

  return (
    <Card>
      <CardHeader className="text-center">
        <CardTitle>{t("record.title")}</CardTitle>
        <CardDescription>
          {recording ? t("record.descRecording") : t("record.descIdle")}
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col items-center gap-4">
        {isWindows && (
          <Alert>
            <Info />
            <AlertTitle>{t("record.winHintTitle")}</AlertTitle>
            <AlertDescription>{t("record.winHintBody")}</AlertDescription>
          </Alert>
        )}
        <p className="text-4xl font-semibold tabular-nums tracking-tight">
          {formatSecs(elapsed)}
        </p>
        <Button
          onClick={() => (recording ? stopCurrent() : setNameDialogOpen(true))}
          disabled={busy}
          aria-label={recording ? t("record.stop") : t("record.start")}
          className={cn(
            "h-28 w-28 rounded-full shadow-lg transition-transform hover:scale-105 active:scale-95",
            "bg-destructive text-destructive-foreground hover:bg-destructive/90",
            recording && "ring-8 ring-destructive/20"
          )}
        >
          {recording ? (
            <Square className="!size-10 fill-current" />
          ) : (
            <Mic className="!size-10" />
          )}
        </Button>
        <div className="flex items-center gap-2">
          {recording ? (
            <Badge variant="destructive" className="gap-1.5">
              <span className="rec-dot-live h-2 w-2 rounded-full bg-current" />
              {t("record.badgeRecording")}
            </Badge>
          ) : (
            <Badge variant="secondary">{t("record.badgeIdle")}</Badge>
          )}
          <Badge variant="outline">
            {mode === "both"
              ? t("record.modeBoth")
              : mode === "system"
                ? t("record.modeSystem")
                : t("record.modeMic")}
          </Badge>
        </div>

        <Separator />

        <div className="w-full space-y-4">
          <Tabs value={mode} onValueChange={(v) => setMode(v as RecordMode)}>
            <TabsList className="grid w-full grid-cols-3">
              <TabsTrigger value="system" disabled={recording}>
                <MonitorSpeaker /> {t("record.tabSystem")}
              </TabsTrigger>
              <TabsTrigger value="mic" disabled={recording}>
                <Mic /> {t("record.tabMic")}
              </TabsTrigger>
              <TabsTrigger value="both" disabled={recording}>
                <AudioLines /> {t("record.tabBoth")}
              </TabsTrigger>
            </TabsList>
          </Tabs>

          <div className={cn("grid gap-3", mode === "both" ? "sm:grid-cols-2" : "grid-cols-1")}>
            {(mode === "system" || mode === "both") && (
              <div className="grid gap-1.5">
                <Label>{t("record.sysLabel")}</Label>
                <Select value={sysSrc} onValueChange={setSysSrc} disabled={recording}>
                  <SelectTrigger title={sysSrc || undefined}>
                    <SelectValue placeholder={t("record.sysPlaceholder")} />
                  </SelectTrigger>
                  <SelectContent>
                      {sysList.map((s) => (
                        <SelectItem key={s.name} value={s.name} title={s.name}>
                          {s.description || s.name}
                        </SelectItem>
                      ))}
                  </SelectContent>
                </Select>
              </div>
            )}
            {(mode === "mic" || mode === "both") && (
              <div className="grid gap-1.5">
                <Label>{t("record.micLabel")}</Label>
                <Select value={micSrc} onValueChange={setMicSrc} disabled={recording}>
                  <SelectTrigger title={micSrc || undefined}>
                    <SelectValue placeholder={t("record.micPlaceholder")} />
                  </SelectTrigger>
                  <SelectContent>
                      {micList.map((s) => (
                        <SelectItem key={s.name} value={s.name} title={s.name}>
                          {s.description || s.name}
                        </SelectItem>
                      ))}
                  </SelectContent>
                </Select>
              </div>
            )}
          </div>

          <div className="flex justify-end">
            <Button variant="ghost" size="sm" disabled={busy || recording} onClick={refreshSources}>
              <RefreshCw /> {t("record.refresh")}
            </Button>
          </div>
        </div>

        {error && (
          <Alert variant="destructive">
            <TriangleAlert />
            <AlertTitle>{t("record.errTitle")}</AlertTitle>
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        <Dialog open={nameDialogOpen} onOpenChange={setNameDialogOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{t("record.nameTitle")}</DialogTitle>
            </DialogHeader>
            <Input
              value={recName}
              onChange={(e) => setRecName(e.target.value)}
              placeholder={t("record.namePlaceholder")}
              maxLength={80}
              autoFocus
              autoComplete="off"
              onKeyDown={(e) => {
                if (e.key === "Enter") startWithName();
              }}
            />
            <DialogFooter>
              <Button variant="ghost" onClick={() => setNameDialogOpen(false)}>
                {t("record.renameCancel")}
              </Button>
              <Button onClick={startWithName} disabled={busy}>
                <Mic /> {t("record.start")}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </CardContent>
    </Card>
  );
}
