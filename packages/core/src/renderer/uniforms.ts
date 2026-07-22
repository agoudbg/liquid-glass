import type { RendererMaterial } from './types';

const UNIFORM_NAMES = [
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
] as const;

/** Name of a uniform required by the liquid-glass shaders. */
export type LiquidGlassUniformName = typeof UNIFORM_NAMES[number];

/** Resolved uniform locations keyed by shader declaration name. */
export type LiquidGlassUniforms = Record<
  LiquidGlassUniformName,
  WebGLUniformLocation | null
>;

/**
 * Resolve every liquid-glass uniform and bind invariant identity matrices.
 *
 * @param gl - Active WebGL2 context.
 * @param program - Linked shader program.
 * @returns Uniform location table.
 */
export function initializeUniforms(
  gl: WebGL2RenderingContext,
  program: WebGLProgram,
): LiquidGlassUniforms {
  const uniforms = Object.fromEntries(
    UNIFORM_NAMES.map((name) => [name, gl.getUniformLocation(program, name)]),
  ) as LiquidGlassUniforms;
  const identity = new Float32Array([
    1, 0, 0, 0,
    0, 1, 0, 0,
    0, 0, 1, 0,
    0, 0, 0, 1,
  ]);

  gl.uniformMatrix4fv(uniforms.uMVMatrix, false, identity);
  gl.uniformMatrix4fv(uniforms.uPMatrix, false, identity);
  gl.uniformMatrix4fv(uniforms.uTextureMatrix, false, identity);
  gl.uniform1i(uniforms.uTexture, 0);
  return uniforms;
}

/**
 * Bind all per-material uniforms using the reference coordinate conversion.
 *
 * @param gl - Active WebGL2 context.
 * @param uniforms - Resolved uniform locations.
 * @param material - Resolved material values.
 * @param scale - CSS-to-device-pixel scale.
 * @param physicalWidth - Drawing-buffer width.
 * @param physicalHeight - Drawing-buffer height.
 */
export function bindMaterialUniforms(
  gl: WebGL2RenderingContext,
  uniforms: LiquidGlassUniforms,
  material: RendererMaterial,
  scale: number,
  physicalWidth: number,
  physicalHeight: number,
): void {
  const [a, b, c, d, translateX, translateY] = material.matrix;
  const determinant = a * d - b * c;
  gl.uniform2f(uniforms.uResolution, physicalWidth, physicalHeight);
  gl.uniform4f(uniforms.uTransformMatrix, a, b, c, d);

  if (Math.abs(determinant) > 1e-10) {
    const inverseDeterminant = 1 / determinant;
    gl.uniform2f(
      uniforms.uTransformMatrixInv1,
      d * inverseDeterminant,
      -c * inverseDeterminant,
    );
    gl.uniform2f(
      uniforms.uTransformMatrixInv2,
      -b * inverseDeterminant,
      a * inverseDeterminant,
    );
  } else {
    gl.uniform2f(uniforms.uTransformMatrixInv1, 1, 0);
    gl.uniform2f(uniforms.uTransformMatrixInv2, 0, 1);
  }

  const centerX = material.rect.x + material.rect.width / 2 + translateX;
  const centerY = material.rect.y + material.rect.height / 2 + translateY;
  gl.uniform2f(uniforms.uCenter, centerX * scale, physicalHeight - centerY * scale);
  gl.uniform2f(
    uniforms.uSize,
    material.rect.width * scale / 2,
    material.rect.height * scale / 2,
  );
  gl.uniform4f(
    uniforms.uRadius,
    material.radii[0] * scale,
    material.radii[1] * scale,
    material.radii[2] * scale,
    material.radii[3] * scale,
  );
  gl.uniform1f(uniforms.uThickness, material.thickness * scale);
  gl.uniform1f(uniforms.uRefractIndex, material.refractIndex);
  gl.uniform1f(uniforms.uRefractIntensity, material.refractIntensity);
  gl.uniform1f(uniforms.uBlur, material.blur);
  gl.uniform1f(uniforms.uDispersion, material.dispersion);
  gl.uniform1f(uniforms.uOpacity, material.opacity);
}
