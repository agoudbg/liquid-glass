self.onmessage = (e) => {
  const { type, item } = e.data;

  if (type === 'UPDATE_TEXTURE') {
    // Handle texture update
    // In a real implementation, we would draw this onto an OffscreenCanvas
    console.log('Worker received texture update', item);

    // Example:
    // const offscreen = new OffscreenCanvas(width, height);
    // const ctx = offscreen.getContext('2d');
    // ctx.drawImage(item.imageBitmap, item.x, item.y);

    // Send back result if needed
  }
};
