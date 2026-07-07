import '@testing-library/jest-dom/vitest';
import { afterEach } from 'vitest';

import { resetStores } from './utils';

// jsdom doesn't implement scrollIntoView, which the chat auto-scroll calls.
Element.prototype.scrollIntoView = () => {};

// Keep the persisted Zustand stores (auth, lang) from leaking between tests.
afterEach(() => {
  resetStores();
});
