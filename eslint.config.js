import js from "@eslint/js";
import globals from "globals";

export default [
    {
        // client/vendor holds third-party code (Three.js)
        ignores: ["node_modules/", "test-results/", "playwright-report/", "client/vendor/"],
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
        files: ["server/**/*.js", "scripts/**/*.js", "test/**/*.js", "e2e/**/*.js", "*.config.js"],
        languageOptions: {
            globals: globals.node,
        },
    },
    {
        // End-to-end tests also contain functions that run inside the browser page
        files: ["e2e/**/*.js"],
        languageOptions: {
            globals: globals.browser,
        },
    },
];
