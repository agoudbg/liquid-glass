import { GlassError } from '../errors/GlassError';

/** Linked shader program and the transient shader handles used to create it. */
export interface LinkedShaderProgram {
  /** Linked WebGL program. */
  program: WebGLProgram;
}

function compileShader(
  gl: WebGL2RenderingContext,
  type: number,
  source: string,
  label: string,
): WebGLShader {
  const shader = gl.createShader(type);
  if (!shader) {
    throw new GlassError(
      'SHADER_COMPILE_FAILED',
      `Unable to allocate the ${label} shader.`,
      { phase: 'shader', details: { label } },
    );
  }

  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    const infoLog = gl.getShaderInfoLog(shader) ?? '';
    gl.deleteShader(shader);
    throw new GlassError(
      'SHADER_COMPILE_FAILED',
      `Failed to compile the ${label} shader.`,
      { phase: 'shader', details: { label, infoLog } },
    );
  }

  return shader;
}

/**
 * Compile and link the exact liquid-glass shader pair.
 *
 * Shader objects are deleted after linking because the program retains the
 * executable while avoiding the leak present in the reference draft.
 *
 * @param gl - Active WebGL2 context.
 * @param vertexSource - Vertex shader source.
 * @param fragmentSource - Fragment shader source.
 * @returns Linked program resource.
 */
export function createShaderProgram(
  gl: WebGL2RenderingContext,
  vertexSource: string,
  fragmentSource: string,
): LinkedShaderProgram {
  const vertexShader = compileShader(gl, gl.VERTEX_SHADER, vertexSource, 'vertex');
  let fragmentShader: WebGLShader | null = null;

  try {
    fragmentShader = compileShader(
      gl,
      gl.FRAGMENT_SHADER,
      fragmentSource,
      'fragment',
    );
    const program = gl.createProgram();
    if (!program) {
      throw new GlassError(
        'PROGRAM_LINK_FAILED',
        'Unable to allocate the liquid-glass shader program.',
        { phase: 'shader' },
      );
    }

    gl.attachShader(program, vertexShader);
    gl.attachShader(program, fragmentShader);
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      const infoLog = gl.getProgramInfoLog(program) ?? '';
      gl.deleteProgram(program);
      throw new GlassError(
        'PROGRAM_LINK_FAILED',
        'Failed to link the liquid-glass shader program.',
        { phase: 'shader', details: { infoLog } },
      );
    }

    return { program };
  } finally {
    gl.deleteShader(vertexShader);
    if (fragmentShader) {
      gl.deleteShader(fragmentShader);
    }
  }
}
