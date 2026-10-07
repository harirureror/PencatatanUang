// Penulis & pembaca ZIP minimal (tanpa dependensi) untuk arsip backup. ZIP dipilih karena bisa
// dibuka bawaan Windows, Android, dan macOS — arsip tetap bisa dibaca tanpa aplikasi ini.
// Mendukung metode "store" (0) dan "deflate" (8), nama file UTF-8, tanpa ZIP64 (arsip < 4 GB).
import { crc32, deflateRawSync, inflateRawSync } from "node:zlib";

export type ZipEntry = {
  /** Jalur di dalam arsip, mis. "struk/abc.jpg" (pemisah "/"). */
  path: string;
  data: Buffer;
  /** false untuk data yang sudah terkompresi (foto) — disimpan apa adanya. */
  compress?: boolean;
  modifiedAt?: Date;
};

const LOCAL_SIG = 0x04034b50;
const CENTRAL_SIG = 0x02014b50;
const END_SIG = 0x06054b50;
const UTF8_FLAG = 0x0800;
const MAX_U32 = 0xffffffff;

/** Tanggal & jam format DOS (resolusi 2 detik, waktu lokal). */
function dosDateTime(d: Date): { time: number; date: number } {
  return {
    time: (d.getHours() << 11) | (d.getMinutes() << 5) | Math.floor(d.getSeconds() / 2),
    date: ((Math.max(d.getFullYear(), 1980) - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate(),
  };
}

export function createZip(entries: ZipEntry[]): Buffer {
  const chunks: Buffer[] = [];
  const central: Buffer[] = [];
  let offset = 0;

  for (const entry of entries) {
    const name = Buffer.from(entry.path, "utf8");
    const deflated = entry.compress === false ? null : deflateRawSync(entry.data, { level: 9 });
    // Pakai deflate hanya bila memang lebih kecil.
    const useDeflate = deflated !== null && deflated.length < entry.data.length;
    const body = useDeflate ? deflated : entry.data;
    const crc = crc32(entry.data);
    const { time, date } = dosDateTime(entry.modifiedAt ?? new Date());
    if (offset > MAX_U32 || body.length > MAX_U32) throw new Error("Arsip terlalu besar untuk ZIP biasa.");

    const local = Buffer.alloc(30);
    local.writeUInt32LE(LOCAL_SIG, 0);
    local.writeUInt16LE(20, 4); // versi minimal
    local.writeUInt16LE(UTF8_FLAG, 6);
    local.writeUInt16LE(useDeflate ? 8 : 0, 8);
    local.writeUInt16LE(time, 10);
    local.writeUInt16LE(date, 12);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(body.length, 18);
    local.writeUInt32LE(entry.data.length, 22);
    local.writeUInt16LE(name.length, 26);
    local.writeUInt16LE(0, 28);
    chunks.push(local, name, body);

    const head = Buffer.alloc(46);
    head.writeUInt32LE(CENTRAL_SIG, 0);
    head.writeUInt16LE(20, 4); // dibuat oleh
    head.writeUInt16LE(20, 6); // versi minimal
    head.writeUInt16LE(UTF8_FLAG, 8);
    head.writeUInt16LE(useDeflate ? 8 : 0, 10);
    head.writeUInt16LE(time, 12);
    head.writeUInt16LE(date, 14);
    head.writeUInt32LE(crc, 16);
    head.writeUInt32LE(body.length, 20);
    head.writeUInt32LE(entry.data.length, 24);
    head.writeUInt16LE(name.length, 28);
    head.writeUInt32LE(offset, 42);
    central.push(head, name);

    offset += local.length + name.length + body.length;
  }

  const centralBuf = Buffer.concat(central);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(END_SIG, 0);
  end.writeUInt16LE(entries.length, 8);
  end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(centralBuf.length, 12);
  end.writeUInt32LE(offset, 16);
  return Buffer.concat([...chunks, centralBuf, end]);
}

export class ZipFormatError extends Error {}

/** Baca semua file di arsip ZIP (memeriksa CRC tiap file). */
export function readZip(zip: Buffer): Map<string, Buffer> {
  // Cari "end of central directory" dari belakang (komentar arsip bisa sampai 64 KB).
  let endAt = -1;
  for (let i = zip.length - 22; i >= Math.max(0, zip.length - 22 - 0xffff); i--) {
    if (zip.readUInt32LE(i) === END_SIG) {
      endAt = i;
      break;
    }
  }
  if (endAt < 0) throw new ZipFormatError("Bukan arsip ZIP.");

  const count = zip.readUInt16LE(endAt + 10);
  let at = zip.readUInt32LE(endAt + 16);
  const files = new Map<string, Buffer>();
  for (let n = 0; n < count; n++) {
    if (zip.readUInt32LE(at) !== CENTRAL_SIG) throw new ZipFormatError("Daftar isi arsip rusak.");
    const method = zip.readUInt16LE(at + 10);
    const crc = zip.readUInt32LE(at + 16);
    const size = zip.readUInt32LE(at + 20);
    const nameLen = zip.readUInt16LE(at + 28);
    const extraLen = zip.readUInt16LE(at + 30);
    const commentLen = zip.readUInt16LE(at + 32);
    const localAt = zip.readUInt32LE(at + 42);
    const name = zip.subarray(at + 46, at + 46 + nameLen).toString("utf8");

    if (zip.readUInt32LE(localAt) !== LOCAL_SIG) throw new ZipFormatError(`Isi "${name}" rusak.`);
    const dataAt = localAt + 30 + zip.readUInt16LE(localAt + 26) + zip.readUInt16LE(localAt + 28);
    const body = zip.subarray(dataAt, dataAt + size);
    const data = method === 0 ? Buffer.from(body) : method === 8 ? inflateRawSync(body) : null;
    if (!data) throw new ZipFormatError(`Metode kompresi "${name}" tidak didukung.`);
    if (crc32(data) !== crc) throw new ZipFormatError(`Isi "${name}" rusak (CRC tidak cocok).`);
    files.set(name, data);

    at += 46 + nameLen + extraLen + commentLen;
  }
  return files;
}
