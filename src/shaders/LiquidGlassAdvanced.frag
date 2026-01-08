#version 300 es
precision mediump float;

/**
 * LiquidGlassAdvanced.frag - Liquid Glass 片段着色器
 * =====================================================
 * 
 * 实现类似 iOS Liquid Glass 的玻璃折射效果。
 * 
 * 核心算法：
 * 1. SDF（有符号距离场）：使用 sdfRect() 计算像素到圆角矩形边界的距离
 * 2. 法线计算：通过 SDF 梯度计算表面法线，模拟玻璃曲面
 * 3. 折射模拟：根据法线和折射率计算 UV 偏移
 * 4. 色散效果：R/G/B 通道使用不同折射强度，模拟光的色散
 * 5. 模糊效果：使用 LOD (Level of Detail) 采样实现边缘模糊
 * 
 * 视觉效果：
 * - 玻璃材质的边缘有折射扭曲效果
 * - 边缘区域有轻微的色散（彩虹）效果
 * - 玻璃边缘有柔和的模糊过渡
 * - 支持 CSS transform 变换（通过变换矩阵）
 * 
 * 性能优化：
 * - 使用 textureLod() 结合 mipmap 实现高效模糊
 * - 边界外像素直接 discard，避免不必要计算
 * - 所有计算在 GPU 上并行执行
 */

// ===== 输入/输出变量 =====
in vec2 vTextureCoord;  // 从顶点着色器传入的纹理坐标 (0.0 ~ 1.0)
out vec4 fragColor;     // 输出的片段颜色

// ===== Uniform 变量：纹理与几何参数 =====
uniform sampler2D uTexture;   // 背景纹理（带 mipmap）
uniform vec2 uResolution;     // 画布分辨率 (宽, 高) 像素
uniform vec2 uCenter;         // 材质中心点在画布中的位置（像素）
uniform vec2 uSize;           // 材质半尺寸（宽度/2, 高度/2）像素

// 每个角的圆角半径（像素），按 GL 坐标象限：x=右上, y=右下, z=左下, w=左上
uniform vec4 uRadius;

// ===== Uniform 变量：视觉效果参数 =====
uniform float uThickness;        // 玻璃边缘厚度（像素），影响折射范围
uniform float uRefractIndex;     // 折射率，值越大折射越明显（建议 1.0 ~ 2.0）
uniform float uRefractIntensity; // 折射强度系数，缩放 UV 偏移量
uniform float uBlur;             // 模糊等级，控制边缘模糊程度（mipmap LOD 偏移）
uniform float uDispersion;       // 色散强度，产生彩虹效果（建议 0.0 ~ 0.05）
uniform float uOpacity;          // 材质整体透明度 (0.0 ~ 1.0)

// ===== Uniform 变量：CSS 变换矩阵 =====
// 用于支持 CSS transform (rotate/scale/skew) 的坐标变换
// CSS matrix(a, b, c, d, e, f) 中的 2x2 变换部分：
//   a = scaleX * cos(rotation), b = scaleX * sin(rotation) + skewY
//   c = -scaleY * sin(rotation) + skewX, d = scaleY * cos(rotation)
// 我们使用逆矩阵将像素坐标变换回 SDF 计算空间
uniform vec4 uTransformMatrix;     // [a, b, c, d] - 2x2 变换矩阵
uniform vec2 uTransformMatrixInv1; // [invA, invB] - 逆矩阵第一行
uniform vec2 uTransformMatrixInv2; // [invC, invD] - 逆矩阵第二行

// ===== SDF 函数：圆角矩形有符号距离场 =====
/**
 * 计算点 p 到圆角矩形边界的有符号距离。
 * 
 * @param p 相对于中心的坐标（y 轴向上）
 * @param r 四个角的圆角半径 (右上, 右下, 左下, 左上)
 * @param halfSize 矩形的半尺寸 (宽/2, 高/2)
 * @return 负值表示点在形状内部，正值表示在外部，0 表示在边界上
 */
float sdfRect(vec2 p, vec4 r, vec2 halfSize) {
  // p 相对于中心；y 轴向上
  // 根据点所在象限选择对应的圆角半径
  float rad;
  if (p.x >= 0.0) {
    rad = (p.y >= 0.0) ? r.x : r.y; // 右侧：上 vs 下
  } else {
    rad = (p.y >= 0.0) ? r.w : r.z; // 左侧：上 vs 下
  }
  // 计算到圆角矩形边界的距离
  // 先缩小到圆角内的矩形，再加上圆角半径
  vec2 q = abs(p) - halfSize + rad;
  return length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - rad;
}

// ===== 主函数：片段着色器入口 =====
void main() {
  // 1. 坐标计算：将纹理坐标转换为像素坐标
  vec2 fragCoord = vTextureCoord * uResolution;
  vec2 p = fragCoord - uCenter;  // 相对于材质中心的像素坐标

  // 2. 应用逆变换矩阵，将坐标变换回 SDF 计算空间
  //    这样 SDF 计算结果会匹配经过 CSS transform 变换后的形状
  //    p_untransformed = inverse(transformMatrix) * p
  vec2 pUntransformed = vec2(
    uTransformMatrixInv1.x * p.x + uTransformMatrixInv1.y * p.y,
    uTransformMatrixInv2.x * p.x + uTransformMatrixInv2.y * p.y
  );

  // 3. 计算 SDF 距离值
  float sd = sdfRect(pUntransformed, uRadius, uSize);
  
  // 4. 边界裁剪：如果在玻璃区域外，直接丢弃该片段
  if (sd >= 0.0) {
    discard;
  }
  
  vec2 uv = vTextureCoord;

  // 5. 计算 SDF 梯度，用于法线计算
  //    通过有限差分法求梯度：在 x/y 方向各偏移 1 像素
  float sdX = sdfRect(pUntransformed + vec2(1.0, 0.0), uRadius, uSize);
  float sdY = sdfRect(pUntransformed + vec2(0.0, 1.0), uRadius, uSize);

  // 6. 法线计算：模拟玻璃边缘的曲面
  //    n_cos: 边缘过渡因子，从边缘(0)到内部(1)平滑过渡
  //    n_sin: 折射方向的正弦分量
  float n_cos = max(uThickness + sd, 0.0) / uThickness;
  float n_cos2 = n_cos * n_cos;
  float n_sin = sqrt(1.0 - n_cos2);
  
  // 7. 构建表面法线向量
  //    xy 分量：通过 SDF 梯度计算得到
  //    z 分量：表示表面朝向（指向观察者）
  vec3 normal = normalize(vec3((sdX - sd) * n_cos, (sdY - sd) * n_cos, n_sin));

  // 8. 将法线变换回屏幕空间
  //    确保折射方向与经过 CSS transform 变换后的视觉形状一致
  vec2 normalXY = vec2(
    uTransformMatrix.x * normal.x + uTransformMatrix.z * normal.y,
    uTransformMatrix.y * normal.x + uTransformMatrix.w * normal.y
  );
  normal = normalize(vec3(normalXY, normal.z));

  // 9. 计算折射向量
  //    入射向量为 (0, 0, -1)，即垂直入射
  //    折射率 = 1.0 / uRefractIndex（从空气进入玻璃）
  vec3 refract_vec = refract(vec3(0.0, 0.0, -1.0), normal, 1.0 / uRefractIndex);

  // 10. 计算折射光线在玻璃中的传播距离
  //     h: 光线在玻璃内部的水平传播距离
  //     refract_length: 考虑玻璃厚度后的总折射长度
  float h = sd < -uThickness ? uThickness : sqrt(sd * (-2.0 * uThickness - sd));
  float refract_length = (h + 8.0 * uThickness) / -refract_vec.z;

  // 11. 将像素偏移转换为 UV 坐标偏移
  vec2 pixelOffset = refract_vec.xy * refract_length * uRefractIntensity;
  vec2 refraction = pixelOffset / uResolution;

  // 12. 设置模糊等级（LOD = Level of Detail）
  //     使用 mipmap 实现高效的模糊效果
  float lod = uBlur;
  
  // ===== 纹理采样与色散处理 =====
  // 性能优化：当色散值可忽略时，跳过色散计算
  // 这样可以减少移动端的纹理采样开销（从 3 次降为 1 次）
  if (uDispersion < 0.0001) {
    // 单次采样路径 - 无色散效果
    vec2 uvFinal = clamp(vTextureCoord + refraction, 0.0, 1.0);
    fragColor = textureLod(uTexture, uvFinal, lod);
  } else {
    // 色散路径：R、G、B 通道使用不同的偏移量采样
    // 红色通道：折射略多（外边缘）
    // 绿色通道：基准折射
    // 蓝色通道：折射略少（内边缘）
    // 这模拟了光通过玻璃时不同波长折射率不同的物理现象
    
    // 将 UV 坐标限制在纹理边界内，防止采样到纹理外部
    vec2 uvR = clamp(vTextureCoord + refraction * (1.0 + uDispersion), 0.0, 1.0);
    vec2 uvG = clamp(vTextureCoord + refraction, 0.0, 1.0);
    vec2 uvB = clamp(vTextureCoord + refraction * (1.0 - uDispersion), 0.0, 1.0);
    
    float r = textureLod(uTexture, uvR, lod).r;
    float g = textureLod(uTexture, uvG, lod).g;
    float b = textureLod(uTexture, uvB, lod).b;
    
    // Alpha 值取自绿色通道（中心采样点），保持一致性
    float a = textureLod(uTexture, uvG, lod).a;
    
    fragColor = vec4(r, g, b, a);
  }

  // ===== 最终颜色处理 =====
  // 13. 应用材质透明度
  fragColor.a *= uOpacity;
  // 14. 预乘 Alpha：将 RGB 乘以 Alpha 值
  //     这是 WebGL 混合模式的标准做法，确保透明度正确混合
  fragColor.rgb *= fragColor.a;
}
