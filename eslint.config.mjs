// ESLint flat config for the Medhā frontend (zero-dependency vanilla JS).
// Run with: npx eslint frontend
const browserGlobals = {
  window: "readonly",
  document: "readonly",
  navigator: "readonly",
  localStorage: "readonly",
  fetch: "readonly",
  console: "readonly",
  setTimeout: "readonly",
  setInterval: "readonly",
  clearTimeout: "readonly",
  clearInterval: "readonly",
  Blob: "readonly",
  Range: "readonly",
  Highlight: "readonly",
  CSS: "readonly",
  NodeFilter: "readonly",
  SpeechSynthesisUtterance: "readonly",
  CustomEvent: "readonly",
  Number: "readonly",
};

export default [
  {
    files: ["frontend/**/*.js"],
    languageOptions: {
      ecmaVersion: 2023,
      sourceType: "module",
      globals: browserGlobals,
    },
    rules: {
      "no-unused-vars": ["error", { argsIgnorePattern: "^_", caughtErrors: "none" }],
      "no-undef": "error",
      eqeqeq: ["error", "smart"],
      "no-var": "error",
      "prefer-const": "error",
      curly: ["error", "multi-line"],
      "no-implicit-globals": "error",
    },
  },
  {
    // config.js is a classic (non-module) script loaded before the app.
    files: ["frontend/config.js"],
    languageOptions: { sourceType: "script", globals: browserGlobals },
  },
];
