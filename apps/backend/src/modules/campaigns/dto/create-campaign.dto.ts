import {
  IsString, IsOptional, IsUUID, IsIn, IsInt, IsNumber,
  IsBoolean, IsDateString, Min, Max,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateCampaignDto {
  @ApiProperty({ example: 'Summer Promo Campaign' })
  @IsString()
  name: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional({ enum: ['BROADCAST', 'VOICEMAIL_DROP'] })
  @IsOptional()
  @IsIn(['BROADCAST', 'VOICEMAIL_DROP'])
  type?: string;

  @ApiProperty()
  @IsUUID()
  sipAccountId: string;

  @ApiProperty()
  @IsUUID()
  contactListId: string;

  @ApiProperty()
  @IsUUID()
  audioFileId: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  voicemailAudioId?: string;

  @ApiPropertyOptional({ example: 5 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(500)
  maxConcurrentCalls?: number;

  @ApiPropertyOptional({ example: 1.0 })
  @IsOptional()
  @IsNumber()
  @Min(0.1)
  @Max(100)
  callsPerSecond?: number;

  @ApiPropertyOptional({ example: 0 })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(3)
  retryAttempts?: number;

  @ApiPropertyOptional({ example: 300 })
  @IsOptional()
  @IsInt()
  retryDelay?: number;

  @ApiPropertyOptional({ example: true })
  @IsOptional()
  @IsBoolean()
  amdEnabled?: boolean;

  @ApiPropertyOptional({ enum: ['PLAY_ON_HUMAN', 'VOICEMAIL_DROP', 'HANGUP_ON_MACHINE', 'PLAY_ON_BOTH'] })
  @IsOptional()
  @IsIn(['PLAY_ON_HUMAN', 'VOICEMAIL_DROP', 'HANGUP_ON_MACHINE', 'PLAY_ON_BOTH'])
  amdAction?: string;

  @ApiPropertyOptional({ example: '+15551234567' })
  @IsOptional()
  @IsString()
  callerIdNumber?: string;

  @ApiPropertyOptional({ example: 'Acme Corp' })
  @IsOptional()
  @IsString()
  callerIdName?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  scheduledAt?: string;
}
