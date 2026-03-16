"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createSkillArchive = createSkillArchive;
const promises_1 = require("node:fs/promises");
const path = require("node:path");
const promises_2 = require("node:fs/promises");
const fs_1 = require("./fs");
const crcTable = createCrcTable();
async function createSkillArchive(sourceDir, destinationFile) {
    const files = await (0, fs_1.listFilesRecursive)(sourceDir);
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
    const centralDirectoryStart = offset;
    for (const entry of entries) {
        const centralHeader = makeCentralDirectoryHeader(entry.name, entry.crc32, entry.data.length, entry.offset);
        chunks.push(centralHeader);
        offset += centralHeader.length;
    }
    const centralDirectorySize = offset - centralDirectoryStart;
    chunks.push(makeEndOfCentralDirectoryRecord(entries.length, centralDirectorySize, centralDirectoryStart));
    await (0, promises_2.writeFile)(destinationFile, Buffer.concat(chunks));
    return entries.length;
}
function normalizeArchivePath(relativePath) {
    return relativePath.split(path.sep).join("/");
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
