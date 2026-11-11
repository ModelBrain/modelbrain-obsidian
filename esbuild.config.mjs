import esbuild from "esbuild";
import fs from "node:fs";

const mode = process.argv[2] ?? "dev";

if (mode === "test") {
  fs.rmSync("test-build", { recursive: true, force: true });
  await esbuild.build({
    entryPoints: fs.readdirSync("test").filter((f) => f.endsWith(".test.ts")).map((f) => `test/${f}`),
    bundle: true,
    platform: "node",
    format: "cjs",
    target: "node18",
    outdir: "test-build",
    outExtension: { ".js": ".cjs" },
    logLevel: "warning",
  });
} else {
  const ctx = await esbuild.context({
    entryPoints: ["src/main.ts"],
    bundle: true,
    external: ["obsidian", "electron", "child_process", "fs", "os", "path", "node:*"],
    format: "cjs",
    target: "es2020",
    platform: "node",
    sourcemap: mode === "production" ? false : "inline",
    treeShaking: true,
    outfile: "main.js",
    logLevel: "info",
  });
  if (mode === "production") {
    await ctx.rebuild();
    await ctx.dispose();
  } else {
    await ctx.watch();
  }
}
