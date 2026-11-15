import type { ColorAnalysis, Recommendations } from "@/lib/imageProcessing";
import type { StudioSettings } from "@/contexts/StudioContext";

export type Difficulty = "debutant" | "intermediaire" | "expert";
export type SuggestedSettingsLocal = Pick<StudioSettings,
  "numColors" | "minRegionSize" | "smoothness" | "mergeTolerance" |
  "enableArtisticMerge" | "smartPalette" | "paintEffect" |
  "paintIntensity" | "artisticEffect" | "artisticIntensity"
>;

export interface LocalParameterSuggestion {
  settings: SuggestedSettingsLocal;
  summary: string;
  rationale: Array<{ parameter: string; value: string; reason: string }>;
}

const limit = (n: number, min: number, max: number): number =>
  Math.max(min, Math.min(max, Math.round(n)));

/**
 * Offline, deterministic fallback. This is NOT an AI response and is always
 * explicitly marked as local in the UI.
 */
export function suggestParametersLocally(
  analysis: ColorAnalysis,
  recommendations: Recommendations | null,
  difficulty: Difficulty,
): LocalParameterSuggestion {
  const complexity = limit(analysis.complexityScore ?? 50, 0, 100);
  const baseColors = limit(
    recommendations?.recommendedNumColors ??
      6 + Math.sqrt(Math.max(1, analysis.uniqueColorsCount)) * 2 + complexity / 10,
    4, 80,
  );
  const baseArea = limit(
    recommendations?.recommendedMinRegionSize ?? 10 + complexity / 2,
    0, 500,
  );
  const baseDeltaE = limit(recommendations?.recommendedDeltaE ?? 5, 0, 30);

  const numColors = difficulty === "debutant"
    ? limit(Math.min(16, baseColors), 4, 16)
    : difficulty === "expert"
    ? limit(Math.max(24, baseColors * 1.5), 4, 80)
    : baseColors;
  const minRegionSize = difficulty === "debutant"
    ? limit(Math.max(45, baseArea * 3), 0, 500)
    : difficulty === "expert"
    ? limit(baseArea / 2, 0, 500)
    : baseArea;
  const mergeTolerance = difficulty === "debutant"
    ? limit(baseDeltaE + 7, 0, 30)
    : difficulty === "expert"
    ? limit(baseDeltaE - 3, 0, 30)
    : baseDeltaE;
  const settings: SuggestedSettingsLocal = {
    numColors,
    minRegionSize,
    smoothness: difficulty === "debutant" ? 20 : difficulty === "expert" ? 0 : 5,
    mergeTolerance,
    enableArtisticMerge: difficulty === "debutant",
    smartPalette: analysis.mode === "photo" && complexity >= 30,
    paintEffect: "none",
    paintIntensity: 0,
    artisticEffect: "none",
    artisticIntensity: 0,
  };
  return {
    settings,
    summary: "Proposition locale calculée à partir de l’analyse de l’image (sans intelligence artificielle).",
    rationale: [
      {
        parameter: "Nombre de couleurs",
        value: String(numColors),
        reason: "Adapte le nombre de teintes à la complexité et au niveau de détail souhaité.",
      },
      {
        parameter: "Petites zones",
        value: minRegionSize + " px",
        reason: "Réduit les zones difficiles à peindre pour les débutants et conserve les détails pour les experts.",
      },
      {
        parameter: "Fusion perceptuelle",
        value: "ΔE " + mergeTolerance,
        reason: "Ajuste la fusion des nuances proches au niveau de difficulté.",
      },
    ],
  };
}
