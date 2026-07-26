/* global document, navigator, window */
async page => {
  const requiredBrowserArguments = [
    '--enable-automation',
    '--use-gl=angle',
    '--use-angle=swiftshader',
    '--force-color-profile=srgb',
  ];
  const ephemeralBrowserArgumentNames = new Set([
    '--breakpad-dump-location',
    '--crash-dumps-dir',
    '--data-path',
    '--disk-cache-dir',
    '--log-file',
    '--remote-debugging-pipe',
    '--remote-debugging-port',
    '--trace-startup-file',
    '--user-data-dir',
  ]);
  const browser = page.context().browser();
  const browserVersion = browser?.version() ?? 'unknown';
  const cdp = await page.context().newCDPSession(page);
  const [protocol, commandLine] = await Promise.all([
    cdp.send('Browser.getVersion'),
    cdp.send('Browser.getBrowserCommandLine'),
  ]);
  await cdp.detach();
  for (const argument of requiredBrowserArguments) {
    if (!commandLine.arguments.includes(argument)) {
      throw new Error(`Chrome command line is missing ${argument}.`);
    }
  }
  const effectiveBrowserArguments = [...new Set(
    commandLine.arguments.filter((argument) => {
      if (!argument.startsWith('--')) return false;
      const separatorIndex = argument.indexOf('=');
      const name = (
        separatorIndex === -1 ? argument : argument.slice(0, separatorIndex)
      ).toLowerCase();
      return !ephemeralBrowserArgumentNames.has(name);
    }),
  )].sort();

  const pageEnvironment = await page.evaluate(() => {
    const canvas = document.createElement('canvas');
    const context = canvas.getContext('webgl2');
    if (!context) throw new Error('Legacy capture contract requires WebGL2.');
    const debugInfo = context.getExtension('WEBGL_debug_renderer_info');
    const webGlFingerprint = {
      renderer: String(context.getParameter(context.RENDERER)),
      shadingLanguageVersion: String(
        context.getParameter(context.SHADING_LANGUAGE_VERSION),
      ),
      unmaskedRenderer: debugInfo
        ? String(context.getParameter(debugInfo.UNMASKED_RENDERER_WEBGL))
        : 'unavailable',
      unmaskedVendor: debugInfo
        ? String(context.getParameter(debugInfo.UNMASKED_VENDOR_WEBGL))
        : 'unavailable',
      vendor: String(context.getParameter(context.VENDOR)),
      version: String(context.getParameter(context.VERSION)),
    };
    context.getExtension('WEBGL_lose_context')?.loseContext();
    return {
      colorScheme: window.matchMedia('(prefers-color-scheme: dark)').matches
        ? 'dark'
        : 'light',
      devicePixelRatio: window.devicePixelRatio,
      locale: navigator.language,
      reducedMotion: window.matchMedia(
        '(prefers-reduced-motion: reduce)',
      ).matches
        ? 'reduce'
        : 'no-preference',
      timezoneId: Intl.DateTimeFormat().resolvedOptions().timeZone,
      userAgent: navigator.userAgent,
      webGlFingerprint,
    };
  });

  return {
    browserName: 'Google Chrome',
    browserVersion,
    browserArguments: requiredBrowserArguments,
    effectiveBrowserArguments,
    browserProtocol: {
      jsVersion: protocol.jsVersion,
      product: protocol.product,
      protocolVersion: protocol.protocolVersion,
      revision: protocol.revision,
    },
    pageEnvironment,
    viewport: page.viewportSize(),
  };
}
