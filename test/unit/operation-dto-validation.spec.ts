import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import {
  RatingSubmitDto,
  RatingSubmitWithSignDto,
  SignByTokenDto,
  SignDto,
  SignTokenRequestDto,
} from '../../server/modules/assessment-operation/dto/operation.dto';

describe('operation DTO runtime validation', () => {
  describe('RatingSubmitDto', () => {
    it('accepts a valid rating payload', async () => {
      const dto = plainToInstance(RatingSubmitDto, {
        isDraft: false,
        ratings: [
          {
            indicatorSnapshotId: 'snap-1',
            score: 85.5,
            completionStatus: '已完成',
            comment: '良好',
          },
        ],
      });
      const errors = await validate(dto);
      expect(errors).toEqual([]);
    });

    it('rejects non-boolean isDraft', async () => {
      const dto = plainToInstance(RatingSubmitDto, {
        isDraft: 'yes',
        ratings: [],
      });
      const errors = await validate(dto);
      expect(errors.some((e) => e.property === 'isDraft')).toBe(true);
    });

    it('rejects ratings without indicatorSnapshotId', async () => {
      const dto = plainToInstance(RatingSubmitDto, {
        isDraft: true,
        ratings: [{ score: 90 }],
      });
      const errors = await validate(dto);
      const nested = errors.find((e) => e.property === 'ratings');
      expect(nested?.children?.[0]?.property).toBe('0');
      expect(nested?.children?.[0]?.children?.[0]?.property).toBe(
        'indicatorSnapshotId',
      );
    });

    it('rejects negative score', async () => {
      const dto = plainToInstance(RatingSubmitDto, {
        isDraft: false,
        ratings: [{ indicatorSnapshotId: 's1', score: -1 }],
      });
      const errors = await validate(dto);
      expect(errors.some((e) => e.property === 'ratings')).toBe(true);
    });
  });

  describe('RatingSubmitWithSignDto', () => {
    it('requires signImage', async () => {
      const dto = plainToInstance(RatingSubmitWithSignDto, {
        isDraft: false,
        ratings: [{ indicatorSnapshotId: 's1', score: 90 }],
      });
      const errors = await validate(dto);
      expect(errors.some((e) => e.property === 'signImage')).toBe(true);
    });
  });

  describe('SignDto', () => {
    it('accepts a valid sign payload', async () => {
      const dto = plainToInstance(SignDto, {
        signType: 'self',
        signName: '张三',
        signImage: 'data:image/png;base64,AAAA',
      });
      const errors = await validate(dto);
      expect(errors).toEqual([]);
    });

    it('rejects invalid signType', async () => {
      const dto = plainToInstance(SignDto, {
        signType: 'boss',
        signImage: 'data:image/png;base64,AAAA',
      });
      const errors = await validate(dto);
      expect(errors.some((e) => e.property === 'signType')).toBe(true);
    });
  });

  describe('SignTokenRequestDto', () => {
    it('requires appBaseUrl', async () => {
      const dto = plainToInstance(SignTokenRequestDto, { signType: 'self' });
      const errors = await validate(dto);
      expect(errors.some((e) => e.property === 'appBaseUrl')).toBe(true);
    });
  });

  describe('SignByTokenDto', () => {
    it('requires non-empty token', async () => {
      const dto = plainToInstance(SignByTokenDto, {
        token: '',
        signImage: 'data:image/jpeg;base64,AAAA',
      });
      const errors = await validate(dto);
      expect(errors.some((e) => e.property === 'token')).toBe(true);
    });
  });
});
