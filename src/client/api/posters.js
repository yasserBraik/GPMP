// API functions for the public project posters wall. Backend: /api/posters
import { api } from './client.js';

// params: { search?, year? } -> { posters: [...], years: ['2026-2027', ...] } (works signed out too)
export const getPosters = (params) => api.get('/posters', params);

// Student: { canPost, reason?, groupName, projectTitle, poster }
export const getMyPoster = () => api.get('/posters/mine');

// Student: posts or replaces the group's poster. `image` is optional when only the text changes.
export function saveMyPoster({ title, summary, image }) {
  const form = new FormData();
  form.append('title', title);
  form.append('summary', summary || '');
  if (image) form.append('poster', image);
  return api.upload('/posters/mine', form, 'PUT');
}

export const deletePoster = (id) => api.del(`/posters/${id}`);
