import { generateSVG, traceContours, type ProcessedResult } from './imageProcessing';

export interface SvgExportOptions {
  /** Kept for API compatibility. Geometry is preserved without additional lossy simplification. */
  simplifyTolerance?: number;
  includeMetadata?: boolean;
  groupByColor?: boolean;
  optimizeAttributes?: boolean;
  viewBoxPadding?: number;
}

/** Export the actual traced rings; pixel indices are linear indices, never packed x/y. */
export function exportToSvg(result: ProcessedResult, options: SvgExportOptions = {}): Blob {
  const width = result.metadata?.width ?? result.colorized?.width;
  const height = result.metadata?.height ?? result.colorized?.height;
  if (!width || !height || !result.zones.length || !result.palette.length) throw new Error('Aucun modèle vectoriel à exporter.');
  const contours = traceContours(width, height, result.zones);
  let svg = generateSVG(contours, result.zones, result.palette, width, height);
  const padding = options.viewBoxPadding ?? 0;
  if (!Number.isFinite(padding) || padding < 0) throw new Error('Marge SVG invalide.');
  svg = svg.replace(`viewBox="0 0 ${width} ${height}"`, `viewBox="${-padding} ${-padding} ${width+2*padding} ${height+2*padding}"`);
  if (options.groupByColor !== false) {
    const paths: string[] = svg.match(/<path\b[^>]*\/>/g) ?? [];
    const groups = result.palette.map((color,index) => `<g id="color-${index+1}" fill="${color}">${paths.filter(path=>path.includes(`data-hex="${color}"`)).join('')}</g>`).join('');
    svg = svg.replace(/<g id="zones">[\s\S]*<\/g>/, `<g id="zones">${groups}</g>`);
  }
  if (options.includeMetadata !== false) {
    svg = svg.replace('<g id="zones">', `<metadata>Paint by Numbers: ${result.zones.length} zones, ${result.palette.length} couleurs, ${width} x ${height} pixels.</metadata><g id="zones">`);
  }
  return new Blob([svg], {type:'image/svg+xml;charset=utf-8'});
}

export function exportToSvgDataUrl(result: ProcessedResult, options?: SvgExportOptions): string {
  return URL.createObjectURL(exportToSvg(result, options));
}

