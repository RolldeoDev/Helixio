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

  const handleNavigateToFile = (newFileId: string) => {
    // Navigate to the new file, replacing current history entry
    // to allow easy back navigation to the library view
    navigate(`/read/${newFileId}`, { replace: true });
  };

  return (
    <ReaderProvider fileId={fileId} filename={filename}>
      <Reader onClose={handleClose} onNavigateToFile={handleNavigateToFile} />
    </ReaderProvider>
  );
}
