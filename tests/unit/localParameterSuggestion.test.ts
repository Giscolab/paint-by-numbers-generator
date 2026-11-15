import { describe, expect, it } from "vitest";
import type { ColorAnalysis, Recommendations } from "@/lib/imageProcessing";
import { suggestParametersLocally } from "@/lib/localParameterSuggestion";

const analysis = (mode: ColorAnalysis["mode"] = "photo"): ColorAnalysis => ({
  mode,
  uniqueColorsCount: 120,
  complexityScore: 65,
  edgeDensity: 0.18,
  entropy: 3.7,
  totalPixels: 120_000,
  dominantColors: ["#ffffff", "#112233"],
  dominantWeights: [0.6, 0.4],
  histogram: [],
});

const recommendation: Recommendations = {
  mode: "photo",
  recommendedNumColors: 24,
  recommendedMinRegionSize: 18,
  recommendedDeltaE: 6,
  reasons: { numColors: "", minRegionSize: "", deltaE: "", mode: "" },
};

describe("fallback local des suggestions de paramètres", () => {
  it("ne prétend pas utiliser l’IA et respecte les limites des réglages", () => {
    const result = suggestParametersLocally(analysis(), recommendation, "debutant");
    expect(result.summary).toContain("sans intelligence artificielle");
    expect(result.settings.numColors).toBeGreaterThanOrEqual(4);
    expect(result.settings.numColors).toBeLessThanOrEqual(16);
    expect(result.settings.minRegionSize).toBeLessThanOrEqual(500);
    expect(result.settings.mergeTolerance).toBeLessThanOrEqual(30);
    expect(result.settings.enableArtisticMerge).toBe(true);
  });

  it("conserve davantage de détails pour un expert que pour un débutant", () => {
    const beginner = suggestParametersLocally(analysis(), recommendation, "debutant");
    const expert = suggestParametersLocally(analysis(), recommendation, "expert");
    expect(expert.settings.numColors).toBeGreaterThan(beginner.settings.numColors);
    expect(expert.settings.minRegionSize).toBeLessThan(beginner.settings.minRegionSize);
    expect(expert.settings.mergeTolerance).toBeLessThan(beginner.settings.mergeTolerance);
    expect(expert.settings.enableArtisticMerge).toBe(false);
  });

  it("fonctionne sans recommandations et respecte la source vectorielle", () => {
    const result = suggestParametersLocally(analysis("vector"), null, "intermediaire");
    expect(result.settings.smartPalette).toBe(false);
    expect(result.settings.numColors).toBeGreaterThan(0);
    expect(result.rationale.length).toBeGreaterThan(0);
    expect(result.settings.paintEffect).toBe("none");
  });
});
