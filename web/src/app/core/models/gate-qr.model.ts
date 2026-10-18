// =============================================================================
// Đọc nội dung mã QR quét được tại cổng (F34).
//
// Chuỗi QR do API sinh khi gửi hồ sơ có dạng `SG1|<mã hồ sơ>|<giây epoch>` — xem
// `api/src/modules/declarations/domain/dossier-qr.ts`. Web **chỉ tách khóa tra cứu**;
// việc hồ sơ có được qua cổng hay không vẫn hoàn toàn do máy chủ quyết định
// (`GET /gate/lookup` + `evaluation.canOpen`).
//
// Vì sao vẫn kiểm ở web: tiêu chí F34 đòi "QR sai/hết hiệu lực có cảnh báo". Quét trúng mã QR
// của thứ khác (vé xe, tem hàng, đường dẫn web) phải báo ngay tại chỗ thay vì bắn một lượt tra
// cứu vô nghĩa lên API rồi hiện "không tìm thấy hồ sơ".
// =============================================================================

/** Phiên bản chuỗi QR — phải khớp `DOSSIER_QR_VERSION` phía API. */
export const DOSSIER_QR_VERSION = 'SG1';

/**
 * Hạn hiệu lực dùng để **cảnh báo**, mặc định 24 giờ.
 *
 * ⚠️ Điểm C3 (nội dung QR và hạn hiệu lực chính thức) **chưa được chủ dự án chốt**, nên đây
 * không phải quy tắc nghiệp vụ: quá hạn chỉ hiện cảnh báo, **không chặn tra cứu** — cán bộ vẫn
 * xem được hồ sơ, và điều kiện qua cổng vẫn do máy chủ quyết. Khi C3 chốt xong thì sửa đúng một
 * hằng này (hoặc chuyển sang hạn do API trả).
 */
export const DOSSIER_QR_MAX_AGE_SECONDS = 24 * 60 * 60;

/** Sai lệch đồng hồ cho phép giữa máy in phiếu và máy trạm cổng. */
const CLOCK_SKEW_SECONDS = 5 * 60;

/** Mã hồ sơ in trần trong QR (đầu đọc phần cứng / QR rút gọn): chữ, số, gạch nối. */
const PLAIN_CODE_PATTERN = /^[A-Za-z0-9][A-Za-z0-9-]{3,39}$/;

export type ScannedQrStatus = 'VALID' | 'EXPIRED' | 'INVALID';

export interface ScannedQr {
  status: ScannedQrStatus;
  /** Mã hồ sơ tách được — rỗng khi `status = 'INVALID'`. */
  code: string;
  /** Thời điểm phát hành chuỗi QR; `null` với QR chỉ chứa mã trần. */
  issuedAt: Date | null;
}

/**
 * Đọc một chuỗi quét được.
 *
 * Chấp nhận hai dạng:
 *   1. `SG1|<mã>|<epoch>` — chuỗi chuẩn do API sinh, có kiểm hạn hiệu lực;
 *   2. mã hồ sơ trần (`HS-250519-0015`) — đầu đọc QR phần cứng và phiếu in rút gọn đều
 *      cho ra dạng này, và ô nhập tay cũng nhận đúng chuỗi đó, nên từ chối nó là tự bịt
 *      mất đường dự phòng đang chạy được.
 * Mọi thứ khác là `INVALID`.
 */
export function readDossierQr(
  text: string,
  now: Date = new Date(),
  maxAgeSeconds: number = DOSSIER_QR_MAX_AGE_SECONDS,
): ScannedQr {
  const payload = (text || '').trim();
  if (!payload) return { status: 'INVALID', code: '', issuedAt: null };

  const parts = payload.split('|');
  if (parts.length === 1) {
    return PLAIN_CODE_PATTERN.test(payload)
      ? { status: 'VALID', code: payload, issuedAt: null }
      : { status: 'INVALID', code: '', issuedAt: null };
  }

  if (parts.length !== 3 || parts[0] !== DOSSIER_QR_VERSION) {
    return { status: 'INVALID', code: '', issuedAt: null };
  }

  const code = parts[1].trim();
  const issuedEpoch = Number(parts[2]);
  if (!code || !Number.isFinite(issuedEpoch)) {
    return { status: 'INVALID', code: '', issuedAt: null };
  }

  const issuedAt = new Date(issuedEpoch * 1000);
  const ageSeconds = (now.getTime() - issuedAt.getTime()) / 1000;
  // Quá hạn, hoặc phát hành ở "tương lai" quá xa (lệch đồng hồ / chuỗi bị chế) — đều cảnh báo.
  const expired = ageSeconds > maxAgeSeconds || ageSeconds < -CLOCK_SKEW_SECONDS;
  return { status: expired ? 'EXPIRED' : 'VALID', code, issuedAt };
}
