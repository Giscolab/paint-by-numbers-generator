import { ThemeProvider as NextThemesProvider } from "next-themes";
import { type ThemeProviderProps } from "next-themes/dist/types";
import { STUDIO_THEMES } from "@/config/themes";

/**
 * ThemeProvider pour le système de thèmes dark/light/système
 * Utilise next-themes pour la gestion automatique du thème
 */
export function ThemeProvider({ children, ...props }: ThemeProviderProps) {
  return (
    <NextThemesProvider
      attribute="class"
      defaultTheme="padawan"
      themes={STUDIO_THEMES}
      value={Object.fromEntries(STUDIO_THEMES.map((id) => [id, id === "light" || id === "dark" ? id : `theme-${id}`]))}
      enableSystem
      enableColorScheme={false}
      disableTransitionOnChange
      {...props}
    >
      {children}
    </NextThemesProvider>
  );
}
