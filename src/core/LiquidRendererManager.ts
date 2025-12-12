import {
  ClickEvent, MaterialConfig, ScrollOffset, TextureMapItem,
} from '../types/liquid';
import TextureBuilderWorker from '../workers/TextureBuilderWorker?worker';

export class LiquidRendererManager {
  private worker: Worker;

  private canvas: HTMLCanvasElement | null = null;

  private gl: WebGLRenderingContext | null = null;

  private isSupported: boolean = false;

  private scrollOffset: ScrollOffset = { x: 0, y: 0 };

  constructor() {
    this.worker = new TextureBuilderWorker();
    this.initWorker();
  }

  private initWorker() {
    this.worker.onmessage = (e) => {
      // Handle worker messages (e.g. texture updated)
      console.log('Worker message:', e.data);
    };
  }

  public initRenderer(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    // Initialize WebGL context here
    this.gl = canvas.getContext('webgl');
    if (this.gl) {
      this.isSupported = true;
    }
  }

  public updateTextureMap(item: TextureMapItem) {
    // Send texture data to worker
    // Note: ImageBitmap is transferable
    this.worker.postMessage({ type: 'UPDATE_TEXTURE', item }, [item.imageBitmap]);
  }

  public updateScroll(offset: ScrollOffset) {
    this.scrollOffset = { ...offset };
    this.worker.postMessage({ type: 'UPDATE_SCROLL', offset: this.scrollOffset });
  }

  public registerMaterial(element: HTMLElement, config: MaterialConfig) {
    if (!this.gl || !element) return;
    console.debug('Registering material', { element, config });
  }

  public triggerRipple(event: ClickEvent) {
    if (!this.gl) return;
    console.debug('Trigger ripple', event);
  }

  public destroy() {
    this.worker.terminate();
  }
}
