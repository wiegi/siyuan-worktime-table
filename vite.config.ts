import { defineConfig } from "vite";
import { resolve } from "node:path";
import { cpSync, existsSync } from "node:fs";

// SiYuan loads a CommonJS `index.js` + `index.css` from the plugin root.
export default defineConfig({
  build: {
    outDir: "dist",
    emptyOutDir: true,
    minify: false,
    lib: {
      entry: resolve(__dirname, "src/index.ts"),
      formats: ["cjs"],
      fileName: () => "index.js",
    },
    rollupOptions: {
      external: ["siyuan"],
      output: { entryFileNames: "index.js", assetFileNames: "index.css" },
    },
  },
  plugins: [
    {
      name: "copy-plugin-files",
      closeBundle() {
        for (const f of ["plugin.json", "README.md", "icon.png", "preview.png"]) {
          if (existsSync(f)) cpSync(f, resolve("dist", f));
        }
        cpSync("public/i18n", resolve("dist/i18n"), { recursive: true });
      },
    },
  ],
});
