import { Globe } from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useLang, type UILang } from "@/lib/i18n";

export function LangSwitch() {
  const { lang, setLang } = useLang();
  return (
    <div className="flex items-center">
      <Globe className="mr-1 h-4 w-4 text-muted-foreground" />
      <Select value={lang} onValueChange={(v) => setLang(v as UILang)}>
        <SelectTrigger aria-label="Interface language" className="h-8 w-[76px] border-0 shadow-none">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="en">EN</SelectItem>
          <SelectItem value="pt">PT</SelectItem>
        </SelectContent>
      </Select>
    </div>
  );
}
