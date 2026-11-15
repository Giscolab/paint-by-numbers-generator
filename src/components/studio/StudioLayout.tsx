import { useState, type ReactNode } from "react";
import { FolderOpen, Image, Layers, MousePointer2, Hand, ZoomIn, Palette, SlidersHorizontal, PanelLeftClose, PanelLeftOpen, PanelRightClose, PanelRightOpen, Plus, Sparkles, Scan, Check } from "lucide-react";
import { useStudio } from "@/contexts/StudioContext";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";

interface StudioImageInfo { width?: number | null; height?: number | null; zoomPercent?: number | null; colorSpace?: string | null; bitDepth?: number | null; }
interface StudioLayoutProps {
  notice?: ReactNode;
  leftPanel: ReactNode; centerPanel: ReactNode; rightPanel?: ReactNode; bottomBar?: ReactNode;
  configurationAction?: ReactNode; imageInfo?: StudioImageInfo; className?: string; sourceImage?: string | null; onImport?: () => void;
}

export function StudioLayout({ leftPanel, centerPanel, rightPanel, bottomBar, imageInfo, className, sourceImage, onImport, configurationAction, notice }: StudioLayoutProps) {
  const studio = useStudio();
  const [leftOpen, setLeftOpen] = useState(() => window.innerWidth >= 640);
  const [rightOpen, setRightOpen] = useState(() => window.innerWidth >= 960);
  const [inspector, setInspector] = useState("properties");
  const toggleLeft = () => { if (!leftOpen && window.innerWidth < 960) setRightOpen(false); setLeftOpen(!leftOpen); };
  const toggleRight = () => { if (!rightOpen && window.innerWidth < 960) setLeftOpen(false); setRightOpen(!rightOpen); };
  const openInspector = (section: string) => { setInspector(section); setRightOpen(true); if (window.innerWidth < 960) setLeftOpen(false); };
  const hasDimensions = Boolean(imageInfo?.width && imageInfo?.height);
  const dimensions = hasDimensions ? `${imageInfo.width} × ${imageInfo.height} px` : "Aucune image";
  const name = studio.currentProject?.name || "Sans titre";
  const result = studio.result;
  const toolButton = (label: string, icon: ReactNode, action: () => void, active = false) => (
    <button type="button" title={label} aria-label={label} aria-pressed={active} onClick={action} className={cn("atelier-tool", active && "is-active")}>{icon}</button>
  );

  return <div className={cn("atelier-layout", className)}>
    <div className="atelier-document-bar">
      <div className="flex h-full min-w-0 items-center">
        <button className="atelier-document-open" onClick={onImport} aria-label="Ouvrir une image"><FolderOpen size={16} /></button>
        <button type="button" className="atelier-panel-switch" aria-label={leftOpen ? "Replier le panneau de configuration" : "Déplier le panneau de configuration"} aria-expanded={leftOpen} aria-controls="studio-configuration" onClick={toggleLeft} title={leftOpen ? "Replier la configuration" : "Déplier la configuration"}>{leftOpen ? <PanelLeftClose size={17}/> : <PanelLeftOpen size={17}/>}<span>Configuration</span></button>
        <div className="atelier-document-tab"><Image size={14} /><span className="truncate">{name}</span><span className="atelier-document-dot" /></div>
        {toolButton("Importer une autre image", <Plus size={16}/>, () => onImport?.())}
      </div>
      <div className="atelier-panel-switches" role="group" aria-label="Visibilité des panneaux">

        <button type="button" className="atelier-panel-switch" aria-label={rightOpen ? "Replier l’inspecteur" : "Déplier l’inspecteur"} aria-expanded={rightOpen} aria-controls="studio-inspector" onClick={toggleRight} title={rightOpen ? "Replier l’inspecteur" : "Déplier l’inspecteur"}>{rightOpen ? <PanelRightClose size={17}/> : <PanelRightOpen size={17}/>}<span>Inspecteur</span></button>
      </div>
    </div>
    <div className="atelier-body">
      <nav aria-label="Outils du studio" className="atelier-toolrail">
        {toolButton("Sélection", <MousePointer2 size={18}/>, () => { if(studio.panTool) studio.togglePanTool(); }, !studio.panTool)}
        {toolButton("Déplacement", <Hand size={18}/>, () => { if(!studio.panTool) studio.togglePanTool(); }, studio.panTool)}
        {toolButton("Zoom avant", <ZoomIn size={18}/>, studio.zoomIn)}
        <span className="atelier-tool-divider" />
        {toolButton("Afficher la palette", <Palette size={18}/>, () => openInspector("properties"))}
        {toolButton("Afficher les rendus", <Layers size={18}/>, () => openInspector("views"))}
        <div className="atelier-color-stack" aria-hidden="true"><span/><span/></div>

      </nav>
      {<aside hidden={!leftOpen} id="studio-configuration" aria-label="Configuration de génération" className="atelier-configuration">
        <div className="atelier-panel-heading"><span><SlidersHorizontal size={14}/>Configuration</span></div>
        <div className="atelier-configuration-content">{leftPanel}</div>
        <div className="atelier-generation-action">{configurationAction}</div>
      </aside>}
      <main aria-label="Plan de travail" className="atelier-workspace">
        {notice}
    {result?.metadata?.unnumberedZoneCount ? <div className="atelier-model-warning" role="status">{result.metadata.unnumberedZoneCount} zone(s) trop fines pour un numéro lisible. Augmentez la fusion des petites zones avant impression.</div> : null}

        <div className="atelier-workspace-caption"><span><span className="atelier-ready-dot"/>PLAN DE TRAVAIL 01</span><span>{imageInfo?.colorSpace ?? "sRGB"} · {imageInfo?.bitDepth ?? 8} bits</span></div>
        <div className="atelier-canvas">{centerPanel}</div>
      </main>
      {<aside hidden={!rightOpen} id="studio-inspector" aria-label="Inspecteur du document" className="atelier-inspector">
        <Tabs value={inspector} onValueChange={setInspector} className="flex min-h-0 flex-1 flex-col">
          <div className="atelier-inspector-heading"><TabsList aria-label="Inspecteur du document" className="atelier-inspector-tabs"><TabsTrigger value="properties">Propriétés</TabsTrigger><TabsTrigger value="views">Rendus</TabsTrigger><TabsTrigger value="export">Export</TabsTrigger></TabsList></div>
          <div className="atelier-inspector-content">
            <TabsContent value="properties" className="m-0">
              <section className="atelier-section"><h2>Navigateur <Scan size={13}/></h2>{sourceImage ? <div className="atelier-navigator"><img src={sourceImage} alt="Vue miniature de l’image source"/><span/></div> : <div className="atelier-navigator-empty"><Image size={28}/><p>Votre image apparaîtra ici</p></div>}<div className="atelier-image-meta"><span>{Math.round(studio.zoomPercent)} %</span><span>{dimensions}</span></div></section>
              {result ? <><section className="atelier-section"><h2>Votre création, en chiffres <Sparkles size={13}/></h2><div className="atelier-metrics">{[[result.zones.length, "Zones détectées"], [result.palette.length, "Couleurs"], [result.metadata?.averageDeltaE?.toFixed(1) ?? "—", "ΔE moyen"], [result.metadata ? `${(result.metadata.totalProcessingTimeMs/1000).toFixed(1)} s` : "—", "Temps de calcul"]].map(([value,label]) => <div key={label}><strong>{value}</strong><span>{label}</span></div>)}</div></section><div className="atelier-result-details">{rightPanel}</div></> : <section className="atelier-section atelier-empty-palette"><h2>Palette extraite <Palette size={13}/></h2><div className="atelier-palette-placeholder" aria-hidden="true">{Array.from({length:18},(_,i)=><span key={i}/>)}</div><p>Importez une image et générez votre modèle pour découvrir ses couleurs.</p></section>}
            </TabsContent>
            <TabsContent value="views" className="m-0"><section className="atelier-section"><h2>Rendus du document <Layers size={13}/></h2><p className="mb-4 text-xs text-muted-foreground">Explorez les étapes de votre création.</p>{([['original','Image source'],['colorized','Couleurs'],['contours','Contours'],['numbered','Numérotation'],['compare','Comparaison']] as const).map(([mode,label])=><button key={mode} className="atelier-view-row" disabled={mode !== 'original' && !result} onClick={()=>studio.setViewMode(mode)}><Layers size={14}/><span>{label}</span>{studio.viewMode===mode && <Check size={14}/>}</button>)}</section></TabsContent>
            <TabsContent value="export" className="m-0"><section className="atelier-section"><h2>Prêt à peindre <FolderOpen size={13}/></h2><p className="text-xs leading-6 text-muted-foreground">Exportez votre modèle en PNG, PDF ou ZIP. Retrouvez les réglages d’impression et les calques dans les options d’export.</p><div className="mt-5 flex flex-wrap gap-2">{bottomBar}</div>{!result && <p className="mt-4 text-xs text-muted-foreground">Générez un modèle pour activer les exports.</p>}</section></TabsContent>
          </div>
        </Tabs>
        <div className="atelier-tip"><Sparkles size={17}/><p><strong>Le conseil du studio</strong><br/>Moins de couleurs, plus de caractère.<br/>Essayez 16 couleurs pour un style illustré.</p></div>
      </aside>}
    </div>
    <footer className="atelier-statusbar"><div><span className="atelier-ready-dot"/>{studio.isProcessing ? "Création en cours…" : "Prêt à créer"}<span className="hidden sm:inline">{dimensions}</span><span className="hidden md:inline">RVB / 8</span></div><div><span className="hidden md:inline">{studio.panTool ? "Déplacement" : "Sélection"}</span><span>{Math.round(studio.zoomPercent)} %</span><span>Canvas to Colors</span></div></footer>
  </div>;
}
