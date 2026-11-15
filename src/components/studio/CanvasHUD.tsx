import { useState, type FormEvent } from "react";
import { ZoomIn, ZoomOut, Hand, Pipette, Eye, EyeOff, Hash, LocateFixed } from "lucide-react";

export interface CanvasHUDProps {
  zoomPercent: number;
  canZoomIn?: boolean;
  canZoomOut?: boolean;
  onZoomIn: () => void;
  onZoomOut: () => void;
  onTogglePan: () => void;
  panTool?: boolean;
  onPickColor?: () => void;
  numberedVisible: boolean;
  onToggleNumbered: (visible: boolean) => void;
  overlayOpacity: number;
  onChangeOverlayOpacity: (value: number) => void;
  onFindNumber?: (number: number) => void;
  showNumberControls?: boolean;
  className?: string;
  status?: string;
  dimensions?: string;
  colorsCount?: number;
  fileSize?: string;
}

/** Functional workspace controls, shared by the colorized and numbered views. */
export function CanvasHUD({
  zoomPercent,
  canZoomIn = true,
  canZoomOut = true,
  onZoomIn,
  onZoomOut,
  onTogglePan,
  panTool = false,
  onPickColor,
  numberedVisible,
  onToggleNumbered,
  overlayOpacity,
  onChangeOverlayOpacity,
  onFindNumber,
  showNumberControls = false,
  className = "",
}: CanvasHUDProps) {
  const [number, setNumber] = useState("");
  const submit = (event: FormEvent) => {
    event.preventDefault();
    const value = Number(number);
    if (number.trim() && Number.isInteger(value) && value > 0) onFindNumber?.(value);
  };
  const buttonStyle = "inline-flex h-8 w-8 items-center justify-center rounded-md border border-border bg-background/80 hover:bg-accent disabled:opacity-40";
  return (
    <div className={"pointer-events-none absolute inset-0 z-40 flex items-end justify-center p-2 " + className}>
      <div className="pointer-events-auto flex max-w-full flex-wrap items-center justify-center gap-2 rounded-lg border border-border bg-card/95 px-2 py-1.5 text-foreground shadow-md backdrop-blur-sm" role="toolbar" aria-label="Outils du canevas">
        <button className={buttonStyle} type="button" title="Zoom arrière" aria-label="Zoom arrière du canevas" onClick={onZoomOut} disabled={!canZoomOut}><ZoomOut size={16}/></button>
        <span className="min-w-12 text-center text-xs font-medium tabular-nums">{Math.round(zoomPercent)} %</span>
        <button className={buttonStyle} type="button" title="Zoom avant" aria-label="Zoom avant du canevas" onClick={onZoomIn} disabled={!canZoomIn}><ZoomIn size={16}/></button>
        <button className={buttonStyle + (panTool ? " ring-2 ring-primary" : "")} type="button" aria-label="Activer ou désactiver le déplacement" aria-pressed={panTool} onClick={onTogglePan}><Hand size={16}/></button>
        <button className={buttonStyle} type="button" title="Prélever une couleur en cliquant sur une zone" aria-label="Pipette à couleurs" disabled={!onPickColor} onClick={onPickColor}><Pipette size={16}/></button>
        {showNumberControls && (
          <>
            <span className="mx-1 h-5 w-px bg-border" aria-hidden="true"/>
            <button className={buttonStyle} type="button" title="Afficher ou masquer les numéros" aria-label="Afficher ou masquer les numéros" aria-pressed={numberedVisible} onClick={() => onToggleNumbered(!numberedVisible)}>{numberedVisible ? <Eye size={16}/> : <EyeOff size={16}/>}</button>
            <label className="flex items-center gap-1 text-xs" title="Intensité de la surbrillance des zones sélectionnées">
              Opacité
              <input type="range" aria-label="Opacité de la sélection" min={0} max={100} step={5} value={overlayOpacity} onChange={event => onChangeOverlayOpacity(Number(event.target.value))} className="w-20 accent-primary"/>
              <span className="w-8 tabular-nums">{overlayOpacity}%</span>
            </label>
            <form onSubmit={submit} className="flex items-center gap-1" aria-label="Localiser une couleur numérotée">
              <Hash size={14} aria-hidden="true"/>
              <input type="number" min={1} step={1} value={number} onChange={event => setNumber(event.target.value)} placeholder="N°" aria-label="Numéro à localiser" className="h-8 w-14 rounded border border-border bg-background px-1.5 text-xs"/>
              <button type="submit" className={buttonStyle} title="Localiser la plus grande zone portant ce numéro" aria-label="Localiser le numéro"><LocateFixed size={16}/></button>
            </form>
          </>
        )}
      </div>
    </div>
  );
}
