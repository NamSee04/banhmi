import tseslint from "typescript-eslint";
import reactHooks from "eslint-plugin-react-hooks";

export default tseslint.config(
  ...tseslint.configs.recommended,
  {
    plugins: { "react-hooks": reactHooks },
    rules: { ...reactHooks.configs.recommended.rules },
  },
  {
    rules: {
      // tsconfig already enforces via noUnusedLocals/noUnusedParameters
      "@typescript-eslint/no-unused-vars": "off",
      // codebase uses 'as X' patterns intentionally
      "@typescript-eslint/consistent-type-assertions": "off",
    },
  },
  {
    ignores: ["dist/**", "postcss.config.js", "tailwind.config.js"],
  },
);
