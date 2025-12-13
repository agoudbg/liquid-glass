import vertexShaderSource from '../shaders/LiquidGlass.vert?raw';
import fragmentShaderSource from '../shaders/LiquidGlassAdvanced.frag?raw';

type TexImageSource = HTMLImageElement | HTMLCanvasElement | ImageBitmap;

export type LiquidGlassConfig = {
  thickness: number
  refractIndex: number
  refractIntensity: number
  radius: number
  radiusTR?: number
  radiusBR?: number
  radiusBL?: number
  radiusTL?: number
  width: number
  height: number
  foregroundColor: [number, number, number, number]
}

export type GlassMaterialInstance = {
  id: string
  config: LiquidGlassConfig
  position: { x: number; y: number } // Normalized 0-1 position
}

export type LiquidGlassRenderer = {
  addMaterial: (id: string, config: LiquidGlassConfig, position: { x: number; y: number }) => void
  updateMaterial: (id: string, config: Partial<LiquidGlassConfig>) => void
  removeMaterial: (id: string) => void
  setMaterialPosition: (id: string, x: number, y: number) => void
  setBackground: (source: TexImageSource) => void
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
    renderScale: Math.max(0.25, options?.renderScale ?? 1),
    logicalResolution: { width: 1, height: 1 },
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
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, source);
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
      'uForegroundColor',
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
    const displayWidth = canvas.clientWidth;
    const displayHeight = canvas.clientHeight;
    state.logicalResolution.width = displayWidth * dpr;
    state.logicalResolution.height = displayHeight * dpr;

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

    const centerX = material.position.x * width;
    const centerY = material.position.y * height;
    gl.uniform2f(state.uniforms.uCenter, centerX, centerY);

    const sizeX = (width * material.config.width) / 2;
    const sizeY = (height * material.config.height) / 2;
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
    gl.uniform4fv(state.uniforms.uForegroundColor, material.config.foregroundColor);
  }

  function render(): void {
    if (!gl) return;
    if (!state.program || !state.vao || !state.hasTexture) {
      state.animationId = requestAnimationFrame(render);
      return;
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

    state.animationId = requestAnimationFrame(render);
  }

  const ok = setupProgram();
  if (!ok) return null;
  setupGeometry();
  resize();
  render();

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
    },
    setRenderScale(scale: number) {
      state.renderScale = Math.max(0.25, scale);
      resize();
    },
    resize,
    dispose() {
      if (state.animationId) cancelAnimationFrame(state.animationId);
      if (state.vao) gl.deleteVertexArray(state.vao);
      gl.useProgram(null);
    },
  };
}
