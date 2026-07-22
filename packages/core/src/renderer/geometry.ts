import { GlassError } from '../errors/GlassError';

/** Fullscreen quad resources used for every material draw. */
export interface QuadGeometry {
  /** Vertex-array object containing attribute bindings. */
  vertexArray: WebGLVertexArrayObject;
  /** Interleaved position and texture-coordinate buffer. */
  vertexBuffer: WebGLBuffer;
}

/**
 * Create the reference fullscreen triangle-strip geometry.
 *
 * @param gl - Active WebGL2 context.
 * @param program - Linked liquid-glass program.
 * @returns Owned quad resources.
 */
export function createQuadGeometry(
  gl: WebGL2RenderingContext,
  program: WebGLProgram,
): QuadGeometry {
  const vertexArray = gl.createVertexArray();
  const vertexBuffer = gl.createBuffer();
  if (!vertexArray || !vertexBuffer) {
    if (vertexArray) {
      gl.deleteVertexArray(vertexArray);
    }
    if (vertexBuffer) {
      gl.deleteBuffer(vertexBuffer);
    }
    throw new GlassError(
      'RENDER_FAILED',
      'Unable to allocate liquid-glass quad geometry.',
      { phase: 'render' },
    );
  }

  const quad = new Float32Array([
    -1, -1, 0, 0, 0,
    1, -1, 0, 1, 0,
    -1, 1, 0, 0, 1,
    1, 1, 0, 1, 1,
  ]);
  gl.bindVertexArray(vertexArray);
  gl.bindBuffer(gl.ARRAY_BUFFER, vertexBuffer);
  gl.bufferData(gl.ARRAY_BUFFER, quad, gl.STATIC_DRAW);

  const positionLocation = gl.getAttribLocation(program, 'aVertexPosition');
  const textureLocation = gl.getAttribLocation(program, 'aTextureCoord');
  gl.enableVertexAttribArray(positionLocation);
  gl.vertexAttribPointer(positionLocation, 3, gl.FLOAT, false, 20, 0);
  gl.enableVertexAttribArray(textureLocation);
  gl.vertexAttribPointer(textureLocation, 2, gl.FLOAT, false, 20, 12);

  return { vertexArray, vertexBuffer };
}
