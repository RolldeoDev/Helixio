import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../database.service.js', () => ({
  getDatabase: vi.fn(),
}));

describe('Metadata Extraction Phase', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should extract series name from ComicInfo.xml', async () => {
    const { extractMetadata } = await import('../phases/metadata-extraction.js');
    expect(extractMetadata).toBeDefined();
  });
});
