export const DOSSIER_OWNERSHIP = Symbol('DOSSIER_OWNERSHIP');

/** Thông tin tối thiểu để đối chiếu phạm vi dữ liệu của tệp đính kèm với hồ sơ tương ứng. */
export interface DossierOwnership {
  dossierId: string;
  /** Tài khoản đã tạo hồ sơ. */
  createdById: string | null;
  /** Mã số thuế doanh nghiệp chủ hồ sơ. */
  taxCode: string | null;
}

/**
 * Cổng đọc quyền sở hữu hồ sơ. Phân hệ `files` **không import trực tiếp** repository của
 * `declarations` để giữ chiều phụ thuộc một hướng — cùng cách `access-control` đọc tài khoản
 * qua `USER_DIRECTORY`.
 */
export interface DossierOwnershipPort {
  findOwnership(dossierId: string): Promise<DossierOwnership | null>;
}
