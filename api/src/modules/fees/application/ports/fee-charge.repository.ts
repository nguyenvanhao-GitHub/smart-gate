import { FeeCharge } from '../../domain/fee-charge.entity';

export const FEE_CHARGE_REPOSITORY = Symbol('FEE_CHARGE_REPOSITORY');

export interface FeeChargeRepository {
  findByDossier(dossierId: string): Promise<FeeCharge[]>;
  /**
   * Ghi lại **toàn bộ** bảng phí của hồ sơ trong một giao dịch: xóa các dòng không còn trong bộ
   * mới rồi ghi bộ mới. Dùng cho lần tính/tính lại phí (F47) — bảng phí của một hồ sơ luôn được
   * thay nguyên khối để tổng tiền không bao giờ lệch giữa hai lần đọc.
   */
  replaceForDossier(dossierId: string, charges: FeeCharge[]): Promise<FeeCharge[]>;
  /** Ghi một dòng phí (điều chỉnh F47). */
  save(charge: FeeCharge): Promise<FeeCharge>;
}
