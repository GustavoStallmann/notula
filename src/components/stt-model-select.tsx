import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { DEFAULT_STT_MODEL, WHISPER_STT_MODEL } from "@/lib/settings";
import { useLang } from "@/lib/i18n";

export function SttModelSelect({
  value,
  onChange,
  disabled,
  id,
}: {
  value: string;
  onChange: (model: string) => void;
  disabled?: boolean;
  id?: string;
}) {
  const { t } = useLang();
  const isCustom = value !== DEFAULT_STT_MODEL && value !== WHISPER_STT_MODEL;
  return (
    <Select value={value} onValueChange={onChange} disabled={disabled}>
      <SelectTrigger id={id}>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value={DEFAULT_STT_MODEL}>{t("settings.sttGrok")}</SelectItem>
        <SelectItem value={WHISPER_STT_MODEL}>{t("settings.sttWhisper")}</SelectItem>
        {isCustom && (
          <SelectItem value={value}>
            {t("settings.sttCustom")}: {value}
          </SelectItem>
        )}
      </SelectContent>
    </Select>
  );
}
