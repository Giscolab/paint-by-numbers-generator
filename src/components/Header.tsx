import { useState, useCallback } from "react";
import type { SavedProjectSummary } from "@/lib/projectStore";
import { Layers, Download, FileArchive, ChevronDown, FolderOpen, Save, CheckCheck } from "lucide-react";
import { ThemeToggle } from "@/components/ThemeToggle";
import { useStudio } from "@/contexts/StudioContext";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { exportToPdf, DEFAULT_PDF_OPTIONS } from "@/lib/exportPdf";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";

import JSZip from "jszip";
import { saveAs } from "file-saver";

/**
 * Header pro Figma-like :
 * - Bouton PNG rapide
 * - Menu ZIP (3 rendus)
 * - Theme toggle à droite
 */
export const Header = ({ onImport }: { onImport?: () => void }) => {
  const studio = useStudio();
  const [isExporting, setIsExporting] = useState(false);
  const [savedProjects, setSavedProjects] = useState<SavedProjectSummary[]>([]);
  const [projectBusy, setProjectBusy] = useState(false);
  const refreshProjects = async () => {
    try { setSavedProjects(await studio.getSavedProjects()); }
    catch (error) { toast.error(error instanceof Error ? error.message : "Stockage local inaccessible."); }
  };
  const saveCurrentProject = async () => {
    setProjectBusy(true);
    try { await studio.saveProject(studio.currentProject?.name || "Mon projet"); await refreshProjects(); toast.success("Projet enregistré et réouvrable localement."); }
    catch (error) { toast.error(error instanceof Error ? error.message : "Enregistrement impossible."); }
    finally { setProjectBusy(false); }
  };
  const openSavedProject = async (id: string) => {
    setProjectBusy(true);
    try { await studio.loadProject(id); toast.success("Projet restauré."); }
    catch (error) { toast.error(error instanceof Error ? error.message : "Restauration impossible."); }
    finally { setProjectBusy(false); }
  };
  const removeSavedProject = async (project: SavedProjectSummary) => {
    if (!window.confirm("Supprimer définitivement le projet enregistré « " + project.name + " » ?")) return;
    try { await studio.deleteProject(project.id); await refreshProjects(); toast.success("Projet supprimé du stockage local."); }
    catch (error) { toast.error(error instanceof Error ? error.message : "Suppression impossible."); }
  };

  const handleQuickExport = async () => {
    try {
      if (!studio.result) {
        toast.error("Aucun projet à exporter");
        return;
      }

      const filename = studio.currentProject?.name
        ? studio.currentProject.name.replace(/\.[^/.]+$/, "")
        : "pbn-export";

      studio.exportCanvasAsPNG(
        "colorized",
        `${filename}-colorized-${new Date().toISOString().slice(0, 10)}.png`,
        2
      );

      toast.success("Export PNG (colorisé HD) réussi 🎨");
    } catch (err) {
      console.error(err);
      toast.error("Échec de l’export PNG");
    }
  };

  const handleExportZIP = useCallback(async () => {
    try {
      if (!studio.result) {
        toast.error("Aucun projet à exporter");
        return;
      }

      setIsExporting(true);
      const zip = new JSZip();
      const date = new Date().toISOString().slice(0, 10);
      const modes = ["colorized", "contours", "numbered"] as const;

      const filenameBase = studio.currentProject?.name
        ? studio.currentProject.name.replace(/\.[^/.]+$/, "")
        : "pbn-export";

      for (const mode of modes) {
        const canvas = studio.renderToCanvas(mode, 2, "#ffffff");
        if (!canvas) continue;
        const blob = await new Promise<Blob | null>((resolve) =>
          canvas.toBlob((b) => resolve(b), "image/png")
        );
        if (blob) zip.file(`${filenameBase}-${mode}-${date}.png`, blob);
      }

      const zipBlob = await zip.generateAsync({ type: "blob" });
      saveAs(zipBlob, `${filenameBase}-bundle-${date}.zip`);
      toast.success("ZIP exporté avec succès 🗜️");
    } catch (err) {
      console.error(err);
      toast.error("Erreur lors de l’export ZIP");
    } finally {
      setIsExporting(false);
    }
  }, [studio]);

  return (
    <header
      role="banner"
      className="atelier-header"
    >
      <div className="atelier-header-inner">
        <div className="atelier-brand"><span className="atelier-brand-icon"><Layers size={20}/></span><h1>canvas<span> to </span>colors</h1><span className="atelier-brand-badge">STUDIO</span></div>
        <nav aria-label="Menu principal" className="atelier-header-nav">
          <DropdownMenu onOpenChange={(open) => { if (open) void refreshProjects(); }}>
            <DropdownMenuTrigger asChild><Button variant="ghost" size="sm">Fichier</Button></DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="max-h-[70vh] min-w-72 overflow-y-auto">
              <DropdownMenuItem onClick={onImport}><FolderOpen className="mr-2 h-4 w-4" />Importer une image</DropdownMenuItem>
              <DropdownMenuItem disabled={!studio.result || projectBusy} onClick={() => { void saveCurrentProject(); }}><Save className="mr-2 h-4 w-4" />Enregistrer le projet localement</DropdownMenuItem>
              <DropdownMenuSeparator />
              <div className="px-2 py-1 text-xs text-muted-foreground">Projets enregistrés sur cet appareil</div>
              {savedProjects.length === 0 ? <DropdownMenuItem disabled>Aucun projet enregistré</DropdownMenuItem> :
                savedProjects.map(project => <DropdownMenuItem key={project.id} disabled={projectBusy} onClick={() => { void openSavedProject(project.id); }}>
                  <FolderOpen className="mr-2 h-4 w-4 shrink-0" /><span className="max-w-[220px] truncate">{project.name}</span>
                </DropdownMenuItem>)}
              {savedProjects.length > 0 && <><DropdownMenuSeparator />
                <div className="px-2 py-1 text-xs text-muted-foreground">Supprimer un projet enregistré</div>
                {savedProjects.map(project => <DropdownMenuItem key={"delete-" + project.id} className="text-destructive" onClick={() => { void removeSavedProject(project); }}>Supprimer : {project.name}</DropdownMenuItem>)}
              </>}
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => studio.updatePreferences({ autoSave: !studio.preferences.autoSave })}>
                {studio.preferences.autoSave ? "☑" : "☐"} Sauvegarde automatique (2 min)
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          <DropdownMenu><DropdownMenuTrigger asChild><Button variant="ghost" size="sm" className="hidden sm:inline-flex">Affichage</Button></DropdownMenuTrigger><DropdownMenuContent>{([['original','Original'],['colorized','Couleurs'],['contours','Contours'],['numbered','Numéros'],['compare','Comparer']] as const).map(([mode,label])=><DropdownMenuItem key={mode} disabled={mode !== 'original' && !studio.result} onClick={()=>studio.setViewMode(mode)}>{label}</DropdownMenuItem>)}</DropdownMenuContent></DropdownMenu>
        </nav>
        {/* Zone droite : actions + theme toggle */}
        <div className="ml-auto flex items-center gap-2">
          <span className="atelier-local-status"><CheckCheck size={13}/>Traitement d’image local</span>
          {/* Export rapide PNG */}
          <Button
            size="sm"
            variant="outline"
            className="hidden sm:inline-flex gap-2"
            onClick={handleQuickExport}
            title="Exporter la version colorisée en PNG (x2)"
            disabled={!studio.result}
          >
            {isExporting ? (
              <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
            ) : (
              <Download className="w-4 h-4" />
            )}
            PNG
          </Button>

          {/* Menu ZIP */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                size="sm"
                variant="outline"
                className="gap-2"
                disabled={!studio.result || isExporting}
                title="Exporter les trois rendus (ZIP)"
              >
                <FileArchive className="w-4 h-4" />
                Exporter
                <ChevronDown className="w-3 h-3" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={handleExportZIP}>
                Exporter tout (colorisé + contours + numéroté)
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                onClick={() => {
                  studio.exportCanvasAsPNG("colorized", "colorized.png", 2);
                  toast.success("Export PNG colorisé 🎨");
                }}
              >
                Seulement colorisé
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() => {
                  studio.exportCanvasAsPNG("contours", "contours.png", 2);
                  toast.success("Export PNG contours ✏️");
                }}
              >
                Seulement contours
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() => {
                  studio.exportCanvasAsPNG("numbered", "numbered.png", 2);
                  toast.success("Export PNG numéroté 🔢");
                }}
              >
                Seulement numéroté
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                onClick={() => {
                  if (!studio.result) return;
                  try {
                    const blob = exportToPdf(studio.result, studio.renderToCanvas, DEFAULT_PDF_OPTIONS);
                    const url = URL.createObjectURL(blob);
                    const a = document.createElement("a");
                    a.href = url;
                    a.download = `pbn-${Date.now()}.pdf`;
                    a.click();
                    URL.revokeObjectURL(url);
                    toast.success("Export PDF réussi 📄");
                  } catch (e) {
                    console.error(e);
                    toast.error("Erreur export PDF");
                  }
                }}
              >
                Export PDF (prêt à imprimer)
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>

          <ThemeToggle />
        </div>
      </div>
    </header>
  );
};
