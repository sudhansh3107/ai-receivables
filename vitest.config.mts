import { defineConfig } from "vitest/config";
import path from "node:path";
import { fileURLToPath } from "node:url";

const rootDir = path.dirname(fileURLToPath(import.meta.url));

// Minimal Vitest setup — scoped to this repo's existing conventions only:
// the same "@/*" -> "./*" path alias tsconfig.json already declares, and
// a plain Node environment (no jsdom/browser globals needed — every test
// target here is server-side business logic, not React components).
export default defineConfig({
    test: {
        environment: "node",
        include: ["**/*.test.ts"],
        exclude: ["node_modules/**", ".next/**"],
    },
    resolve: {
        alias: {
            "@": rootDir,
        },
    },
});
