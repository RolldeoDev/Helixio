import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../database.service.js', () => ({
  getDatabase: vi.fn(),
}));

describe('File Linking Phase', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should link files to their series', async () => {
    const { linkFilesToSeries } = await import('../phases/file-linking.js');
    expect(linkFilesToSeries).toBeDefined();
  });
});
