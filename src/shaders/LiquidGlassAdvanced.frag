#version 300 es
precision mediump float;

in vec2 vTextureCoord;
out vec4 fragColor;

uniform sampler2D uTexture;
uniform vec2 uResolution;
uniform vec2 uCenter;
uniform vec2 uSize; // half size in pixels
// Per-corner radii (pixels) in GL coordinate quadrants: x=Top-Right, y=Bottom-Right, z=Bottom-Left, w=Top-Left
uniform vec4 uRadius;

uniform float uThickness;        // Physical thickness in pixels
uniform float uRefractIndex;     // Index of refraction
uniform float uRefractIntensity; // Scales refraction offset
uniform float uBlur;             // LOD bias for mipmap-based blur
uniform float uDispersion;       // Chromatic aberration strength (0.0 to 0.05)
uniform float uOpacity;          // Material opacity (0.0 to 1.0)

// Transform matrix components [a, b, c, d] (2x2 portion) for shape distortion
// The full CSS matrix is matrix(a, b, c, d, e, f) where:
// a = scaleX * cos(rotation), b = scaleX * sin(rotation) + skewY
// c = -scaleY * sin(rotation) + skewX, d = scaleY * cos(rotation)
// We use the inverse of this matrix to transform coordinates before SDF computation
uniform vec4 uTransformMatrix; // [a, b, c, d] - the 2x2 transformation part
uniform vec2 uTransformMatrixInv1; // [invA, invB] - first row of inverse
uniform vec2 uTransformMatrixInv2; // [invC, invD] - second row of inverse

float sdfRect(vec2 p, vec4 r, vec2 halfSize) {
  // p is relative to center; y is up.
  float rad;
  if (p.x >= 0.0) {
    rad = (p.y >= 0.0) ? r.x : r.y; // right side: top vs bottom
  } else {
    rad = (p.y >= 0.0) ? r.w : r.z; // left side: top vs bottom
  }
  vec2 q = abs(p) - halfSize + rad;
  return length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - rad;
}

void main() {
  vec2 fragCoord = vTextureCoord * uResolution;
  vec2 p = fragCoord - uCenter;

  // Apply inverse transform to get coordinates in untransformed space
  // This makes the SDF calculation match the CSS-transformed shape
  // p_untransformed = inverse(transformMatrix) * p
  vec2 pUntransformed = vec2(
    uTransformMatrixInv1.x * p.x + uTransformMatrixInv1.y * p.y,
    uTransformMatrixInv2.x * p.x + uTransformMatrixInv2.y * p.y
  );

  float sd = sdfRect(pUntransformed, uRadius, uSize);
  
  // Outside glass region: discard to allow other materials to show
  if (sd >= 0.0) {
    discard;
  }
  
  vec2 uv = vTextureCoord;

  // Calculate gradient for normal computation in untransformed space
  float sdX = sdfRect(pUntransformed + vec2(1.0, 0.0), uRadius, uSize);
  float sdY = sdfRect(pUntransformed + vec2(0.0, 1.0), uRadius, uSize);

  float n_cos = max(uThickness + sd, 0.0) / uThickness;
  float n_cos2 = n_cos * n_cos;
  float n_sin = sqrt(1.0 - n_cos2);
  vec3 normal = normalize(vec3((sdX - sd) * n_cos, (sdY - sd) * n_cos, n_sin));

  // Transform the normal back to screen space using the transform matrix
  // This ensures refraction direction matches the visual shape
  vec2 normalXY = vec2(
    uTransformMatrix.x * normal.x + uTransformMatrix.z * normal.y,
    uTransformMatrix.y * normal.x + uTransformMatrix.w * normal.y
  );
  normal = normalize(vec3(normalXY, normal.z));

  vec3 refract_vec = refract(vec3(0.0, 0.0, -1.0), normal, 1.0 / uRefractIndex);

  float h = sd < -uThickness ? uThickness : sqrt(sd * (-2.0 * uThickness - sd));
  float refract_length = (h + 8.0 * uThickness) / -refract_vec.z;

  vec2 pixelOffset = refract_vec.xy * refract_length * uRefractIntensity;
  vec2 refraction = pixelOffset / uResolution;

  // LOD bias for mipmap-based blur
  float lod = uBlur;
  
  // Performance optimization: skip chromatic aberration when dispersion is negligible
  // This reduces texture fetch overhead on mobile devices by avoiding 3 separate samples
  if (uDispersion < 0.0001) {
    // Single sample path - no chromatic aberration
    vec2 uvFinal = clamp(vTextureCoord + refraction, 0.0, 1.0);
    fragColor = textureLod(uTexture, uvFinal, lod);
  } else {
    // Chromatic aberration path: sample R, G, B with different offsets
    // Red channel: slightly more refraction (outer edge)
    // Green channel: base refraction  
    // Blue channel: slightly less refraction (inner edge)
    
    // Clamp UV coordinates to prevent sampling outside texture bounds
    vec2 uvR = clamp(vTextureCoord + refraction * (1.0 + uDispersion), 0.0, 1.0);
    vec2 uvG = clamp(vTextureCoord + refraction, 0.0, 1.0);
    vec2 uvB = clamp(vTextureCoord + refraction * (1.0 - uDispersion), 0.0, 1.0);
    
    float r = textureLod(uTexture, uvR, lod).r;
    float g = textureLod(uTexture, uvG, lod).g;
    float b = textureLod(uTexture, uvB, lod).b;
    
    // Alpha is taken from the green channel (center sample) for consistency
    float a = textureLod(uTexture, uvG, lod).a;
    
    fragColor = vec4(r, g, b, a);
  }

  // Apply material opacity
  fragColor.a *= uOpacity;
  // Premultiplied alpha: multiply RGB by alpha for proper blending
  fragColor.rgb *= fragColor.a;
}
