/**
 * @fileoverview WebGL2-based Liquid Glass renderer.
 *
 * This module provides a factory function `createLiquidGlassRenderer` that creates
 * a WebGL2 renderer for the liquid glass effect. It handles:
 * - Material management (add, update, remove, position, transform)
 * - Background texture management
 * - Shader-based refraction and distortion effects
 * - Theme color detection from backdrop pixels
 * - Canvas resizing with proper DPR handling
 */

import vertexShaderSource from '../shaders/LiquidGlass.vert?raw';
import fragmentShaderSource from '../shaders/LiquidGlassAdvanced.frag?raw';
import { LiquidRendererMaterialElementTransform } from '../types/LiquidGlass';
import { getSafeDevicePixelRatio } from '../utils/featureDetect';

type TexImageSource = HTMLImageElement | HTMLCanvasElement | ImageBitmap;

export type ThemeColor = 'black' | 'ultra_black' | 'white' | 'ultra_white';
export type ThemeColorMap = Record<string, ThemeColor>;

/**
 * Configuration for theme color detection thresholds.
 * Luma values are in the range 0-255.
 */
export interface ThemeColorThresholds {
  /** Maximum luma for ultra_dark mode (default: 25) */
  ultraDarkMax: number;
  /** Maximum luma for dark mode (default: 85) */
  darkMax: number;
  /** Minimum luma for ultra_light mode (default: 230) */
  ultraLightMin: number;
}

export const DEFAULT_THEME_COLOR_THRESHOLDS: ThemeColorThresholds = {
  ultraDarkMax: 25,
  darkMax: 85,
  ultraLightMin: 230,
};

export type LiquidGlassConfig = {
  thickness: number
  refractIndex: number
  refractIntensity: number
  blur: number
  dispersion: number // Chromatic aberration strength (0.0 to 0.05)
  radius: number
  radiusTR?: number
  radiusBR?: number
  radiusBL?: number
  radiusTL?: number
  width: number
  height: number
  opacity?: number // Material opacity (0.0 to 1.0)
}

export type GlassMaterialInstance = {
  id: string
  config: LiquidGlassConfig
  position: { x: number; y: number } // Absolute pixel position (CSS pixels, Top-Left origin)
  transform: LiquidRendererMaterialElementTransform
}

export type LiquidGlassRenderer = {
  addMaterial: (
    id: string,
    config: LiquidGlassConfig,
    position: { x: number; y: number },
    transform?: LiquidRendererMaterialElementTransform,
  ) => void
  updateMaterial: (id: string, config: Partial<LiquidGlassConfig>) => void
  removeMaterial: (id: string) => void
  setMaterialPosition: (id: string, x: number, y: number) => void
  setMaterialTransform: (id: string, transform: LiquidRendererMaterialElementTransform) => void
  setBackground: (source: TexImageSource) => void
  /**
   * Trigger a render pass. If collectThemes is true, returns the inferred theme color per material.
   * This call does not start or stop the internal render loop.
   */
  render: (options?: { collectThemes?: boolean }) => ThemeColorMap | null
  /**
   * Compute the theme colors without issuing a draw. Uses the last captured backdrop pixels.
   */
  getThemeColors: () => ThemeColorMap
  /**
   * Update the theme color detection thresholds.
   */
  setThemeThresholds: (thresholds: Partial<ThemeColorThresholds>) => void
  setRenderScale: (scale: number) => void
  resize: () => void
  dispose: () => void
}

export function createLiquidGlassRenderer(
  canvas: HTMLCanvasElement,
  options?: { renderScale?: number; themeThresholds?: Partial<ThemeColorThresholds> },
): LiquidGlassRenderer | null {
  const gl = canvas.getContext('webgl2', {
    // Preserve drawing buffer to allow reading canvas content after render
    // This is necessary because we use drawImage to copy the WebGL canvas to the uniform canvas
    preserveDrawingBuffer: true,
    // Premultiplied alpha for proper compositing with CSS
    premultipliedAlpha: true,
    // Transparent background
    alpha: true,
  });
  if (!gl) {
    console.error('WebGL2 not supported');
    return null;
  }

  const state = {
    gl,
    program: null as WebGLProgram | null,
    uniforms: {} as Record<string, WebGLUniformLocation | null>,
    vao: null as WebGLVertexArrayObject | null,
    animationId: null as number | null,
    textureResolution: { width: 1, height: 1 },
    hasTexture: false,
    materials: new Map<string, GlassMaterialInstance>(),
    renderScale: Math.max(0.05, options?.renderScale ?? 1),
    logicalResolution: { width: 1, height: 1 },
    backgroundPixelData: null as { data: Uint8ClampedArray; width: number; height: number } | null,
    // Cache the last background source for re-upload after context reset
    lastBackgroundSource: null as TexImageSource | null,
    // Theme color detection thresholds
    themeThresholds: {
      ...DEFAULT_THEME_COLOR_THRESHOLDS,
      ...options?.themeThresholds,
    } as ThemeColorThresholds,
  };

  const identityTransform: LiquidRendererMaterialElementTransform = {
    scaleX: 1,
    scaleY: 1,
    translateX: 0,
    translateY: 0,
  };

  function compileShader(source: string, type: number) {
    if (!gl) return null;
    const shader = gl.createShader(type);
    if (!shader) return null;
    gl.shaderSource(shader, source);
    gl.compileShader(shader);
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
      console.error('Shader compilation error:', gl.getShaderInfoLog(shader));
      gl.deleteShader(shader);
      return null;
    }
    return shader;
  }

  function createProgram(vertexShader: WebGLShader, fragmentShader: WebGLShader) {
    if (!gl) return null;
    const program = gl.createProgram();
    if (!program) return null;
    gl.attachShader(program, vertexShader);
    gl.attachShader(program, fragmentShader);
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      console.error('Program linking error:', gl.getProgramInfoLog(program));
      gl.deleteProgram(program);
      return null;
    }
    return program;
  }

  function createTexture(unit: number, source: TexImageSource) {
    if (!gl) return;
    gl.activeTexture(gl.TEXTURE0 + unit);
    const texture = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, source);
    gl.generateMipmap(gl.TEXTURE_2D);
    state.hasTexture = true;
  }

  function setupProgram(): boolean {
    if (!gl) return false;
    const vertexShader = compileShader(vertexShaderSource, gl.VERTEX_SHADER);
    const fragmentShader = compileShader(fragmentShaderSource, gl.FRAGMENT_SHADER);
    if (!vertexShader || !fragmentShader) return false;
    const program = createProgram(vertexShader, fragmentShader);
    if (!program) return false;
    state.program = program;
    gl.useProgram(program);

    const uniformNames = [
      'uMVMatrix',
      'uPMatrix',
      'uTextureMatrix',
      'uTexture',
      'uResolution',
      'uCenter',
      'uSize',
      'uRadius',
      'uThickness',
      'uRefractIndex',
      'uRefractIntensity',
      'uBlur',
      'uDispersion',
      'uOpacity',
      'uTransformMatrix',
      'uTransformMatrixInv1',
      'uTransformMatrixInv2',
    ];
    uniformNames.forEach((name) => {
      state.uniforms[name] = gl.getUniformLocation(program, name);
    });

    const identityMatrix = new Float32Array([
      1, 0, 0, 0,
      0, 1, 0, 0,
      0, 0, 1, 0,
      0, 0, 0, 1,
    ]);
    gl.uniformMatrix4fv(state.uniforms.uMVMatrix, false, identityMatrix);
    gl.uniformMatrix4fv(state.uniforms.uPMatrix, false, identityMatrix);
    gl.uniformMatrix4fv(state.uniforms.uTextureMatrix, false, identityMatrix);
    gl.uniform1i(state.uniforms.uTexture, 0);

    return true;
  }

  function setupGeometry(): void {
    if (!gl || !state.program) return;

    const quad = new Float32Array([
      -1, -1, 0, 0, 0,
      1, -1, 0, 1, 0,
      -1, 1, 0, 0, 1,
      1, 1, 0, 1, 1,
    ]);

    const vao = gl.createVertexArray();
    const vbo = gl.createBuffer();
    if (!vao || !vbo) return;

    state.vao = vao;
    gl.bindVertexArray(vao);

    gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
    gl.bufferData(gl.ARRAY_BUFFER, quad, gl.STATIC_DRAW);

    const posLoc = gl.getAttribLocation(state.program!, 'aVertexPosition');
    const uvLoc = gl.getAttribLocation(state.program!, 'aTextureCoord');

    gl.enableVertexAttribArray(posLoc);
    gl.vertexAttribPointer(posLoc, 3, gl.FLOAT, false, 5 * 4, 0);

    gl.enableVertexAttribArray(uvLoc);
    gl.vertexAttribPointer(uvLoc, 2, gl.FLOAT, false, 5 * 4, 3 * 4);
  }

  /**
   * Force reinitialize WebGL resources. Call this after canvas size changes or context loss.
   */
  function reinitializeWebGL(): void {
    const programOk = setupProgram();
    if (!programOk) {
      console.error('Failed to reinitialize WebGL program');
      return;
    }
    setupGeometry();

    // Re-upload texture if we had one
    if (state.lastBackgroundSource) {
      createTexture(0, state.lastBackgroundSource);
    }
  }

  function resize(): void {
    if (!gl) return;
    // MEMORY FIX: Use getSafeDevicePixelRatio() for consistent DPR across all components
    // The backdrop canvas is scaled by deviceScale = safeDpr * renderPrecision.
    // We need to use the same scale here so that textureResolution / deviceScale = CSS pixels.
    const dpr = getSafeDevicePixelRatio();
    const deviceScale = dpr * state.renderScale;

    // Calculate CSS pixel dimensions (logical size)
    // textureResolution stores the backdrop's physical pixel dimensions (already scaled by deviceScale)
    // We need to convert back to CSS pixels using the same scale factor
    let cssWidth: number;
    let cssHeight: number;

    if (state.textureResolution.width > 1 && state.textureResolution.height > 1) {
      // textureResolution is in physical pixels (scaled by deviceScale), convert back to CSS pixels
      cssWidth = state.textureResolution.width / deviceScale;
      cssHeight = state.textureResolution.height / deviceScale;
    } else {
      cssWidth = canvas.clientWidth || canvas.width / deviceScale;
      cssHeight = canvas.clientHeight || canvas.height / deviceScale;
    }

    // Store logical resolution (CSS pixels)
    state.logicalResolution.width = cssWidth;
    state.logicalResolution.height = cssHeight;

    // Canvas physical dimensions = CSS pixels * deviceScale
    const physicalWidth = Math.max(1, Math.round(cssWidth * deviceScale));
    const physicalHeight = Math.max(1, Math.round(cssHeight * deviceScale));

    // Check if canvas size actually changed
    // Modifying canvas.width/height resets WebGL context, so we need to reinitialize
    const sizeChanged = canvas.width !== physicalWidth || canvas.height !== physicalHeight;

    if (sizeChanged) {
      canvas.width = physicalWidth;
      canvas.height = physicalHeight;

      // WebGL context was reset, reinitialize everything
      reinitializeWebGL();
    }

    gl.viewport(0, 0, gl.drawingBufferWidth, gl.drawingBufferHeight);
  }

  /**
   * Update uniforms for a material.
   * @param material The material instance
   * @param scale The unified scale factor (dpr * renderScale)
   * @param physicalWidth The physical canvas width (gl.drawingBufferWidth)
   * @param physicalHeight The physical canvas height (gl.drawingBufferHeight)
   */
  function updateUniforms(
    material: GlassMaterialInstance,
    scale: number,
    physicalWidth: number,
    physicalHeight: number,
  ): void {
    if (!gl) return;
    if (!state.program) return;

    const transform = material.transform ?? identityTransform;

    // Set resolution to physical canvas dimensions
    gl.uniform2f(state.uniforms.uResolution, physicalWidth, physicalHeight);

    // Extract the 2x2 transformation matrix from the full CSS matrix
    // The CSS matrix is [a, b, c, d, e, f] representing:
    // | a  c  e |
    // | b  d  f |
    // | 0  0  1 |
    // For the shader, we need the 2x2 portion [a, b, c, d] and its inverse
    let a = transform.scaleX;
    let b = 0;
    let c = 0;
    let d = transform.scaleY;

    // If a full CSS matrix is provided, use it instead
    if (transform.matrix) {
      [a, b, c, d] = transform.matrix;
    }

    // Note: WebGL Y-axis is flipped (bottom-left origin), so we need to flip the Y components
    // The matrix in CSS space is [a, b, c, d], but in WebGL space we flip Y:
    // - b stays as is (relates to y input)
    // - c stays as is (affects x output from y input)
    // - For the shader, we just pass the matrix as-is since the coordinate system
    //   is handled in the shader by the uCenter calculation

    // Pass the transform matrix to the shader [a, b, c, d]
    gl.uniform4f(state.uniforms.uTransformMatrix, a, b, c, d);

    // Compute the inverse of the 2x2 matrix for the shader
    // The inverse of [a, b; c, d] is (1/det) * [d, -b; -c, a]
    const det = a * d - b * c;
    if (Math.abs(det) > 1e-10) {
      const invDet = 1 / det;
      const invA = d * invDet;
      const invB = -b * invDet;
      const invC = -c * invDet;
      const invD = a * invDet;
      gl.uniform2f(state.uniforms.uTransformMatrixInv1, invA, invC);
      gl.uniform2f(state.uniforms.uTransformMatrixInv2, invB, invD);
    } else {
      // Singular matrix, use identity
      gl.uniform2f(state.uniforms.uTransformMatrixInv1, 1, 0);
      gl.uniform2f(state.uniforms.uTransformMatrixInv2, 0, 1);
    }

    // For the size uniform, we pass the original (untransformed) half-size
    // The shader will apply the transform via the matrix
    const w = material.config.width * scale;
    const h = material.config.height * scale;

    // position is the CENTER of the material in CSS pixels
    const centerXCss = material.position.x + transform.translateX;
    const centerYCss = material.position.y + transform.translateY;

    // Convert to physical pixels with Y-axis flip (WebGL origin is bottom-left)
    const physicalCenterX = centerXCss * scale;
    const physicalCenterY = physicalHeight - (centerYCss * scale);

    gl.uniform2f(state.uniforms.uCenter, physicalCenterX, physicalCenterY);

    // Shader expects half-width and half-height in untransformed space
    gl.uniform2f(state.uniforms.uSize, w / 2, h / 2);

    const baseRadius = material.config.radius;
    // For radius, we don't scale by transform - let the matrix handle the distortion
    // The radius values are in untransformed space

    gl.uniform4f(
      state.uniforms.uRadius,
      (material.config.radiusTR ?? baseRadius) * scale,
      (material.config.radiusBR ?? baseRadius) * scale,
      (material.config.radiusBL ?? baseRadius) * scale,
      (material.config.radiusTL ?? baseRadius) * scale,
    );

    gl.uniform1f(state.uniforms.uThickness, material.config.thickness * scale);
    gl.uniform1f(state.uniforms.uRefractIndex, material.config.refractIndex);
    gl.uniform1f(state.uniforms.uRefractIntensity, material.config.refractIntensity);
    gl.uniform1f(state.uniforms.uBlur, material.config.blur ?? 0);
    gl.uniform1f(state.uniforms.uDispersion, material.config.dispersion ?? 0.01);
    gl.uniform1f(state.uniforms.uOpacity, material.config.opacity ?? 1.0);
  }

  function computeThemeColors(): ThemeColorMap {
    if (!state.backgroundPixelData) return {};

    const { data, width, height } = state.backgroundPixelData;
    const cssWidth = Math.max(1, state.logicalResolution.width);
    const cssHeight = Math.max(1, state.logicalResolution.height);

    // Derive pixel-per-CSS scaling from the captured texture to avoid double-applying DPR.
    const pxPerCssX = width / cssWidth;
    const pxPerCssY = height / cssHeight;
    const result: ThemeColorMap = {};

    const clamp = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v));

    state.materials.forEach((material, id) => {
      const transform = material.transform ?? identityTransform;
      const halfW = (material.config.width * transform.scaleX * pxPerCssX) / 2;
      const halfH = (material.config.height * transform.scaleY * pxPerCssY) / 2;
      // position is the CENTER of the material in CSS pixels
      const centerX = (material.position.x + transform.translateX) * pxPerCssX;
      const centerY = (material.position.y + transform.translateY) * pxPerCssY;

      const startX = clamp(Math.floor(centerX - halfW), 0, width - 1);
      const endX = clamp(Math.ceil(centerX + halfW), 0, width - 1);
      const startY = clamp(Math.floor(centerY - halfH), 0, height - 1);
      const endY = clamp(Math.ceil(centerY + halfH), 0, height - 1);

      const spanX = endX - startX + 1;
      const spanY = endY - startY + 1;
      const step = Math.max(1, Math.floor(Math.min(spanX, spanY) / 32));

      let sumLuma = 0;
      let count = 0;

      for (let y = startY; y <= endY; y += step) {
        for (let x = startX; x <= endX; x += step) {
          const idx = (y * width + x) * 4;
          const r = data[idx];
          const g = data[idx + 1];
          const b = data[idx + 2];
          const luma = 0.2126 * r + 0.7152 * g + 0.0722 * b;
          sumLuma += luma;
          count += 1;
        }
      }

      if (count === 0) {
        result[id] = 'black';
        return;
      }

      const avgLuma = sumLuma / count;
      const { ultraDarkMax, darkMax, ultraLightMin } = state.themeThresholds;
      let theme: ThemeColor;
      if (avgLuma <= ultraDarkMax) {
        theme = 'ultra_black';
      } else if (avgLuma <= darkMax) {
        theme = 'black';
      } else if (avgLuma >= ultraLightMin) {
        theme = 'ultra_white';
      } else {
        theme = 'white';
      }

      result[id] = theme;
    });

    return result;
  }

  function render(collectThemes = false): ThemeColorMap | null {
    if (!gl) return null;
    if (!state.program || !state.vao || !state.hasTexture) {
      return null;
    }

    // 1. Prepare physical size parameters - UNIFIED scale factor
    // MEMORY FIX: Use getSafeDevicePixelRatio() for consistent DPR across all components
    const dpr = getSafeDevicePixelRatio();
    const scale = dpr * state.renderScale;
    const physicalWidth = gl.drawingBufferWidth;
    const physicalHeight = gl.drawingBufferHeight;

    // 2. Global state initialization - clear canvas with transparent color
    // Disable scissor test before clearing to ensure the entire canvas is cleared
    gl.disable(gl.SCISSOR_TEST);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);

    // Enable blending for proper transparency compositing
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);

    // Enable scissor test for per-material clipping
    gl.enable(gl.SCISSOR_TEST);

    // 3. Core loop - render each material with its own scissor rect
    gl.bindVertexArray(state.vao);
    state.materials.forEach((material) => {
      // Skip rendering if opacity is 0 (hidden element)
      const opacity = material.config.opacity ?? 1.0;
      if (opacity <= 0) {
        return; // Skip this material entirely
      }

      const transform = material.transform ?? identityTransform;

      // A. Calculate scissor rectangle in physical pixels
      // For transformed shapes, we need to compute the axis-aligned bounding box (AABB)
      // of the transformed rectangle

      // Extract transform matrix components
      let a = transform.scaleX;
      let b = 0;
      let c = 0;
      let d = transform.scaleY;

      if (transform.matrix) {
        [a, b, c, d] = transform.matrix;
      }

      // Half-dimensions in untransformed space
      const halfW = (material.config.width * scale) / 2;
      const halfH = (material.config.height * scale) / 2;

      // Transform the four corners of the rectangle to find the AABB
      // Corners in local space: (-halfW, -halfH), (halfW, -halfH), (halfW, halfH), (-halfW, halfH)
      // Transform each corner: x' = a*x + c*y, y' = b*x + d*y
      const corners = [
        { x: -halfW, y: -halfH },
        { x: halfW, y: -halfH },
        { x: halfW, y: halfH },
        { x: -halfW, y: halfH },
      ];

      let minX = Infinity;
      let maxX = -Infinity;
      let minY = Infinity;
      let maxY = -Infinity;

      corners.forEach((corner) => {
        const tx = a * corner.x + c * corner.y;
        const ty = b * corner.x + d * corner.y;
        minX = Math.min(minX, tx);
        maxX = Math.max(maxX, tx);
        minY = Math.min(minY, ty);
        maxY = Math.max(maxY, ty);
      });

      const aabbWidth = maxX - minX;
      const aabbHeight = maxY - minY;

      // position is the CENTER of the material in CSS pixels
      const centerXCss = material.position.x + transform.translateX;
      const centerYCss = material.position.y + transform.translateY;

      // Calculate scissor rect position (left edge in physical pixels)
      const centerXPhysical = centerXCss * scale;
      const centerYPhysical = centerYCss * scale;
      const x = centerXPhysical + minX; // minX is negative for left edge
      // WebGL Y-axis: origin is bottom-left, so flip Y
      const y = physicalHeight - centerYPhysical - maxY;

      // B. Apply scissor rect immediately before drawing this material
      // Add a small margin to prevent clipping artifacts at edges
      const margin = 2;
      gl.scissor(
        Math.floor(x - margin),
        Math.floor(y - margin),
        Math.ceil(aabbWidth + margin * 2),
        Math.ceil(aabbHeight + margin * 2),
      );

      // C. Update uniforms with the same scale and draw immediately
      updateUniforms(material, scale, physicalWidth, physicalHeight);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    });

    // 4. Cleanup - restore global state
    gl.disable(gl.SCISSOR_TEST);
    gl.disable(gl.BLEND);

    const themes = collectThemes ? computeThemeColors() : null;

    // Note: We no longer schedule the next frame internally.
    // The Manager's RAF loop handles render timing to avoid race conditions.

    return themes;
  }

  const ok = setupProgram();
  if (!ok) return null;
  setupGeometry();
  resize();
  // Note: We do NOT start an internal RAF loop here.
  // The Manager controls when to call render() to avoid timing issues
  // and duplicate rendering with the internal loop.

  return {
    addMaterial(
      id: string,
      config: LiquidGlassConfig,
      position: { x: number; y: number },
      transform: LiquidRendererMaterialElementTransform = identityTransform,
    ) {
      state.materials.set(id, {
        id,
        config: { ...config },
        position: { ...position },
        transform: { ...transform },
      });
    },
    updateMaterial(id: string, configPartial: Partial<LiquidGlassConfig>) {
      const material = state.materials.get(id);
      if (material) {
        material.config = { ...material.config, ...configPartial };
      }
    },
    removeMaterial(id: string) {
      state.materials.delete(id);
    },
    setMaterialPosition(id: string, x: number, y: number) {
      const material = state.materials.get(id);
      if (material) {
        material.position.x = x;
        material.position.y = y;
        if (!material.transform) {
          material.transform = { ...identityTransform };
        }
      }
    },
    setMaterialTransform(id: string, transform: LiquidRendererMaterialElementTransform) {
      const material = state.materials.get(id);
      if (material) {
        material.transform = { ...transform };
      }
    },
    setBackground(source: TexImageSource) {
      // Cache the source for re-upload after context reset
      state.lastBackgroundSource = source;

      createTexture(0, source);
      state.textureResolution.width = (source as any).width || state.textureResolution.width;
      state.textureResolution.height = (source as any).height || state.textureResolution.height;

      const width = (source as any).width as number | undefined;
      const height = (source as any).height as number | undefined;
      if (width && height) {
        const bgCanvas = document.createElement('canvas');
        bgCanvas.width = width;
        bgCanvas.height = height;
        const ctx = bgCanvas.getContext('2d');
        if (ctx) {
          try {
            ctx.drawImage(source, 0, 0, width, height);
            const imageData = ctx.getImageData(0, 0, width, height);
            state.backgroundPixelData = {
              data: imageData.data,
              width,
              height,
            };
          } catch (error) {
            console.warn('LiquidGlassRenderer: failed to sample backdrop pixels', error);
            state.backgroundPixelData = null;
          }
        }
      }
    },
    render(options?: { collectThemes?: boolean }) {
      return render(options?.collectThemes ?? false);
    },
    getThemeColors() {
      return computeThemeColors();
    },
    setThemeThresholds(thresholds: Partial<ThemeColorThresholds>) {
      state.themeThresholds = {
        ...state.themeThresholds,
        ...thresholds,
      };
    },
    setRenderScale(scale: number) {
      state.renderScale = Math.max(0.05, scale);
      resize();
    },
    resize,
    dispose() {
      if (state.animationId) {
        cancelAnimationFrame(state.animationId);
        state.animationId = null;
      }
      if (state.vao) gl.deleteVertexArray(state.vao);
      gl.useProgram(null);
    },
  };
}
