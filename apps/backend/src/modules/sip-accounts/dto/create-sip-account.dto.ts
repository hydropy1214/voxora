import { IsString, IsInt, IsOptional, IsNumber, IsIn, Min, Max } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateSipAccountDto {
  @ApiProperty({ example: 'My SIP Provider' })
  @IsString()
  name: string;

  @ApiProperty({ example: 'sip.provider.com' })
  @IsString()
  sipServer: string;

  @ApiPropertyOptional({ example: 5060 })
  @IsOptional()
  @IsInt()
  sipPort?: number;

  @ApiProperty({ example: '1001' })
  @IsString()
  username: string;

  @ApiProperty({ example: 'secret_password' })
  @IsString()
  password: string;

  @ApiPropertyOptional({ enum: ['UDP', 'TCP', 'TLS'] })
  @IsOptional()
  @IsIn(['UDP', 'TCP', 'TLS'])
  transport?: 'UDP' | 'TCP' | 'TLS';

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  proxy?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  outboundProxy?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  fromDomain?: string;

  @ApiPropertyOptional({ example: 'Voxora' })
  @IsOptional()
  @IsString()
  callerIdName?: string;

  @ApiPropertyOptional({ example: '+15551234567' })
  @IsOptional()
  @IsString()
  callerIdNumber?: string;

  @ApiPropertyOptional({ example: 10 })
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
}
