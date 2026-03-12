// Shim for react-dom/client in React Native
module.exports = {
  createRoot() { return { render() {}, unmount() {} }; },
  hydrateRoot() { return { render() {}, unmount() {} }; },
};
