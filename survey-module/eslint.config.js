// @ts-check
import { defineConfig } from "eslint/config";
import { includeIgnoreFile } from "@eslint/compat";
import eslint from "@eslint/js";
import tseslint from "typescript-eslint";
import path from "node:path";
import globals from "globals";
import eslintReact from "@eslint-react/eslint-plugin";

export default defineConfig(
  {
    languageOptions: {
      globals: { ...globals.browser, ...globals.node },
    },
  },
  eslint.configs.recommended,
  { files: ["**/*.ts", "**/*.tsx"], extends: tseslint.configs.recommended },
  eslintReact.configs["recommended-typescript"],
  includeIgnoreFile(path.resolve(import.meta.dirname, ".gitignore")),
);
