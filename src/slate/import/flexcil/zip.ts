import { Inflate } from "fflate";
import { FlexcilImportCancelledError, FlexcilImportError, type SeekableSource } from "./types";

export interface ZipReaderLimits {
  readonly maxEntries: number;
  readonly maxCentralDirectoryBytes: number;
  readonly maxEntryBytes: number;
  readonly maxTotalBytes: number;
  readonly maxCompressionRatio: number;
}

export interface ZipEntry {
  readonly name: string;
  readonly compressedSize: number;
  readonly size: number;
  readonly crc32: number;
  readonly method: number;
  readonly isDirectory: boolean;
  stream(signal?: AbortSignal): AsyncIterable<Uint8Array>;
}

interface EntryRecord extends Omit<ZipEntry, "stream"> {
  readonly localHeaderOffset: number;
}

export class SeekableZipArchive {
  readonly entries: readonly ZipEntry[];

  private constructor(
    private readonly source: SeekableSource,
    records: readonly EntryRecord[],
  ) {
    this.entries = records.map((record) => ({
      ...record,
      stream: (signal?: AbortSignal) => this.streamEntry(record, signal),
    }));
  }

  static async open(source: SeekableSource, limits: ZipReaderLimits): Promise<SeekableZipArchive> {
    if (!Number.isSafeInteger(source.size) || source.size < 22) {
      throw new FlexcilImportError("invalid_zip", "ZIP source size is invalid");
    }
    const directory = await locateCentralDirectory(source);
    if (directory.entries > limits.maxEntries) {
      throw limitError("archive entry count", directory.entries, limits.maxEntries);
    }
    if (directory.size > limits.maxCentralDirectoryBytes) {
      throw limitError("central directory bytes", directory.size, limits.maxCentralDirectoryBytes);
    }
    const bytes = await readExact(source, directory.offset, directory.size);
    const records: EntryRecord[] = [];
    let total = 0;
    let cursor = 0;
    for (let index = 0; index < directory.entries; index += 1) {
      if (u32(bytes, cursor) !== 0x02014b50) {
        throw new FlexcilImportError("invalid_zip", `Invalid central directory entry ${index}`);
      }
      const flags = u16(bytes, cursor + 8);
      if ((flags & 1) !== 0)
        throw new FlexcilImportError("encrypted_zip", "Encrypted ZIP entries are unsupported");
      const method = u16(bytes, cursor + 10);
      const crc32 = u32(bytes, cursor + 16);
      let compressedSize = u32(bytes, cursor + 20);
      let size = u32(bytes, cursor + 24);
      const nameLength = u16(bytes, cursor + 28);
      const extraLength = u16(bytes, cursor + 30);
      const commentLength = u16(bytes, cursor + 32);
      let localHeaderOffset = u32(bytes, cursor + 42);
      const end = cursor + 46 + nameLength + extraLength + commentLength;
      if (end > bytes.length)
        throw new FlexcilImportError("invalid_zip", "Truncated central directory entry");
      const nameBytes = bytes.subarray(cursor + 46, cursor + 46 + nameLength);
      const decodedName = decodeName(nameBytes, flags);
      const name = validateEntryPath(decodedName);
      const extra = bytes.subarray(
        cursor + 46 + nameLength,
        cursor + 46 + nameLength + extraLength,
      );
      if (
        size === 0xffffffff ||
        compressedSize === 0xffffffff ||
        localHeaderOffset === 0xffffffff
      ) {
        const zip64 = parseZip64Extra(extra, {
          size: size === 0xffffffff,
          compressedSize: compressedSize === 0xffffffff,
          localHeaderOffset: localHeaderOffset === 0xffffffff,
        });
        if (size === 0xffffffff) size = zip64.size;
        if (compressedSize === 0xffffffff) compressedSize = zip64.compressedSize;
        if (localHeaderOffset === 0xffffffff) localHeaderOffset = zip64.localHeaderOffset;
      }
      if (size > limits.maxEntryBytes)
        throw limitError(`${name} uncompressed bytes`, size, limits.maxEntryBytes);
      if (compressedSize === 0 ? size > 0 : size / compressedSize > limits.maxCompressionRatio) {
        throw limitError(
          `${name} compression ratio`,
          compressedSize === 0 ? Infinity : size / compressedSize,
          limits.maxCompressionRatio,
        );
      }
      total += size;
      if (!Number.isSafeInteger(total) || total > limits.maxTotalBytes) {
        throw limitError("archive uncompressed bytes", total, limits.maxTotalBytes);
      }
      records.push({
        name,
        compressedSize,
        size,
        crc32,
        method,
        isDirectory: name.endsWith("/"),
        localHeaderOffset,
      });
      cursor = end;
    }
    return new SeekableZipArchive(source, records);
  }

  private async *streamEntry(
    record: EntryRecord,
    signal?: AbortSignal,
  ): AsyncGenerator<Uint8Array> {
    checkCancelled(signal);
    if (record.isDirectory) return;
    if (record.method !== 0 && record.method !== 8) {
      throw new FlexcilImportError(
        "unsupported_compression",
        `${record.name} uses ZIP method ${record.method}`,
      );
    }
    const header = await readExact(this.source, record.localHeaderOffset, 30);
    if (u32(header, 0) !== 0x04034b50)
      throw new FlexcilImportError("invalid_zip", `Invalid local header for ${record.name}`);
    const dataOffset = record.localHeaderOffset + 30 + u16(header, 26) + u16(header, 28);
    if (dataOffset + record.compressedSize > this.source.size) {
      throw new FlexcilImportError("invalid_zip", `Truncated entry data for ${record.name}`);
    }

    const crc = new Crc32();
    let outputSize = 0;
    const accept = (chunk: Uint8Array): Uint8Array => {
      outputSize += chunk.length;
      if (outputSize > record.size)
        throw new FlexcilImportError(
          "invalid_zip",
          `${record.name} expands beyond its declared size`,
        );
      crc.update(chunk);
      return chunk;
    };

    if (record.method === 0) {
      for (let offset = 0; offset < record.compressedSize; offset += CHUNK_SIZE) {
        checkCancelled(signal);
        const chunk = await readExact(
          this.source,
          dataOffset + offset,
          Math.min(CHUNK_SIZE, record.compressedSize - offset),
        );
        yield accept(chunk);
      }
    } else {
      const pending: Uint8Array[] = [];
      const inflate = new Inflate((chunk) => {
        if (chunk.length > 0) pending.push(chunk);
      });
      for (let offset = 0; offset < record.compressedSize; offset += CHUNK_SIZE) {
        checkCancelled(signal);
        const length = Math.min(CHUNK_SIZE, record.compressedSize - offset);
        inflate.push(
          await readExact(this.source, dataOffset + offset, length),
          offset + length === record.compressedSize,
        );
        for (const chunk of pending.splice(0)) yield accept(chunk);
      }
      if (record.compressedSize === 0) inflate.push(new Uint8Array(), true);
      for (const chunk of pending.splice(0)) yield accept(chunk);
    }

    if (outputSize !== record.size) {
      throw new FlexcilImportError(
        "invalid_zip",
        `${record.name} produced ${outputSize} bytes; expected ${record.size}`,
      );
    }
    if (crc.digest() !== record.crc32)
      throw new FlexcilImportError("crc_mismatch", `${record.name} failed CRC-32 validation`);
  }
}

const CHUNK_SIZE = 16 * 1024;

async function locateCentralDirectory(
  source: SeekableSource,
): Promise<{ entries: number; offset: number; size: number }> {
  const tailLength = Math.min(source.size, 65_557);
  const tailOffset = source.size - tailLength;
  const tail = await readExact(source, tailOffset, tailLength);
  let position = -1;
  for (let index = tail.length - 22; index >= 0; index -= 1) {
    if (u32(tail, index) === 0x06054b50 && index + 22 + u16(tail, index + 20) === tail.length) {
      position = index;
      break;
    }
  }
  if (position < 0)
    throw new FlexcilImportError("invalid_zip", "ZIP end-of-central-directory record is missing");
  if (u16(tail, position + 4) !== 0 || u16(tail, position + 6) !== 0) {
    throw new FlexcilImportError("multi_disk_zip", "Multi-disk ZIP archives are unsupported");
  }
  const entries = u16(tail, position + 10);
  const size = u32(tail, position + 12);
  const offset = u32(tail, position + 16);
  if (entries !== 0xffff && size !== 0xffffffff && offset !== 0xffffffff)
    return { entries, size, offset };

  const eocdOffset = tailOffset + position;
  if (eocdOffset < 20) throw new FlexcilImportError("invalid_zip", "ZIP64 locator is missing");
  const locator = await readExact(source, eocdOffset - 20, 20);
  if (u32(locator, 0) !== 0x07064b50 || u32(locator, 4) !== 0 || u32(locator, 16) !== 1) {
    throw new FlexcilImportError("invalid_zip", "ZIP64 locator is invalid");
  }
  const zip64Offset = u64(locator, 8);
  const record = await readExact(source, zip64Offset, 56);
  if (u32(record, 0) !== 0x06064b50 || u32(record, 16) !== 0 || u32(record, 20) !== 0) {
    throw new FlexcilImportError("invalid_zip", "ZIP64 end record is invalid");
  }
  return { entries: u64(record, 32), size: u64(record, 40), offset: u64(record, 48) };
}

function parseZip64Extra(
  extra: Uint8Array,
  needed: { size: boolean; compressedSize: boolean; localHeaderOffset: boolean },
): { size: number; compressedSize: number; localHeaderOffset: number } {
  let cursor = 0;
  while (cursor + 4 <= extra.length) {
    const id = u16(extra, cursor);
    const length = u16(extra, cursor + 2);
    const body = cursor + 4;
    if (body + length > extra.length) break;
    if (id === 1) {
      let valueCursor = body;
      const next = (): number => {
        if (valueCursor + 8 > body + length)
          throw new FlexcilImportError("invalid_zip", "ZIP64 extra field is truncated");
        const value = u64(extra, valueCursor);
        valueCursor += 8;
        return value;
      };
      return {
        size: needed.size ? next() : 0,
        compressedSize: needed.compressedSize ? next() : 0,
        localHeaderOffset: needed.localHeaderOffset ? next() : 0,
      };
    }
    cursor = body + length;
  }
  throw new FlexcilImportError("invalid_zip", "Required ZIP64 extra field is missing");
}

export async function collectEntry(
  entry: ZipEntry,
  maxBytes: number,
  signal?: AbortSignal,
): Promise<Uint8Array> {
  if (entry.size > maxBytes) throw limitError(`${entry.name} bytes`, entry.size, maxBytes);
  const output = new Uint8Array(entry.size);
  let offset = 0;
  for await (const chunk of entry.stream(signal)) {
    output.set(chunk, offset);
    offset += chunk.length;
  }
  return output;
}

export async function readEntryPrefix(
  entry: ZipEntry,
  length: number,
  signal?: AbortSignal,
): Promise<Uint8Array> {
  const output = new Uint8Array(Math.min(length, entry.size));
  let offset = 0;
  for await (const chunk of entry.stream(signal)) {
    const count = Math.min(chunk.length, output.length - offset);
    output.set(chunk.subarray(0, count), offset);
    offset += count;
    if (offset === output.length) break;
  }
  return output;
}

export function validateEntryPath(path: string): string {
  if (!path || path.includes("\0") || path.includes("\\") || /^[A-Za-z]:/.test(path)) {
    throw new FlexcilImportError("unsafe_path", `Unsafe ZIP entry path: ${JSON.stringify(path)}`);
  }
  const canonical = path.replace(/^\/+/, "");
  const directory = canonical.endsWith("/");
  const value = directory ? canonical.slice(0, -1) : canonical;
  if (!value || value.split("/").some((part) => !part || part === "." || part === "..")) {
    throw new FlexcilImportError("unsafe_path", `Unsafe ZIP entry path: ${JSON.stringify(path)}`);
  }
  return directory ? `${value}/` : value;
}

function decodeName(bytes: Uint8Array, flags: number): string {
  try {
    return new TextDecoder("utf-8", { fatal: (flags & 0x800) !== 0 }).decode(bytes);
  } catch {
    throw new FlexcilImportError("invalid_zip", "ZIP entry name is not valid UTF-8");
  }
}

async function readExact(
  source: SeekableSource,
  offset: number,
  length: number,
): Promise<Uint8Array> {
  if (
    !Number.isSafeInteger(offset) ||
    !Number.isSafeInteger(length) ||
    offset < 0 ||
    length < 0 ||
    offset + length > source.size
  ) {
    throw new FlexcilImportError(
      "invalid_zip",
      `Invalid ZIP read at ${offset} for ${length} bytes`,
    );
  }
  const bytes = await source.read(offset, length);
  if (bytes.length !== length)
    throw new FlexcilImportError(
      "invalid_zip",
      `Short ZIP read at ${offset}: ${bytes.length}/${length}`,
    );
  return bytes;
}

function u16(bytes: Uint8Array, offset: number): number {
  if (offset < 0 || offset + 2 > bytes.length)
    throw new FlexcilImportError("invalid_zip", "Truncated ZIP integer");
  return (bytes[offset] ?? 0) | ((bytes[offset + 1] ?? 0) << 8);
}

function u32(bytes: Uint8Array, offset: number): number {
  return (u16(bytes, offset) | (u16(bytes, offset + 2) << 16)) >>> 0;
}

function u64(bytes: Uint8Array, offset: number): number {
  const value = BigInt(u32(bytes, offset)) | (BigInt(u32(bytes, offset + 4)) << 32n);
  if (value > BigInt(Number.MAX_SAFE_INTEGER))
    throw new FlexcilImportError(
      "zip_too_large",
      "ZIP64 value exceeds JavaScript's safe integer range",
    );
  return Number(value);
}

function limitError(label: string, actual: number, limit: number): FlexcilImportError {
  return new FlexcilImportError(
    "size_limit",
    `${label} (${actual}) exceeds the configured limit (${limit})`,
  );
}

function checkCancelled(signal?: AbortSignal): void {
  if (signal?.aborted) throw new FlexcilImportCancelledError();
}

class Crc32 {
  private value = 0xffffffff;

  update(bytes: Uint8Array): void {
    let value = this.value;
    for (const byte of bytes) value = CRC_TABLE[(value ^ byte) & 0xff]! ^ (value >>> 8);
    this.value = value;
  }

  digest(): number {
    return (this.value ^ 0xffffffff) >>> 0;
  }
}

const CRC_TABLE = new Uint32Array(256);
for (let index = 0; index < 256; index += 1) {
  let value = index;
  for (let bit = 0; bit < 8; bit += 1)
    value = (value & 1) !== 0 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
  CRC_TABLE[index] = value >>> 0;
}
