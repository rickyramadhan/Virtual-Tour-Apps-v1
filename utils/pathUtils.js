// utils/pathUtils.js
const path = require('path');

const normalizePath = (p) => {
  if (!p) return '';
  return path.normalize(p)
    .replace(/^(\.\.\/|\/|\\)/, '')
    .replace(/\\/g, '/');
};

const getAbsolutePath = (relativePath) => {
  return path.resolve(__dirname, '..', relativePath);
};

module.exports = {
  normalizePath,
  getAbsolutePath
};