/** Own the optional diagnostic context-loss extension across a loss cycle. */
export class RendererContextLossController {
  private extension: WEBGL_lose_context | null | undefined;

  /** Bind context-loss actions to one private WebGL renderer context. */
  public constructor(private readonly gl: WebGL2RenderingContext) {}

  /** Request context loss when the browser exposes the diagnostic extension. */
  public requestLoss(): boolean {
    const extension = this.getExtension();
    if (!extension) return false;
    extension.loseContext();
    return true;
  }

  /** Restore through the handle cached before the context became unavailable. */
  public requestRestore(): boolean {
    const extension = this.getExtension();
    if (!extension) return false;
    extension.restoreContext();
    return true;
  }

  private getExtension(): WEBGL_lose_context | null {
    if (this.extension === undefined) {
      this.extension = this.gl.getExtension('WEBGL_lose_context');
    }
    return this.extension;
  }
}
