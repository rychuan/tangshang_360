import { buildAppBaseUrl } from '../../client/src/utils/app-url';

describe('application URL helper', () => {
  it('combines the current origin and application base path', () => {
    expect(buildAppBaseUrl('https://example.com', '/app/app-1/')).toBe(
      'https://example.com/app/app-1',
    );
    expect(buildAppBaseUrl('https://example.com/', '/')).toBe(
      'https://example.com',
    );
  });
});
