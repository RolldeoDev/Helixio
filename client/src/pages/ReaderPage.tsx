/**
 * Reader Page
 *
 * Route component for the comic reader.
 * Wraps the Reader component with the ReaderProvider context.
 */

import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import { Reader, ReaderProvider } from '../components/Reader';

export function ReaderPage() {
  const { fileId } = useParams<{ fileId: string }>();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();

  const filename = searchParams.get('filename') || 'Comic';
  const startPageParam = searchParams.get('page');
  const startPage = startPageParam !== null ? parseInt(startPageParam, 10) : undefined;

  if (!fileId) {
    return (
      <div className="reader-error-page">
        <h2>No file specified</h2>
        <button onClick={() => navigate(-1)} className="btn-primary">
          Go Back
        </button>
      </div>
    );
  }

  const handleClose = () => {
    // Go back to previous page, or home if no history
    if (window.history.length > 1) {
      navigate(-1);
    } else {
      navigate('/');
    }
  };

  const handleNavigateToFile = (newFileId: string, options?: { startPage?: number }) => {
    // Navigate to the new file, replacing current history entry
    // to allow easy back navigation to the library view
    const pageParam = options?.startPage !== undefined ? `?page=${options.startPage}` : '';
    navigate(`/read/${newFileId}${pageParam}`, { replace: true });
  };

  return (
    <ReaderProvider fileId={fileId} filename={filename} startPage={startPage}>
      <Reader onClose={handleClose} onNavigateToFile={handleNavigateToFile} />
    </ReaderProvider>
  );
}
