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
  zIndex: number;
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
