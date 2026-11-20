// PostersPage: the public wall of project posters. Everyone can open it, also without
// signing in. Students see a "Your team's poster" card to post or replace their poster;
// the group's students, its supervisor and administrators can remove a poster.
import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import Icon from '../components/common/Icon.jsx';
import Loading from '../components/common/Loading.jsx';
import ErrorMessage from '../components/common/ErrorMessage.jsx';
import EmptyState from '../components/common/EmptyState.jsx';
import Tabs from '../components/common/Tabs.jsx';
import ConfirmButton from '../components/common/ConfirmButton.jsx';
import PosterCard from '../components/posters/PosterCard.jsx';
import PosterViewer from '../components/posters/PosterViewer.jsx';
import PosterFormModal from '../components/posters/PosterFormModal.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import { useToast } from '../context/ToastContext.jsx';
import { useApi } from '../hooks/useApi.js';
import { getPosters, getMyPoster, deletePoster } from '../api/posters.js';
import { plural } from '../utils/format.js';
import '../styles/posters.css';

// Waits until the user stops typing before searching
function useDebouncedValue(value, delay = 300) {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(timer);
  }, [value, delay]);
  return debounced;
}

// The student's own poster: post it, or see / update / remove it
function MyPosterCard({ mine, onEdit, onOpen, onDelete }) {
  if (!mine?.canPost) return null;
  const poster = mine.poster;

  return (
    <section className="card poster-mine" aria-labelledby="poster-mine-title">
      {poster ? (
        <button type="button" className="poster-mine-thumb" onClick={onOpen} aria-label="View your team’s poster">
          <img src={poster.imageUrl} alt="" />
        </button>
      ) : (
        <span className="poster-mine-placeholder" aria-hidden="true">
          <Icon name="image" size={28} />
        </span>
      )}
      <div className="poster-mine-text">
        <h2 id="poster-mine-title">{poster ? 'Your team’s poster is live' : 'Show your project to everyone'}</h2>
        <p>
          {poster
            ? `“${poster.title}” is on the public wall for ${mine.groupName}. You can replace it at any time.`
            : `Post a poster of ${mine.projectTitle ? `“${mine.projectTitle}”` : 'your project'} so visitors, students and staff can see what ${mine.groupName} is building.`}
        </p>
      </div>
      <div className="poster-mine-actions">
        <button type="button" className="btn btn-primary" onClick={onEdit}>
          <Icon name={poster ? 'edit' : 'upload'} size={16} /> {poster ? 'Update poster' : 'Post your poster'}
        </button>
        {poster && (
          <ConfirmButton
            className="btn btn-ghost text-danger"
            title="Remove your team’s poster?"
            message="It disappears from the public Posters page. You can post a new one at any time."
            confirmLabel="Remove poster"
            onConfirm={onDelete}
          >
            <Icon name="trash" size={16} /> Remove
          </ConfirmButton>
        )}
      </div>
    </section>
  );
}

export default function PostersPage() {
  const { user } = useAuth();
  const toast = useToast();
  const isStudent = user?.role === 'Student';

  const [searchText, setSearchText] = useState('');
  const search = useDebouncedValue(searchText.trim());
  const [year, setYear] = useState('all');
  const [viewIndex, setViewIndex] = useState(null);
  const [formOpen, setFormOpen] = useState(false);

  const { data, loading, error, reload } = useApi(
    () => getPosters({ search, year: year === 'all' ? '' : year }),
    [search, year, user?.id]
  );
  const mine = useApi(() => (isStudent ? getMyPoster() : Promise.resolve(null)), [isStudent, user?.id]);

  const posters = useMemo(() => data?.posters || [], [data]);
  const years = data?.years || [];

  async function handleDelete(poster) {
    await deletePoster(poster.id);
    toast.success('Poster removed');
    setViewIndex(null);
    reload();
    mine.reload();
  }

  function openMine() {
    const index = posters.findIndex((p) => p.id === mine.data?.poster?.id);
    if (index >= 0) setViewIndex(index);
  }

  let content;
  if (loading) content = <Loading text="Loading posters..." />;
  else if (error) content = <ErrorMessage error={error} onRetry={reload} title="Could not load the posters" />;
  else if (posters.length === 0) {
    content = (
      <EmptyState
        icon="image"
        title={search || year !== 'all' ? 'No posters match your search' : 'No posters yet'}
        message={
          search || year !== 'all'
            ? 'Try another word or academic year.'
            : 'When project teams post their posters, they appear here for everyone to see.'
        }
        action={
          (search || year !== 'all') && (
            <button
              type="button"
              className="btn btn-secondary"
              onClick={() => {
                setSearchText('');
                setYear('all');
              }}
            >
              Show all posters
            </button>
          )
        }
      />
    );
  } else {
    content = (
      <div className="poster-wall">
        {posters.map((poster, index) => (
          <PosterCard key={poster.id} poster={poster} onOpen={() => setViewIndex(index)} />
        ))}
      </div>
    );
  }

  return (
    <div className="posters-page">
      <section className="hero posters-hero">
        <p className="posters-eyebrow">
          <Icon name="eye" size={15} /> Public page · visible to everyone
        </p>
        <h1>Project Posters</h1>
        <p>
          Graduation projects of Al-Yamamah University, one poster per team. Click a poster to see it full size.
        </p>
        {!user && (
          <p className="posters-hero-cta">
            Are you on a project team? <Link to="/login" state={{ from: { pathname: '/posters' } }}>Sign in</Link> to post your poster.
          </p>
        )}
      </section>

      {isStudent && (
        <MyPosterCard
          mine={mine.data}
          onEdit={() => setFormOpen(true)}
          onOpen={openMine}
          onDelete={() => handleDelete(mine.data.poster)}
        />
      )}

      <div className="posters-toolbar">
        <div className="input-with-icon posters-search">
          <Icon name="search" size={18} />
          <label htmlFor="posters-search" className="sr-only">
            Search posters
          </label>
          <input
            id="posters-search"
            type="search"
            placeholder="Search posters..."
            value={searchText}
            onChange={(e) => setSearchText(e.target.value)}
          />
        </div>
        {!loading && !error && (
          <span className="muted small" aria-live="polite">
            {plural(posters.length, 'poster')}
          </span>
        )}
      </div>

      {years.length > 1 && (
        <Tabs
          tabs={[{ value: 'all', label: 'All years' }, ...years.map((y) => ({ value: y, label: y }))]}
          active={year}
          onChange={setYear}
          ariaLabel="Academic year"
        />
      )}

      {content}

      <PosterViewer
        posters={posters}
        index={viewIndex}
        onChange={setViewIndex}
        onDelete={async (poster) => {
          await handleDelete(poster);
        }}
      />

      {isStudent && (
        <PosterFormModal
          open={formOpen}
          onClose={() => setFormOpen(false)}
          mine={mine.data}
          onSaved={() => {
            setFormOpen(false);
            reload();
            mine.reload();
          }}
        />
      )}
    </div>
  );
}
