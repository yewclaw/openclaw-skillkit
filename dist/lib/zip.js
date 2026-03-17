"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.createSkillArchive = createSkillArchive;
exports.readArchiveManifest = readArchiveManifest;
exports.readArchiveEntryText = readArchiveEntryText;
exports.readArchiveEntryBuffer = readArchiveEntryBuffer;
const node_crypto_1 = require("node:crypto");
const promises_1 = require("node:fs/promises");
const node_path_1 = __importDefault(require("node:path"));
const promises_2 = require("node:fs/promises");
const fs_1 = require("./fs");
const frontmatter_1 = require("./frontmatter");
const crcTable = createCrcTable();
const PACK_MANIFEST_PATH = ".openclaw-skillkit/manifest.json";
async function createSkillArchive(sourceDir, destinationFile) {
    const files = (await (0, fs_1.listFilesRecursive)(sourceDir))
        .filter((file) => !file.relativePath.endsWith(".skill"))
        .sort(compareArchiveEntries);
    const packagedEntries = files.map((file) => normalizeArchivePath(file.relativePath));
    const manifest = await buildArchiveManifest(sourceDir, files);
    const manifestBuffer = Buffer.from(JSON.stringify(manifest, null, 2), "utf8");
    const chunks = [];
    const entries = [];
    let offset = 0;
    for (const file of files) {
        const data = await (0, promises_1.readFile)(file.absolutePath);
        const name = normalizeArchivePath(file.relativePath);
        const crc32 = crc32Buffer(data);
        const localHeader = makeLocalFileHeader(name, crc32, data.length);
        const headerOffset = offset;
        chunks.push(localHeader, data);
        offset += localHeader.length + data.length;
        entries.push({
            name,
            data,
            crc32,
            offset: headerOffset
        });
    }
    offset = appendEntry(chunks, entries, offset, PACK_MANIFEST_PATH, manifestBuffer);
    const centralDirectoryStart = offset;
    for (const entry of entries) {
        const centralHeader = makeCentralDirectoryHeader(entry.name, entry.crc32, entry.data.length, entry.offset);
        chunks.push(centralHeader);
        offset += centralHeader.length;
    }
    const centralDirectorySize = offset - centralDirectoryStart;
    chunks.push(makeEndOfCentralDirectoryRecord(entries.length, centralDirectorySize, centralDirectoryStart));
    await (0, promises_2.writeFile)(destinationFile, Buffer.concat(chunks));
    return {
        fileCount: entries.length,
        packagedEntries,
        manifest
    };
}
async function readArchiveManifest(archivePath) {
    const manifest = (await readArchiveEntryBuffer(archivePath, PACK_MANIFEST_PATH)).toString("utf8");
    return JSON.parse(manifest);
}
async function readArchiveEntryText(archivePath, entryName) {
    return (await readArchiveEntryBuffer(archivePath, entryName)).toString("utf8");
}
function compareArchiveEntries(left, right) {
    if (left.relativePath === "SKILL.md") {
        return right.relativePath === "SKILL.md" ? 0 : -1;
    }
    if (right.relativePath === "SKILL.md") {
        return 1;
    }
    return left.relativePath.localeCompare(right.relativePath);
}
function normalizeArchivePath(relativePath) {
    return relativePath.split(node_path_1.default.sep).join("/");
}
async function buildArchiveManifest(sourceDir, files) {
    const skillMarkdown = await (0, promises_1.readFile)(node_path_1.default.join(sourceDir, "SKILL.md"), "utf8");
    const parsed = (0, frontmatter_1.parseFrontmatter)(skillMarkdown);
    const entries = await Promise.all(files.map(async (file) => ({
        path: normalizeArchivePath(file.relativePath),
        size: file.size,
        sha256: hashBuffer(await (0, promises_1.readFile)(file.absolutePath))
    })));
    return {
        schemaVersion: 2,
        packagedAt: new Date().toISOString(),
        sourceDir: node_path_1.default.basename(sourceDir),
        skill: {
            name: parsed.attributes.name ?? node_path_1.default.basename(sourceDir),
            description: parsed.attributes.description ?? "",
            version: parsed.attributes.version ?? ""
        },
        entryCount: files.length,
        totalBytes: files.reduce((total, file) => total + file.size, 0),
        entries
    };
}
function hashBuffer(buffer) {
    return (0, node_crypto_1.createHash)("sha256").update(buffer).digest("hex");
}
async function readArchiveEntryBuffer(archivePath, entryName) {
    const buffer = await (0, promises_1.readFile)(archivePath);
    let offset = 0;
    while (offset + 30 <= buffer.length) {
        const signature = buffer.readUInt32LE(offset);
        if (signature !== 0x04034b50) {
            break;
        }
        const compressedSize = buffer.readUInt32LE(offset + 18);
        const fileNameLength = buffer.readUInt16LE(offset + 26);
        const extraFieldLength = buffer.readUInt16LE(offset + 28);
        const fileNameStart = offset + 30;
        const fileNameEnd = fileNameStart + fileNameLength;
        const currentEntryName = buffer.toString("utf8", fileNameStart, fileNameEnd);
        const dataStart = fileNameEnd + extraFieldLength;
        const dataEnd = dataStart + compressedSize;
        if (currentEntryName === entryName) {
            return buffer.subarray(dataStart, dataEnd);
        }
        offset = dataEnd;
    }
    throw new Error(`Archive entry not found: ${entryName}`);
}
function makeLocalFileHeader(name, crc32, size) {
    const nameBuffer = Buffer.from(name, "utf8");
    const header = Buffer.alloc(30 + nameBuffer.length);
    header.writeUInt32LE(0x04034b50, 0);
    header.writeUInt16LE(20, 4);
    header.writeUInt16LE(0, 6);
    header.writeUInt16LE(0, 8);
    header.writeUInt16LE(0, 10);
    header.writeUInt16LE(0, 12);
    header.writeUInt32LE(crc32 >>> 0, 14);
    header.writeUInt32LE(size, 18);
    header.writeUInt32LE(size, 22);
    header.writeUInt16LE(nameBuffer.length, 26);
    header.writeUInt16LE(0, 28);
    nameBuffer.copy(header, 30);
    return header;
}
function appendEntry(chunks, entries, offset, name, data) {
    const crc32 = crc32Buffer(data);
    const localHeader = makeLocalFileHeader(name, crc32, data.length);
    const headerOffset = offset;
    chunks.push(localHeader, data);
    entries.push({
        name,
        data,
        crc32,
        offset: headerOffset
    });
    return offset + localHeader.length + data.length;
}
function makeCentralDirectoryHeader(name, crc32, size, offset) {
    const nameBuffer = Buffer.from(name, "utf8");
    const header = Buffer.alloc(46 + nameBuffer.length);
    header.writeUInt32LE(0x02014b50, 0);
    header.writeUInt16LE(20, 4);
    header.writeUInt16LE(20, 6);
    header.writeUInt16LE(0, 8);
    header.writeUInt16LE(0, 10);
    header.writeUInt16LE(0, 12);
    header.writeUInt16LE(0, 14);
    header.writeUInt32LE(crc32 >>> 0, 16);
    header.writeUInt32LE(size, 20);
    header.writeUInt32LE(size, 24);
    header.writeUInt16LE(nameBuffer.length, 28);
    header.writeUInt16LE(0, 30);
    header.writeUInt16LE(0, 32);
    header.writeUInt16LE(0, 34);
    header.writeUInt16LE(0, 36);
    header.writeUInt32LE(0, 38);
    header.writeUInt32LE(offset, 42);
    nameBuffer.copy(header, 46);
    return header;
}
function makeEndOfCentralDirectoryRecord(entryCount, centralDirectorySize, centralDirectoryOffset) {
    const record = Buffer.alloc(22);
    record.writeUInt32LE(0x06054b50, 0);
    record.writeUInt16LE(0, 4);
    record.writeUInt16LE(0, 6);
    record.writeUInt16LE(entryCount, 8);
    record.writeUInt16LE(entryCount, 10);
    record.writeUInt32LE(centralDirectorySize, 12);
    record.writeUInt32LE(centralDirectoryOffset, 16);
    record.writeUInt16LE(0, 20);
    return record;
}
function crc32Buffer(buffer) {
    let crc = 0xffffffff;
    for (const byte of buffer) {
        crc = (crc >>> 8) ^ crcTable[(crc ^ byte) & 0xff];
    }
    return (crc ^ 0xffffffff) >>> 0;
}
function createCrcTable() {
    const table = new Uint32Array(256);
    for (let index = 0; index < 256; index += 1) {
        let value = index;
        for (let bit = 0; bit < 8; bit += 1) {
            value = (value & 1) !== 0 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
        }
        table[index] = value >>> 0;
    }
    return table;
}
