/** Serialize synchronous context renders while retaining one newest follow-up. */
export class ContextRenderReentryController {
  private active = false;
  private pendingRefresh: boolean | null = null;

  /** Run immediately or merge one reentrant request into the next frame. */
  public run(refreshBackdrop: boolean, render: (refresh: boolean) => void): void {
    if (this.active) {
      this.pendingRefresh = (this.pendingRefresh ?? false) || refreshBackdrop;
      return;
    }
    this.active = true;
    let nextRefresh = refreshBackdrop;
    try {
      do {
        this.pendingRefresh = null;
        render(nextRefresh);
        nextRefresh = this.pendingRefresh ?? false;
      } while (this.pendingRefresh !== null);
    } finally {
      this.pendingRefresh = null;
      this.active = false;
    }
  }
}
