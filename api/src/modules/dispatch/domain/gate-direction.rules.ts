import { GateDirection } from '../../catalog/domain/border-facility.catalog';
import { DeclarationType } from '../../declarations/domain/declaration.enums';

/**
 * Chiều cổng hợp lệ theo **luồng của hồ sơ** — cùng quy ước `flowForDossierType` (queue domain):
 * hồ sơ nhập (`IMPORT` / `SELF_PROPELLED`) chỉ được gán cổng chiều `ENTRY`; hồ sơ xuất
 * (`EXPORT` / `TRANSSHIPMENT`) chỉ được gán cổng chiều `EXIT`.
 *
 * `flow` gắn với hồ sơ, `direction` gắn với cổng — hai từ trùng nhau nhưng khác chủ thể; hàm này
 * là cầu nối một chiều: từ loại hồ sơ suy ra chiều cổng được phép.
 */
export function expectedGateDirection(type: DeclarationType): GateDirection {
  return type === DeclarationType.EXPORT || type === DeclarationType.TRANSSHIPMENT_EXPORT
    ? GateDirection.EXIT
    : GateDirection.ENTRY;
}
