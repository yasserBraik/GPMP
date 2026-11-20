// PosterViewer: shows one poster large, with its details. The arrow keys (and the Previous /
// Next buttons) move through the posters on the wall.
//
// Props:
//   posters   array     the posters on the wall
//   index     number    which one is open, or null when closed
//   onChange  function  called with the new index (or null to close)
//   onDelete  function  called with a poster the user may remove (button shown when canDelete)
import { useEffect } from 'react';
import Modal from '../common/Modal.jsx';
import Icon from '../common/Icon.jsx';
import ConfirmButton from '../common/ConfirmButton.jsx';
import { formatDate } from '../../utils/format.js';

export default function PosterViewer({ posters, index, onChange, onDelete }) {
  const poster = index === null ? null : posters[index];
  const hasPrevious = index > 0;
  const hasNext = index !== null && index < posters.length - 1;

  // Left / right arrow keys move to the previous / next poster
  useEffect(() => {
    if (!poster) return undefined;
    function handleKey(event) {
      if (event.target.closest?.('input, textarea, select')) return;
      if (event.key === 'ArrowLeft' && hasPrevious) onChange(index - 1);
      if (event.key === 'ArrowRight' && hasNext) onChange(index + 1);
    }
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [poster, index, hasPrevious, hasNext, onChange]);

  if (!poster) return <Modal open={false} onClose={() => onChange(null)} />;

  return (
    <Modal open onClose={() => onChange(null)} title={poster.title} size="large">
      <div className="poster-viewer">
        <div className="poster-viewer-image">
          <img src={poster.imageUrl} alt={`Poster: ${poster.title}`} width={poster.width || undefined} height={poster.height || undefined} />
        </div>

        <aside className="poster-viewer-info">
          <p className="poster-viewer-group">
            {poster.groupName}
            {poster.academicYear && <span className="badge badge-gray">{poster.academicYear}</span>}
          </p>
          {poster.projectTitle && poster.projectTitle !== poster.title && (
            <p className="muted small">Project: {poster.projectTitle}</p>
          )}
          {poster.summary && <p className="poster-viewer-summary">{poster.summary}</p>}

          <dl className="poster-viewer-facts">
            {poster.members.length > 0 && (
              <>
                <dt>Team</dt>
                <dd>{poster.members.join(', ')}</dd>
              </>
            )}
            {poster.supervisorName && (
              <>
                <dt>Supervisor</dt>
                <dd>{poster.supervisorName}</dd>
              </>
            )}
            <dt>Posted</dt>
            <dd>{formatDate(poster.updatedAt)}</dd>
          </dl>

          <div className="poster-viewer-actions">
            <a className="btn btn-secondary btn-small" href={poster.imageUrl} target="_blank" rel="noreferrer">
              <Icon name="externalLink" size={15} /> Full size
            </a>
            {poster.canDelete && (
              <ConfirmButton
                className="btn btn-ghost btn-small text-danger"
                title="Remove this poster?"
                message="It disappears from the public Posters page. The team can post a new one at any time."
                confirmLabel="Remove poster"
                onConfirm={() => onDelete(poster)}
              >
                <Icon name="trash" size={15} /> Remove
              </ConfirmButton>
            )}
          </div>

          <div className="poster-viewer-nav">
            <button type="button" className="btn btn-secondary btn-small" onClick={() => onChange(index - 1)} disabled={!hasPrevious}>
              <Icon name="chevronLeft" size={16} /> Previous
            </button>
            <span className="muted small">
              {index + 1} of {posters.length}
            </span>
            <button type="button" className="btn btn-secondary btn-small" onClick={() => onChange(index + 1)} disabled={!hasNext}>
              Next <Icon name="chevronRight" size={16} />
            </button>
          </div>
        </aside>
      </div>
    </Modal>
  );
}
