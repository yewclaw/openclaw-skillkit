"use strict";

const fs = require("node:fs/promises");
const path = require("node:path");
const os = require("node:os");

const fixturesRoot = path.resolve(__dirname, "..", "fixtures");

async function makeTempDir(prefix = "skillforge-") {
  return fs.mkdtemp(path.join(os.tmpdir(), prefix));
}

async function copyFixture(relativePath, destinationDir) {
  const sourceDir = path.join(fixturesRoot, relativePath);
  await fs.cp(sourceDir, destinationDir, { recursive: true });
  return destinationDir;
}

async function readArchiveEntries(archivePath) {
  const buffer = await fs.readFile(archivePath);
  const entries = [];
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

    entries.push(buffer.toString("utf8", fileNameStart, fileNameEnd));
    offset = fileNameEnd + extraFieldLength + compressedSize;
  }

  return entries;
}

async function readArchiveEntry(archivePath, entryName) {
  const buffer = await fs.readFile(archivePath);
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
      return buffer.toString("utf8", dataStart, dataEnd);
    }

    offset = dataEnd;
  }

  throw new Error(`Archive entry not found: ${entryName}`);
}

module.exports = {
  copyFixture,
  fixturesRoot,
  makeTempDir,
  readArchiveEntries,
  readArchiveEntry
};
