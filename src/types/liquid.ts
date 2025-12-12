export type BackdropSourceType = 'converter' | 'canvas';

export interface MaterialConfig {
  strength: number;
  borderRadius: string;
  fallbackBlur: string;
  shapePath?: string;
}

export interface TextureMapItem {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
  imageBitmap: ImageBitmap;
  previewBitmap?: ImageBitmap;
  zIndex: number;
  sourceType: BackdropSourceType;
  debugLabel?: string;
}

export interface ScrollOffset {
  x: number;
  y: number;
}

export interface ClickEvent {
  x: number;
  y: number;
  timestamp: number;
}

export interface RegisteredSourceSnapshot {
  id: string;
  type: BackdropSourceType;
  rect: { x: number; y: number; width: number; height: number };
  zIndex: number;
  updatedAt: number;
  debugLabel?: string;
  previewBitmap?: ImageBitmap;
}

export interface MaterialSnapshot {
  id: string;
  config: MaterialConfig;
  rect: { x: number; y: number; width: number; height: number };
}

export interface ScrollAreaSnapshot {
  id: string;
  offset: ScrollOffset;
}

export interface DebugSnapshot {
  debugEnabled: boolean;
  sources: RegisteredSourceSnapshot[];
  materials: MaterialSnapshot[];
  scrollAreas: ScrollAreaSnapshot[];
  scrollOffset: ScrollOffset;
  rendererBitmap?: ImageBitmap;
  rendererSize?: { width: number; height: number };
  rendererUpdatedAt?: number;
}
