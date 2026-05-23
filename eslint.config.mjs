import nextCoreWebVitals from "eslint-config-next/core-web-vitals";
import nextTypescript from "eslint-config-next/typescript";

// Previously this config disabled almost every rule (including no-explicit-any,
// no-unused-vars, react-hooks/exhaustive-deps, prefer-const, no-undef). That
// made `bun run lint` effectively a no-op. We now keep the Next.js defaults
// and only document explicit, narrow overrides below.
//
// Strategy:
//   - `no-explicit-any` -> warn (not error): the codebase has ~50 legacy
//     `any` sites; each requires real typing work (see Phase 5 aspirational
//     target of <= 3). Lint should surface them but not block CI.
//   - `no-unused-vars` -> allow `_`-prefixed names so we can preserve handler
//     signatures (`(_request: NextRequest, …)`).
//   - `react-hooks/purity` is a newer Next 16 rule that flags computed
//     constants as "could change every render". Useful guidance, not a bug;
//     keep off to avoid flooding warnings.

const eslintConfig = [
  ...nextCoreWebVitals,
  ...nextTypescript,
  {
    rules: {
      // App uses <img> intentionally in a few places where next/image is overkill
      // (e.g. inline remote VCS-provider logos). Keep off.
      "@next/next/no-img-element": "off",

      // See note above — surface, don't fail.
      "@typescript-eslint/no-explicit-any": "warn",

      // Allow underscore-prefixed unused (common pattern for required-by-signature params).
      "@typescript-eslint/no-unused-vars": [
        "warn",
        {
          argsIgnorePattern: "^_",
          varsIgnorePattern: "^_",
          caughtErrorsIgnorePattern: "^_",
        },
      ],

      // Newer Next 16 rule that warns when a computed constant could change
      // render-to-render. Useful guidance but very noisy; off.
      "react-hooks/purity": "off",
    },
  },
  {
    ignores: [
      "node_modules/**",
      ".next/**",
      "out/**",
      "build/**",
      "next-env.d.ts",
      "examples/**",
      "skills/**",
      "mini-services/**",
      "scripts/**",
      // Integration tests rely on a running :3000 stack and use lots of `any`
      // for HTTP response shapes. They are slated for the Phase 10 split into
      // __tests__/integration/**; ignore them for now.
      "__tests__/integration/**",
    ],
  },
];

export default eslintConfig;
