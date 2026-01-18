/**
 * Global test setup file for Vitest
 *
 * This file runs before each test file to set up the testing environment.
 */

import { vi } from 'vitest';

// Mock window.matchMedia for tests that use responsive design features
Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: vi.fn().mockImplementation((query) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: vi.fn(), // deprecated
    removeListener: vi.fn(), // deprecated
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  })),
});

// Mock ResizeObserver for tests that need it
class MockResizeObserver {
  observe = vi.fn();

  unobserve = vi.fn();

  disconnect = vi.fn();
}
Object.defineProperty(window, 'ResizeObserver', {
  writable: true,
  value: MockResizeObserver,
});

// Mock IntersectionObserver for visibility culling tests
class MockIntersectionObserver {
  constructor(private callback: IntersectionObserverCallback) {}

  observe = vi.fn();

  unobserve = vi.fn();

  disconnect = vi.fn();

  // Helper to trigger intersection
  triggerIntersection(entries: Partial<IntersectionObserverEntry>[]) {
    this.callback(entries as IntersectionObserverEntry[], this as unknown as IntersectionObserver);
  }
}
Object.defineProperty(window, 'IntersectionObserver', {
  writable: true,
  value: MockIntersectionObserver,
});

// Mock requestAnimationFrame for animation tests
let rafId = 0;
Object.defineProperty(window, 'requestAnimationFrame', {
  writable: true,
  value: vi.fn((callback: FrameRequestCallback) => {
    rafId += 1;
    setTimeout(() => callback(performance.now()), 16);
    return rafId;
  }),
});

Object.defineProperty(window, 'cancelAnimationFrame', {
  writable: true,
  value: vi.fn((id: number) => {
    clearTimeout(id);
  }),
});

// Mock WebGL2RenderingContext for shader tests
// Note: Full WebGL testing requires a headless GPU context (e.g., headless Chrome)
// This mock provides basic structure for unit tests
const mockWebGL2Context = {
  createShader: vi.fn(() => ({})),
  shaderSource: vi.fn(),
  compileShader: vi.fn(),
  getShaderParameter: vi.fn(() => true),
  createProgram: vi.fn(() => ({})),
  attachShader: vi.fn(),
  linkProgram: vi.fn(),
  getProgramParameter: vi.fn(() => true),
  useProgram: vi.fn(),
  getUniformLocation: vi.fn(() => ({})),
  getAttribLocation: vi.fn(() => 0),
  createBuffer: vi.fn(() => ({})),
  bindBuffer: vi.fn(),
  bufferData: vi.fn(),
  enableVertexAttribArray: vi.fn(),
  vertexAttribPointer: vi.fn(),
  createTexture: vi.fn(() => ({})),
  bindTexture: vi.fn(),
  texParameteri: vi.fn(),
  texImage2D: vi.fn(),
  generateMipmap: vi.fn(),
  uniform1f: vi.fn(),
  uniform2f: vi.fn(),
  uniform4f: vi.fn(),
  drawArrays: vi.fn(),
  viewport: vi.fn(),
  clearColor: vi.fn(),
  clear: vi.fn(),
  enable: vi.fn(),
  blendFunc: vi.fn(),
  deleteShader: vi.fn(),
  deleteProgram: vi.fn(),
  deleteBuffer: vi.fn(),
  deleteTexture: vi.fn(),
  VERTEX_SHADER: 35633,
  FRAGMENT_SHADER: 35632,
  COMPILE_STATUS: 35713,
  LINK_STATUS: 35714,
  ARRAY_BUFFER: 34962,
  STATIC_DRAW: 35044,
  FLOAT: 5126,
  TEXTURE_2D: 3553,
  TEXTURE_WRAP_S: 10242,
  TEXTURE_WRAP_T: 10243,
  TEXTURE_MIN_FILTER: 10241,
  TEXTURE_MAG_FILTER: 10240,
  CLAMP_TO_EDGE: 33071,
  LINEAR_MIPMAP_LINEAR: 9987,
  LINEAR: 9729,
  RGBA: 6408,
  UNSIGNED_BYTE: 5121,
  TRIANGLES: 4,
  COLOR_BUFFER_BIT: 16384,
  BLEND: 3042,
  ONE: 1,
  ONE_MINUS_SRC_ALPHA: 771,
};

// Mock canvas.getContext to return our mock WebGL context
const originalGetContext = HTMLCanvasElement.prototype.getContext;
HTMLCanvasElement.prototype.getContext = function (
  contextId: string,
  options?: any,
): RenderingContext | null {
  if (contextId === 'webgl2') {
    return mockWebGL2Context as unknown as WebGL2RenderingContext;
  }
  return originalGetContext.call(this, contextId, options);
};
