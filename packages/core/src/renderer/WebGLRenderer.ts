import { GlassError } from '../errors/GlassError';
import {
  LIQUID_GLASS_FRAGMENT_SHADER,
  LIQUID_GLASS_VERTEX_SHADER,
} from '../shaders';
import { validateFiniteNumber } from '../utils/validation';
import { createQuadGeometry, type QuadGeometry } from './geometry';
import { calculateMaterialScissor } from './scissor';
import { createShaderProgram } from './shader-program';
import type {
  RendererFrameResult,
  RendererMaterial,
  RendererResourceCounts,
  WebGLRendererOptions,
} from './types';
import {
  bindMaterialUniforms,
  initializeUniforms,
  type LiquidGlassUniforms,
} from './uniforms';

const CONTEXT_ATTRIBUTES: WebGLContextAttributes = {
  alpha: true,
  premultipliedAlpha: true,
  preserveDrawingBuffer: true,
};

function defaultDevicePixelRatio(): number {
  return typeof globalThis.devicePixelRatio === 'number'
    ? globalThis.devicePixelRatio
    : 1;
}

/** Framework-neutral owner of one liquid-glass WebGL2 rendering pipeline. */
export class WebGLRenderer {
  /** Whether every owned listener and graphics resource has been released. */
  public get destroyed(): boolean {
    return this.isDestroyed;
  }

  private readonly gl: WebGL2RenderingContext;
  private renderScale: number;
  private readonly readDevicePixelRatio: () => number;
  private readonly onContextLost: (() => void) | undefined;
  private readonly onContextRestored: (() => void) | undefined;
  private readonly onContextRestoreError: ((error: GlassError) => void) | undefined;
  private program: WebGLProgram | null = null;
  private uniforms: LiquidGlassUniforms | null = null;
  private geometry: QuadGeometry | null = null;
  private texture: WebGLTexture | null = null;
  private backdrop: TexImageSource | null = null;
  private logicalWidth = 1;
  private logicalHeight = 1;
  private isContextLost = false;
  private isDestroyed = false;

  private readonly handleContextLost = (event: Event): void => {
    event.preventDefault();
    this.isContextLost = true;
    this.abandonResources();
    this.onContextLost?.();
  };

  private readonly handleContextRestored = (): void => {
    if (this.isDestroyed) {
      return;
    }
    try {
      this.isContextLost = false;
      this.initializeResources();
      this.resize(this.logicalWidth, this.logicalHeight);
      this.onContextRestored?.();
    } catch (error) {
      this.isContextLost = true;
      this.releaseResources();
      this.onContextRestoreError?.(GlassError.fromUnknown(
        error,
        'RENDER_FAILED',
        'Failed to restore the WebGL rendering context.',
        { phase: 'render' },
      ));
    }
  };

  /**
   * Create a renderer and allocate the shader program and fullscreen geometry.
   *
   * @param canvas - Core-owned presentation canvas.
   * @param options - Quality, deterministic DPR, and context lifecycle hooks.
   */
  public constructor(
    private readonly canvas: HTMLCanvasElement,
    options: WebGLRendererOptions = {},
  ) {
    const gl = canvas.getContext('webgl2', CONTEXT_ATTRIBUTES);
    if (!gl) {
      throw new GlassError(
        'WEBGL2_UNSUPPORTED',
        'WebGL2 is required to render the liquid-glass effect.',
        { phase: 'render' },
      );
    }

    this.gl = gl;
    this.renderScale = Number.isFinite(options.renderScale)
      ? Math.max(0.05, options.renderScale ?? 1)
      : 1;
    this.readDevicePixelRatio = options.devicePixelRatio ?? defaultDevicePixelRatio;
    this.onContextLost = options.onContextLost;
    this.onContextRestored = options.onContextRestored;
    this.onContextRestoreError = options.onContextRestoreError;
    canvas.addEventListener('webglcontextlost', this.handleContextLost);
    canvas.addEventListener('webglcontextrestored', this.handleContextRestored);

    try {
      this.initializeResources();
    } catch (error) {
      canvas.removeEventListener('webglcontextlost', this.handleContextLost);
      canvas.removeEventListener('webglcontextrestored', this.handleContextRestored);
      throw error;
    }
  }

  /**
   * Resize the drawing buffer from logical CSS dimensions.
   *
   * @param width - Logical canvas width in CSS pixels.
   * @param height - Logical canvas height in CSS pixels.
   */
  public resize(width: number, height: number): void {
    this.assertUsable();
    this.logicalWidth = Math.max(1, width);
    this.logicalHeight = Math.max(1, height);
    const scale = this.getDeviceScale();
    const physicalWidth = Math.max(1, Math.round(this.logicalWidth * scale));
    const physicalHeight = Math.max(1, Math.round(this.logicalHeight * scale));

    if (this.canvas.width !== physicalWidth) {
      this.canvas.width = physicalWidth;
    }
    if (this.canvas.height !== physicalHeight) {
      this.canvas.height = physicalHeight;
    }
    this.gl.viewport(0, 0, this.gl.drawingBufferWidth, this.gl.drawingBufferHeight);
  }

  /**
   * Replace the effective quality scale and immediately resize the drawing buffer.
   *
   * @param renderScale - Finite scale greater than or equal to the shader-safe minimum.
   */
  public setRenderScale(renderScale: number): void {
    this.assertUsable();
    const nextScale = validateFiniteNumber(
      renderScale,
      'renderer.renderScale',
      { minimum: 0.05 },
    );
    if (nextScale === this.renderScale) {
      return;
    }

    this.renderScale = nextScale;
    if (!this.isContextLost) {
      this.resize(this.logicalWidth, this.logicalHeight);
    }
  }

  /**
   * Upload or replace the backdrop texture sampled by the liquid-glass shader.
   *
   * @param source - Browser image source, normally a core-owned canvas.
   */
  public uploadBackdrop(source: TexImageSource): void {
    this.assertUsable();
    this.backdrop = source;
    if (this.isContextLost) {
      return;
    }

    let createdTexture = false;
    try {
      if (!this.texture) {
        this.texture = this.gl.createTexture();
        createdTexture = true;
      }
      if (!this.texture) {
        throw new Error('WebGL returned a null texture handle.');
      }
      this.gl.activeTexture(this.gl.TEXTURE0);
      this.gl.bindTexture(this.gl.TEXTURE_2D, this.texture);
      this.gl.pixelStorei(this.gl.UNPACK_FLIP_Y_WEBGL, true);
      this.gl.texParameteri(
        this.gl.TEXTURE_2D,
        this.gl.TEXTURE_MIN_FILTER,
        this.gl.LINEAR_MIPMAP_LINEAR,
      );
      this.gl.texParameteri(
        this.gl.TEXTURE_2D,
        this.gl.TEXTURE_MAG_FILTER,
        this.gl.LINEAR,
      );
      this.gl.texParameteri(
        this.gl.TEXTURE_2D,
        this.gl.TEXTURE_WRAP_S,
        this.gl.CLAMP_TO_EDGE,
      );
      this.gl.texParameteri(
        this.gl.TEXTURE_2D,
        this.gl.TEXTURE_WRAP_T,
        this.gl.CLAMP_TO_EDGE,
      );
      this.gl.texImage2D(
        this.gl.TEXTURE_2D,
        0,
        this.gl.RGBA,
        this.gl.RGBA,
        this.gl.UNSIGNED_BYTE,
        source,
      );
      this.gl.generateMipmap(this.gl.TEXTURE_2D);
    } catch (error) {
      if (createdTexture && this.texture) {
        this.gl.deleteTexture(this.texture);
        this.texture = null;
      }
      throw GlassError.fromUnknown(
        error,
        'TEXTURE_UPLOAD_FAILED',
        'Failed to upload the liquid-glass backdrop texture.',
        { phase: 'texture' },
      );
    }
  }

  /**
   * Draw all visible materials into the current presentation canvas.
   *
   * @param materials - Resolved material draw data in render order.
   * @returns Draw-call count and final WebGL error code.
   */
  public render(materials: readonly RendererMaterial[]): RendererFrameResult {
    this.assertUsable();
    if (
      this.isContextLost
      || !this.program
      || !this.uniforms
      || !this.geometry
      || !this.texture
    ) {
      return { drawCalls: 0, glError: this.gl.NO_ERROR };
    }

    const scale = this.getDeviceScale();
    const physicalWidth = this.gl.drawingBufferWidth;
    const physicalHeight = this.gl.drawingBufferHeight;
    let drawCalls = 0;
    this.gl.useProgram(this.program);
    this.gl.bindVertexArray(this.geometry.vertexArray);
    this.gl.activeTexture(this.gl.TEXTURE0);
    this.gl.bindTexture(this.gl.TEXTURE_2D, this.texture);
    this.gl.disable(this.gl.SCISSOR_TEST);
    this.gl.clearColor(0, 0, 0, 0);
    this.gl.clear(this.gl.COLOR_BUFFER_BIT);
    this.gl.enable(this.gl.BLEND);
    this.gl.blendFunc(this.gl.ONE, this.gl.ONE_MINUS_SRC_ALPHA);
    this.gl.enable(this.gl.SCISSOR_TEST);

    try {
      for (const material of materials) {
        if (material.opacity <= 0) {
          continue;
        }
        try {
          const scissor = calculateMaterialScissor(
            material,
            scale,
            physicalHeight,
          );
          this.gl.scissor(scissor.x, scissor.y, scissor.width, scissor.height);
          bindMaterialUniforms(
            this.gl,
            this.uniforms,
            material,
            scale,
            physicalWidth,
            physicalHeight,
          );
          this.gl.drawArrays(this.gl.TRIANGLE_STRIP, 0, 4);
          drawCalls += 1;
        } catch (error) {
          throw GlassError.fromUnknown(
            error,
            'RENDER_FAILED',
            'Failed to draw a liquid-glass material.',
            { phase: 'render', materialId: material.id },
          );
        }
      }
    } finally {
      this.gl.disable(this.gl.SCISSOR_TEST);
      this.gl.disable(this.gl.BLEND);
    }

    const glError = this.gl.getError();
    if (glError !== this.gl.NO_ERROR) {
      throw new GlassError(
        'RENDER_FAILED',
        'WebGL reported an error after rendering liquid-glass materials.',
        { phase: 'render', details: { glError, drawCalls } },
      );
    }
    return { drawCalls, glError };
  }

  /** Clear the presentation canvas when no backdrop can be sampled. */
  public clear(): void {
    this.assertUsable();
    if (this.isContextLost) {
      return;
    }

    try {
      this.gl.disable(this.gl.SCISSOR_TEST);
      this.gl.disable(this.gl.BLEND);
      this.gl.clearColor(0, 0, 0, 0);
      this.gl.clear(this.gl.COLOR_BUFFER_BIT);
      const glError = this.gl.getError();
      if (glError !== this.gl.NO_ERROR) {
        throw new GlassError(
          'RENDER_FAILED',
          'WebGL reported an error while clearing the liquid-glass canvas.',
          { phase: 'render', details: { glError } },
        );
      }
    } catch (error) {
      throw GlassError.fromUnknown(
        error,
        'RENDER_FAILED',
        'Failed to clear the liquid-glass presentation canvas.',
        { phase: 'render' },
      );
    }
  }

  /** Read the complete RGBA drawing buffer for deterministic pixel checks. */
  public readPixels(): Uint8Array {
    this.assertUsable();
    const pixels = new Uint8Array(
      this.gl.drawingBufferWidth * this.gl.drawingBufferHeight * 4,
    );
    try {
      this.gl.readPixels(
        0,
        0,
        this.gl.drawingBufferWidth,
        this.gl.drawingBufferHeight,
        this.gl.RGBA,
        this.gl.UNSIGNED_BYTE,
        pixels,
      );
    } catch (error) {
      throw GlassError.fromUnknown(
        error,
        'RENDER_FAILED',
        'Failed to read the liquid-glass drawing buffer.',
        { phase: 'render' },
      );
    }
    return pixels;
  }

  /** Return current live resource counts for lifecycle assertions. */
  public getResourceCounts(): RendererResourceCounts {
    return {
      shaders: 0,
      programs: this.program ? 1 : 0,
      buffers: this.geometry ? 1 : 0,
      vertexArrays: this.geometry ? 1 : 0,
      textures: this.texture ? 1 : 0,
    };
  }

  /** Idempotently release listeners, texture, geometry, and shader program. */
  public destroy(): void {
    if (this.isDestroyed) {
      return;
    }
    this.isDestroyed = true;
    this.canvas.removeEventListener('webglcontextlost', this.handleContextLost);
    this.canvas.removeEventListener('webglcontextrestored', this.handleContextRestored);
    this.releaseResources();
    this.backdrop = null;
  }

  private initializeResources(): void {
    const { program } = createShaderProgram(
      this.gl,
      LIQUID_GLASS_VERTEX_SHADER,
      LIQUID_GLASS_FRAGMENT_SHADER,
    );
    this.program = program;

    try {
      this.gl.useProgram(program);
      this.uniforms = initializeUniforms(this.gl, program);
      this.geometry = createQuadGeometry(this.gl, program);
      if (this.backdrop) {
        this.uploadBackdrop(this.backdrop);
      }
    } catch (error) {
      this.releaseResources();
      throw error;
    }
  }

  private releaseResources(): void {
    if (this.texture) {
      this.gl.deleteTexture(this.texture);
      this.texture = null;
    }
    if (this.geometry) {
      this.gl.deleteBuffer(this.geometry.vertexBuffer);
      this.gl.deleteVertexArray(this.geometry.vertexArray);
      this.geometry = null;
    }
    if (this.program) {
      this.gl.useProgram(null);
      this.gl.deleteProgram(this.program);
      this.program = null;
    }
    this.uniforms = null;
  }

  private abandonResources(): void {
    this.texture = null;
    this.geometry = null;
    this.program = null;
    this.uniforms = null;
  }

  private getDeviceScale(): number {
    const ratio = this.readDevicePixelRatio();
    const safeRatio = Number.isFinite(ratio) && ratio > 0 ? ratio : 1;
    return safeRatio * this.renderScale;
  }

  private assertUsable(): void {
    if (this.isDestroyed) {
      throw new GlassError(
        'DESTROYED_CONTEXT',
        'The WebGL renderer has already been destroyed.',
        { phase: 'lifecycle' },
      );
    }
  }
}
