interface FakeResource {
  readonly id: number;
  readonly kind: string;
}

/** Recorded fake WebGL call used by deterministic renderer tests. */
export interface FakeGlCall {
  /** WebGL method name. */
  name: string;
  /** Arguments supplied to the method. */
  args: readonly unknown[];
}

/** Minimal deterministic WebGL2 context used by core unit tests. */
export class FakeWebGL2Context {
  readonly VERTEX_SHADER = 0x8b31;
  readonly FRAGMENT_SHADER = 0x8b30;
  readonly COMPILE_STATUS = 0x8b81;
  readonly LINK_STATUS = 0x8b82;
  readonly ARRAY_BUFFER = 0x8892;
  readonly STATIC_DRAW = 0x88e4;
  readonly FLOAT = 0x1406;
  readonly TEXTURE0 = 0x84c0;
  readonly TEXTURE_2D = 0x0de1;
  readonly UNPACK_FLIP_Y_WEBGL = 0x9240;
  readonly TEXTURE_MIN_FILTER = 0x2801;
  readonly TEXTURE_MAG_FILTER = 0x2800;
  readonly TEXTURE_WRAP_S = 0x2802;
  readonly TEXTURE_WRAP_T = 0x2803;
  readonly LINEAR_MIPMAP_LINEAR = 0x2703;
  readonly LINEAR = 0x2601;
  readonly CLAMP_TO_EDGE = 0x812f;
  readonly RGBA = 0x1908;
  readonly UNSIGNED_BYTE = 0x1401;
  readonly COLOR_BUFFER_BIT = 0x4000;
  readonly BLEND = 0x0be2;
  readonly SCISSOR_TEST = 0x0c11;
  readonly ONE = 1;
  readonly ONE_MINUS_SRC_ALPHA = 0x0303;
  readonly TRIANGLE_STRIP = 0x0005;
  readonly NO_ERROR = 0;

  readonly calls: FakeGlCall[] = [];
  shaderCompileSucceeds = true;
  programLinkSucceeds = true;
  errorCode = this.NO_ERROR;
  drawingBufferWidth = 1;
  drawingBufferHeight = 1;

  private nextResourceId = 1;

  private record(name: string, ...args: unknown[]): void {
    this.calls.push({ name, args });
  }

  private resource(kind: string): FakeResource {
    return { id: this.nextResourceId++, kind };
  }

  createShader(type: number): WebGLShader {
    const resource = this.resource('shader');
    this.record('createShader', type, resource);
    return resource as unknown as WebGLShader;
  }

  shaderSource(shader: WebGLShader, source: string): void {
    this.record('shaderSource', shader, source);
  }

  compileShader(shader: WebGLShader): void {
    this.record('compileShader', shader);
  }

  getShaderParameter(shader: WebGLShader, parameter: number): boolean {
    this.record('getShaderParameter', shader, parameter);
    return this.shaderCompileSucceeds;
  }

  getShaderInfoLog(): string {
    return 'fake shader compilation failure';
  }

  deleteShader(shader: WebGLShader): void {
    this.record('deleteShader', shader);
  }

  createProgram(): WebGLProgram {
    const resource = this.resource('program');
    this.record('createProgram', resource);
    return resource as unknown as WebGLProgram;
  }

  attachShader(program: WebGLProgram, shader: WebGLShader): void {
    this.record('attachShader', program, shader);
  }

  linkProgram(program: WebGLProgram): void {
    this.record('linkProgram', program);
  }

  getProgramParameter(program: WebGLProgram, parameter: number): boolean {
    this.record('getProgramParameter', program, parameter);
    return this.programLinkSucceeds;
  }

  getProgramInfoLog(): string {
    return 'fake program link failure';
  }

  deleteProgram(program: WebGLProgram): void {
    this.record('deleteProgram', program);
  }

  useProgram(program: WebGLProgram | null): void {
    this.record('useProgram', program);
  }

  getUniformLocation(_program: WebGLProgram, name: string): WebGLUniformLocation {
    return { name } as unknown as WebGLUniformLocation;
  }

  uniformMatrix4fv(...args: unknown[]): void {
    this.record('uniformMatrix4fv', ...args);
  }

  uniform1i(...args: unknown[]): void {
    this.record('uniform1i', ...args);
  }

  uniform1f(...args: unknown[]): void {
    this.record('uniform1f', ...args);
  }

  uniform2f(...args: unknown[]): void {
    this.record('uniform2f', ...args);
  }

  uniform4f(...args: unknown[]): void {
    this.record('uniform4f', ...args);
  }

  createVertexArray(): WebGLVertexArrayObject {
    const resource = this.resource('vertex-array');
    this.record('createVertexArray', resource);
    return resource as unknown as WebGLVertexArrayObject;
  }

  bindVertexArray(vertexArray: WebGLVertexArrayObject | null): void {
    this.record('bindVertexArray', vertexArray);
  }

  deleteVertexArray(vertexArray: WebGLVertexArrayObject): void {
    this.record('deleteVertexArray', vertexArray);
  }

  createBuffer(): WebGLBuffer {
    const resource = this.resource('buffer');
    this.record('createBuffer', resource);
    return resource as unknown as WebGLBuffer;
  }

  bindBuffer(...args: unknown[]): void {
    this.record('bindBuffer', ...args);
  }

  bufferData(...args: unknown[]): void {
    this.record('bufferData', ...args);
  }

  deleteBuffer(buffer: WebGLBuffer): void {
    this.record('deleteBuffer', buffer);
  }

  getAttribLocation(_program: WebGLProgram, name: string): number {
    return name === 'aVertexPosition' ? 0 : 1;
  }

  enableVertexAttribArray(...args: unknown[]): void {
    this.record('enableVertexAttribArray', ...args);
  }

  vertexAttribPointer(...args: unknown[]): void {
    this.record('vertexAttribPointer', ...args);
  }

  createTexture(): WebGLTexture {
    const resource = this.resource('texture');
    this.record('createTexture', resource);
    return resource as unknown as WebGLTexture;
  }

  activeTexture(...args: unknown[]): void {
    this.record('activeTexture', ...args);
  }

  bindTexture(...args: unknown[]): void {
    this.record('bindTexture', ...args);
  }

  pixelStorei(...args: unknown[]): void {
    this.record('pixelStorei', ...args);
  }

  texParameteri(...args: unknown[]): void {
    this.record('texParameteri', ...args);
  }

  texImage2D(...args: unknown[]): void {
    this.record('texImage2D', ...args);
  }

  generateMipmap(...args: unknown[]): void {
    this.record('generateMipmap', ...args);
  }

  deleteTexture(texture: WebGLTexture): void {
    this.record('deleteTexture', texture);
  }

  viewport(...args: unknown[]): void {
    this.record('viewport', ...args);
  }

  disable(...args: unknown[]): void {
    this.record('disable', ...args);
  }

  enable(...args: unknown[]): void {
    this.record('enable', ...args);
  }

  clearColor(...args: unknown[]): void {
    this.record('clearColor', ...args);
  }

  clear(...args: unknown[]): void {
    this.record('clear', ...args);
  }

  blendFunc(...args: unknown[]): void {
    this.record('blendFunc', ...args);
  }

  scissor(...args: unknown[]): void {
    this.record('scissor', ...args);
  }

  drawArrays(...args: unknown[]): void {
    this.record('drawArrays', ...args);
  }

  readPixels(
    _x: number,
    _y: number,
    _width: number,
    _height: number,
    _format: number,
    _type: number,
    pixels: Uint8Array,
  ): void {
    pixels.fill(7);
    this.record('readPixels', pixels.length);
  }

  getError(): number {
    this.record('getError');
    return this.errorCode;
  }
}

/** Minimal 2D context recorder used by custom-backdrop tests. */
export class FakeCanvas2DContext {
  readonly calls: FakeGlCall[] = [];

  setTransform(...args: unknown[]): void {
    this.calls.push({ name: 'setTransform', args });
  }

  fillRect(...args: unknown[]): void {
    this.calls.push({ name: 'fillRect', args });
  }

  clearRect(...args: unknown[]): void {
    this.calls.push({ name: 'clearRect', args });
  }

  drawImage(...args: unknown[]): void {
    this.calls.push({ name: 'drawImage', args });
  }
}

/** Canvas test double supporting WebGL, 2D drawing, and context events. */
export class FakeCanvas {
  readonly gl = new FakeWebGL2Context();
  readonly context2d = new FakeCanvas2DContext();
  readonly dataset: Record<string, string> = {};
  readonly style: Record<string, string> = {};
  className = '';
  clientWidth = 1;
  clientHeight = 1;
  parentNode: unknown = null;

  private canvasWidth = 1;
  private canvasHeight = 1;
  private readonly attributes = new Map<string, string>();
  private readonly listeners = new Map<string, Set<EventListener>>();

  get width(): number {
    return this.canvasWidth;
  }

  set width(value: number) {
    this.canvasWidth = value;
    this.gl.drawingBufferWidth = value;
  }

  get height(): number {
    return this.canvasHeight;
  }

  set height(value: number) {
    this.canvasHeight = value;
    this.gl.drawingBufferHeight = value;
  }

  getContext(contextId: string): WebGL2RenderingContext | FakeCanvas2DContext | null {
    if (contextId === 'webgl2') {
      return this.gl as unknown as WebGL2RenderingContext;
    }
    if (contextId === '2d') {
      return this.context2d;
    }
    return null;
  }

  setAttribute(name: string, value: string): void {
    this.attributes.set(name, value);
  }

  getAttribute(name: string): string | null {
    return this.attributes.get(name) ?? null;
  }

  addEventListener(type: string, listener: EventListener): void {
    const listeners = this.listeners.get(type) ?? new Set<EventListener>();
    listeners.add(listener);
    this.listeners.set(type, listeners);
  }

  removeEventListener(type: string, listener: EventListener): void {
    this.listeners.get(type)?.delete(listener);
  }

  dispatch(type: string, event: Event): void {
    for (const listener of this.listeners.get(type) ?? []) {
      listener(event);
    }
  }
}

/** Return every recorded call with a given method name. */
export function callsNamed(
  context: FakeWebGL2Context,
  name: string,
): FakeGlCall[] {
  return context.calls.filter((call) => call.name === name);
}
