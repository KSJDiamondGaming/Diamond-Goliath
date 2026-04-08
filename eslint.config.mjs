import js from "@eslint/js";
import globals from "globals";

export default [
  {
    ignores: [
      "node_modules/**",
      "dashboard/**",
      "dist/**",
      "coverage/**",
      ".github/**"
    ]
  },
  js.configs.recommended,
  {
    files: ["index.js", "src/**/*.js", "clear-commands.js"],
    languageOptions: {
      ecmaVersion: "latest",
      sourceType: "commonjs",
      globals: {
        ...globals.node
      }
    },
    rules: {
      "no-unused-vars": ["warn", { argsIgnorePattern: "^_" }],
      "no-undef": "error"
    }
  }
];