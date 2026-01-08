#version 300 es
precision mediump float;

/**
 * LiquidGlass.vert - Liquid Glass 顶点着色器
 * ============================================
 * 
 * 职责：
 * 1. 将顶点位置从模型空间变换到裁剪空间
 * 2. 将纹理坐标从局部空间变换到全局纹理空间
 * 
 * 坐标变换流程：
 * aVertexPosition (模型空间) 
 *   -> uMVMatrix (模型视图矩阵) 
 *   -> uPMatrix (投影矩阵) 
 *   -> gl_Position (裁剪空间)
 * 
 * 纹理坐标变换：
 * aTextureCoord (局部 UV) 
 *   -> uTextureMatrix (纹理变换矩阵) 
 *   -> vTextureCoord (全局纹理 UV)
 * 
 * uTextureMatrix 的作用：
 * - 将材质的局部纹理坐标映射到整个背景 Canvas 的全局坐标
 * - 包含缩放、平移等变换，确保每个 Material 采样到正确的背景区域
 */

// ===== 顶点属性输入 =====
in vec3 aVertexPosition;  // 顶点位置 (模型空间)
in vec2 aTextureCoord;    // 纹理坐标 (0.0 ~ 1.0)

// ===== Uniform 变量 =====
uniform mat4 uMVMatrix;      // 模型视图矩阵：将顶点从模型空间变换到视图空间
uniform mat4 uPMatrix;       // 投影矩阵：将顶点从视图空间变换到裁剪空间
uniform mat4 uTextureMatrix; // 纹理变换矩阵：将局部 UV 变换到全局背景纹理 UV

// ===== 输出到片段着色器 =====
out vec2 vTextureCoord;  // 经过变换的纹理坐标

void main() {
  // 1. 计算顶点在裁剪空间中的位置
  gl_Position = uPMatrix * uMVMatrix * vec4(aVertexPosition, 1.0);
  
  // 2. 变换纹理坐标
  //    使用 4D 齐次坐标进行变换，支持透视变换
  //    最后取 xy 分量作为 2D 纹理坐标
  vTextureCoord = (uTextureMatrix * vec4(aTextureCoord, 0, 1)).xy;
}
