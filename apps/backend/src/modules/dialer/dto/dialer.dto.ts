import { IsString, IsNotEmpty, IsOptional, IsPhoneNumber, MaxLength, MinLength } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class InitiateCallDto {
  @ApiProperty({ example: '+12025551234', description: 'E.164 destination phone number' })
  @IsString()
  @IsNotEmpty()
  @MinLength(7)
  @MaxLength(20)
  destination: string;

  @ApiProperty({ description: 'SIP account UUID to place the call through' })
  @IsString()
  @IsNotEmpty()
  sipAccountId: string;

  @ApiPropertyOptional({ example: '+12025550000', description: 'Caller ID number to present' })
  @IsOptional()
  @IsString()
  callerIdNumber?: string;

  @ApiPropertyOptional({ example: 'CallsPsy', description: 'Caller ID name to present' })
  @IsOptional()
  @IsString()
  @MaxLength(50)
  callerIdName?: string;

  @ApiPropertyOptional({ example: 'Support follow-up', description: 'Optional note for this call' })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  notes?: string;
}

export class HangupCallDto {
  @ApiProperty({ description: 'Call UUID to hang up' })
  @IsString()
  @IsNotEmpty()
  callId: string;
}
