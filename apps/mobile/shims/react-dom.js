// Shim for react-dom in React Native — @clerk/clerk-js imports it but RN doesn't have it
const React = require('react');
const { unstable_batchedUpdates } = require('react-native');

module.exports = {
  render() {},
  createPortal(children) { return children; },
  flushSync(fn) {
    // Actually flush — this is critical for Clerk state updates
    let result;
    if (unstable_batchedUpdates) {
      unstable_batchedUpdates(() => { result = fn(); });
    } else {
      result = fn();
    }
    return result;
  },
  unstable_batchedUpdates: unstable_batchedUpdates || ((fn) => fn()),
  __SECRET_INTERNALS_DO_NOT_USE_OR_YOU_WILL_BE_FIRED: {
    Events: [],
  },
};
module.exports.default = module.exports;
