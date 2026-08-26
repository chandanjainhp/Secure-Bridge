import js from "@eslint/js";
import globals from "globals";

export default [
  {
    ignores: ["logs/**", "fhe/**"],
  },
  {
    files: ["src/**/*.js"],
    ...js.configs.recommended,
    languageOptions: {
      globals: { ...globals.node, ...globals.es2021 },
    },
    rules: {
      "no-unused-vars": "off",
      "no-undef": "error",
    },
  },
  {
    files: ["src/tests/**/*.js"],
    languageOptions: {
      globals: {
        ...globals.node,
        ...globals.es2021,
        describe: "readonly",
        it: "readonly",
        expect: "readonly",
        beforeEach: "readonly",
        afterEach: "readonly",
        beforeAll: "readonly",
        afterAll: "readonly",
        jest: "readonly",
      },
    },
  },
];
