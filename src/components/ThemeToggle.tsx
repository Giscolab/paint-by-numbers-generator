import { Moon, Sun, Monitor, Palette } from "lucide-react";
import { useTheme } from "next-themes";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useEffect, useState } from "react";
import { CRYPTOKEEP_THEMES } from "@/config/themes";

export function ThemeToggle() {
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const selected = CRYPTOKEEP_THEMES.find((item) => item.id === theme);
  const Icon = theme === "light" ? Sun : theme === "dark" ? Moon : theme === "system" ? Monitor : Palette;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          disabled={!mounted}
          className="h-9 gap-2 hover:bg-accent/50 transition-colors"
          aria-label={`Changer de thème${mounted && selected ? ` : ${selected.label}` : ""}`}
          title="Choisir les couleurs du studio"
        >
          <Icon className="h-4 w-4" />
          <span className="hidden sm:inline">{mounted && selected ? selected.label : "Thème"}</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-60 max-h-[min(32rem,80vh)] overflow-y-auto">
        <DropdownMenuRadioGroup value={theme} onValueChange={setTheme}>
          <DropdownMenuLabel>Apparence du studio</DropdownMenuLabel>
          <DropdownMenuRadioItem value="light"><Sun className="mr-2 h-4 w-4" />Clair</DropdownMenuRadioItem>
          <DropdownMenuRadioItem value="dark"><Moon className="mr-2 h-4 w-4" />Sombre</DropdownMenuRadioItem>
          <DropdownMenuRadioItem value="system"><Monitor className="mr-2 h-4 w-4" />Système</DropdownMenuRadioItem>
          <DropdownMenuSeparator />
          <DropdownMenuLabel>Collection CryptoKeep</DropdownMenuLabel>
          {CRYPTOKEEP_THEMES.map((item) => (
            <DropdownMenuRadioItem key={item.id} value={item.id} className="cursor-pointer gap-3">
              <span aria-hidden="true" className="flex overflow-hidden rounded border border-current/20">
                {[item.background, item.surface, item.accent].map((color, index) => (
                  <span key={index} className="h-4 w-3" style={{ backgroundColor: color }} />
                ))}
              </span>
              <span className="flex-1">{item.label}</span>
              {item.dark ? <Moon className="h-3 w-3 opacity-60" aria-hidden="true" /> : <Sun className="h-3 w-3 opacity-60" aria-hidden="true" />}
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
