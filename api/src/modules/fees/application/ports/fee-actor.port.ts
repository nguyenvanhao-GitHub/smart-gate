export const FEE_ACTOR_DIRECTORY = Symbol('FEE_ACTOR_DIRECTORY');

export interface FeeActor {
  id: string;
  fullName: string;
}

/**
 * Tên hiển thị của người xác nhận thanh toán. Lưu **kèm vào giao dịch** chứ không tham chiếu sống:
 * biên lai là chứng cứ, phải đọc được nguyên vẹn sau khi tài khoản bị đổi tên hoặc khóa.
 */
export interface FeeActorDirectory {
  findById(userId: string): Promise<FeeActor | null>;
}
