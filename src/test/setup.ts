import '@testing-library/jest-dom/vitest';
// Initialize the i18next singleton for the whole suite so components that call
// useTranslation resolve real catalog strings (default language 'en') even when
// a test renders them without going through main.tsx / an I18nextProvider.
import '@/lib/i18n';
import { afterAll, afterEach, beforeAll } from 'vitest';
import { cleanup } from '@testing-library/react';
import { server } from './server';

// Pin the timezone so local<->UTC date conversions (DatePicker / dateInputToWire
// / formatDateTime) are deterministic regardless of the machine running tests.
// In UTC, the local wall-clock equals the wire timestamp, so expectations can be
// written against plain ISO strings.
process.env.TZ = 'UTC';

// happy-dom polyfills for Radix UI: in some pointerdown paths, the event
// `target` is an element whose prototype chain doesn't expose pointer-capture
// methods, so Radix Select's onPointerDown handler throws
// "target.hasPointerCapture is not a function". Force these onto Element so
// every element inherits a no-op implementation.
Element.prototype.hasPointerCapture = function () {
  return false;
};
Element.prototype.setPointerCapture = function () {
  return undefined;
};
Element.prototype.releasePointerCapture = function () {
  return undefined;
};

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterEach(() => {
  cleanup();
  server.resetHandlers();
  localStorage.clear();
  sessionStorage.clear();
});
afterAll(() => server.close());
