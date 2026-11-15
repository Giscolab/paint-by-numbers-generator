import {
  createContext,
  useContext,
  useState,
  useCallback,
  ReactNode,
  useEffect,
  useRef,
} from "react";
import { toast } from "sonner";
import { ProcessedResult, ColorAnalysis, Recommendations } from "@/lib/imageProcessing";
import { useProfiler } from "@/hooks/useProfiler";
import type { PaintEffectType } from "@/lib/postProcessing";
import { applyArtisticEffect, type ArtisticEffectType } from "@/lib/artisticEffects";
import { applyPaintEffect } from "@/lib/postProcessing";
import { deleteStoredProject, listStoredProjects, loadStoredProject, saveStoredProject, type SavedProjectSummary } from "@/lib/projectStore";

// Note: Pour la fonctionnalité d'export ZIP, vous devrez installer ces dépendances:
// npm install jszip file-saver
// import JSZip from "jszip";
// import { saveAs } from "file-saver";

// ---------------------------------------------
// Types principaux
// ---------------------------------------------

export type ViewMode =
  | "original"
  | "contours"
  | "numbered"
  | "colorized"
  | "compare"
  | "profiler";

export interface StudioSettings {
  numColors: number;
  minRegionSize: number;
  smoothness: number;
  mergeTolerance: number;
  enableArtisticMerge: boolean;
  smartPalette: boolean;
  paintEffect: PaintEffectType;
  paintIntensity: number;
  artisticEffect: ArtisticEffectType;
  artisticIntensity: number;
  profilingEnabled: boolean;
  watermarkEnabled?: boolean; // Nouveau: option pour le filigrane
  watermarkText?: string; // Nouveau: texte du filigrane
}

export interface UserPreferences {
  lastViewMode: ViewMode;
  autoSave: boolean;
  theme: "light" | "dark" | "system";
  lastProjectId?: string;
}

export interface Project {
  id: string;
  name: string;
  timestamp: number;
  imageUrl: string;
  imageFile?: File;
  sourceType?: 'vector' | 'raster';
  settings: StudioSettings;
  analysis?: ColorAnalysis;
  recommendations?: Recommendations;
  result?: ProcessedResult;
    favorite?: boolean;
}

// ---------------------------------------------
// Nouveaux types HUD / Overlay
// ---------------------------------------------

export type OverlayState = {
  numbered: boolean; // afficher les numéros sur l'overlay
  opacity: number; // 0..100
};

// ---------------------------------------------
// Interface principale du contexte
// ---------------------------------------------

export interface StudioContextValue {
  // --- État général ---
  currentProject: Project | null;
  viewMode: ViewMode;
  analysis: ColorAnalysis | null;
  recommendations: Recommendations | null;
  result: ProcessedResult | null;
  settings: StudioSettings;
  isProcessing: boolean;
  preferences: UserPreferences;

  // --- Actions principales ---
  setCurrentProject: (project: Project | null) => void;
  setViewMode: (mode: ViewMode) => void;
  setAnalysis: (analysis: ColorAnalysis | null) => void;
  setRecommendations: (recommendations: Recommendations | null) => void;
  setResult: (result: ProcessedResult | null) => void;
  updateSettings: (settings: Partial<StudioSettings>) => void;
  setIsProcessing: (processing: boolean) => void;
  applyRecommendations: () => void;
  updatePreferences: (prefs: Partial<UserPreferences>) => void;

  // --- Gestion projets ---
  saveProject: (name: string) => Promise<void>;
  loadProject: (projectId: string) => Promise<void>;
  deleteProject: (projectId: string) => Promise<void>;
  getSavedProjects: () => Promise<SavedProjectSummary[]>;

  // --- Performance profiler ---
  profiler: ReturnType<typeof useProfiler>;

  // --- AJOUT : état/handlers HUD ---
  zoomPercent: number;
  setZoomPercent: (v: number) => void;
  zoomIn: () => void;
  zoomOut: () => void;
  resetZoom: () => void;
  panTool: boolean;
  togglePanTool: () => void; // mode "main" (pan) visuel
  pickColor: () => void;
  colorPicking: boolean;
  setColorPicking: (value: boolean) => void;
  selectedColorIdx: number | null;
  setSelectedColorIdx: (value: number | null) => void;
  focusedZone: { id: number; x: number; y: number; nonce: number } | null;

  overlay: OverlayState;
  setOverlay: (s: OverlayState) => void;

  // Aller à la zone numérotée N (si dispo)
  findZoneByNumber?: (n: number) => void;
  
  // --- AJOUT : méthodes de rendu et d'export ---
  renderToCanvas: (mode: ViewMode, scale?: number, backgroundColor?: string) => HTMLCanvasElement | null;
  exportCanvasAsPNG: (mode: ViewMode, filename?: string, scale?: number, backgroundColor?: string) => void;
  exportAllPNGs: () => Promise<void>; // Nouveau: export multi-fichiers en ZIP
}

// ---------------------------------------------
// Défauts
// ---------------------------------------------

const DEFAULT_SETTINGS: StudioSettings = {
  numColors: 36,
  minRegionSize: 20,
  smoothness: 0,
  mergeTolerance: 5,
  enableArtisticMerge: false,
  smartPalette: false,
  paintEffect: "none",
  paintIntensity: 0,
  artisticEffect: "none",
  artisticIntensity: 0,
  profilingEnabled: false,
  watermarkEnabled: false,
  watermarkText: "",
};

const DEFAULT_PREFERENCES: UserPreferences = {
  lastViewMode: "original",
  autoSave: false,
  theme: "system",
};

// ---------------------------------------------
// LocalStorage helpers
// ---------------------------------------------

const loadPreferences = (): UserPreferences => {
  try {
    const stored = localStorage.getItem("pbn-preferences");
    return stored
      ? { ...DEFAULT_PREFERENCES, ...JSON.parse(stored) }
      : DEFAULT_PREFERENCES;
  } catch {
    return DEFAULT_PREFERENCES;
  }
};

const savePreferences = (prefs: UserPreferences) => {
  try {
    localStorage.setItem("pbn-preferences", JSON.stringify(prefs));
  } catch (error) {
    console.error("Failed to save preferences:", error);
  }
};

// ---------------------------------------------
// Contexte
// ---------------------------------------------

const StudioContext = createContext<StudioContextValue | undefined>(undefined);

// ---------------------------------------------
// Provider
// ---------------------------------------------

export function StudioProvider({ children }: { children: ReactNode }) {
  const [currentProject, setCurrentProject] = useState<Project | null>(null);
  const [preferences, setPreferences] =
    useState<UserPreferences>(loadPreferences);
  const [viewMode, setViewMode] = useState<ViewMode>("original");
  const [analysis, setAnalysis] = useState<ColorAnalysis | null>(null);
  const [recommendations, setRecommendations] = useState<Recommendations | null>(null);
  const [result, setResult] = useState<ProcessedResult | null>(null);
  const effectCache = useRef<{ source: ImageData; key: string; image: ImageData } | null>(null);
  const [settings, setSettings] = useState<StudioSettings>(DEFAULT_SETTINGS);
  const [isProcessing, setIsProcessing] = useState(false);
  const profiler = useProfiler();

  // --- AJOUT HUD ---
  const [zoomPercent, _setZoomPercent] = useState<number>(100);
  const clampZoom = (v: number) => Math.max(10, Math.min(800, Math.round(v)));

  const setZoomPercent = useCallback((v: number) => {
    _setZoomPercent(clampZoom(v));
  }, []);

  const zoomIn = useCallback(() => {
    _setZoomPercent((z) => clampZoom(z + 10));
  }, []);

  const zoomOut = useCallback(() => {
    _setZoomPercent((z) => clampZoom(z - 10));
  }, []);

  const [isPanMode, setIsPanMode] = useState(false);
  const togglePanTool = useCallback(() => setIsPanMode((v) => !v), []);
  const resetZoom = useCallback(() => {
    _setZoomPercent(100);
  }, []);
  const [colorPicking, setColorPicking] = useState(false);
  const [selectedColorIdx, setSelectedColorIdx] = useState<number | null>(null);
  const [focusedZone, setFocusedZone] = useState<{ id: number; x: number; y: number; nonce: number } | null>(null);
  const pickColor = useCallback(() => {
    if (!result) { toast.error("Générez d’abord un modèle pour utiliser la pipette."); return; }
    setColorPicking(true);
    setViewMode("numbered");
    toast.info("Cliquez sur une zone pour copier sa couleur.");
  }, [result]);

  const [overlay, setOverlay] = useState<OverlayState>({
    numbered: true,
    opacity: 60,
  });

  const findZoneByNumber = useCallback((n: number) => {
    if (!result) return;
    if (!Number.isInteger(n) || n < 1 || n > result.palette.length) {
      toast.error("Numéro de couleur inexistant.");
      return;
    }
    const target = result.zones.filter(zone => zone.colorIdx + 1 === n)
      .sort((a, b) => b.area - a.area)[0];
    if (!target) { toast.error("Aucune zone trouvée pour ce numéro."); return; }
    setSelectedColorIdx(target.colorIdx);
    setFocusedZone({ id: target.id, x: target.centroid.x, y: target.centroid.y, nonce: Date.now() });
    setViewMode("numbered");
    toast.success("Zone « " + n + " » localisée et sélectionnée.");
  }, [result]);

// ---------------------------------------------
// Fonction de rendu sur Canvas (corrigée et centrée)
// ---------------------------------------------
// ---------------------------------------------
// Fonction de rendu sur Canvas (Option B : taille originale, redimensionnée)
// ---------------------------------------------
const renderToCanvas = useCallback((
  mode: ViewMode,
  scale: number = 1,
  backgroundColor?: string
): HTMLCanvasElement | null => {
  if (!result) {
    console.warn("[Studio] Aucun résultat à exporter.");
    toast.error("Aucun rendu disponible.");
    return null;
  }

  const { metadata, colorized, contours, numbered } = result;
  const width = metadata?.width ?? colorized?.width ?? 0;
  const height = metadata?.height ?? colorized?.height ?? 0;

  if (!width || !height || width <= 0 || height <= 0) {
    console.error("[Studio] Export annulé : dimensions invalides", { width, height });
    toast.error("Erreur : largeur ou hauteur d'image invalide.");
    return null;
  }

  if (!Number.isFinite(scale) || scale <= 0 || scale > 8) throw new Error("Échelle d’export invalide.");
  const canvas = document.createElement("canvas");
  canvas.width = width * scale;
  canvas.height = height * scale;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;

  // Fond blanc par défaut
  ctx.fillStyle = backgroundColor ?? "#ffffff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  // Choix du rendu à exporter
  let img: ImageData | null = null;
  switch (mode) {
    case "original":
      img = result.original ?? null;
      break;
    case "colorized":
      img = colorized;
      if (img) {
        const key = [settings.paintEffect, settings.paintIntensity, settings.artisticEffect, settings.artisticIntensity].join(":");
        if (effectCache.current?.source === img && effectCache.current.key === key) {
          img = effectCache.current.image;
        } else {
          let output = img;
          if (settings.paintEffect !== "none" && settings.paintIntensity > 0) {
            output = applyPaintEffect(output, { type: settings.paintEffect, intensity: settings.paintIntensity });
          }
          if (settings.artisticEffect !== "none" && settings.artisticIntensity > 0) {
            output = applyArtisticEffect(output, { type: settings.artisticEffect, intensity: settings.artisticIntensity });
          }
          effectCache.current = { source: img, key, image: output };
          img = output;
        }
      }
      break;
    case "contours":
      img = contours;
      break;
    case "numbered":
      img = numbered;
      break;
    case "compare":
      img = colorized;
      break;
    default:
      toast.error(`Mode d'export inconnu : ${mode}`);
      return null;
  }

  if (!img) {
    toast.error("Aucune image disponible pour ce mode.");
    console.error("[Studio] Aucun ImageData pour le mode", mode);
    return null;
  }

  // ✅ Création d’un canvas temporaire à la taille du rendu réel
  const tempCanvas = document.createElement("canvas");
  tempCanvas.width = img.width;
  tempCanvas.height = img.height;
  const tempCtx = tempCanvas.getContext("2d");
  if (!tempCtx) return null;
  tempCtx.putImageData(img, 0, 0);

  // ✅ Mise à l’échelle vers la taille originale
  ctx.save();
  ctx.scale(scale, scale);
  ctx.drawImage(tempCanvas, 0, 0, img.width, img.height, 0, 0, width, height);
  ctx.restore();

  // The numbered image already contains palette numbers. Never draw zone ids over it.

  // ✅ Filigrane optionnel
  if (settings.watermarkEnabled && settings.watermarkText) {
    ctx.font = `${8 * scale}px JetBrains Mono`;
    ctx.fillStyle = "rgba(0,0,0,0.4)";
    ctx.textAlign = "right";
    ctx.fillText(
      settings.watermarkText,
      width * scale - 10,
      height * scale - 10
    );
  }

  return canvas;
}, [result, settings.paintEffect, settings.paintIntensity, settings.artisticEffect, settings.artisticIntensity, settings.watermarkEnabled, settings.watermarkText]);



  // ---------------------------------------------
  // Helper d'export PNG
  // ---------------------------------------------
  const exportCanvasAsPNG = useCallback((
    mode: ViewMode,
    filename?: string,
    scale = 1,
    backgroundColor?: string
  ) => {
    const canvas = renderToCanvas(mode, scale, backgroundColor);
    if (!canvas) throw new Error("Canvas introuvable");
    
    const link = document.createElement("a");
    link.download = filename ?? `pbn-${mode}.png`;
    link.href = canvas.toDataURL("image/png");
    link.click();
  }, [renderToCanvas]);

  // ---------------------------------------------
  // Helper d'export multi-fichiers en ZIP
  // ---------------------------------------------
  const exportAllPNGs = useCallback(async () => {
    if (!result) return;
    
    // Note: Cette fonction nécessite les dépendances jszip et file-saver
    // import JSZip from "jszip";
    // import { saveAs } from "file-saver";
    
    try {
      // Dynamic import to avoid runtime errors when optional dependencies are missing
      const JSZip = (await import("jszip")).default;
      const { saveAs } = await import("file-saver");
      
      const zip = new JSZip();
      const modes: ViewMode[] = ["colorized", "contours", "numbered"];
      
      for (const mode of modes) {
        const canvas = renderToCanvas(mode, 1);
        if (!canvas) continue;
        
        const blob = await new Promise<Blob | null>((res) => 
          canvas.toBlob(res, "image/png")
        );
        
        if (blob) {
          zip.file(`pbn-${mode}.png`, blob);
        }
      }

      const zipBlob = await zip.generateAsync({ type: "blob" });
      const dateStr = new Date().toISOString().slice(0, 10);
      saveAs(zipBlob, `pbn-exports-${dateStr}.zip`);
    } catch (error) {
      console.error("Erreur lors de l'export ZIP:", error);
      // Fallback: exporter les fichiers individuellement si JSZip n'est pas disponible
      const modes: ViewMode[] = ["colorized", "contours", "numbered"];
      for (const mode of modes) {
        exportCanvasAsPNG(mode);
      }
    }
  }, [result, renderToCanvas, exportCanvasAsPNG]);

  // ---------------------------------------------
  // Effets
  // ---------------------------------------------

  useEffect(() => {
    profiler.setEnabled(settings.profilingEnabled);
  }, [settings.profilingEnabled, profiler.setEnabled]);

  useEffect(() => {
    if (!result && viewMode !== "original" && viewMode !== "profiler") setViewMode("original");
  }, [result, viewMode]);

  useEffect(() => {
    savePreferences(preferences);
  }, [preferences]);

  useEffect(() => {
    if (viewMode !== preferences.lastViewMode) {
      setPreferences((prev) => ({ ...prev, lastViewMode: viewMode }));
    }
  }, [viewMode, preferences.lastViewMode]);

  // ---------------------------------------------
  // Actions
  // ---------------------------------------------

  const updatePreferences = useCallback((newPrefs: Partial<UserPreferences>) => {
    setPreferences((prev) => ({ ...prev, ...newPrefs }));
  }, []);

  const updateSettings = useCallback((newSettings: Partial<StudioSettings>) => {
    setSettings((prev) => ({ ...prev, ...newSettings }));
  }, []);

  const applyRecommendations = useCallback(() => {
    if (!recommendations) return;
    setSettings((prev) => ({
      ...prev,
      numColors: recommendations.recommendedNumColors,
      minRegionSize: recommendations.recommendedMinRegionSize,
      mergeTolerance: recommendations.recommendedDeltaE,
    }));
  }, [recommendations]);

  const getSavedProjects = useCallback(() => listStoredProjects(), []);

  const saveProject = useCallback(async (name: string) => {
    const imageFile = currentProject?.imageFile;
    if (!currentProject || !imageFile || !result) throw new Error("Importez et générez une image avant de l’enregistrer.");
    const projectName = name.trim() || currentProject.name || "Sans titre";
    await saveStoredProject({
      id: currentProject.id, name: projectName, timestamp: Date.now(), imageFile,
      sourceType: currentProject.sourceType, settings, analysis: analysis ?? undefined,
      recommendations: recommendations ?? undefined, result,
    });
    setCurrentProject(previous => previous?.id === currentProject.id ? { ...previous, name: projectName } : previous);
  }, [currentProject, result, settings, analysis, recommendations]);

  const loadProject = useCallback(async (projectId: string) => {
    const project = await loadStoredProject(projectId);
    if (!project) throw new Error("Ce projet n’existe plus dans le stockage local.");
    if (!project.imageFile || !project.result) throw new Error("Projet incomplet : impossible de restaurer les rendus.");
    const imageUrl = URL.createObjectURL(project.imageFile);
    setCurrentProject({
      id: project.id, name: project.name, timestamp: project.timestamp,
      imageFile: project.imageFile, imageUrl, sourceType: project.sourceType,
      settings: project.settings, analysis: project.analysis,
      recommendations: project.recommendations, result: project.result,
    });
    setSettings({ ...DEFAULT_SETTINGS, ...project.settings });
    setAnalysis(project.analysis ?? null);
    setRecommendations(project.recommendations ?? null);
    setResult(project.result);
    setSelectedColorIdx(null);
    setFocusedZone(null);
    setColorPicking(false);
    setViewMode("colorized");
  }, []);

  const deleteProject = useCallback(async (projectId: string) => {
    await deleteStoredProject(projectId);
  }, []);

  // ---------------------------------------------
  // Valeur exposée
  // ---------------------------------------------

  const value: StudioContextValue = {
    currentProject,
    viewMode,
    analysis,
    recommendations,
    result,
    settings,
    isProcessing,
    preferences,
    setCurrentProject,
    setViewMode,
    setAnalysis,
    setRecommendations,
    setResult,
    updateSettings,
    setIsProcessing,
    applyRecommendations,
    updatePreferences,
    saveProject,
    loadProject,
    deleteProject,
    getSavedProjects,
    profiler,

    // HUD
    zoomPercent,
    setZoomPercent,
    zoomIn,
    zoomOut,
    resetZoom,
    panTool: isPanMode,
    togglePanTool,
    pickColor,
    colorPicking,
    setColorPicking,
    selectedColorIdx,
    setSelectedColorIdx,
    focusedZone,
    overlay,
    setOverlay,
    findZoneByNumber,
    
    // Export
    renderToCanvas,
    exportCanvasAsPNG,
    exportAllPNGs,
  };

  return (
    <StudioContext.Provider value={value}>{children}</StudioContext.Provider>
  );
}

// ---------------------------------------------
// Hook
// ---------------------------------------------

export function useStudio() {
  const context = useContext(StudioContext);
  if (context === undefined) {
    throw new Error("useStudio must be used within a StudioProvider");
  }
  return context;
}
