import { Type } from 'class-transformer';
import { IsArray, IsBoolean, IsNotEmpty, IsOptional, IsString, ValidateNested } from 'class-validator';

export class UpdateDossierFieldConfigItemRequest {
  @IsString()
  @IsNotEmpty()
  fieldKey!: string;

  @IsString()
  @IsOptional()
  sectionKey?: string;

  @IsBoolean()
  isVisible!: boolean;

  @IsBoolean()
  isRequired!: boolean;
}

export class UpdateDossierFieldConfigsRequest {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => UpdateDossierFieldConfigItemRequest)
  items!: UpdateDossierFieldConfigItemRequest[];
}
