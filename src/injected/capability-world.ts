(() => {
  const marker = Symbol.for('aegis.capabilityLockdown');
  const markedWindow = window as Window & { [marker]?: boolean };
  if (markedWindow[marker]) return;
  markedWindow[marker] = true;

  const denied = (capability: string): DOMException => new DOMException(`Suvi Shield blocked ${capability}`, 'NotAllowedError');
  const reject = (capability: string) => (): Promise<never> => Promise.reject(denied(capability));
  const lock = (target: object | undefined, key: PropertyKey, value: unknown): void => {
    if (!target) return;
    try {
      Object.defineProperty(target, key, { configurable: false, writable: false, value });
    } catch {
      // Browser-owned prototypes can be non-configurable; network enforcement remains active.
    }
  };

  if ('Notification' in window) lock(Notification, 'requestPermission', () => Promise.resolve('denied' as NotificationPermission));
  if ('ServiceWorkerContainer' in window) lock(ServiceWorkerContainer.prototype, 'register', reject('service-worker registration'));
  lock(Navigator.prototype, 'registerProtocolHandler', () => { throw denied('protocol-handler registration'); });
  lock(Navigator.prototype, 'sendBeacon', () => false);

  if ('Clipboard' in window) {
    for (const method of ['read', 'readText', 'write', 'writeText']) lock(Clipboard.prototype, method, reject(`clipboard ${method}`));
  }
  if ('MediaDevices' in window) {
    lock(MediaDevices.prototype, 'getUserMedia', reject('camera or microphone access'));
    lock(MediaDevices.prototype, 'getDisplayMedia', reject('screen capture'));
  }

  const permissionError = { code: 1, message: 'Suvi Shield denied geolocation', PERMISSION_DENIED: 1, POSITION_UNAVAILABLE: 2, TIMEOUT: 3 };
  if ('Geolocation' in window) {
    lock(Geolocation.prototype, 'getCurrentPosition', (_success: PositionCallback, error?: PositionErrorCallback | null) => {
      queueMicrotask(() => error?.(permissionError as GeolocationPositionError));
    });
    lock(Geolocation.prototype, 'watchPosition', (_success: PositionCallback, error?: PositionErrorCallback | null) => {
      queueMicrotask(() => error?.(permissionError as GeolocationPositionError));
      return -1;
    });
  }

  lock(Element.prototype, 'requestFullscreen', reject('fullscreen'));
  lock(Element.prototype, 'requestPointerLock', () => undefined);
  lock(Document.prototype, 'requestStorageAccess', reject('third-party storage access'));

  const globals = globalThis as typeof globalThis & {
    PaymentRequest?: { prototype: object };
    Bluetooth?: { prototype: object };
    USB?: { prototype: object };
    Serial?: { prototype: object };
    HID?: { prototype: object };
  };
  lock(globals.PaymentRequest?.prototype, 'show', reject('payment requests'));
  lock(globals.Bluetooth?.prototype, 'requestDevice', reject('Bluetooth access'));
  lock(globals.USB?.prototype, 'requestDevice', reject('USB access'));
  lock(globals.Serial?.prototype, 'requestPort', reject('serial-port access'));
  lock(globals.HID?.prototype, 'requestDevice', reject('HID access'));
})();
