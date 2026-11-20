// PosterCard: one poster on the Posters wall. Clicking the image or the title opens the viewer.
//
// Props:
//   poster  object    an item from GET /api/posters
//   onOpen  function  called when the user wants to see the poster large
import Icon from '../common/Icon.jsx';

export default function PosterCard({ poster, onOpen }) {
  const ratio = poster.width && poster.height ? `${poster.width} / ${poster.height}` : '1 / 1.414';

  return (
    <article className="poster-card">
      {/* The image is clickable with the mouse; keyboard users use the title button below */}
      <div className="poster-card-media" style={{ aspectRatio: ratio }} onClick={onOpen} aria-hidden="true">
        <img src={poster.imageUrl} alt="" loading="lazy" width={poster.width || undefined} height={poster.height || undefined} />
        <span className="poster-card-zoom">
          <Icon name="search" size={16} /> View
        </span>
      </div>
      <div className="poster-card-body">
        <div className="poster-card-meta">
          <span>{poster.groupName}</span>
          {poster.academicYear && <span className="badge badge-gray">{poster.academicYear}</span>}
        </div>
        <h3>
          <button type="button" className="poster-card-title" onClick={onOpen}>
            {poster.title}
          </button>
        </h3>
        {poster.summary && <p className="poster-card-summary">{poster.summary}</p>}
        {poster.members.length > 0 && (
          <p className="poster-card-team">
            <Icon name="users" size={14} /> {poster.members.join(' · ')}
          </p>
        )}
      </div>
    </article>
  );
}
