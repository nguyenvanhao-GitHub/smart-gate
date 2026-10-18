import { IsEnum } from 'class-validator';
import { DeclarationType } from '../../../domain/declaration.enums';

/** Tham số cho GET /catalog/required-documents (F13). Loại hồ sơ bắt buộc và phải hợp lệ. */
export class ListRequiredDocumentsRequest {
  @IsEnum(DeclarationType, { message: 'Loại hồ sơ không hợp lệ.' })
  dossierType!: DeclarationType;
}
