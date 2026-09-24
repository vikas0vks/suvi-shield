(() => {
  const marker = Symbol.for('aegis.fingerprintDefense');
  const markedWindow = window as Window & { [marker]?: boolean };
  if (markedWindow[marker]) return;
  markedWindow[marker] = true;

  let seed = 0x811c9dc5;
  for (const character of location.hostname) {
    seed ^= character.charCodeAt(0);
    seed = Math.imul(seed, 0x01000193);
  }

  const defineGetter = (object: object, property: string, value: unknown): void => {
    const descriptor = Object.getOwnPropertyDescriptor(object, property);
    if (descriptor?.configurable === false) return;
    Object.defineProperty(object, property, { configurable: true, enumerable: descriptor?.enumerable ?? true, get: () => value });
  };

  defineGetter(Navigator.prototype, 'hardwareConcurrency', 4);
  if ('deviceMemory' in navigator) defineGetter(Navigator.prototype, 'deviceMemory', 8);

  const nativeGetImageData = CanvasRenderingContext2D.prototype.getImageData;
  CanvasRenderingContext2D.prototype.getImageData = function (...args) {
    const image = Reflect.apply(nativeGetImageData, this, args);
    const stride = Math.max(4, Math.floor(image.data.length / 32));
    for (let index = seed % stride; index < image.data.length; index += stride) {
      image.data[index] = (image.data[index] ?? 0) ^ 1;
    }
    return image;
  };

  const patchWebGl = (prototype: typeof WebGLRenderingContext.prototype): void => {
    const nativeGetParameter = prototype.getParameter;
    prototype.getParameter = function (parameter: number) {
      if (parameter === 37445) return 'Aegis';
      if (parameter === 37446) return 'Generic GPU';
      return Reflect.apply(nativeGetParameter, this, [parameter]);
    };
  };
  patchWebGl(WebGLRenderingContext.prototype);
  if (typeof WebGL2RenderingContext !== 'undefined') patchWebGl(WebGL2RenderingContext.prototype);
})();
