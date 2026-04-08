const { AsyncLocalStorage } = require('async_hooks');

const asyncLocalStorage = new AsyncLocalStorage();

function getStore() {
  return asyncLocalStorage.getStore();
}

function run(store, fn) {
  return asyncLocalStorage.run(store, fn);
}

module.exports = { asyncLocalStorage, getStore, run };
