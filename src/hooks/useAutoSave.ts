import { useEffect, useRef } from "react";
import { useStudio } from "@/contexts/StudioContext";

const AUTO_SAVE_INTERVAL = 2 * 60 * 1000; // 2 minutes

/** Persist changed projects using a stable callback, not a stale context snapshot. */
export function useAutoSave() {
  const { currentProject, result, settings, preferences, saveProject } = useStudio();
  const pendingRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastSaveRef = useRef("");

  const projectId = currentProject?.id;
  const projectName = currentProject?.name;
  const autoSave = preferences.autoSave;

  useEffect(() => {
    if (!autoSave || !projectId || !projectName || !result) return;

    const stateKey = JSON.stringify({
      projectId,
      projectName,
      settings,
      cacheKey: result.metadata?.cacheKey,
      generationTime: result.metadata?.totalProcessingTimeMs,
      zones: result.zones.length,
      colors: result.palette.length,
    });

    if (stateKey === lastSaveRef.current) return;

    pendingRef.current = setTimeout(() => {
      void saveProject(projectName)
        .then(() => {
          lastSaveRef.current = stateKey;
          console.info("[Studio] Sauvegarde automatique terminée.");
        })
        .catch(error => {
          console.error("[Studio] Échec de la sauvegarde automatique.", error);
        });
    }, AUTO_SAVE_INTERVAL);

    return () => {
      if (pendingRef.current !== null) {
        clearTimeout(pendingRef.current);
        pendingRef.current = null;
      }
    };
  }, [autoSave, projectId, projectName, result, settings, saveProject]);
}
