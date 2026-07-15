import {
  hashSignToken,
  validateSignImage,
} from '../../server/modules/assessment-operation/sign-session.utils';

describe('sign session utilities', () => {
  describe('hashSignToken', () => {
    it('returns a deterministic SHA-256 digest without exposing the token', () => {
      const token = 'plain-mobile-sign-token';

      const first = hashSignToken(token);
      const second = hashSignToken(token);

      expect(first).toBe(second);
      expect(first).toMatch(/^[a-f0-9]{64}$/);
      expect(first).not.toContain(token);
    });
  });

  describe('validateSignImage', () => {
    it('accepts a valid PNG data URL', () => {
      const image = `data:image/png;base64,${Buffer.from('png-data').toString('base64')}`;

      expect(validateSignImage(image)).toBe(image);
    });

    it('rejects a missing image', () => {
      expect(() => validateSignImage(undefined)).toThrow('签名图片不能为空');
    });

    it('rejects unsupported image types', () => {
      const image = `data:image/gif;base64,${Buffer.from('gif-data').toString('base64')}`;

      expect(() => validateSignImage(image)).toThrow(
        '签名图片格式无效，仅支持 PNG 或 JPEG',
      );
    });

    it('rejects malformed base64 data', () => {
      expect(() =>
        validateSignImage('data:image/png;base64,not-valid-***'),
      ).toThrow('签名图片数据无效');
    });

    it('rejects decoded images larger than 1 MiB', () => {
      const image = `data:image/png;base64,${Buffer.alloc(1024 * 1024 + 1).toString('base64')}`;

      expect(() => validateSignImage(image)).toThrow(
        '签名图片不能超过 1 MiB',
      );
    });
  });
});
