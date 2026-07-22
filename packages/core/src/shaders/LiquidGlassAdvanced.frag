#version 300 es
precision mediump float;

/**
 * LiquidGlassAdvanced.frag - Liquid Glass Fragment Shader
 * ========================================================
 * 
 * Implements iOS-like Liquid Glass refraction effects.
 * 
 * Core Algorithm:
 * 1. SDF (Signed Distance Field): Use sdfRect() to calculate pixel distance to rounded rect boundary
 * 2. Normal Calculation: Compute surface normal from SDF gradient to simulate glass curvature
 * 3. Refraction Simulation: Calculate UV offset based on normal and refraction index
 * 4. Chromatic Dispersion: R/G/B channels use different refraction intensities
 * 5. Blur Effect: Use LOD (Level of Detail) sampling combined with multi-point Gaussian blur
 * 
 * Visual Effects:
 * - Glass material has refraction distortion at edges
 * - Slight chromatic aberration (rainbow) effect at edges
 * - Soft blur transition at glass edges
 * - Supports CSS transform (via transform matrix)
 * 
 * Performance Optimizations:
 * - Uses textureLod() with mipmap for efficient blur base
 * - Multi-point sampling for improved blur quality
 * - Pixels outside boundary use discard to skip unnecessary computation
 * - All calculations run in parallel on GPU
 */

// ===== Input/Output Variables =====
in vec2 vTextureCoord;  // Texture coordinates from vertex shader (0.0 ~ 1.0)
out vec4 fragColor;     // Output fragment color

// ===== Uniform Variables: Texture and Geometry Parameters =====
uniform sampler2D uTexture;   // Background texture (with mipmap)
uniform vec2 uResolution;     // Canvas resolution (width, height) in pixels
uniform vec2 uCenter;         // Material center position in canvas (pixels)
uniform vec2 uSize;           // Material half-size (width/2, height/2) in pixels

// Corner radii in pixels, ordered by GL coordinate quadrants: x=TR, y=BR, z=BL, w=TL
uniform vec4 uRadius;

// ===== Uniform Variables: Visual Effect Parameters =====
uniform float uThickness;        // Glass edge thickness (pixels), affects refraction range
uniform float uRefractIndex;     // Refraction index, higher = more distortion (recommend 1.0 ~ 2.0)
uniform float uRefractIntensity; // Refraction intensity coefficient, scales UV offset
uniform float uBlur;             // Blur level, controls edge blur amount (mipmap LOD offset)
uniform float uDispersion;       // Chromatic dispersion strength (recommend 0.0 ~ 0.05)
uniform float uOpacity;          // Material overall opacity (0.0 ~ 1.0)

// ===== Uniform Variables: CSS Transform Matrix =====
// Used to support CSS transform (rotate/scale/skew) coordinate transformations
// From CSS matrix(a, b, c, d, e, f), we use the 2x2 transform portion:
//   a = scaleX * cos(rotation), b = scaleX * sin(rotation) + skewY
//   c = -scaleY * sin(rotation) + skewX, d = scaleY * cos(rotation)
// We use the inverse matrix to transform pixel coordinates back to SDF calculation space
uniform vec4 uTransformMatrix;     // [a, b, c, d] - 2x2 transform matrix
uniform vec2 uTransformMatrixInv1; // [invA, invB] - Inverse matrix row 1
uniform vec2 uTransformMatrixInv2; // [invC, invD] - Inverse matrix row 2

// ===== SDF Function: Rounded Rectangle Signed Distance Field =====
/**
 * Calculate the signed distance from point p to rounded rectangle boundary.
 * 
 * @param p Coordinates relative to center (y-axis up)
 * @param r Corner radii for four corners (TR, BR, BL, TL)
 * @param halfSize Rectangle half-size (width/2, height/2)
 * @return Negative = inside shape, Positive = outside, 0 = on boundary
 */
float sdfRect(vec2 p, vec4 r, vec2 halfSize) {
  // p is relative to center; y-axis points up
  // Select corner radius based on which quadrant the point is in
  float rad;
  if (p.x >= 0.0) {
    rad = (p.y >= 0.0) ? r.x : r.y; // Right side: top vs bottom
  } else {
    rad = (p.y >= 0.0) ? r.w : r.z; // Left side: top vs bottom
  }
  // Calculate distance to rounded rectangle boundary
  // First shrink to the rectangle inside the corners, then add corner radius
  vec2 q = abs(p) - halfSize + rad;
  return length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - rad;
}

// ===== Main Function: Fragment Shader Entry Point =====
void main() {
  // 1. Coordinate Calculation: Convert texture coordinates to pixel coordinates
  vec2 fragCoord = vTextureCoord * uResolution;
  vec2 p = fragCoord - uCenter;  // Position relative to material center (pixels)

  // 2. Apply inverse transform matrix to transform coordinates back to SDF calculation space
  //    This ensures SDF calculation matches the CSS-transformed shape
  //    p_untransformed = inverse(transformMatrix) * p
  vec2 pUntransformed = vec2(
    uTransformMatrixInv1.x * p.x + uTransformMatrixInv1.y * p.y,
    uTransformMatrixInv2.x * p.x + uTransformMatrixInv2.y * p.y
  );

  // 3. Calculate SDF distance value
  float sd = sdfRect(pUntransformed, uRadius, uSize);
  
  // 4. Boundary Clipping: Discard fragment if outside glass area
  if (sd >= 0.0) {
    discard;
  }
  
  vec2 uv = vTextureCoord;

  // 5. Calculate SDF gradient for normal computation
  //    Use finite difference method: offset 1 pixel in x/y directions
  float sdX = sdfRect(pUntransformed + vec2(1.0, 0.0), uRadius, uSize);
  float sdY = sdfRect(pUntransformed + vec2(0.0, 1.0), uRadius, uSize);

  // 6. Normal Calculation: Simulate glass edge curvature
  //    n_cos: Edge transition factor, smoothly transitions from edge(0) to interior(1)
  //    n_sin: Sine component of refraction direction
  float n_cos = max(uThickness + sd, 0.0) / uThickness;
  float n_cos2 = n_cos * n_cos;
  float n_sin = sqrt(1.0 - n_cos2);
  
  // 7. Construct surface normal vector
  //    xy components: derived from SDF gradient
  //    z component: surface facing direction (toward viewer)
  vec3 normal = normalize(vec3((sdX - sd) * n_cos, (sdY - sd) * n_cos, n_sin));

  // 8. Transform normal back to screen space
  //    Ensures refraction direction matches the CSS-transformed visual shape
  vec2 normalXY = vec2(
    uTransformMatrix.x * normal.x + uTransformMatrix.z * normal.y,
    uTransformMatrix.y * normal.x + uTransformMatrix.w * normal.y
  );
  normal = normalize(vec3(normalXY, normal.z));

  // 9. Calculate refraction vector
  //    Incident vector is (0, 0, -1), i.e., perpendicular incidence
  //    Refraction index = 1.0 / uRefractIndex (from air into glass)
  vec3 refract_vec = refract(vec3(0.0, 0.0, -1.0), normal, 1.0 / uRefractIndex);

  // 10. Calculate refracted ray travel distance in glass
  //     h: Horizontal travel distance inside glass
  //     refract_length: Total refraction length considering glass thickness
  float h = sd < -uThickness ? uThickness : sqrt(sd * (-2.0 * uThickness - sd));
  float refract_length = (h + 8.0 * uThickness) / -refract_vec.z;

  // 11. Convert pixel offset to UV coordinate offset
  vec2 pixelOffset = refract_vec.xy * refract_length * uRefractIntensity;
  vec2 refraction = pixelOffset / uResolution;

  // 12. Set blur level (LOD = Level of Detail)
  //     Uses mipmap for efficient blur effect
  //     Blur intensity: edges are more blurred, center is clearer
  float lod = uBlur;
  
  // ===== Texture Sampling and Dispersion Processing =====
  // Use 9-point Gaussian sampling for higher quality blur
  // Still uses LOD sampling on mobile for bandwidth reduction, combined with multi-point sampling for smoothness
  
  // Calculate LOD-based sampling offset (in texture coordinate units)
  // Uses mipmap size to determine appropriate offset
  float blurRadius = exp2(lod) / min(uResolution.x, uResolution.y);
  
  // 9-point Gaussian kernel weights (normalized, sum = 1.0)
  // Center weight is higher, edge weights are lower, simulating Gaussian distribution
  const float w0 = 0.0625;  // Corner weight (1/16)
  const float w1 = 0.125;   // Edge weight (2/16)
  const float w2 = 0.25;    // Center weight (4/16)
  
  // Performance optimization: Skip dispersion calculation when value is negligible
  // This reduces texture sampling overhead on mobile (from 3 samples to 1)
  if (uDispersion < 0.0001) {
    vec2 uvBase = vTextureCoord + refraction;
    
    // When blur value is small, use simple sampling for performance
    if (uBlur < 0.5) {
      vec2 uvFinal = clamp(uvBase, 0.0, 1.0);
      fragColor = textureLod(uTexture, uvFinal, lod);
    } else {
      // 9-point Gaussian blur sampling
      vec4 color = vec4(0.0);
      
      // Center point
      color += textureLod(uTexture, clamp(uvBase, 0.0, 1.0), lod) * w2;
      
      // 4 cross points (up, down, left, right)
      color += textureLod(uTexture, clamp(uvBase + vec2(blurRadius, 0.0), 0.0, 1.0), lod) * w1;
      color += textureLod(uTexture, clamp(uvBase + vec2(-blurRadius, 0.0), 0.0, 1.0), lod) * w1;
      color += textureLod(uTexture, clamp(uvBase + vec2(0.0, blurRadius), 0.0, 1.0), lod) * w1;
      color += textureLod(uTexture, clamp(uvBase + vec2(0.0, -blurRadius), 0.0, 1.0), lod) * w1;
      
      // 4 corner points
      color += textureLod(uTexture, clamp(uvBase + vec2(blurRadius, blurRadius), 0.0, 1.0), lod) * w0;
      color += textureLod(uTexture, clamp(uvBase + vec2(-blurRadius, blurRadius), 0.0, 1.0), lod) * w0;
      color += textureLod(uTexture, clamp(uvBase + vec2(blurRadius, -blurRadius), 0.0, 1.0), lod) * w0;
      color += textureLod(uTexture, clamp(uvBase + vec2(-blurRadius, -blurRadius), 0.0, 1.0), lod) * w0;
      
      fragColor = color;
    }
  } else {
    // Dispersion path: R, G, B channels use different offset amounts
    // Red channel: slightly more refraction (outer edge)
    // Green channel: base refraction
    // Blue channel: slightly less refraction (inner edge)
    // This simulates how different wavelengths refract differently through glass
    
    vec2 uvBaseR = vTextureCoord + refraction * (1.0 + uDispersion);
    vec2 uvBaseG = vTextureCoord + refraction;
    vec2 uvBaseB = vTextureCoord + refraction * (1.0 - uDispersion);
    
    // When blur value is small, use simple sampling for performance
    if (uBlur < 0.5) {
      vec2 uvR = clamp(uvBaseR, 0.0, 1.0);
      vec2 uvG = clamp(uvBaseG, 0.0, 1.0);
      vec2 uvB = clamp(uvBaseB, 0.0, 1.0);
      
      float r = textureLod(uTexture, uvR, lod).r;
      float g = textureLod(uTexture, uvG, lod).g;
      float b = textureLod(uTexture, uvB, lod).b;
      float a = textureLod(uTexture, uvG, lod).a;
      
      fragColor = vec4(r, g, b, a);
    } else {
      // 5-point cross sampling (per channel), maintains performance in dispersion mode
      // Fewer than 9 points but still significantly improves quality
      float r = 0.0, g = 0.0, b = 0.0, a = 0.0;
      
      // Center sampling (weight 0.4)
      r += textureLod(uTexture, clamp(uvBaseR, 0.0, 1.0), lod).r * 0.4;
      g += textureLod(uTexture, clamp(uvBaseG, 0.0, 1.0), lod).g * 0.4;
      b += textureLod(uTexture, clamp(uvBaseB, 0.0, 1.0), lod).b * 0.4;
      a += textureLod(uTexture, clamp(uvBaseG, 0.0, 1.0), lod).a * 0.4;
      
      // Cross 4-point sampling (weight 0.15 each)
      vec2 offsets[4];
      offsets[0] = vec2(blurRadius, 0.0);
      offsets[1] = vec2(-blurRadius, 0.0);
      offsets[2] = vec2(0.0, blurRadius);
      offsets[3] = vec2(0.0, -blurRadius);
      
      for (int i = 0; i < 4; i++) {
        r += textureLod(uTexture, clamp(uvBaseR + offsets[i], 0.0, 1.0), lod).r * 0.15;
        g += textureLod(uTexture, clamp(uvBaseG + offsets[i], 0.0, 1.0), lod).g * 0.15;
        b += textureLod(uTexture, clamp(uvBaseB + offsets[i], 0.0, 1.0), lod).b * 0.15;
        a += textureLod(uTexture, clamp(uvBaseG + offsets[i], 0.0, 1.0), lod).a * 0.15;
      }
      
      fragColor = vec4(r, g, b, a);
    }
  }

  // ===== Final Color Processing =====
  // 13. Apply material opacity
  fragColor.a *= uOpacity;
  // 14. Premultiplied Alpha: Multiply RGB by Alpha value
  //     This is standard practice for WebGL blending, ensures correct transparency blending
  fragColor.rgb *= fragColor.a;
}
