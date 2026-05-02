import tseslint from "@typescript-eslint/eslint-plugin";
import tsparser from "@typescript-eslint/parser";
import nextConfig from "eslint-config-next";

const eslintConfig = [
  {
    ignores: [
      "node_modules/**",
      ".next/**",
      "scripts/**",
      "*.js",
      "*.mjs",
      "next-env.d.ts",
    ],
  },
  ...nextConfig,
  {
    plugins: {
      "@typescript-eslint": tseslint,
    },
    languageOptions: {
      parser: tsparser,
    },
    rules: {
      "@next/next/no-html-link-for-pages": "off",
      "react/jsx-key": "off",
      "react/display-name": "off",
      "import/no-named-as-default-member": "off",
      "react/react-in-jsx-scope": "off",
      "@typescript-eslint/ban-ts-comment": [
        "error",
        { "ts-ignore": "allow-with-description" },
      ],
      "jsx-a11y/no-static-element-interactions": "off",
      "jsx-a11y/click-events-have-key-events": "off",
      "jsx-a11y/no-noninteractive-element-interactions": "off",
      "jsx-a11y/no-noninteractive-tabindex": "off",
      "jsx-a11y/media-has-caption": "off",
      "jsx-a11y/anchor-is-valid": "off",
      "jsx-a11y/heading-has-content": "off",
      "@typescript-eslint/no-empty-object-type": "off",
      "react/no-unescaped-entities": "off",
      "no-console": "warn",
      "import/order": [
        "error",
        {
          groups: [
            ["builtin", "external"],
            ["internal", "parent", "sibling", "index"],
          ],
          pathGroups: [
            {
              pattern: "react",
              group: "builtin",
              position: "before",
            },
            {
              pattern: "next/**",
              group: "builtin",
              position: "before",
            },
            {
              pattern: "@/**",
              group: "internal",
              position: "after",
            },
          ],
          pathGroupsExcludedImportTypes: ["builtin"],
          "newlines-between": "always",
          alphabetize: {
            order: "asc",
            caseInsensitive: true,
          },
        },
      ],
    },
  },
];

export default eslintConfig;
