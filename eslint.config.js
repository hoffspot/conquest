import js from "@eslint/js";
import globals from "globals";

export default [
    {
        // client/vendor holds third-party code (Three.js); a utility's .venv holds Python's (Blender's)
        ignores: ["node_modules/", "test-results/", "playwright-report/", "client/vendor/", "utilities/*/.venv/", "utilities/*/test-results/", "utilities/*/playwright-report/"],
    },
    js.configs.recommended,
    {
        rules: {
            "eqeqeq": "error",
            "no-var": "error",
            "prefer-const": "error",
            "curly": "error",
            "no-unused-vars": ["error", { argsIgnorePattern: "^_" }],
        },
    },
    {
        // The game client runs in the browser
        files: ["client/**/*.js"],
        ignores: ["client/js/core/**"],
        languageOptions: {
            globals: globals.browser,
        },
    },
    {
        files: ["client/sw.js"],
        languageOptions: {
            globals: globals.serviceworker,
        },
    },
    {
        // The simulation core must not depend on the DOM, so that it also runs under Node
        files: ["client/js/core/**/*.js"],
        languageOptions: {
            globals: { ...globals["shared-node-browser"], structuredClone: "readonly" },
        },
    },
    {
        files: ["server/**/*.js", "scripts/**/*.js", "test/**/*.js", "e2e/**/*.js", "*.config.js", "utilities/**/*.js"],
        languageOptions: {
            globals: globals.node,
        },
    },
    {
        // End-to-end tests also contain functions that run inside the browser page, and the
        // utilities' viewers run in it
        files: ["e2e/**/*.js", "utilities/**/*.spec.js", "utilities/*/viewer/viewer.js"],
        languageOptions: {
            globals: globals.browser,
        },
    },
];
