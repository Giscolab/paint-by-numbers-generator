import { useEffect, useRef, useState } from "react";
import { ImageUpload } from "@/components/ImageUpload";
import { ParametersPanel } from "@/components/ParametersPanel";
import { AiSuggestionsCard } from "@/components/AiSuggestionsCard";

import { ColorPalette } from "@/components/ColorPalette";
import { PalettePanel } from "@/components/PalettePanel";
import { ColorAnalysisPanel } from "@/components/ColorAnalysisPanel";
import { Header } from "@/components/Header";
import { StudioLayout } from "@/components/studio/StudioLayout";
import { EnhancedViewTabs } from "@/components/studio/EnhancedViewTabs";
import { ExportBar } from "@/components/studio/ExportBar";
import { DebugPanel } from "@/components/studio/DebugPanel";
import { StudioProvider, useStudio } from "@/contexts/StudioContext";
import { analyzeImageColors, getRecommendationsFromAnalysis } from "@/lib/imageProcessing";
import { processImageWithWorker } from "@/lib/imageProcessingWorker";
import { resizeForDisplay } from "@/lib/imageNormalization";
import { isSvgFile, rasterizeSvgFile } from "@/lib/svgImport";
import { toast } from "sonner";
import Confetti from "react-confetti";
import { useWindowSize } from "@/hooks/useWindowSize";
import { ProcessingProgress } from "@/components/ProcessingProgress";
import { Zone } from "@/hooks/useCanvasInteractions";
import { IMAGE_PROCESSING, UI } from "@/config/constants";
import { useAutoSave } from "@/hooks/useAutoSave";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";

/**
 * ================================
 *  PAINT BY NUMBERS STUDIO v2.0
 *  - gauche : upload + réglages
 *  - centre : canvas interactif
 *  - droite : palette + debug
 *  - bas : export PNG / ZIP
 * ================================
 */
function IndexContent() {
  const studio = useStudio();
  const { startProfiling, recordStage, endProfiling, clearHistory } =
    studio.profiler;
  useAutoSave();

  const lastFileRef = useRef<File | null>(null);
  const importInputRef = useRef<HTMLInputElement>(null);
  const documentRevision = useRef(0);
  const processingLock = useRef(false);
  const [isImporting, setIsImporting] = useState(false);
  const [selectedImageUrl, setSelectedImageUrl] = useState<string | null>(null);
  const [showConfetti, setShowConfetti] = useState(false);
  const [processingStage, setProcessingStage] = useState("");
  const [processingProgress, setProcessingProgress] = useState(0);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [showAnalysisDialog, setShowAnalysisDialog] = useState(false);
  const [zonesByColor, setZonesByColor] = useState<Map<number, Zone[]>>(
    new Map()
  );
  const [selectedColorIdx, setSelectedColorIdx] = useState<number | null>(null);
  const [imageDimensions, setImageDimensions] = useState<{ width: number; height: number } | null>(null);

  const { width = 0, height = 0 } = useWindowSize() ?? {};

  useEffect(() => {
    if (!selectedImageUrl) {
      setImageDimensions(null);
      return;
    }

    const image = new Image();
    image.onload = () => {
      setImageDimensions({ width: image.naturalWidth, height: image.naturalHeight });
    };
    image.src = selectedImageUrl;
    return () => { image.onload = null; };
  }, [selectedImageUrl]);

  // ========== IMAGE SELECTION ==========
  const handleImageSelect = async (file: File) => {
    if (processingLock.current) { toast.info("Patientez jusqu’à la fin de la génération avant de changer d’image."); return; }
    if (file.size > IMAGE_PROCESSING.MAX_FILE_SIZE_BYTES || !file.type.startsWith('image/')) { toast.error("Choisissez une image de 20 Mo maximum."); return; }
    const revision = ++documentRevision.current;
    setIsImporting(true);
    try {
      const originalName = file.name;
      const isVectorSource = isSvgFile(file);
      let processingFile = file;
      const resetSettings = {
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
      } as const;

      if (isVectorSource) {
        toast.info("Rasterisation du SVG…", {
          description: "Conversion en image bitmap pour le traitement.",
        });
        const rasterized = await rasterizeSvgFile(file);
        processingFile = rasterized.file;
      }

      if (revision !== documentRevision.current) return;
      lastFileRef.current = processingFile;
      const tempUrl = URL.createObjectURL(processingFile);
      setSelectedImageUrl(tempUrl);

      const initialProject = {
        id: Date.now().toString(),
        name: originalName,
        timestamp: Date.now(),
        imageUrl: tempUrl,
        imageFile: processingFile,
        sourceType: isVectorSource ? "vector" as const : "raster" as const,
        settings: { ...studio.settings, ...resetSettings },
      };

      studio.setViewMode("original");
      studio.setResult(null);
      studio.setAnalysis(null);
      studio.setRecommendations(null);
      studio.setCurrentProject(initialProject);
      setShowAnalysisDialog(false);
      studio.updateSettings(resetSettings);
      setZonesByColor(new Map());
      setSelectedColorIdx(null);

      toast.success("Image chargée (aperçu)", {
        description: "Normalisation en cours…",
      });

      const normalizedUrl = await resizeForDisplay(
        processingFile,
        IMAGE_PROCESSING.MAX_DISPLAY_WIDTH
      );
      if (revision !== documentRevision.current) { URL.revokeObjectURL(tempUrl); return; }
      setSelectedImageUrl(normalizedUrl);
      studio.setCurrentProject({ ...initialProject, imageUrl: normalizedUrl });
      URL.revokeObjectURL(tempUrl);
    } catch (err) {
      console.error(err);
      toast.error("Erreur lors du chargement de l'image");
    } finally {
      if (revision === documentRevision.current) { setIsAnalyzing(false); setIsImporting(false); }
    }
  };

  const handleAnalyze = async () => {
    if (isImporting || processingLock.current || isAnalyzing) return;
    const revision = documentRevision.current;
    const file = studio.currentProject?.imageFile ?? lastFileRef.current;
    if (!file) {
      toast.error("Aucun fichier à analyser");
      return;
    }

    try {
      setIsAnalyzing(true);
      const analysis = await analyzeImageColors(file, {
        onProgress: () => {},
        sourceType: studio.currentProject?.sourceType ?? "raster",
      });
      if (revision !== documentRevision.current) return;
      const recommendations = getRecommendationsFromAnalysis(analysis);
      studio.setAnalysis(analysis);
      studio.setRecommendations(recommendations);
      toast.success(`✨ ${analysis.uniqueColorsCount} couleurs détectées`);
      setShowAnalysisDialog(true);
    } catch (err) {
      console.error(err);
      toast.error("Erreur lors de l'analyse de l'image");
    } finally {
      setIsAnalyzing(false);
    }
  };

  const handleApplyRecommendations = () => {
    studio.applyRecommendations();
    toast.success("Recommandations appliquées aux paramètres");
    setShowAnalysisDialog(false);
  };

  // ========== PROCESSING ==========
  const handleProcess = async () => {
    if (processingLock.current || isImporting || isAnalyzing) return;
    const file = studio.currentProject?.imageFile ?? lastFileRef.current;
    if (!file) return toast.error("Aucun fichier à traiter");
    if (!studio.analysis) {
      toast.error("Veuillez d'abord analyser l'image.");
      return;
    }

    processingLock.current = true;
    studio.setIsProcessing(true);
    setProcessingStage("Initialisation…");
    toast.info("Traitement de l'image en cours ⚡");

    const profilingEnabled = studio.settings.profilingEnabled;
    let profilingActive = false;
    let lastStageLabel = "Initialisation";
    let lastStageTime = performance.now();

    if (profilingEnabled) {
      profilingActive = true;
      startProfiling();
    }

    try {
      const result = await processImageWithWorker(
        file,
        studio.settings.numColors,
        studio.settings.minRegionSize,
        studio.settings.smoothness,
        studio.settings.mergeTolerance,
        (stage, progress) => {
          setProcessingStage(stage);
          setProcessingProgress(progress);
          if (profilingActive) {
            const now = performance.now();
            recordStage(lastStageLabel, now - lastStageTime);
            lastStageLabel = stage;
            lastStageTime = now;
          }
        },
        studio.settings.smartPalette,
        studio.settings.enableArtisticMerge
      );

      studio.setResult(result);
      studio.setViewMode("colorized");
      setShowConfetti(true);
      setTimeout(() => setShowConfetti(false), UI.CONFETTI_DURATION_MS);
      const missing = result.metadata?.unnumberedZoneCount ?? 0;
      if (missing) toast.warning(`${missing} zone(s) trop fines pour un numéro. Vérifiez le modèle avant impression.`);
      else toast.success("Modèle généré : chaque zone dispose d’un numéro lisible.");
    } catch (err) {
      console.error("Erreur de traitement :", err);
      toast.error("Erreur lors du traitement de l'image");
      if (profilingActive) clearHistory();
    } finally {
      if (profilingActive) endProfiling();
      processingLock.current = false;
      studio.setIsProcessing(false);
      setProcessingProgress(0);
    }
  };

  // ========== RENDER ==========
  return (
    <div className="atelier-studio">
      <input ref={importInputRef} type="file" accept="image/png,image/jpeg,image/webp,image/svg+xml" hidden onChange={(event) => { const file = event.target.files?.[0]; if (file) void handleImageSelect(file); event.target.value = ""; }} />
      <Header onImport={() => importInputRef.current?.click()} />

      {/* Confettis */}
      {showConfetti && (
        <Confetti
          width={width}
          height={height}
          recycle={false}
          numberOfPieces={UI.CONFETTI_PIECES}
          gravity={UI.CONFETTI_GRAVITY}
        />
      )}

      {/* Barre de progression */}
      <ProcessingProgress
        stage={processingStage}
        progress={processingProgress}
        isVisible={studio.isProcessing}
      />

      {/* === Layout principal === */}
      <StudioLayout
        sourceImage={selectedImageUrl}
        onImport={() => importInputRef.current?.click()}
        configurationAction={<><p className="mb-3 text-[10px] text-muted-foreground">{studio.analysis ? "Votre prochaine création commence ici." : "Analysez votre image pour commencer."}</p><Button className="h-10 w-full gap-2 text-xs" onClick={handleProcess} disabled={studio.isProcessing || isImporting || isAnalyzing || !studio.analysis}>{studio.isProcessing ? "Création en cours…" : "Générer ma création"}</Button></>}
        leftPanel={
          <>
            <ImageUpload
              onImageSelect={handleImageSelect}
              selectedImage={selectedImageUrl}
            />

            <div className="mt-2 flex gap-2">
              <Button
                type="button"
                size="sm"
                onClick={handleAnalyze}
                disabled={!selectedImageUrl || isAnalyzing || isImporting || studio.isProcessing}
              >
                {isAnalyzing ? "Analyse en cours…" : "Analyser l'image"}
              </Button>
              {studio.analysis && (
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() => setShowAnalysisDialog(true)}
                >
                  Voir le rapport
                </Button>
              )}
            </div>

            <Dialog open={showAnalysisDialog} onOpenChange={setShowAnalysisDialog}>
              <DialogContent className="max-w-lg">
                <DialogHeader>
                  <DialogTitle>Analyse brute</DialogTitle>
                  <DialogDescription>
                    Rapport structuré : mesures brutes, interprétation et recommandations.
                  </DialogDescription>
                </DialogHeader>
                <ColorAnalysisPanel
                  analysis={studio.analysis}
                  recommendations={studio.recommendations}
                  isAnalyzing={isAnalyzing}
                  processedResult={studio.result}
                  onApplyRecommendations={handleApplyRecommendations}
                  onClose={() => setShowAnalysisDialog(false)}
                />
              </DialogContent>
            </Dialog>

            <AiSuggestionsCard
              analysis={studio.analysis}
              recommendations={studio.recommendations}
              onApply={(settings) => {
                studio.updateSettings(settings);
                toast.success("Paramètres IA appliqués");
              }}
            />

            <fieldset disabled={studio.isProcessing || isImporting} className="atelier-parameters-fieldset">
            <ParametersPanel
              showProcessButton={false}

              numColors={studio.settings.numColors}
              onNumColorsChange={(v) =>
                studio.updateSettings({ numColors: v })
              }
              minRegionSize={studio.settings.minRegionSize}
              onMinRegionSizeChange={(v) =>
                studio.updateSettings({ minRegionSize: v })
              }
              smoothness={studio.settings.smoothness}
              onSmoothnessChange={(v) =>
                studio.updateSettings({ smoothness: v })
              }
              mergeTolerance={studio.settings.mergeTolerance}
              onMergeToleranceChange={(v) =>
                studio.updateSettings({ mergeTolerance: v })
              }
              enableArtisticMerge={studio.settings.enableArtisticMerge}
              onEnableArtisticMergeChange={(v) =>
                studio.updateSettings({ enableArtisticMerge: v })
              }
              smartPalette={studio.settings.smartPalette}
              onSmartPaletteChange={(v) =>
                studio.updateSettings({ smartPalette: v })
              }
              paintEffect={studio.settings.paintEffect}
              onPaintEffectChange={(effect) =>
                studio.updateSettings({
                  paintEffect: effect,
                  // Une intensité nulle rendrait l'effet invisible : on amorce à 55 %
                  paintIntensity:
                    effect !== "none" && studio.settings.paintIntensity === 0
                      ? 55
                      : studio.settings.paintIntensity,
                })
              }
              paintIntensity={studio.settings.paintIntensity}
              onPaintIntensityChange={(intensity) =>
                studio.updateSettings({ paintIntensity: intensity })
              }
              artisticEffect={studio.settings.artisticEffect}
              onArtisticEffectChange={(effect) =>
                studio.updateSettings({
                  artisticEffect: effect,
                  artisticIntensity:
                    effect !== "none" && studio.settings.artisticIntensity === 0
                      ? 55
                      : studio.settings.artisticIntensity,
                })
              }
              artisticIntensity={studio.settings.artisticIntensity}
              onArtisticIntensityChange={(intensity) =>
                studio.updateSettings({ artisticIntensity: intensity })
              }
              profilingEnabled={studio.settings.profilingEnabled}
              onProfilingEnabledChange={(enabled) =>
                studio.updateSettings({ profilingEnabled: enabled })
              }
              analysisReady={Boolean(studio.analysis)}
              recommendations={studio.recommendations}
              onProcess={handleProcess}
              isProcessing={studio.isProcessing}
            />
            </fieldset>
          </>
        }
        centerPanel={
          <EnhancedViewTabs
            originalImage={selectedImageUrl}
            processedData={studio.result}
          />
        }
        rightPanel={
          <>
            {studio.result && (
              <>
                <ColorPalette colors={studio.result.palette} />
                {zonesByColor.size > 0 && (
                  <PalettePanel
                    zonesByColor={zonesByColor}
                    selectedColorIdx={selectedColorIdx}
                    onColorSelect={setSelectedColorIdx}
                  />
                )}
                <details className="atelier-debug"><summary>Analyse détaillée du modèle</summary><DebugPanel processedData={studio.result} /></details>
              </>
            )}
          </>
        }
        bottomBar={<ExportBar />} // ✅ export PNG + ZIP
        imageInfo={{
          width: imageDimensions?.width,
          height: imageDimensions?.height,
          zoomPercent: studio.zoomPercent,
          colorSpace: "sRGB",
          bitDepth: 8,
        }}
      />
    </div>
  );
}

const Index = () => (
  <StudioProvider>
    <IndexContent />
  </StudioProvider>
);

export default Index;
