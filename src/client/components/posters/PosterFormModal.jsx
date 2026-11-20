// PosterFormModal: a student posts or replaces their group's poster.
// Title, a short public description (with an AI helper) and the poster image with a preview.
//
// Props:
//   open        boolean
//   onClose     function
//   mine        object    from GET /api/posters/mine ({ projectTitle, poster })
//   onSaved     function  called with the saved poster
import { useEffect, useState } from 'react';
import Modal from '../common/Modal.jsx';
import FormField from '../common/FormField.jsx';
import Icon from '../common/Icon.jsx';
import AiNote from '../common/AiNote.jsx';
import { useToast } from '../../context/ToastContext.jsx';
import { saveMyPoster } from '../../api/posters.js';
import { draftPosterSummary } from '../../api/ai.js';
import { formatFileSize } from '../../utils/format.js';

const MAX_MB = 10;
const TYPES = ['image/png', 'image/jpeg', 'image/webp'];
const SUMMARY_MAX = 1000;
const SUMMARY_GOOD = 400;

// Reads the pixel size of an image file in the browser
function readImageSize(file) {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      resolve({ width: img.naturalWidth, height: img.naturalHeight });
      URL.revokeObjectURL(url);
    };
    img.onerror = () => {
      resolve(null);
      URL.revokeObjectURL(url);
    };
    img.src = url;
  });
}

export default function PosterFormModal({ open, onClose, mine, onSaved }) {
  const toast = useToast();
  const existing = mine?.poster || null;

  const [title, setTitle] = useState('');
  const [summary, setSummary] = useState('');
  const [image, setImage] = useState(null);
  const [preview, setPreview] = useState(null);
  const [dragging, setDragging] = useState(false);
  const [errors, setErrors] = useState({});
  const [formError, setFormError] = useState('');
  const [saving, setSaving] = useState(false);
  const [drafting, setDrafting] = useState(false);
  const [aiSource, setAiSource] = useState(null);

  // Fill the form each time it opens
  useEffect(() => {
    if (!open) return;
    setTitle(existing?.title || mine?.projectTitle || '');
    setSummary(existing?.summary || '');
    setImage(null);
    setErrors({});
    setFormError('');
    setAiSource(null);
  }, [open, existing, mine]);

  // Preview of the chosen file (or the current poster)
  useEffect(() => {
    if (!image) {
      setPreview(existing?.imageUrl || null);
      return undefined;
    }
    const url = URL.createObjectURL(image);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [image, existing]);

  async function chooseFile(file) {
    if (!file) return;
    if (!TYPES.includes(file.type)) {
      setErrors((old) => ({ ...old, image: 'Please choose a PNG, JPG or WebP image. (Export a PDF poster as an image first.)' }));
      return;
    }
    if (file.size > MAX_MB * 1024 * 1024) {
      setErrors((old) => ({ ...old, image: `The image is too large (maximum ${MAX_MB} MB).` }));
      return;
    }
    const size = await readImageSize(file);
    if (!size) {
      setErrors((old) => ({ ...old, image: 'This image could not be opened. Please choose it again.' }));
      return;
    }
    if (size.width < 300 || size.height < 300) {
      setErrors((old) => ({ ...old, image: 'The image is too small. Please use at least 300 × 300 pixels.' }));
      return;
    }
    setErrors((old) => ({ ...old, image: undefined }));
    setImage(file);
  }

  async function handleDraft() {
    setDrafting(true);
    try {
      const result = await draftPosterSummary(title);
      setSummary(result.summary);
      setAiSource(result.source);
    } catch (err) {
      toast.error(err.message);
    } finally {
      setDrafting(false);
    }
  }

  async function handleSubmit(event) {
    event.preventDefault();
    setFormError('');
    const found = {};
    if (!title.trim()) found.title = 'Please enter a title.';
    if (!existing && !image) found.image = 'Please choose the poster image.';
    if (summary.length > SUMMARY_MAX) found.summary = `Please keep the description under ${SUMMARY_MAX} characters.`;
    setErrors(found);
    if (Object.values(found).some(Boolean)) return;

    setSaving(true);
    try {
      const saved = await saveMyPoster({ title: title.trim(), summary: summary.trim(), image });
      toast.success(existing ? 'Poster updated' : 'Poster posted — everyone can see it now');
      onSaved(saved);
    } catch (err) {
      setFormError(err.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={existing ? 'Update your team’s poster' : 'Post your team’s poster'}
      size="large"
      closeOnBackdrop={false}
    >
      <form className="form poster-form" onSubmit={handleSubmit} noValidate>
        {formError && <div className="alert alert-error">{formError}</div>}

        <div className="poster-form-grid">
          <div className="stack">
            <FormField
              id="poster-title"
              label="Title"
              required
              value={title}
              maxLength={200}
              onChange={(e) => {
                setTitle(e.target.value);
                setErrors((old) => ({ ...old, title: undefined }));
              }}
              error={errors.title}
            />

            <div className="form-field">
              <div className="poster-form-label-row">
                <label htmlFor="poster-summary" className="label">
                  Short description
                </label>
                <button type="button" className="btn btn-ghost btn-small ai-button" onClick={handleDraft} disabled={drafting}>
                  <Icon name="sparkles" size={15} />
                  {drafting ? 'Writing…' : summary ? 'Rewrite with AI' : 'Write with AI'}
                </button>
              </div>
              <textarea
                id="poster-summary"
                rows={5}
                value={summary}
                maxLength={SUMMARY_MAX}
                placeholder="What problem does your project solve, and how? Visitors read this under your poster."
                aria-describedby="poster-summary-hint"
                onChange={(e) => {
                  setSummary(e.target.value);
                  setAiSource(null);
                }}
              />
              <p id="poster-summary-hint" className={`field-hint${summary.length > SUMMARY_GOOD ? ' text-warning' : ''}`}>
                {summary.length}/{SUMMARY_GOOD} characters recommended
              </p>
              {errors.summary && <p className="field-error">{errors.summary}</p>}
              <AiNote source={aiSource} />
            </div>

            <p className="alert alert-info poster-form-public">
              <Icon name="eye" size={16} />
              <span>Your poster, title, description and team names are shown to <strong>everyone</strong>, also people who are not signed in.</span>
            </p>
          </div>

          <div className="form-field">
            <span className="label" id="poster-image-label">
              Poster image {!existing && <span className="required" aria-hidden="true">*</span>}
            </span>
            <label
              className={`poster-drop${dragging ? ' dragging' : ''}${preview ? ' has-preview' : ''}`}
              onDragOver={(e) => {
                e.preventDefault();
                setDragging(true);
              }}
              onDragLeave={() => setDragging(false)}
              onDrop={(e) => {
                e.preventDefault();
                setDragging(false);
                chooseFile(e.dataTransfer.files?.[0]);
              }}
            >
              <input
                type="file"
                accept=".png,.jpg,.jpeg,.webp"
                className="sr-only"
                aria-labelledby="poster-image-label"
                onChange={(e) => {
                  chooseFile(e.target.files?.[0]);
                  e.target.value = '';
                }}
              />
              {preview ? (
                <img src={preview} alt="Poster preview" />
              ) : (
                <span className="poster-drop-empty">
                  <Icon name="image" size={30} />
                  <strong>Drop your poster here</strong>
                  <span>or click to choose a file</span>
                </span>
              )}
              {preview && (
                <span className="poster-drop-change">
                  <Icon name="upload" size={15} /> {image ? 'Choose another' : 'Replace image'}
                </span>
              )}
            </label>
            <p className="field-hint">
              {image ? `${image.name} · ${formatFileSize(image.size)}` : `PNG, JPG or WebP · up to ${MAX_MB} MB · portrait A-size works best`}
            </p>
            {errors.image && <p className="field-error">{errors.image}</p>}
          </div>
        </div>

        <div className="form-actions">
          <button type="button" className="btn btn-secondary" onClick={onClose} disabled={saving}>
            Cancel
          </button>
          <button type="submit" className="btn btn-primary" disabled={saving}>
            <Icon name="upload" size={16} />
            {saving ? 'Saving…' : existing ? 'Save changes' : 'Post poster'}
          </button>
        </div>
      </form>
    </Modal>
  );
}
