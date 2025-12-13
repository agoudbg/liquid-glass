export function isWebGLSupported(): boolean {
  try {
    const canvas = document.createElement('canvas');

    // Prefer WebGL2 (our renderer requires it). Fallback to WebGL1 only if nothing else is available.
    const hasWebGL2 = typeof WebGL2RenderingContext !== 'undefined' && canvas.getContext('webgl2');
    return Boolean(hasWebGL2);
  } catch {
    return false;
  }
}
