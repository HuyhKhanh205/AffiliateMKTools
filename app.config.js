// Extends app.json. EXPO_BASE_URL serves the web build from a sub-path,
// e.g. EXPO_BASE_URL=/AffiliateMKTools for https://<user>.github.io/AffiliateMKTools
module.exports = ({ config }) => ({
  ...config,
  experiments: {
    ...config.experiments,
    ...(process.env.EXPO_BASE_URL ? { baseUrl: process.env.EXPO_BASE_URL } : {}),
  },
});
