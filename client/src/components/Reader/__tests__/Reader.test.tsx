/**
 * Reader Component Tests
 *
 * Tests for the comic reader component focusing on layout and display.
 * Note: Full integration tests require a browser environment due to
 * DOM APIs like scrollTo. These tests verify basic structure.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, waitFor } from '@testing-library/react';
import { BrowserRouter } from 'react-router-dom';
import { Reader, ReaderProvider } from '../index';

// Mock scrollTo for jsdom
Element.prototype.scrollTo = vi.fn();

// Mock useDeviceDetection to return a non-touch device so toolbar renders
vi.mock('../../../hooks', async (importOriginal) => {
  const actual = await importOriginal() as Record<string, unknown>;
  return {
    ...actual,
    useDeviceDetection: () => ({
      isTouchDevice: false,
      isTablet: false,
      isMobile: false,
      isLandscape: true,
      isPortrait: false,
      screenWidth: 1920,
      screenHeight: 1080,
    }),
  };
});

// Mock the API service with all required exports
vi.mock('../../../services/api.service', async (importOriginal) => {
  const actual = await importOriginal() as Record<string, unknown>;
  return {
    ...actual,
    getArchiveContents: vi.fn().mockResolvedValue({
      entries: [
        { path: 'page001.jpg', size: 100000, isDirectory: false },
        { path: 'page002.jpg', size: 100000, isDirectory: false },
        { path: 'page003.jpg', size: 100000, isDirectory: false },
      ],
    }),
    getResolvedReaderSettings: vi.fn().mockResolvedValue({
      mode: 'single',
      background: 'black',
      brightness: 100,
      scalingMode: 'fit-height',
      showPageShadow: false,
      colorCorrection: 'none',
      imageSplitting: 'none',
      readingDirection: 'ltr',
      showThumbnails: false,
      autoHideUI: true,
      showPageNumbers: true,
      preloadCount: 3,
      webtoonMaxWidth: 800,
      webtoonGap: 0,
    }),
    getReadingProgress: vi.fn().mockResolvedValue({
      currentPage: 0,
      totalPages: 3,
      completed: false,
      bookmarks: [],
    }),
    getAdjacentFiles: vi.fn().mockResolvedValue({ previous: null, next: null }),
    getFile: vi.fn().mockResolvedValue({
      id: 'test-file-id',
      filename: 'Test Comic.cbz',
      metadata: null,
    }),
    generateThumbnails: vi.fn().mockResolvedValue({ success: true }),
    updateReadingProgress: vi.fn().mockResolvedValue({ success: true }),
    getPageUrl: vi.fn().mockImplementation((fileId: string, path: string) => `/api/files/${fileId}/page/${encodeURIComponent(path)}`),
  };
});

// Wrapper for providing required context
const TestWrapper = ({ children }: { children: React.ReactNode }) => (
  <BrowserRouter>
    {children}
  </BrowserRouter>
);

describe('Reader', () => {
  const defaultProps = {
    onClose: vi.fn(),
    onNavigateToFile: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Basic Rendering', () => {
    it('should render the reader container', async () => {
      const { container } = render(
        <TestWrapper>
          <ReaderProvider fileId="test-file-id" filename="Test Comic.cbz">
            <Reader {...defaultProps} />
          </ReaderProvider>
        </TestWrapper>
      );

      // Reader should render with the reader class
      await waitFor(() => {
        const reader = container.querySelector('.reader');
        expect(reader).toBeTruthy();
      });
    });

    it('should render the reader-content area', async () => {
      const { container } = render(
        <TestWrapper>
          <ReaderProvider fileId="test-file-id" filename="Test Comic.cbz">
            <Reader {...defaultProps} />
          </ReaderProvider>
        </TestWrapper>
      );

      await waitFor(() => {
        const content = container.querySelector('.reader-content');
        expect(content).toBeTruthy();
      });
    });

    it('should show loading state initially', () => {
      const { container } = render(
        <TestWrapper>
          <ReaderProvider fileId="test-file-id" filename="Test Comic.cbz">
            <Reader {...defaultProps} />
          </ReaderProvider>
        </TestWrapper>
      );

      // Should show loading indicator
      expect(container.querySelector('.reader-loading')).toBeTruthy();
    });
  });

  describe('Layout Structure', () => {
    it('should have reader-content for page display', async () => {
      const { container } = render(
        <TestWrapper>
          <ReaderProvider fileId="test-file-id" filename="Test Comic.cbz">
            <Reader {...defaultProps} />
          </ReaderProvider>
        </TestWrapper>
      );

      await waitFor(() => {
        const content = container.querySelector('.reader-content');
        expect(content).toBeTruthy();
      });
    });

    it('should render page container after loading', async () => {
      const { container } = render(
        <TestWrapper>
          <ReaderProvider fileId="test-file-id" filename="Test Comic.cbz">
            <Reader {...defaultProps} />
          </ReaderProvider>
        </TestWrapper>
      );

      await waitFor(() => {
        const pageContainer = container.querySelector('.reader-page-container');
        expect(pageContainer).toBeTruthy();
      }, { timeout: 3000 });
    });
  });

  describe('Background', () => {
    it('should apply background class', async () => {
      const { container } = render(
        <TestWrapper>
          <ReaderProvider fileId="test-file-id" filename="Test Comic.cbz">
            <Reader {...defaultProps} />
          </ReaderProvider>
        </TestWrapper>
      );

      await waitFor(() => {
        const reader = container.querySelector('.reader');
        expect(reader?.classList.contains('reader-bg-black')).toBe(true);
      });
    });
  });

  describe('Toolbar', () => {
    it('should render the toolbar', async () => {
      const { container } = render(
        <TestWrapper>
          <ReaderProvider fileId="test-file-id" filename="Test Comic.cbz">
            <Reader {...defaultProps} />
          </ReaderProvider>
        </TestWrapper>
      );

      await waitFor(() => {
        const toolbar = container.querySelector('.reader-toolbar');
        expect(toolbar).toBeTruthy();
      });
    });
  });
});
