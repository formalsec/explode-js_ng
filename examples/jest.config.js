module.exports = {
  transform: {
    '^.+\\.js$': 'babel-jest',
  },
  transformIgnorePatterns: [
    'node_modules/(?!(\\@75lb\\/deep-merge|\\@abw\\/badger-database)/)',
  ],
};
