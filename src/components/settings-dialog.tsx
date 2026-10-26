import { useState } from "react";
import { Eye, EyeOff, Settings } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { SttModelSelect } from "@/components/stt-model-select";
import { CloudSettings, saveSettings } from "@/lib/settings";
import { useLang } from "@/lib/i18n";

export function SettingsDialog({
  settings,
  onChange,
}: {
  settings: CloudSettings;
  onChange: (s: CloudSettings) => void;
}) {
  const [showToken, setShowToken] = useState(false);
  const { t } = useLang();
  const missing = !settings.accountId || !settings.apiToken;

  function update(patch: Partial<CloudSettings>) {
    const next = { ...settings, ...patch };
    onChange(next);
    saveSettings(next);
  }

  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button variant="ghost" size="icon" aria-label={t("settings.trigger")} className="relative">
          <Settings />
          {missing && (
            <span className="absolute right-1.5 top-1.5 h-2 w-2 rounded-full bg-destructive" />
          )}
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("settings.title")}</DialogTitle>
          <DialogDescription>{t("settings.desc")}</DialogDescription>
        </DialogHeader>
        <div className="grid gap-4">
          <div className="grid gap-2">
            <Label htmlFor="cf-account">{t("settings.accountId")}</Label>
            <Input
              id="cf-account"
              value={settings.accountId}
              onChange={(e) => update({ accountId: e.target.value.trim() })}
              placeholder="e.g. a1b2c3d4…"
              spellCheck={false}
              autoComplete="off"
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="cf-token">{t("settings.apiToken")}</Label>
            <div className="flex gap-2">
              <Input
                id="cf-token"
                type={showToken ? "text" : "password"}
                value={settings.apiToken}
                onChange={(e) => update({ apiToken: e.target.value.trim() })}
                placeholder="Workers AI token"
                spellCheck={false}
                autoComplete="off"
              />
              <Button
                variant="outline"
                size="icon"
                aria-label={showToken ? t("settings.hideToken") : t("settings.showToken")}
                onClick={() => setShowToken(!showToken)}
              >
                {showToken ? <EyeOff /> : <Eye />}
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">{t("settings.tokenHint")}</p>
          </div>
          <div className="grid gap-2">
            <Label htmlFor="cf-stt">{t("settings.sttModel")}</Label>
            <SttModelSelect
              id="cf-stt"
              value={settings.sttModel}
              onChange={(m) => update({ sttModel: m })}
            />
          </div>
          <div className="flex items-center gap-2">
            <input
              id="cf-trim"
              type="checkbox"
              checked={settings.trimSilence}
              onChange={(e) => update({ trimSilence: e.target.checked })}
            />
            <Label htmlFor="cf-trim">{t("settings.trimSilence")}</Label>
          </div>
          <div className="grid gap-2">
            <Label>{t("settings.speed")}</Label>
            <Select
              value={String(settings.sttSpeed)}
              onValueChange={(v) => update({ sttSpeed: Number(v) })}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="1">1×</SelectItem>
                <SelectItem value="1.25">1.25×</SelectItem>
                <SelectItem value="1.5">1.5×</SelectItem>
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">{t("settings.speedHint")}</p>
          </div>
          <div className="grid gap-2">
            <Label htmlFor="cf-llm">{t("settings.llmModel")}</Label>
            <Input
              id="cf-llm"
              value={settings.llmModel}
              onChange={(e) => update({ llmModel: e.target.value })}
              spellCheck={false}
            />
          </div>
          <div className="grid gap-2">
            <Label>{t("settings.outputLang")}</Label>
            <Select value={settings.language || "auto"} onValueChange={(v) => update({ language: v === "auto" ? "" : v })}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="auto">{t("settings.langAuto")}</SelectItem>
                <SelectItem value="English">{t("lang.english")}</SelectItem>
                <SelectItem value="French">{t("lang.french")}</SelectItem>
                <SelectItem value="Spanish">{t("lang.spanish")}</SelectItem>
                <SelectItem value="German">{t("lang.german")}</SelectItem>
                <SelectItem value="Portuguese">{t("lang.portuguese")}</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
