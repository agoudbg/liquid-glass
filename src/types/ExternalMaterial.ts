/**
 * ExternalMaterial.ts - 跨组件渲染委托类型定义
 * ============================================
 *
 * 当一个 LiquidGlassMaterial 视觉上位于嵌套的 LiquidGlass 上方时，
 * 需要将渲染委托给子级 LiquidGlass。这个模块定义了委托机制所需的所有类型。
 *
 * 架构图：
 * ┌─────────────────────────────────────────────────────────────┐
 * │ Parent LiquidGlass                                         │
 * │  ┌─────────────────────────────────────────────────────┐   │
 * │  │ LiquidGlassMaterial (使用 proxyTarget 委托渲染)     │   │
 * │  │    │                                                │   │
 * │  │    ▼ ExternalMaterialConfig                         │   │
 * │  │ ┌─────────────────────────────────────────────┐     │   │
 * │  │ │ Child LiquidGlass (作为 ProxyTarget)        │     │   │
 * │  │ │  - 接收配置                                 │     │   │
 * │  │ │  - 创建 ExternalMaterialElement            │     │   │
 * │  │ │  - 渲染玻璃效果                            │     │   │
 * │  │ │    │                                        │     │   │
 * │  │ │    ▼ ExternalMaterialFeedback               │     │   │
 * │  │ │  - 返回主题颜色反馈                         │     │   │
 * │  │ └─────────────────────────────────────────────┘     │   │
 * │  └─────────────────────────────────────────────────────┘   │
 * └─────────────────────────────────────────────────────────────┘
 *
 * 关键接口：
 * - ExternalMaterialConfig: Material → ProxyTarget 的配置数据
 * - ExternalMaterialFeedback: ProxyTarget → Material 的反馈数据
 * - ProxyTargetInterface: ProxyTarget 暴露的 API
 */

// ===== 配置类型 =====

/**
 * Configuration data sent from Material to its proxy target LiquidGlass
 */
export interface ExternalMaterialConfig {
  /** Unique identifier for this external material */
  id: string;

  /** Client bounding rect in viewport coordinates */
  clientRect: {
    x: number;
    y: number;
    width: number;
    height: number;
  };

  /** Border radius values (all four corners) */
  borderRadius: {
    topLeft: number;
    topRight: number;
    bottomRight: number;
    bottomLeft: number;
  };

  /** Blur amount for the glass effect */
  blur: number;

  /** Glass thickness parameter */
  thickness: number;

  /** Refraction index for glass effect */
  refractIndex: number;

  /** Refraction intensity */
  refractIntensity: number;

  /** Chromatic aberration / dispersion strength */
  dispersion: number;

  /** Transform applied to the material (scale, translate) */
  transform: {
    scaleX: number;
    scaleY: number;
    translateX: number;
    translateY: number;
  };
}

// ===== 反馈类型 =====

/**
 * Data returned from proxy LiquidGlass to the Material
 * for background/text color adaptation
 */
export interface ExternalMaterialFeedback {
  /** The computed theme color mode based on the backdrop beneath this material */
  themeColorMode: 'light' | 'dark' | 'ultra_light' | 'ultra_dark';

  /** Average luminance of the backdrop area (0-255) */
  averageLuminance?: number;
}

// ===== 回调类型 =====

/**
 * Registration callback for when material is first registered with proxy
 */
export type ExternalMaterialRegistrationCallback = (id: string, config: ExternalMaterialConfig) => void;

/**
 * Update callback for when material position/config changes
 */
export type ExternalMaterialUpdateCallback = (id: string, data: Partial<ExternalMaterialConfig>) => void;

/**
 * Unregistration callback for when material is removed
 */
export type ExternalMaterialUnregistrationCallback = (id: string) => void;

// ===== 代理目标接口 =====

/**
 * Interface for the proxy target (LiquidGlass component) exposed methods.
 * This is the API that a child LiquidGlass exposes for external materials
 * to delegate their rendering.
 */
export interface ProxyTargetInterface {
  /** Register a new external material with the proxy */
  registerExternalMaterial: ExternalMaterialRegistrationCallback;

  /** Update an existing external material's configuration */
  updateExternalMaterial: ExternalMaterialUpdateCallback;

  /** Unregister an external material */
  unregisterExternalMaterial: ExternalMaterialUnregistrationCallback;

  /** Get the container element's bounding rect for coordinate calculations */
  getContainerRect: () => DOMRect | null;

  /** Get the current scroll position of the proxy container */
  getScrollPosition: () => { x: number; y: number };

  /** Subscribe to feedback updates for a material */
  onMaterialFeedback: (id: string, callback: (feedback: ExternalMaterialFeedback) => void) => () => void;
}

// ===== Canvas 坐标类型 =====

/**
 * Computed canvas coordinates for an external material
 * relative to the proxy LiquidGlass's internal canvas.
 * Used for positioning the glass effect on the WebGL canvas.
 */
export interface ExternalMaterialCanvasCoords {
  /** Destination X in the proxy's canvas (CSS pixels) */
  destX: number;

  /** Destination Y in the proxy's canvas (CSS pixels) */
  destY: number;

  /** Source X in the proxy's backdrop canvas (CSS pixels) */
  srcX: number;

  /** Source Y in the proxy's backdrop canvas (CSS pixels) */
  srcY: number;

  /** Width of the material region (CSS pixels) */
  width: number;

  /** Height of the material region (CSS pixels) */
  height: number;

  /** Whether the material is at least partially visible within the proxy bounds */
  isVisible: boolean;
}
