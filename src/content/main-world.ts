import { installSunoFetchObserver } from './main-world-observer';

if (typeof window !== 'undefined' && typeof window.fetch === 'function') {
  installSunoFetchObserver(window);
}
