import {
  BackdropSourceType,
  ClickEvent,
  DebugSnapshot,
  MaterialConfig,
  MaterialSnapshot,
  RegisteredSourceSnapshot,
  ScrollAreaSnapshot,
  ScrollOffset,
  TextureMapItem,
} from '../types/liquid';
import TextureBuilderWorker from '../workers/TextureBuilderWorker?worker';

export class LiquidRendererManager {
  private worker: Worker;

  private canvas: HTMLCanvasElement | null = null;

  private gl: WebGLRenderingContext | null = null;

  private isSupported: boolean = false;

  private scrollOffset: ScrollOffset = { x: 0, y: 0 };

  private debugEnabled = false;

  private sources = new Map<string, RegisteredSourceSnapshot>();

  private materials = new Map<string, { id: string; element: HTMLElement; config: MaterialConfig }>();

  private scrollAreas = new Map<string, ScrollAreaSnapshot & { element: HTMLElement }>();

  constructor(opts?: { debug?: boolean }) {
    this.worker = new TextureBuilderWorker();
    this.debugEnabled = Boolean(opts?.debug);
    this.initWorker();
  }

  private initWorker() {
    this.worker.onmessage = (e) => {
      // Handle worker messages (e.g. texture updated)
      this.logDebug('Worker message:', e.data);
    };
  }

  private logDebug(...args: unknown[]) {
    if (this.debugEnabled) {
      // eslint-disable-next-line no-console
      console.debug('[LiquidRendererManager]', ...args);
    }
  }

  public initRenderer(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    // Initialize WebGL context here
    this.gl = canvas.getContext('webgl');
    if (this.gl) {
      this.isSupported = true;
    }
  }

  public setDebugEnabled(enabled: boolean) {
    this.debugEnabled = enabled;
  }

  public updateTextureMap(item: TextureMapItem) {
    const { previewBitmap, ...transferItem } = item;

    const rect = {
      x: item.x,
      y: item.y,
      width: item.width,
      height: item.height,
    };

    this.sources.set(item.id, {
      id: item.id,
      type: item.sourceType,
      rect,
      zIndex: item.zIndex,
      updatedAt: Date.now(),
      previewBitmap,
      debugLabel: item.debugLabel,
    });

    this.logDebug('updateTexture', { id: item.id, rect, type: item.sourceType });

    // Send texture data to worker. Note: ImageBitmap is transferable
    this.worker.postMessage({ type: 'UPDATE_TEXTURE', item: transferItem }, [transferItem.imageBitmap]);
  }

  public updateScroll(offset: ScrollOffset) {
    this.scrollOffset = { ...offset };
    this.worker.postMessage({ type: 'UPDATE_SCROLL', offset: this.scrollOffset });
    this.logDebug('updateScroll', this.scrollOffset);
  }

  public updateScrollArea(id: string, offset: ScrollOffset) {
    const entry = this.scrollAreas.get(id);
    if (entry) {
      entry.offset = { ...offset };
    }
    this.updateScroll(offset);
  }

  public registerMaterial(element: HTMLElement, config: MaterialConfig) {
    if (!this.gl || !element) return;
    const id = element.dataset.lgMaterialId || crypto.randomUUID();
    element.dataset.lgMaterialId = id;

    this.materials.set(id, { id, element, config: { ...config } });
    this.logDebug('registerMaterial', { id, config });
  }

  public unregisterMaterial(element: HTMLElement) {
    const id = element.dataset.lgMaterialId;
    if (!id) return;
    this.materials.delete(id);
    this.logDebug('unregisterMaterial', id);
  }

  public registerSource(id: string, type: BackdropSourceType, debugLabel?: string) {
    this.sources.set(id, {
      id,
      type,
      rect: { x: 0, y: 0, width: 0, height: 0 },
      zIndex: 0,
      updatedAt: Date.now(),
      debugLabel,
    });
    this.logDebug('registerSource', { id, type, debugLabel });
  }

  public unregisterSource(id: string) {
    this.sources.delete(id);
    this.logDebug('unregisterSource', id);
  }

  public registerScrollArea(id: string, element: HTMLElement) {
    this.scrollAreas.set(id, { id, element, offset: { x: 0, y: 0 } });
    this.logDebug('registerScrollArea', { id });
  }

  public unregisterScrollArea(id: string) {
    this.scrollAreas.delete(id);
    this.logDebug('unregisterScrollArea', { id });
  }

  public triggerRipple(event: ClickEvent) {
    if (!this.gl) return;
    console.debug('Trigger ripple', event);
  }

  public getDebugSnapshot(): DebugSnapshot {
    const materials: MaterialSnapshot[] = [];
    this.materials.forEach((value) => {
      const rect = value.element.getBoundingClientRect();
      materials.push({
        id: value.id,
        config: value.config,
        rect: {
          x: rect.left,
          y: rect.top,
          width: rect.width,
          height: rect.height,
        },
      });
    });

    const scrollAreas: ScrollAreaSnapshot[] = [];
    this.scrollAreas.forEach((area) => {
      scrollAreas.push({ id: area.id, offset: { ...area.offset } });
    });

    return {
      debugEnabled: this.debugEnabled,
      sources: Array.from(this.sources.values()),
      materials,
      scrollAreas,
      scrollOffset: { ...this.scrollOffset },
    };
  }

  public destroy() {
    this.worker.terminate();
  }
}
