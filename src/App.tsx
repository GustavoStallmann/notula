import { useState } from "react";
import { LayoutGrid, Mic } from "lucide-react";
import { useTheme } from "next-themes";
import { Toaster } from "sonner";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { SettingsDialog } from "@/components/settings-dialog";
import { ThemeToggle } from "@/components/theme-toggle";
import { LangSwitch } from "@/components/lang-switch";
import { useLang } from "@/lib/i18n";
import RecordStep from "@/components/record-step";
import GalleryStep from "@/components/gallery-step";
import { CloudSettings, loadSettings } from "@/lib/settings";

type Step = "record" | "tasks";

export default function App() {
  const [settings, setSettings] = useState<CloudSettings>(() => loadSettings());
  const [step, setStep] = useState<Step>("record");
  const [lastRecording, setLastRecording] = useState<string | null>(null);
  const { resolvedTheme } = useTheme();
  const { t } = useLang();

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="sticky top-0 z-40 border-b bg-background/80 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-3xl items-center justify-between px-4">
          <div className="flex items-center gap-2.5">
            <img src="/notula.svg" alt="Notula" className="h-8 w-8 rounded-lg" />
            <div className="leading-tight">
              <p className="text-sm font-semibold tracking-tight">Notula</p>
            </div>
          </div>
          <div className="flex items-center gap-1">
            <LangSwitch />
            <SettingsDialog settings={settings} onChange={setSettings} />
            <ThemeToggle />
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-4 py-6">
        <Tabs value={step} onValueChange={(v) => setStep(v as Step)}>
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="record">
              <Mic /> {t("tabs.record")}
            </TabsTrigger>
            <TabsTrigger value="tasks">
              <LayoutGrid /> {t("tabs.tasks")}
            </TabsTrigger>
          </TabsList>

          <TabsContent value="record">
            <RecordStep
              onStopped={(p) => {
                setLastRecording(p);
                setStep("tasks");
              }}
            />
          </TabsContent>
          <TabsContent value="tasks">
            <GalleryStep settings={settings} initialOpenPath={lastRecording} />
          </TabsContent>
        </Tabs>
      </main>

      <Toaster
        theme={(resolvedTheme as "light" | "dark" | "system") ?? "system"}
        richColors
        closeButton
        position="bottom-right"
      />
    </div>
  );
}
