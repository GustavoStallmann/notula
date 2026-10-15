import { useEffect, useRef, useState } from "react";
import { convertFileSrc } from "@tauri-apps/api/core";
import { openPath } from "@tauri-apps/plugin-opener";
import { toast } from "sonner";
import { ExternalLink, Loader2, Pause, Play, SkipBack } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useLang } from "@/lib/i18n";
import { formatSecs } from "@/lib/tauri";

type Status = "idle" | "loading" | "ready" | "failed";

/**
 * Custom audio player backed by WebAudio (sample-accurate start at 0).
 * Bytes are loaded via fetch because WebKitGTK's media engine rejects raw
 * asset:// URLs, and plain <audio> elements proved unreliable for start offset.
 */
export function AudioPlayer({ path, showPath = true }: { path: string; showPath?: boolean }) {
  const { t } = useLang();
  const ctxRef = useRef<AudioContext | null>(null);
  const bufRef = useRef<AudioBuffer | null>(null);
  const srcRef = useRef<AudioBufferSourceNode | null>(null);
  const offsetRef = useRef(0);
  const startCtxRef = useRef(0);
  const playingRef = useRef(false);
  const [status, setStatus] = useState<Status>("idle");
  const [playing, setPlaying] = useState(false);
  const [time, setTime] = useState(0);
  const [duration, setDuration] = useState(0);

  function setPlayingBoth(v: boolean) {
    playingRef.current = v;
    setPlaying(v);
  }

  function stopSource() {
    try {
      if (srcRef.current) srcRef.current.onended = null;
      srcRef.current?.stop();
    } catch {
      /* already stopped */
    }
    srcRef.current = null;
  }

  function currentPos(): number {
    const ctx = ctxRef.current;
    const buf = bufRef.current;
    if (!ctx || !buf) return offsetRef.current;
    if (!playingRef.current) return offsetRef.current;
    return Math.min(offsetRef.current + (ctx.currentTime - startCtxRef.current), buf.duration);
  }

  // Reset + full cleanup when the track changes or the player unmounts.
  useEffect(() => {
    setStatus("idle");
    setPlayingBoth(false);
    setTime(0);
    setDuration(0);
    offsetRef.current = 0;
    return () => {
      try {
        if (srcRef.current) srcRef.current.onended = null;
        srcRef.current?.stop();
      } catch {
        /* ignore */
      }
      srcRef.current = null;
      ctxRef.current?.close().catch(() => {});
      ctxRef.current = null;
      bufRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [path]);

  // Time ticker.
  useEffect(() => {
    const id = setInterval(() => {
      if (playingRef.current) {
        const pos = currentPos();
        setTime(pos);
        const dur = bufRef.current?.duration ?? 0;
        if (dur > 0 && pos >= dur) {
          offsetRef.current = 0;
          setTime(0);
          setPlayingBoth(false);
        }
      }
    }, 200);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function playFrom(offset: number) {
    const ctx = ctxRef.current;
    const buf = bufRef.current;
    if (!ctx || !buf) return;
    ctx.resume().catch(() => {});
    stopSource();
    const clamped = Math.max(0, Math.min(offset, buf.duration));
    const src = ctx.createBufferSource();
    src.buffer = buf;
    src.connect(ctx.destination);
    src.onended = () => setPlayingBoth(false);
    // Explicit offset 0 → playback always starts at the first sample.
    src.start(0, clamped);
    srcRef.current = src;
    offsetRef.current = clamped;
    startCtxRef.current = ctx.currentTime;
    setTime(clamped);
    setPlayingBoth(true);
  }

  function pause() {
    offsetRef.current = currentPos();
    setTime(offsetRef.current);
    stopSource();
    setPlayingBoth(false);
  }

  async function loadAndPlay() {
    if (status === "loading") return;
    setStatus("loading");
    try {
      const AC =
        window.AudioContext ??
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      const ctx = new AC();
      await ctx.resume().catch(() => {});
      const res = await fetch(convertFileSrc(path));
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const raw = await res.arrayBuffer();
      const audioBuf = await ctx.decodeAudioData(raw);
      ctxRef.current = ctx;
      bufRef.current = audioBuf;
      setDuration(audioBuf.duration);
      setStatus("ready");
      playFrom(0);
    } catch {
      setStatus("failed");
    }
  }

  function toggle() {
    if (status === "loading") return;
    if (!bufRef.current) {
      loadAndPlay();
      return;
    }
    if (playingRef.current) {
      pause();
    } else {
      const dur = bufRef.current.duration;
      playFrom(offsetRef.current >= dur - 0.15 ? 0 : offsetRef.current);
    }
  }

  function restart() {
    if (!bufRef.current) {
      loadAndPlay();
      return;
    }
    playFrom(0);
  }

  function seek(v: number) {
    if (!bufRef.current) return;
    if (playingRef.current) {
      playFrom(v);
    } else {
      offsetRef.current = Math.max(0, Math.min(v, bufRef.current.duration));
      setTime(offsetRef.current);
    }
  }

  const fileName = path.split(/[\\/]/).pop()?.replace(/\.wav$/i, "") ?? path;

  return (
    <div className="space-y-1.5">
      {status === "idle" && (
        <button
          onClick={loadAndPlay}
          className="flex h-[54px] w-full items-center gap-3 rounded-md border bg-background px-4 text-left transition-colors hover:bg-accent"
        >
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground">
            <Play className="h-4 w-4 fill-current" />
          </span>
          <span className="min-w-0">
            <span className="block truncate text-sm font-medium">{fileName}</span>
            <span className="block text-xs text-muted-foreground">{t("record.playAudio")}</span>
          </span>
        </button>
      )}

      {status === "loading" && (
        <div className="flex h-[54px] items-center justify-center gap-2 rounded-md bg-muted text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          {t("record.preparing")}
        </div>
      )}

      {status === "failed" && (
        <p className="text-xs text-muted-foreground">{t("record.audioLoadFailed")}</p>
      )}

      {status === "ready" && (
        <div className="flex items-center gap-2 rounded-md border bg-background px-2 py-2">
          <Button
            size="icon"
            variant="ghost"
            className="h-9 w-9 shrink-0 rounded-full"
            aria-label={t("record.restartAudio")}
            onClick={restart}
          >
            <SkipBack className="fill-current" />
          </Button>
          <Button
            size="icon"
            variant="ghost"
            className="h-9 w-9 shrink-0 rounded-full"
            aria-label={playing ? t("record.pauseAudio") : t("record.playAudio")}
            onClick={toggle}
          >
            {playing ? <Pause className="fill-current" /> : <Play className="fill-current" />}
          </Button>
          <span className="w-10 shrink-0 text-xs tabular-nums text-muted-foreground">
            {formatSecs(time)}
          </span>
          <input
            type="range"
            min={0}
            max={Math.max(duration, 0.1)}
            step={0.1}
            value={Math.min(time, Math.max(duration, 0.1))}
            onChange={(e) => seek(Number(e.target.value))}
            className="h-1 min-w-0 flex-1 cursor-pointer accent-primary"
            aria-label={fileName}
          />
          <span className="w-10 shrink-0 text-right text-xs tabular-nums text-muted-foreground">
            {formatSecs(duration)}
          </span>
        </div>
      )}

      <div className="flex items-center gap-2">
        {showPath && (
          <p className="min-w-0 flex-1 truncate font-mono text-[11px] text-muted-foreground">
            {path}
          </p>
        )}
        {!showPath && <span className="flex-1" />}
        <Button
          variant="ghost"
          size="sm"
          onClick={() =>
            openPath(path).catch((e) => toast.error(t("record.openFailed", { err: String(e) })))
          }
        >
          <ExternalLink /> {t("record.openExternally")}
        </Button>
      </div>
    </div>
  );
}
