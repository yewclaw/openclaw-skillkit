"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ensureDir = ensureDir;
exports.writeTextFile = writeTextFile;
exports.readTextFile = readTextFile;
exports.exists = exists;
exports.listFilesRecursive = listFilesRecursive;
const promises_1 = require("node:fs/promises");
const path = require("node:path");
async function ensureDir(dirPath) {
    await (0, promises_1.mkdir)(dirPath, { recursive: true });
}
async function writeTextFile(filePath, contents) {
    await ensureDir(path.dirname(filePath));
    await (0, promises_1.writeFile)(filePath, contents, "utf8");
}
async function readTextFile(filePath) {
    return (0, promises_1.readFile)(filePath, "utf8");
}
async function exists(targetPath) {
    try {
        await (0, promises_1.stat)(targetPath);
        return true;
    }
    catch {
        return false;
    }
}
async function listFilesRecursive(rootDir) {
    const results = [];
    async function walk(currentDir, relativeBase) {
        const entries = await (0, promises_1.readdir)(currentDir, { withFileTypes: true });
        for (const entry of entries) {
            const absolutePath = path.join(currentDir, entry.name);
            const relativePath = path.posix.join(relativeBase, entry.name);
            if (entry.isDirectory()) {
                await walk(absolutePath, relativePath);
                continue;
            }
            if (!entry.isFile()) {
                continue;
            }
            const fileStat = await (0, promises_1.stat)(absolutePath);
            results.push({
                absolutePath,
                relativePath,
                size: fileStat.size
            });
        }
    }
    await walk(rootDir, "");
    return results;
}
