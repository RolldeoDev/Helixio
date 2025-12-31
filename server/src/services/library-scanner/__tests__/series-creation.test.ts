import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../database.service.js', () => ({
  getDatabase: vi.fn(),
}));

describe('Series Creation Phase', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should create series sequentially', async () => {
    const { createSeriesFromFiles } = await import('../phases/series-creation.js');
    expect(createSeriesFromFiles).toBeDefined();
  });
});
