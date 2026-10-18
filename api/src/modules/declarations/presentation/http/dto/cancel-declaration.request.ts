import { IsOptional, IsString } from 'class-validator';

export class CancelDeclarationRequest {
  @IsOptional()
  @IsString()
  note?: string;
}
