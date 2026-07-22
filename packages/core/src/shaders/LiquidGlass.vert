#version 300 es
precision mediump float;

/**
 * LiquidGlass.vert - Liquid Glass Vertex Shader
 * ==============================================
 * 
 * Responsibilities:
 * 1. Transform vertex positions from model space to clip space
 * 2. Transform texture coordinates from local space to global texture space
 * 
 * Coordinate Transform Pipeline:
 * aVertexPosition (model space) 
 *   -> uMVMatrix (model-view matrix) 
 *   -> uPMatrix (projection matrix) 
 *   -> gl_Position (clip space)
 * 
 * Texture Coordinate Transform:
 * aTextureCoord (local UV) 
 *   -> uTextureMatrix (texture transform matrix) 
 *   -> vTextureCoord (global texture UV)
 * 
 * Purpose of uTextureMatrix:
 * - Maps the material's local texture coordinates to the global coordinates of the entire backdrop Canvas
 * - Contains scale, translation, and other transforms to ensure each Material samples from the correct backdrop region
 */

// ===== Vertex Attribute Inputs =====
in vec3 aVertexPosition;  // Vertex position (model space)
in vec2 aTextureCoord;    // Texture coordinates (0.0 ~ 1.0)

// ===== Uniform Variables =====
uniform mat4 uMVMatrix;      // Model-View matrix: transforms vertices from model space to view space
uniform mat4 uPMatrix;       // Projection matrix: transforms vertices from view space to clip space
uniform mat4 uTextureMatrix; // Texture transform matrix: transforms local UV to global backdrop texture UV

// ===== Outputs to Fragment Shader =====
out vec2 vTextureCoord;  // Transformed texture coordinates

void main() {
  // 1. Calculate vertex position in clip space
  gl_Position = uPMatrix * uMVMatrix * vec4(aVertexPosition, 1.0);
  
  // 2. Transform texture coordinates
  //    Uses 4D homogeneous coordinates for transformation, supporting perspective transforms
  //    Finally takes the xy components as 2D texture coordinates
  vTextureCoord = (uTextureMatrix * vec4(aTextureCoord, 0, 1)).xy;
}
