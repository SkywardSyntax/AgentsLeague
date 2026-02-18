/**
 * Dynamic import helpers for heavy dependencies.
 *
 * These functions ensure large libraries are only loaded when
 * actually needed, keeping the initial bundle small.
 */

/** Lazily load pdf-lib (already dynamic in ExportManager, re-exported for consistency). */
export async function loadPdfLib() {
  return import('pdf-lib');
}

/**
 * Lazily load the voice mode hook.
 * Voice recognition + Web Speech API code is only pulled in when
 * the user actually switches to voice mode.
 */
export async function loadVoiceMode() {
  const { useVoiceMode, whisperTranscribe } = await import(
    '@/hooks/interaction/useVoiceMode'
  );
  return { useVoiceMode, whisperTranscribe };
}
