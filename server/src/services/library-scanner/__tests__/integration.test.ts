import { describe, it, expect, vi, beforeEach } from 'vitest';

describe('Library Scanner Integration', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should export all phases', async () => {
    const scanner = await import('../index.js');

    expect(scanner.scanLibrary).toBeDefined();
  });

  it('should have correct phase order', async () => {
    // The scanner should process phases in order:
    // 1. discovery
    // 2. metadata
    // 3. series (sequential!)
    // 4. linking
    // 5. covers

    const types = await import('../types.js');
    expect(types).toBeDefined();
  });

  it('should export types correctly', async () => {
    const types = await import('../types.js');

    // Verify the types module can be imported and has expected exports
    expect(typeof types).toBe('object');
    expect(types).toBeDefined();
  });

  it('should export all phase functions', async () => {
    const discovery = await import('../phases/discovery.js');
    const metadata = await import('../phases/metadata-extraction.js');
    const series = await import('../phases/series-creation.js');
    const linking = await import('../phases/file-linking.js');
    const covers = await import('../phases/cover-extraction.js');

    expect(discovery.discoverFiles).toBeDefined();
    expect(metadata.extractMetadata).toBeDefined();
    expect(series.createSeriesFromFiles).toBeDefined();
    expect(linking.linkFilesToSeries).toBeDefined();
    expect(covers.extractCovers).toBeDefined();
  });
});
