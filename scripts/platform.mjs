// Native packaging only: each VSIX is built and smoke-tested on its target OS.
export function getPlatform(platform = process.platform, arch = process.arch,
    glibc = process.report?.getReport().header.glibcVersionRuntime) {
    if (arch === "x64" && platform === "win32") {
        return { target: "windows-x86_64", vsceTarget: "win32-x64", binary: "ond-lsp.exe" };
    }
    if (arch === "x64" && platform === "linux" && glibc) {
        return { target: "linux-x86_64", vsceTarget: "linux-x64", binary: "ond-lsp" };
    }
    throw new Error(`Unsupported packaging host: ${platform}-${arch}. Use Windows x64 or Linux x64 (glibc).`);
}
