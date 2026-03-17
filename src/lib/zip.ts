import { readFile } from "node:fs/promises";
import path from "node:path";
import { writeFile } from "node:fs/promises";
import { listFilesRecursive } from "./fs";

const crcTable = createCrcTable();
const PACK_MANIFEST_PATH = ".openclaw-skillkit/manifest.json";

interface ZipEntry {
  name: string;
  data: Buffer;
  crc32: number;
  offset: number;
}

export interface SkillArchiveSummary {
  fileCount: number;
  packagedEntries: string[];
}

export async function createSkillArchive(sourceDir: string, destinationFile: string): Promise<SkillArchiveSummary> {
  const files = (await listFilesRecursive(sourceDir))
    .filter((file) => !file.relativePath.endsWith(".skill"))
    .sort(compareArchiveEntries);
  const packagedEntries = files.map((file) => normalizeArchivePath(file.relativePath));
  const manifestBuffer = Buffer.from(
    JSON.stringify(
      {
        schemaVersion: 1,
        packagedAt: new Date().toISOString(),
        sourceDir: path.basename(sourceDir),
        entries: packagedEntries
      },
      null,
      2
    ),
    "utf8"
  );
  const chunks: Buffer[] = [];
  const entries: ZipEntry[] = [];
  let offset = 0;

  for (const file of files) {
    const data = await readFile(file.absolutePath);
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

  await writeFile(destinationFile, Buffer.concat(chunks));
  return {
    fileCount: entries.length,
    packagedEntries
  };
}

function compareArchiveEntries(
  left: { relativePath: string },
  right: { relativePath: string }
): number {
  if (left.relativePath === "SKILL.md") {
    return right.relativePath === "SKILL.md" ? 0 : -1;
  }

  if (right.relativePath === "SKILL.md") {
    return 1;
  }

  return left.relativePath.localeCompare(right.relativePath);
}

function normalizeArchivePath(relativePath: string): string {
  return relativePath.split(path.sep).join("/");
}

function makeLocalFileHeader(name: string, crc32: number, size: number): Buffer {
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

function appendEntry(chunks: Buffer[], entries: ZipEntry[], offset: number, name: string, data: Buffer): number {
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

function makeCentralDirectoryHeader(name: string, crc32: number, size: number, offset: number): Buffer {
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

function makeEndOfCentralDirectoryRecord(
  entryCount: number,
  centralDirectorySize: number,
  centralDirectoryOffset: number
): Buffer {
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

function crc32Buffer(buffer: Buffer): number {
  let crc = 0xffffffff;

  for (const byte of buffer) {
    crc = (crc >>> 8) ^ crcTable[(crc ^ byte) & 0xff];
  }

  return (crc ^ 0xffffffff) >>> 0;
}

function createCrcTable(): Uint32Array {
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
