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

float sdfRect(vec2 p, vec4 r) {
  // p is relative to center; y is up.
  float rad;
  if (p.x >= 0.0) {
    rad = (p.y >= 0.0) ? r.x : r.y; // right side: top vs bottom
  } else {
    rad = (p.y >= 0.0) ? r.w : r.z; // left side: top vs bottom
  }
  vec2 q = abs(p) - uSize + rad;
  return length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - rad;
}

void main() {
  vec2 fragCoord = vTextureCoord * uResolution;
  vec2 p = fragCoord - uCenter;

  float sd = sdfRect(p, uRadius);
  
  // Outside glass region: discard to allow other materials to show
  if (sd >= 0.0) {
    discard;
  }
  
  vec2 uv = vTextureCoord;

  float sdX = sdfRect(p + vec2(1.0, 0.0), uRadius);
  float sdY = sdfRect(p + vec2(0.0, 1.0), uRadius);

  float n_cos = max(uThickness + sd, 0.0) / uThickness;
  float n_cos2 = n_cos * n_cos;
  float n_sin = sqrt(1.0 - n_cos2);
  vec3 normal = normalize(vec3((sdX - sd) * n_cos, (sdY - sd) * n_cos, n_sin));

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
}
