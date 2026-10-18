import { FeeCharge } from '../../domain/fee-charge.entity';
import { FeeUnit } from '../../domain/fee.enums';
import { FeeChargeOrmEntity } from './fee-charge.orm-entity';
import { readAmount, readQuantity, writeNumeric } from './money';

export class FeeChargeMapper {
  static toDomain(row: FeeChargeOrmEntity): FeeCharge {
    return new FeeCharge(
      row.id,
      row.dossierId,
      row.ruleId,
      row.ruleCode,
      row.name,
      row.unit as FeeUnit,
      readQuantity(row.quantity),
      readAmount(row.unitAmount),
      readAmount(row.amount),
      row.adjusted,
      row.reasonCode,
      row.reasonNote,
      row.adjustedById,
      row.adjustedAt ? new Date(row.adjustedAt) : null,
      new Date(row.calculatedAt),
      row.sortOrder,
    );
  }

  static toPersistence(charge: FeeCharge): FeeChargeOrmEntity {
    const row = new FeeChargeOrmEntity();
    row.id = charge.id;
    row.dossierId = charge.dossierId;
    row.ruleId = charge.ruleId;
    row.ruleCode = charge.ruleCode;
    row.name = charge.name;
    row.unit = charge.unit;
    row.quantity = writeNumeric(charge.quantity, 3);
    row.unitAmount = writeNumeric(charge.unitAmount);
    row.amount = writeNumeric(charge.amount);
    row.adjusted = charge.adjusted;
    row.reasonCode = charge.reasonCode;
    row.reasonNote = charge.reasonNote;
    row.adjustedById = charge.adjustedById;
    row.adjustedAt = charge.adjustedAt;
    row.calculatedAt = charge.calculatedAt;
    row.sortOrder = charge.sortOrder;
    return row;
  }
}
