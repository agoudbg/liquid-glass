import vertexShaderSource from '../shaders/LiquidGlass.vert?raw';
import fragmentShaderSource from '../shaders/LiquidGlassAdvanced.frag?raw';

type TexImageSource = HTMLImageElement | HTMLCanvasElement | ImageBitmap;

export type ThemeColor = 'black' | 'ultra_black' | 'white' | 'ultra_white';
export type ThemeColorMap = Record<string, ThemeColor>;

export type LiquidGlassConfig = {
  thickness: number
  refractIndex: number
  refractIntensity: number
  blur: number
  radius: number
  radiusTR?: number
  radiusBR?: number
  radiusBL?: number
  radiusTL?: number
  width: number
  height: number
}

export type GlassMaterialInstance = {
  id: string
  config: LiquidGlassConfig
  position: { x: number; y: number } // Absolute pixel position (CSS pixels, Top-Left origin)
}

export type LiquidGlassRenderer = {
  addMaterial: (id: string, config: LiquidGlassConfig, position: { x: number; y: number }) => void
  updateMaterial: (id: string, config: Partial<LiquidGlassConfig>) => void
  removeMaterial: (id: string) => void
  setMaterialPosition: (id: string, x: number, y: number) => void
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
  setRenderScale: (scale: number) => void
  resize: () => void
  dispose: () => void
}

export function createLiquidGlassRenderer(
  canvas: HTMLCanvasElement,
  options?: { renderScale?: number },
): LiquidGlassRenderer | null {
  const gl = canvas.getContext('webgl2');
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

  function resize(): void {
    if (!gl) return;
    const dpr = window.devicePixelRatio || 1;
    // Prefer the true logical (unscaled) resolution from the captured backdrop.
    // textureResolution is set when setBackground() is called and represents
    // the backdrop's physical pixel dimensions.
    // If textureResolution is not yet set, use canvas.width directly as the
    // logical resolution. The caller (renderMaterials) sets canvas dimensions
    // to physical pixel size (size * dpr) before creating the renderer, so
    // canvas.width represents the intended logical resolution, not a scaled value.
    const logicalWidth = (state.textureResolution.width > 1
      ? state.textureResolution.width
      : 0)
      || canvas.clientWidth * dpr
      || canvas.width;
    const logicalHeight = (state.textureResolution.height > 1
      ? state.textureResolution.height
      : 0)
      || canvas.clientHeight * dpr
      || canvas.height;

    state.logicalResolution.width = logicalWidth;
    state.logicalResolution.height = logicalHeight;

    const scaledWidth = Math.max(1, Math.round(state.logicalResolution.width * state.renderScale));
    const scaledHeight = Math.max(1, Math.round(state.logicalResolution.height * state.renderScale));

    canvas.width = scaledWidth;
    canvas.height = scaledHeight;
    gl.viewport(0, 0, scaledWidth, scaledHeight);
  }

  function updateUniforms(material: GlassMaterialInstance): void {
    if (!gl) return;
    if (!state.program) return;
    const { width } = state.logicalResolution;
    const { height } = state.logicalResolution;
    const dpr = window.devicePixelRatio || 1;

    gl.uniform2f(state.uniforms.uResolution, width, height);

    const centerX = material.position.x * dpr;
    const centerY = height - (material.position.y * dpr);
    gl.uniform2f(state.uniforms.uCenter, centerX, centerY);

    const sizeX = (material.config.width * dpr) / 2;
    const sizeY = (material.config.height * dpr) / 2;
    gl.uniform2f(state.uniforms.uSize, sizeX, sizeY);

    const baseRadius = material.config.radius;

    gl.uniform4f(
      state.uniforms.uRadius,
      (material.config.radiusTR ?? baseRadius) * dpr,
      (material.config.radiusBR ?? baseRadius) * dpr,
      (material.config.radiusBL ?? baseRadius) * dpr,
      (material.config.radiusTL ?? baseRadius) * dpr,
    );

    gl.uniform1f(state.uniforms.uThickness, material.config.thickness * dpr);
    gl.uniform1f(state.uniforms.uRefractIndex, material.config.refractIndex);
    gl.uniform1f(state.uniforms.uRefractIntensity, material.config.refractIntensity);
    gl.uniform1f(state.uniforms.uBlur, material.config.blur ?? 0);
  }

  function computeThemeColors(): ThemeColorMap {
    if (!state.backgroundPixelData) return {};

    const { data, width, height } = state.backgroundPixelData;
    const dpr = window.devicePixelRatio || 1;
    const result: ThemeColorMap = {};

    const clamp = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v));

    state.materials.forEach((material, id) => {
      const halfW = (material.config.width * dpr) / 2;
      const halfH = (material.config.height * dpr) / 2;
      const centerX = material.position.x * dpr;
      const centerY = material.position.y * dpr;

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
      let theme: ThemeColor;
      if (avgLuma <= 32) {
        theme = 'ultra_black';
      } else if (avgLuma <= 110) {
        theme = 'black';
      } else if (avgLuma >= 224) {
        theme = 'ultra_white';
      } else {
        theme = 'white';
      }

      result[id] = theme;
    });

    return result;
  }

  function render(collectThemes = false, scheduleNext = true): ThemeColorMap | null {
    if (!gl) return null;
    if (!state.program || !state.vao || !state.hasTexture) {
      if (scheduleNext) {
        state.animationId = requestAnimationFrame(() => render(false, true));
      }
      return null;
    }

    // Clear canvas once
    gl.clear(gl.COLOR_BUFFER_BIT);

    // Enable blending for proper transparency compositing
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);

    // Render each material
    gl.bindVertexArray(state.vao);
    state.materials.forEach((material) => {
      updateUniforms(material);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    });

    gl.disable(gl.BLEND);

    const themes = collectThemes ? computeThemeColors() : null;

    if (scheduleNext) {
      state.animationId = requestAnimationFrame(() => render(false, true));
    }

    return themes;
  }

  const ok = setupProgram();
  if (!ok) return null;
  setupGeometry();
  resize();
  render(false, true);

  return {
    addMaterial(id: string, config: LiquidGlassConfig, position: { x: number; y: number }) {
      state.materials.set(id, {
        id,
        config: { ...config },
        position: { ...position },
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
      }
    },
    setBackground(source: TexImageSource) {
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
      return render(options?.collectThemes ?? false, false);
    },
    getThemeColors() {
      return computeThemeColors();
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
