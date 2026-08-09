import { Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsIn,
  IsNumber,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
  ValidateNested,
} from 'class-validator';
import type {
  RatingSubmitRequest,
  RatingSubmitWithSignRequest,
  SignByTokenRequest,
  SignRequest,
  SignTokenRequest,
} from '@shared/api.interface';

/**
 * 考核操作请求 DTO（运行时校验）。
 * 结构校验为第一道防线，业务规则（快照归属、状态机、图片格式等）仍由 service 层校验。
 */

export class RatingItemDto {
  @IsString()
  @MinLength(1)
  indicatorSnapshotId!: string;

  @IsOptional()
  @IsNumber({ allowNaN: false, allowInfinity: false })
  score?: number;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  completionStatus?: string;

  @IsOptional()
  @IsString()
  @MaxLength(5000)
  comment?: string;
}

export class RatingSubmitDto implements RatingSubmitRequest {
  @IsBoolean()
  isDraft!: boolean;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => RatingItemDto)
  ratings!: RatingItemDto[];
}

export class RatingSubmitWithSignDto
  extends RatingSubmitDto
  implements RatingSubmitWithSignRequest
{
  @IsOptional()
  @IsString()
  @MaxLength(255)
  signName?: string;

  @IsString()
  @MinLength(1)
  signImage!: string;
}

export class SignDto implements SignRequest {
  @IsIn(['self', 'supervisor'])
  signType!: 'self' | 'supervisor';

  @IsOptional()
  @IsString()
  @MaxLength(255)
  signName?: string;

  @IsString()
  @MinLength(1)
  signImage!: string;
}

export class SignTokenRequestDto implements SignTokenRequest {
  @IsIn(['self', 'supervisor'])
  signType!: 'self' | 'supervisor';

  @IsString()
  @MaxLength(500)
  appBaseUrl!: string;
}

export class SignByTokenDto implements SignByTokenRequest {
  @IsString()
  @MinLength(1)
  token!: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  signName?: string;

  @IsString()
  @MinLength(1)
  signImage!: string;
}
