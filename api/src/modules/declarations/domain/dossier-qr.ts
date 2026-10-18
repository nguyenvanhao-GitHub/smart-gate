/**
 * Chuỗi mã QR của hồ sơ (F14).
 *
 * API **chỉ trả chuỗi**, không render ảnh — web tự vẽ. Chuỗi cố tình giữ dạng thuần văn bản,
 * không chứa chữ ký số, vì hai lý do:
 * - Điểm **C3** của kế hoạch (nội dung QR và hạn hiệu lực) vẫn chưa được chốt.
 * - Cổng luôn tra ngược mã hồ sơ trong cơ sở dữ liệu trước khi cho qua, nên chuỗi QR chỉ đóng vai
 *   trò khoá tra cứu chứ không phải bằng chứng xác thực. Khi C3 chốt xong thì thêm chữ ký ở đây.
 *
 * Công thức phải **tái lập được bằng SQL** để migration sinh lại đúng chuỗi cho hồ sơ cũ —
 * xem `dossier-jsonb-backfill.ts`.
 */
export const DOSSIER_QR_VERSION = 'SG1';

export function buildDossierQrPayload(code: string, submittedAt: Date): string {
  const issuedAt = Math.floor(submittedAt.getTime() / 1000);
  return `${DOSSIER_QR_VERSION}|${code}|${issuedAt}`;
}

/** Tách mã hồ sơ khỏi chuỗi QR do cổng quét được. Trả null khi chuỗi không đúng định dạng. */
export function parseDossierQrPayload(payload: string): { code: string; issuedAt: Date } | null {
  const parts = payload.split('|');
  if (parts.length !== 3 || parts[0] !== DOSSIER_QR_VERSION) return null;
  const issuedAt = Number(parts[2]);
  if (!parts[1] || !Number.isFinite(issuedAt)) return null;
  return { code: parts[1], issuedAt: new Date(issuedAt * 1000) };
}
