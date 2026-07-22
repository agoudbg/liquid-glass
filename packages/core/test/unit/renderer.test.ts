import { describe, expect, it, vi } from 'vitest';

import { GlassError } from '../../src/errors/GlassError';
import {
  type RendererMaterial,
  WebGLRenderer,
} from '../../src/renderer';
import {
  LIQUID_GLASS_FRAGMENT_SHADER,
  LIQUID_GLASS_VERTEX_SHADER,
} from '../../src/shaders';
import {
  callsNamed,
  FakeCanvas,
} from '../fixtures/fake-webgl2';

const material: RendererMaterial = {
  id: 'material-1',
  rect: { x: 20, y: 10, width: 80, height: 40 },
  matrix: [1, 0, 0, 1, 0, 0],
  radii: [8, 8, 8, 8],
  opacity: 0.75,
  thickness: 0.3,
  refractIndex: 1.2,
  refractIntensity: 0.8,
  blur: 0.03,
  dispersion: 0.02,
};

describe('WebGLRenderer', () => {
  it('compiles the exact shaders and surfaces contextual compile failures', () => {
    const canvas = new FakeCanvas();
    canvas.gl.shaderCompileSucceeds = false;

    expect(() => new WebGLRenderer(
      canvas as unknown as HTMLCanvasElement,
    )).toThrowError(GlassError);

    try {
      new WebGLRenderer(canvas as unknown as HTMLCanvasElement);
    } catch (error) {
      expect(error).toMatchObject({
        code: 'SHADER_COMPILE_FAILED',
        phase: 'shader',
      });
    }
    expect(callsNamed(canvas.gl, 'deleteShader')).not.toHaveLength(0);
  });

  it('uploads a backdrop and binds legacy material uniforms before drawing', () => {
    const canvas = new FakeCanvas();
    const renderer = new WebGLRenderer(
      canvas as unknown as HTMLCanvasElement,
      { devicePixelRatio: () => 2, renderScale: 0.5 },
    );
    const backdrop = { width: 200, height: 100 } as unknown as TexImageSource;

    renderer.resize(200, 100);
    renderer.uploadBackdrop(backdrop);
    const result = renderer.render([material]);

    const shaderSources = callsNamed(canvas.gl, 'shaderSource')
      .map((call) => call.args[1]);
    expect(shaderSources).toEqual([
      LIQUID_GLASS_VERTEX_SHADER,
      LIQUID_GLASS_FRAGMENT_SHADER,
    ]);
    expect(callsNamed(canvas.gl, 'texImage2D')).toHaveLength(1);
    expect(callsNamed(canvas.gl, 'scissor').at(-1)?.args).toEqual([
      18, 48, 84, 44,
    ]);
    expect(callsNamed(canvas.gl, 'drawArrays').at(-1)?.args).toEqual([
      canvas.gl.TRIANGLE_STRIP, 0, 4,
    ]);
    expect(result).toEqual({ drawCalls: 1, glError: canvas.gl.NO_ERROR });

    const uniform2f = callsNamed(canvas.gl, 'uniform2f');
    expect(uniform2f.some((call) => (
      (call.args[0] as { name: string }).name === 'uCenter'
      && call.args[1] === 60
      && call.args[2] === 70
    ))).toBe(true);
    expect(uniform2f.some((call) => (
      (call.args[0] as { name: string }).name === 'uSize'
      && call.args[1] === 40
      && call.args[2] === 20
    ))).toBe(true);

    expect(renderer.readPixels()).toEqual(new Uint8Array(200 * 100 * 4).fill(7));
  });

  it('updates render scale immediately and rejects invalid scales', () => {
    const canvas = new FakeCanvas();
    const renderer = new WebGLRenderer(
      canvas as unknown as HTMLCanvasElement,
      { devicePixelRatio: () => 2, renderScale: 1 },
    );

    renderer.resize(100, 50);
    expect(canvas).toMatchObject({ width: 200, height: 100 });

    renderer.setRenderScale(0.5);
    expect(canvas).toMatchObject({ width: 100, height: 50 });

    for (const invalidScale of [0, 0.049, NaN, Number.POSITIVE_INFINITY]) {
      expect(() => renderer.setRenderScale(invalidScale)).toThrowError(GlassError);
      expect(canvas).toMatchObject({ width: 100, height: 50 });
    }

    renderer.destroy();
  });

  it('recreates resources after context restoration and cleans up idempotently', () => {
    const canvas = new FakeCanvas();
    const restored = vi.fn();
    const renderer = new WebGLRenderer(
      canvas as unknown as HTMLCanvasElement,
      { onContextRestored: restored },
    );
    renderer.resize(20, 10);
    renderer.uploadBackdrop({ width: 20, height: 10 } as unknown as TexImageSource);
    const preventDefault = vi.fn();

    canvas.dispatch('webglcontextlost', {
      preventDefault,
    } as unknown as Event);
    expect(preventDefault).toHaveBeenCalledOnce();
    expect(renderer.render([material]).drawCalls).toBe(0);

    canvas.dispatch('webglcontextrestored', {} as Event);
    expect(restored).toHaveBeenCalledOnce();
    expect(callsNamed(canvas.gl, 'texImage2D')).toHaveLength(2);

    renderer.destroy();
    renderer.destroy();
    expect(renderer.destroyed).toBe(true);
    expect(renderer.getResourceCounts()).toEqual({
      shaders: 0,
      programs: 0,
      buffers: 0,
      vertexArrays: 0,
      textures: 0,
    });
    expect(callsNamed(canvas.gl, 'deleteProgram')).not.toHaveLength(0);
    expect(callsNamed(canvas.gl, 'deleteBuffer')).not.toHaveLength(0);
    expect(callsNamed(canvas.gl, 'deleteVertexArray')).not.toHaveLength(0);
    expect(callsNamed(canvas.gl, 'deleteTexture')).not.toHaveLength(0);
  });

  it('surfaces non-zero WebGL errors after a draw pass', () => {
    const canvas = new FakeCanvas();
    const renderer = new WebGLRenderer(canvas as unknown as HTMLCanvasElement);
    renderer.resize(100, 50);
    renderer.uploadBackdrop({ width: 100, height: 50 } as unknown as TexImageSource);
    canvas.gl.errorCode = 0x0502;

    expect(() => renderer.render([material])).toThrowError(GlassError);
    try {
      renderer.render([material]);
    } catch (error) {
      expect(error).toMatchObject({
        code: 'RENDER_FAILED',
        phase: 'render',
        details: { glError: 0x0502 },
      });
    }
    renderer.destroy();
  });
});
