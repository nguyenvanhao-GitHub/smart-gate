// =============================================================================
// Sinh ma trận mã QR theo ISO/IEC 18004 — chế độ byte (UTF-8), mức sửa lỗi M.
//
// Vì sao tự viết: dự án chưa được duyệt thêm thư viện mới, mà UI-04 bắt buộc
// hiển thị mã QR sau khi gửi hồ sơ (F14). API chỉ trả **chuỗi** QR, web tự vẽ.
// Toàn bộ thuật toán nằm gọn ở đây và không phụ thuộc DOM nên test được thuần.
// =============================================================================

/** Số codeword sửa lỗi trên mỗi khối, mức M, theo phiên bản 1..40. */
const ECC_CODEWORDS_PER_BLOCK_M = [
  10, 16, 26, 18, 24, 16, 18, 22, 22, 26, 30, 22, 22, 24, 24, 28, 28, 26, 26, 26,
  26, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28,
];

/** Số khối sửa lỗi, mức M, theo phiên bản 1..40. */
const NUM_ERROR_CORRECTION_BLOCKS_M = [
  1, 1, 1, 2, 2, 4, 4, 4, 5, 5, 5, 8, 9, 9, 10, 10, 11, 13, 14, 16, 17, 17, 18, 20,
  21, 23, 25, 26, 28, 29, 31, 33, 35, 37, 38, 40, 43, 45, 47, 49,
];

/** Bit đại diện mức sửa lỗi M trong thông tin định dạng. */
const FORMAT_ECC_BITS_M = 0;

const PENALTY_N1 = 3;
const PENALTY_N2 = 3;
const PENALTY_N3 = 40;
const PENALTY_N4 = 10;

export interface QrCodeMatrix {
  /** Số module mỗi cạnh (chưa tính vùng lặng). */
  size: number;
  /** `modules[y][x] === true` là ô tối. */
  modules: boolean[][];
  version: number;
  mask: number;
}

/**
 * Sinh ma trận QR cho một chuỗi bất kỳ.
 * Ném lỗi nếu chuỗi rỗng hoặc dài quá sức chứa phiên bản 40.
 */
export function encodeQrCode(text: string): QrCodeMatrix {
  const data = toUtf8Bytes(text ?? '');
  if (!data.length) throw new Error('Chuỗi mã QR rỗng.');

  const version = pickVersion(data.length);
  const dataCodewords = buildDataCodewords(data, version);
  const codewords = addEccAndInterleave(dataCodewords, version);
  return drawMatrix(codewords, version);
}

// --- Mã hóa dữ liệu ----------------------------------------------------------

function toUtf8Bytes(text: string): number[] {
  if (typeof TextEncoder !== 'undefined') return Array.from(new TextEncoder().encode(text));
  // Dự phòng cho môi trường không có TextEncoder.
  return Array.from(unescape(encodeURIComponent(text))).map((char) => char.charCodeAt(0));
}

/** Số bit của trường "độ dài" ở chế độ byte: 8 bit cho phiên bản 1–9, 16 bit từ phiên bản 10. */
function charCountBits(version: number): number {
  return version <= 9 ? 8 : 16;
}

function getNumRawDataModules(version: number): number {
  let result = (16 * version + 128) * version + 64;
  if (version >= 2) {
    const numAlign = Math.floor(version / 7) + 2;
    result -= (25 * numAlign - 10) * numAlign - 55;
    if (version >= 7) result -= 36;
  }
  return result;
}

function getNumDataCodewords(version: number): number {
  return (
    Math.floor(getNumRawDataModules(version) / 8) -
    ECC_CODEWORDS_PER_BLOCK_M[version - 1] * NUM_ERROR_CORRECTION_BLOCKS_M[version - 1]
  );
}

function pickVersion(byteLength: number): number {
  for (let version = 1; version <= 40; version++) {
    const capacityBits = getNumDataCodewords(version) * 8;
    if (4 + charCountBits(version) + byteLength * 8 <= capacityBits) return version;
  }
  throw new Error('Chuỗi mã QR quá dài, vượt sức chứa phiên bản 40.');
}

function buildDataCodewords(data: number[], version: number): number[] {
  const bits: number[] = [];
  appendBits(bits, 0b0100, 4); // chỉ báo chế độ byte
  appendBits(bits, data.length, charCountBits(version));
  data.forEach((byte) => appendBits(bits, byte, 8));

  const capacityBits = getNumDataCodewords(version) * 8;
  appendBits(bits, 0, Math.min(4, capacityBits - bits.length)); // dấu kết thúc
  appendBits(bits, 0, (8 - (bits.length % 8)) % 8); // đệm cho tròn byte

  const codewords: number[] = [];
  for (let i = 0; i < bits.length; i += 8) {
    let value = 0;
    for (let j = 0; j < 8; j++) value = (value << 1) | bits[i + j];
    codewords.push(value);
  }
  // Đệm luân phiên 0xEC / 0x11 cho đủ dung lượng.
  for (let pad = 0xec; codewords.length < capacityBits / 8; pad ^= 0xec ^ 0x11) codewords.push(pad);
  return codewords;
}

function appendBits(bits: number[], value: number, length: number): void {
  for (let i = length - 1; i >= 0; i--) bits.push((value >>> i) & 1);
}

// --- Sửa lỗi Reed–Solomon ----------------------------------------------------

function addEccAndInterleave(data: number[], version: number): number[] {
  const numBlocks = NUM_ERROR_CORRECTION_BLOCKS_M[version - 1];
  const blockEccLen = ECC_CODEWORDS_PER_BLOCK_M[version - 1];
  const rawCodewords = Math.floor(getNumRawDataModules(version) / 8);
  const numShortBlocks = numBlocks - (rawCodewords % numBlocks);
  const shortBlockLen = Math.floor(rawCodewords / numBlocks);

  const blocks: number[][] = [];
  const eccBlocks: number[][] = [];
  const divisor = reedSolomonDivisor(blockEccLen);

  for (let i = 0, offset = 0; i < numBlocks; i++) {
    const dataLen = shortBlockLen - blockEccLen + (i < numShortBlocks ? 0 : 1);
    const block = data.slice(offset, offset + dataLen);
    offset += dataLen;
    blocks.push(block);
    eccBlocks.push(reedSolomonRemainder(block, divisor));
  }

  const result: number[] = [];
  for (let i = 0; i < shortBlockLen - blockEccLen + 1; i++) {
    blocks.forEach((block, index) => {
      // Khối ngắn không có codeword cuối cùng — bỏ qua để giữ đúng thứ tự đan xen.
      if (i < block.length || index >= numShortBlocks) result.push(block[i]);
    });
  }
  for (let i = 0; i < blockEccLen; i++) {
    eccBlocks.forEach((block) => result.push(block[i]));
  }
  return result;
}

function reedSolomonDivisor(degree: number): number[] {
  const result = new Array<number>(degree).fill(0);
  result[degree - 1] = 1;
  let root = 1;
  for (let i = 0; i < degree; i++) {
    for (let j = 0; j < degree; j++) {
      result[j] = reedSolomonMultiply(result[j], root);
      if (j + 1 < degree) result[j] ^= result[j + 1];
    }
    root = reedSolomonMultiply(root, 0x02);
  }
  return result;
}

function reedSolomonRemainder(data: number[], divisor: number[]): number[] {
  const result = divisor.map(() => 0);
  data.forEach((byte) => {
    const factor = byte ^ (result.shift() as number);
    result.push(0);
    divisor.forEach((coefficient, i) => {
      result[i] ^= reedSolomonMultiply(coefficient, factor);
    });
  });
  return result;
}

/** Nhân trên trường Galois GF(2^8) với đa thức sinh 0x11D. */
function reedSolomonMultiply(x: number, y: number): number {
  let z = 0;
  for (let i = 7; i >= 0; i--) {
    z = (z << 1) ^ ((z >>> 7) * 0x11d);
    z ^= ((y >>> i) & 1) * x;
  }
  return z & 0xff;
}

// --- Dựng ma trận ------------------------------------------------------------

function drawMatrix(codewords: number[], version: number): QrCodeMatrix {
  const size = version * 4 + 17;
  const modules: boolean[][] = Array.from({ length: size }, () => new Array<boolean>(size).fill(false));
  const isFunction: boolean[][] = Array.from({ length: size }, () => new Array<boolean>(size).fill(false));

  const setFunctionModule = (x: number, y: number, isDark: boolean): void => {
    modules[y][x] = isDark;
    isFunction[y][x] = true;
  };

  drawFunctionPatterns(size, version, setFunctionModule);
  drawFormatBits(size, 0, setFunctionModule); // đặt chỗ, ghi lại sau khi chọn mặt nạ
  drawCodewords(size, codewords, modules, isFunction);

  let bestMask = 0;
  let bestPenalty = Number.MAX_SAFE_INTEGER;
  for (let mask = 0; mask < 8; mask++) {
    applyMask(size, mask, modules, isFunction);
    drawFormatBits(size, mask, setFunctionModule);
    const penalty = getPenaltyScore(size, modules);
    if (penalty < bestPenalty) {
      bestPenalty = penalty;
      bestMask = mask;
    }
    applyMask(size, mask, modules, isFunction); // XOR hai lần để hoàn tác
  }
  applyMask(size, bestMask, modules, isFunction);
  drawFormatBits(size, bestMask, setFunctionModule);

  return { size, modules, version, mask: bestMask };
}

type SetModule = (x: number, y: number, isDark: boolean) => void;

function drawFunctionPatterns(size: number, version: number, setModule: SetModule): void {
  for (let i = 0; i < size; i++) {
    setModule(6, i, i % 2 === 0);
    setModule(i, 6, i % 2 === 0);
  }

  drawFinderPattern(size, 3, 3, setModule);
  drawFinderPattern(size, size - 4, 3, setModule);
  drawFinderPattern(size, 3, size - 4, setModule);

  const positions = alignmentPatternPositions(version);
  const count = positions.length;
  for (let i = 0; i < count; i++) {
    for (let j = 0; j < count; j++) {
      // Ba góc đã có ô định vị lớn.
      const isCorner = (i === 0 && j === 0) || (i === 0 && j === count - 1) || (i === count - 1 && j === 0);
      if (!isCorner) drawAlignmentPattern(positions[i], positions[j], setModule);
    }
  }

  drawVersionBits(size, version, setModule);
}

function drawFinderPattern(size: number, x: number, y: number, setModule: SetModule): void {
  for (let dy = -4; dy <= 4; dy++) {
    for (let dx = -4; dx <= 4; dx++) {
      const distance = Math.max(Math.abs(dx), Math.abs(dy));
      const xx = x + dx;
      const yy = y + dy;
      if (xx >= 0 && xx < size && yy >= 0 && yy < size) {
        setModule(xx, yy, distance !== 2 && distance !== 4);
      }
    }
  }
}

function drawAlignmentPattern(x: number, y: number, setModule: SetModule): void {
  for (let dy = -2; dy <= 2; dy++) {
    for (let dx = -2; dx <= 2; dx++) {
      setModule(x + dx, y + dy, Math.max(Math.abs(dx), Math.abs(dy)) !== 1);
    }
  }
}

function alignmentPatternPositions(version: number): number[] {
  if (version === 1) return [];
  const numAlign = Math.floor(version / 7) + 2;
  const step = version === 32 ? 26 : Math.ceil((version * 4 + 4) / (numAlign * 2 - 2)) * 2;
  const result = [6];
  for (let pos = version * 4 + 10; result.length < numAlign; pos -= step) result.splice(1, 0, pos);
  return result;
}

function drawFormatBits(size: number, mask: number, setModule: SetModule): void {
  const data = (FORMAT_ECC_BITS_M << 3) | mask;
  let remainder = data;
  for (let i = 0; i < 10; i++) remainder = (remainder << 1) ^ ((remainder >>> 9) * 0x537);
  const bits = ((data << 10) | remainder) ^ 0x5412;

  for (let i = 0; i <= 5; i++) setModule(8, i, getBit(bits, i));
  setModule(8, 7, getBit(bits, 6));
  setModule(8, 8, getBit(bits, 7));
  setModule(7, 8, getBit(bits, 8));
  for (let i = 9; i < 15; i++) setModule(14 - i, 8, getBit(bits, i));

  for (let i = 0; i < 8; i++) setModule(size - 1 - i, 8, getBit(bits, i));
  for (let i = 8; i < 15; i++) setModule(8, size - 15 + i, getBit(bits, i));
  setModule(8, size - 8, true); // module tối cố định
}

function drawVersionBits(size: number, version: number, setModule: SetModule): void {
  if (version < 7) return;
  let remainder = version;
  for (let i = 0; i < 12; i++) remainder = (remainder << 1) ^ ((remainder >>> 11) * 0x1f25);
  const bits = (version << 12) | remainder;
  for (let i = 0; i < 18; i++) {
    const bit = getBit(bits, i);
    const a = size - 11 + (i % 3);
    const b = Math.floor(i / 3);
    setModule(a, b, bit);
    setModule(b, a, bit);
  }
}

function drawCodewords(size: number, codewords: number[], modules: boolean[][], isFunction: boolean[][]): void {
  let index = 0;
  for (let right = size - 1; right >= 1; right -= 2) {
    if (right === 6) right = 5; // cột 6 là vạch định thời
    for (let vert = 0; vert < size; vert++) {
      for (let j = 0; j < 2; j++) {
        const x = right - j;
        const upward = ((right + 1) & 2) === 0;
        const y = upward ? size - 1 - vert : vert;
        if (!isFunction[y][x] && index < codewords.length * 8) {
          modules[y][x] = getBit(codewords[index >>> 3], 7 - (index & 7));
          index++;
        }
      }
    }
  }
}

function applyMask(size: number, mask: number, modules: boolean[][], isFunction: boolean[][]): void {
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      if (isFunction[y][x]) continue;
      if (maskBit(mask, x, y)) modules[y][x] = !modules[y][x];
    }
  }
}

function maskBit(mask: number, x: number, y: number): boolean {
  switch (mask) {
    case 0: return (x + y) % 2 === 0;
    case 1: return y % 2 === 0;
    case 2: return x % 3 === 0;
    case 3: return (x + y) % 3 === 0;
    case 4: return (Math.floor(x / 3) + Math.floor(y / 2)) % 2 === 0;
    case 5: return ((x * y) % 2) + ((x * y) % 3) === 0;
    case 6: return (((x * y) % 2) + ((x * y) % 3)) % 2 === 0;
    default: return (((x + y) % 2) + ((x * y) % 3)) % 2 === 0;
  }
}

// --- Chấm điểm mặt nạ --------------------------------------------------------

function getPenaltyScore(size: number, modules: boolean[][]): number {
  let result = 0;

  for (let y = 0; y < size; y++) {
    let runColor = false;
    let runLength = 0;
    const history = [0, 0, 0, 0, 0, 0, 0];
    for (let x = 0; x < size; x++) {
      if (modules[y][x] === runColor) {
        runLength++;
        if (runLength === 5) result += PENALTY_N1;
        else if (runLength > 5) result++;
      } else {
        addRunToHistory(runLength, history, size);
        if (!runColor) result += countFinderLikePatterns(history) * PENALTY_N3;
        runColor = modules[y][x];
        runLength = 1;
      }
    }
    result += terminateAndCount(runColor, runLength, history, size) * PENALTY_N3;
  }

  for (let x = 0; x < size; x++) {
    let runColor = false;
    let runLength = 0;
    const history = [0, 0, 0, 0, 0, 0, 0];
    for (let y = 0; y < size; y++) {
      if (modules[y][x] === runColor) {
        runLength++;
        if (runLength === 5) result += PENALTY_N1;
        else if (runLength > 5) result++;
      } else {
        addRunToHistory(runLength, history, size);
        if (!runColor) result += countFinderLikePatterns(history) * PENALTY_N3;
        runColor = modules[y][x];
        runLength = 1;
      }
    }
    result += terminateAndCount(runColor, runLength, history, size) * PENALTY_N3;
  }

  for (let y = 0; y < size - 1; y++) {
    for (let x = 0; x < size - 1; x++) {
      const color = modules[y][x];
      if (color === modules[y][x + 1] && color === modules[y + 1][x] && color === modules[y + 1][x + 1]) {
        result += PENALTY_N2;
      }
    }
  }

  let dark = 0;
  modules.forEach((row) => row.forEach((cell) => { if (cell) dark++; }));
  const total = size * size;
  const k = Math.ceil(Math.abs(dark * 20 - total * 10) / total) - 1;
  return result + k * PENALTY_N4;
}

function addRunToHistory(runLength: number, history: number[], size: number): void {
  let length = runLength;
  if (history[0] === 0) length += size; // dải sáng đầu hàng coi như nối với viền
  history.pop();
  history.unshift(length);
}

function terminateAndCount(runColor: boolean, runLength: number, history: number[], size: number): number {
  let length = runLength;
  if (runColor) {
    addRunToHistory(length, history, size);
    length = 0;
  }
  length += size; // viền sáng ngoài cùng
  addRunToHistory(length, history, size);
  return countFinderLikePatterns(history);
}

/** Đếm mẫu tỉ lệ 1:1:3:1:1 dễ bị nhầm với ô định vị. */
function countFinderLikePatterns(history: number[]): number {
  const n = history[1];
  const core = n > 0 && history[2] === n && history[3] === n * 3 && history[4] === n && history[5] === n;
  return (
    (core && history[0] >= n * 4 && history[6] >= n ? 1 : 0) +
    (core && history[6] >= n * 4 && history[0] >= n ? 1 : 0)
  );
}

function getBit(value: number, index: number): boolean {
  return ((value >>> index) & 1) !== 0;
}

// --- Kết xuất ----------------------------------------------------------------

/**
 * Dựng đường vẽ SVG cho ma trận (mỗi module là một ô vuông 1×1).
 * `quietZone` là vùng lặng tính bằng module, chuẩn khuyến nghị là 4.
 */
export function qrMatrixToSvgPath(matrix: QrCodeMatrix, quietZone = 4): string {
  const parts: string[] = [];
  for (let y = 0; y < matrix.size; y++) {
    for (let x = 0; x < matrix.size; x++) {
      if (matrix.modules[y][x]) parts.push(`M${x + quietZone} ${y + quietZone}h1v1h-1z`);
    }
  }
  return parts.join('');
}
