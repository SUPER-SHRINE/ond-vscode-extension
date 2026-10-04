import * as esbuild from "esbuild";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const production = process.argv.includes("--production");
const extensionRoot = dirname(fileURLToPath(import.meta.url));

await esbuild.build({
    absWorkingDir: extensionRoot,
    entryPoints: [resolve(extensionRoot, "src", "extension.ts")],
    bundle: true,
    format: "cjs",
    minify: production,
    platform: "node",
    sourcemap: !production,
    sourcesContent: false,
    outfile: resolve(extensionRoot, "dist", "extension.js"),
    external: ["vscode"],
    logLevel: "info"
});
