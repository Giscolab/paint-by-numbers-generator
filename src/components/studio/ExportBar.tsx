import { useState, useCallback } from "react";
import { Button } from "@/components/ui/button";
import type { ViewMode } from "@/contexts/StudioContext";
import {
  Download, FileImage, FileArchive, Settings, ChevronDown, Check, Copy, FileText
} from "lucide-react";
import { toast } from "sonner";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger
} from "@/components/ui/dropdown-menu";
import {
  Tooltip, TooltipContent, TooltipProvider, TooltipTrigger
} from "@/components/ui/tooltip";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue
} from "@/components/ui/select";
import { useStudio } from "@/contexts/StudioContext";
import { exportToPdf, PdfExportOptions, DEFAULT_PDF_OPTIONS } from "@/lib/exportPdf";
import { withPngDpi } from "@/lib/pngDpi";

import JSZip from "jszip";
import { saveAs } from "file-saver";

const DPI_PRESETS = [
  { label: "72 (Web)", value: 72 },
  { label: "150 (Écran)", value: 150 },
  { label: "300 (Impression)", value: 300 },
];

export function ExportBar() {
  const studio = useStudio();
  const processedData = studio.result;
  const [isExporting, setIsExporting] = useState(false);

  // Advanced export dialog
  const [showDialog, setShowDialog] = useState(false);
  const [scale, setScale] = useState(2);
  const [backgroundColor, setBackgroundColor] = useState("#ffffff");
  const [dpi, setDpi] = useState(150);
  const [layerContours, setLayerContours] = useState(true);
  const [layerNumbers, setLayerNumbers] = useState(true);
  const [layerColorized, setLayerColorized] = useState(true);
  const [outputFormat, setOutputFormat] = useState<"png" | "pdf">("png");
  const [copied, setCopied] = useState(false);

  // PDF dialog
  const [showPdfDialog, setShowPdfDialog] = useState(false);
  const [pdfOptions, setPdfOptions] = useState<PdfExportOptions>(DEFAULT_PDF_OPTIONS);

  const disabled = !processedData || studio.isProcessing;

  // Dimensions info
  const imgW = processedData?.numbered?.width || 0;
  const imgH = processedData?.numbered?.height || 0;
  const realW = imgW > 0 ? ((imgW * scale * 25.4) / dpi).toFixed(1) : "—";
  const realH = imgH > 0 ? ((imgH * scale * 25.4) / dpi).toFixed(1) : "—";

  const handleExportPNG = useCallback(
    (scaleValue = 1) => {
      if (!processedData) return;
      try {
        const mode: ViewMode = ["original", "colorized", "contours", "numbered"].includes(studio.viewMode)
          ? studio.viewMode : "colorized";
        studio.exportCanvasAsPNG(
          mode,
          `pbn-${mode}-${new Date().toISOString().slice(0, 10)}.png`,
          scaleValue,
          backgroundColor
        );
        toast.success("Export PNG réussi 🎨");
      } catch (e) {
        console.error(e);
        toast.error("Erreur lors de l'export PNG");
      }
    },
    [processedData, studio, backgroundColor]
  );

  const handleExportZIP = useCallback(async (advanced = false) => {
    if (!processedData) return;
    setIsExporting(true);
    const zip = new JSZip();
    const date = new Date().toISOString().slice(0, 10);

    try {
      const modes: Array<{ key: ViewMode; enabled: boolean }> = [
        { key: "colorized", enabled: !advanced || layerColorized },
        { key: "contours", enabled: !advanced || layerContours },
        { key: "numbered", enabled: !advanced || layerNumbers },
      ];

      if (modes.every(mode => !mode.enabled)) throw new Error("Sélectionnez au moins un calque à exporter.");
      for (const { key, enabled } of modes) {
        if (!enabled) continue;
        const canvas = studio.renderToCanvas(key, advanced ? scale : 1, advanced ? backgroundColor : "#ffffff");
        if (!canvas) continue;
        const blob = await new Promise<Blob | null>((resolve) =>
          canvas.toBlob((b) => resolve(b), "image/png")
        );
        if (!blob) throw new Error("Impossible de créer le PNG du calque « " + key + " ».");
        zip.file(`pbn-${key}-${date}.png`, advanced ? await withPngDpi(blob, dpi) : blob);
      }

      if (Object.keys(zip.files).length === 0) throw new Error("Le ZIP ne contient aucun rendu.");
      const zipBlob = await zip.generateAsync({ type: "blob" });
      saveAs(zipBlob, `pbn-export-${date}.zip`);
      toast.success("ZIP exporté avec succès 🗜️");
    } catch (e) {
      console.error(e);
      toast.error(e instanceof Error ? e.message : "Erreur lors de l'export ZIP");
    } finally {
      setIsExporting(false);
    }
  }, [studio, processedData, scale, backgroundColor, dpi, layerColorized, layerContours, layerNumbers]);

  const handleExportPDF = useCallback((options: PdfExportOptions = pdfOptions) => {
    if (!processedData) return;
    try {
      const blob = exportToPdf(processedData, studio.renderToCanvas, options);
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `pbn-${Date.now()}.pdf`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success("Export PDF réussi 📄");
      setShowPdfDialog(false);
    } catch (e) {
      console.error(e);
      toast.error("Erreur lors de l'export PDF");
    }
  }, [processedData, studio, pdfOptions]);

  const handleCopy = useCallback(async () => {
    if (!processedData) return;
    const width = processedData.metadata?.width ?? processedData.colorized?.width ?? 0;
    const height = processedData.metadata?.height ?? processedData.colorized?.height ?? 0;
    const summary = [
      "PaintByNumbers Studio",
      "Projet : " + (studio.currentProject?.name ?? "Sans titre"),
      "Dimensions : " + width + " × " + height + " px",
      "Couleurs : " + processedData.palette.length,
      "Zones : " + processedData.zones.length,
      "Palette : " + processedData.palette.map((hex, i) => (i + 1) + ". " + hex).join(", "),
    ].join("\n");
    try {
      if (!navigator.clipboard?.writeText) throw new Error("Presse-papiers indisponible");
      await navigator.clipboard.writeText(summary);
      setCopied(true);
      toast.success("Résumé du projet copié.");
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error("Échec de la copie : accès au presse-papiers refusé.");
    }
  }, [processedData, studio.currentProject?.name]);

  return (
    <TooltipProvider>
      <div className="flex items-center gap-2 p-2 flex-wrap">
        {/* Quick PNG */}
        <Tooltip>
          <TooltipTrigger asChild>
            <Button size="sm" variant="outline" onClick={() => handleExportPNG(1)} disabled={disabled}>
              <Download className="w-4 h-4 mr-1" /> PNG
            </Button>
          </TooltipTrigger>
          <TooltipContent>Export PNG rapide (x1)</TooltipContent>
        </Tooltip>

        {/* ZIP */}
        <Tooltip>
          <TooltipTrigger asChild>
            <Button size="sm" variant="outline" onClick={() => { void handleExportZIP(); }} disabled={disabled || isExporting}>
              <FileArchive className="w-4 h-4 mr-1" /> ZIP
            </Button>
          </TooltipTrigger>
          <TooltipContent>Export ZIP (3 rendus)</TooltipContent>
        </Tooltip>

        {/* PDF */}
        <Tooltip>
          <TooltipTrigger asChild>
            <Button size="sm" variant="outline" onClick={() => setShowPdfDialog(true)} disabled={disabled}>
              <FileText className="w-4 h-4 mr-1" /> PDF
            </Button>
          </TooltipTrigger>
          <TooltipContent>Export PDF prêt à imprimer</TooltipContent>
        </Tooltip>

        {/* Advanced */}
        <Tooltip>
          <TooltipTrigger asChild>
            <Button size="sm" variant="ghost" aria-label="Options d'export avancées" onClick={() => setShowDialog(true)} disabled={disabled}>
              <Settings className="w-4 h-4" />
            </Button>
          </TooltipTrigger>
          <TooltipContent>Export avancé multi-résolution</TooltipContent>
        </Tooltip>

        {/* Copy */}
        <Tooltip>
          <TooltipTrigger asChild>
            <Button size="sm" variant="ghost" aria-label="Copier le résumé du projet" onClick={handleCopy} disabled={disabled}>
              {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
            </Button>
          </TooltipTrigger>
          <TooltipContent>Copier info</TooltipContent>
        </Tooltip>
      </div>

      {/* === Advanced Export Dialog === */}
      <Dialog open={showDialog} onOpenChange={setShowDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Export multi-résolution</DialogTitle>
            <DialogDescription>
              Configurez la résolution, les calques et le format avant l'export.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            {outputFormat === "png" && <>
            {/* Scale */}
            <div>
              <Label>Échelle : {scale}x</Label>
              <Slider min={0.5} max={4} step={0.5} value={[scale]} onValueChange={(val) => setScale(val[0])} />
            </div>

            {/* DPI */}
            <div>
              <Label>DPI du PNG (métadonnées d’impression)</Label>
              <div className="flex gap-1 mt-1">
                {DPI_PRESETS.map((p) => (
                  <Button
                    key={p.value}
                    size="sm"
                    variant={dpi === p.value ? "default" : "outline"}
                    onClick={() => setDpi(p.value)}
                    className="text-xs h-7"
                  >
                    {p.label}
                  </Button>
                ))}
              </div>
            </div>

            {/* Dimensions */}
            {imgW > 0 && (
              <div className="text-xs text-muted-foreground">
                Dimensions réelles : {realW} × {realH} mm ({((parseFloat(realW as string) || 0) / 25.4).toFixed(1)}" × {((parseFloat(realH as string) || 0) / 25.4).toFixed(1)}")
              </div>
            )}

            </>}
            {/* Layers */}
            <div>
              <Label className="mb-2 block">Calques à inclure</Label>
              <div className="flex flex-col gap-2">
                <label className="flex items-center gap-2 text-sm">
                  <Checkbox checked={layerColorized} onCheckedChange={(v) => setLayerColorized(!!v)} />
                  Colorisé
                </label>
                <label className="flex items-center gap-2 text-sm">
                  <Checkbox checked={layerContours} onCheckedChange={(v) => setLayerContours(!!v)} />
                  Contours
                </label>
                <label className="flex items-center gap-2 text-sm">
                  <Checkbox checked={layerNumbers} onCheckedChange={(v) => setLayerNumbers(!!v)} />
                  Numéroté
                </label>
              </div>
            </div>

            {outputFormat === "png" && <>
            {/* Background */}
            <div>
              <Label htmlFor="export-background-color">Couleur de fond</Label>
              <Input id="export-background-color" type="color" value={backgroundColor} aria-label="Couleur de fond" onChange={(e) => setBackgroundColor(e.target.value)} />
            </div>

            </>}
            {outputFormat === "pdf" && <div className="grid grid-cols-2 gap-2">
              <div><Label>Format papier</Label><Select value={pdfOptions.paperSize} onValueChange={value => setPdfOptions(prev => ({ ...prev, paperSize: value as PdfExportOptions["paperSize"] }))}><SelectTrigger className="h-8"><SelectValue/></SelectTrigger><SelectContent><SelectItem value="a4">A4</SelectItem><SelectItem value="a3">A3</SelectItem><SelectItem value="letter">Letter</SelectItem></SelectContent></Select></div>
              <div><Label>Orientation</Label><Select value={pdfOptions.orientation} onValueChange={value => setPdfOptions(prev => ({ ...prev, orientation: value as PdfExportOptions["orientation"] }))}><SelectTrigger className="h-8"><SelectValue/></SelectTrigger><SelectContent><SelectItem value="portrait">Portrait</SelectItem><SelectItem value="landscape">Paysage</SelectItem></SelectContent></Select></div>
            </div>}
            {/* Format */}
            <div>
              <Label>Format de sortie</Label>
              <Select value={outputFormat} onValueChange={(v) => setOutputFormat(v as "png" | "pdf")}>
                <SelectTrigger className="w-full h-8 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="png">ZIP (PNG)</SelectItem>
                  <SelectItem value="pdf">PDF</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowDialog(false)}>Annuler</Button>
            <Button
              onClick={() => {
                if (outputFormat === "pdf") {
                  // Use PDF export with selected layers
                  const opts: PdfExportOptions = {
                    ...pdfOptions,
                    includeColorized: layerColorized,
                    includeNumbered: layerNumbers,
                    includeContours: layerContours,
                    includeLegend: true,
                  };
                  setPdfOptions(opts);
                  handleExportPDF(opts);
                } else {
                  void handleExportZIP(true);
                }
                setShowDialog(false);
              }}
              disabled={isExporting || (!layerColorized && !layerContours && !layerNumbers)}
            >
              {outputFormat === "pdf" ? (
                <><FileText className="w-4 h-4 mr-2" /> Export PDF</>
              ) : (
                <><FileArchive className="w-4 h-4 mr-2" /> Export ZIP</>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* === PDF Export Dialog === */}
      <Dialog open={showPdfDialog} onOpenChange={setShowPdfDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Export PDF — Prêt à imprimer</DialogTitle>
            <DialogDescription>
              Générez un PDF multi-pages avec image, contours, légende et instructions.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>Format papier</Label>
              <Select value={pdfOptions.paperSize} onValueChange={(v) => setPdfOptions((o) => ({ ...o, paperSize: v as PdfExportOptions["paperSize"] }))}>
                <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="a4">A4 (210 × 297 mm)</SelectItem>
                  <SelectItem value="a3">A3 (297 × 420 mm)</SelectItem>
                  <SelectItem value="letter">Letter (8.5 × 11 in)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Orientation</Label>
              <Select value={pdfOptions.orientation} onValueChange={(v) => setPdfOptions((o) => ({ ...o, orientation: v as PdfExportOptions["orientation"] }))}>
                <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="portrait">Portrait</SelectItem>
                  <SelectItem value="landscape">Paysage</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="mb-2 block">Pages à inclure</Label>
              <div className="flex flex-col gap-2">
                <label className="flex items-center gap-2 text-sm">
                  <Checkbox checked={pdfOptions.includeColorized} onCheckedChange={(v) => setPdfOptions((o) => ({ ...o, includeColorized: !!v }))} />
                  Image colorisée
                </label>
                <label className="flex items-center gap-2 text-sm">
                  <Checkbox checked={pdfOptions.includeNumbered} onCheckedChange={(v) => setPdfOptions((o) => ({ ...o, includeNumbered: !!v }))} />
                  Contours numérotés
                </label>
                <label className="flex items-center gap-2 text-sm">
                  <Checkbox checked={pdfOptions.includeContours} onCheckedChange={(v) => setPdfOptions((o) => ({ ...o, includeContours: !!v }))} />
                  Contours sans numéros
                </label>
                <label className="flex items-center gap-2 text-sm">
                  <Checkbox checked={pdfOptions.includeLegend} onCheckedChange={(v) => setPdfOptions((o) => ({ ...o, includeLegend: !!v }))} />
                  Légende des couleurs
                </label>
                <label className="flex items-center gap-2 text-sm">
                  <Checkbox checked={pdfOptions.includeInstructions} onCheckedChange={(v) => setPdfOptions((o) => ({ ...o, includeInstructions: !!v }))} />
                  Instructions de peinture
                </label>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowPdfDialog(false)}>Annuler</Button>
            <Button onClick={() => handleExportPDF()}>
              <FileText className="w-4 h-4 mr-2" /> Générer le PDF
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </TooltipProvider>
  );
}
