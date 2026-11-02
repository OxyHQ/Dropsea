// Shared Oxy Metro config: see @oxy.so/app-preset/metro.
const { createOxyMetroConfig } = require('@oxy.so/app-preset/metro');

module.exports = createOxyMetroConfig(__dirname, {
  sharedTypesPackage: '@dropsea/shared-types',
});
