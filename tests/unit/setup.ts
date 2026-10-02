const testNavigator = typeof navigator === 'undefined' ? {} : navigator;

if (typeof navigator === 'undefined') {
  Object.defineProperty(globalThis, 'navigator', {
    configurable: true,
    value: testNavigator
  });
}

Object.defineProperty(testNavigator, 'language', {
  configurable: true,
  value: 'zh-CN'
});
