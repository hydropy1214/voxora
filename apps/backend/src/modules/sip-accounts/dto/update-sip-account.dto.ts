import { PartialType } from '@nestjs/swagger';
import { CreateSipAccountDto } from './create-sip-account.dto';
import { IsOptional, IsBoolean } from 'class-validator';

export class UpdateSipAccountDto extends PartialType(CreateSipAccountDto) {
  @IsOptional()
  @IsBoolean()
  active?: boolean;
}
