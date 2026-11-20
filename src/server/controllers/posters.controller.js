// Project posters wall: every group can post one poster image of their project, and the
// wall is public (visible to everyone, also without signing in).
//   GET    /api/posters             public list (search, year)
//   GET    /api/posters/:id/image   public poster image
//   GET    /api/posters/mine        student: the poster of their group (+ what they may do)
//   PUT    /api/posters/mine        student: post or replace their group's poster
//   DELETE /api/posters/:id         the group's students, its supervisor or an administrator

import fs from 'node:fs';
import { query, likePattern } from '../config/db.js';
import { HttpError } from '../utils/HttpError.js';
import { toInt, isBlank, trimOrNull, checkMaxLength } from '../utils/validate.js';
import { getGroupUserIds, isGroupSupervisor } from '../services/access.js';
import { notify } from '../services/notify.js';
import { imageInfo } from '../utils/imageInfo.js';
import { getUploadPath, storedFileExists, deleteStoredFile } from '../utils/paths.js';

const MAX_TITLE = 200;
const MAX_SUMMARY = 1000;

const POSTER_SELECT = `
  SELECT ps.PosterID AS id, ps.GroupID AS groupId, ps.Title AS title, ps.Summary AS summary,
         ps.ImageWidth AS width, ps.ImageHeight AS height, ps.FileSize AS size,
         ps.CreatedAt AS createdAt, ps.UpdatedAt AS updatedAt,
         g.GroupName AS groupName,
         p.ProjectID AS projectId, p.ProjectTitle AS projectTitle, p.AcademicYear AS academicYear,
         p.Status AS projectStatus, su.Name AS supervisorName
    FROM poster ps
    JOIN project_group g             ON g.GroupID = ps.GroupID
    LEFT JOIN graduation_project p   ON p.GroupID = ps.GroupID
    LEFT JOIN supervisor sp          ON sp.SupervisorID = g.SupervisorID
    LEFT JOIN \`user\` su            ON su.UserID = sp.UserID`;

// ---------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------

// Student names per group: Map groupId -> ['Name', ...]
async function getStudentNames(groupIds) {
  const map = new Map();
  if (groupIds.length === 0) return map;
  const rows = await query(
    `SELECT s.GroupID AS groupId, u.Name AS name
       FROM student s JOIN \`user\` u ON u.UserID = s.UserID
      WHERE s.GroupID IN (?) AND u.IsActive = 1 ORDER BY u.Name`,
    [groupIds]
  );
  for (const row of rows) {
    if (!map.has(row.groupId)) map.set(row.groupId, []);
    map.get(row.groupId).push(row.name);
  }
  return map;
}

// May this (possibly signed-out) user remove the poster of this group?
async function canManagePoster(user, groupId) {
  if (!user) return false;
  if (user.role === 'Administrator') return true;
  if (user.role === 'Student') return user.groupId === groupId;
  if (user.role === 'Supervisor') return isGroupSupervisor(user, groupId);
  return false;
}

// The API shape. The image address carries the update time, so browsers can cache it safely
async function toPosters(rows, user) {
  const names = await getStudentNames([...new Set(rows.map((r) => r.groupId))]);
  return Promise.all(
    rows.map(async (row) => ({
      ...row,
      members: names.get(row.groupId) || [],
      imageUrl: `/api/posters/${row.id}/image?v=${new Date(row.updatedAt).getTime()}`,
      canDelete: await canManagePoster(user, row.groupId),
    }))
  );
}

async function findPoster(id) {
  const rows = await query('SELECT PosterID, GroupID, FilePath, MimeType FROM poster WHERE PosterID = ?', [id]);
  if (rows.length === 0) throw new HttpError(404, 'Poster not found');
  return rows[0];
}

// ---------------------------------------------------------------------
// Public endpoints
// ---------------------------------------------------------------------

// GET /api/posters?search=&year=  -> newest first
export async function listPosters(req, res) {
  const where = [];
  const params = [];

  const search = trimOrNull(req.query.search);
  if (search) {
    checkMaxLength(search, 100, 'Search');
    where.push('(ps.Title LIKE ? OR ps.Summary LIKE ? OR g.GroupName LIKE ? OR p.ProjectTitle LIKE ?)');
    const pattern = likePattern(search);
    params.push(pattern, pattern, pattern, pattern);
  }
  const year = trimOrNull(req.query.year);
  if (year) {
    where.push('p.AcademicYear = ?');
    params.push(year);
  }

  const rows = await query(
    `${POSTER_SELECT} ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
      ORDER BY ps.UpdatedAt DESC, ps.PosterID DESC LIMIT 200`,
    params
  );
  const years = await query(
    `SELECT DISTINCT p.AcademicYear AS year FROM poster ps
       JOIN graduation_project p ON p.GroupID = ps.GroupID
      WHERE p.AcademicYear IS NOT NULL ORDER BY p.AcademicYear DESC`
  );

  res.json({ posters: await toPosters(rows, req.user), years: years.map((y) => y.year) });
}

// GET /api/posters/:id/image -> the image itself (public)
export async function getPosterImage(req, res) {
  const poster = await findPoster(toInt(req.params.id, 'Poster id'));
  if (!storedFileExists(poster.FilePath)) throw new HttpError(404, 'The poster image is missing.');

  res.set({
    'Content-Type': poster.MimeType,
    'Content-Disposition': 'inline',
    // The address changes when the poster is replaced (?v=...), so it may be cached for long
    'Cache-Control': 'public, max-age=604800, immutable',
  });
  res.sendFile(getUploadPath(poster.FilePath));
}

// ---------------------------------------------------------------------
// Signed-in endpoints
// ---------------------------------------------------------------------

// GET /api/posters/mine -> { canPost, reason?, groupName, projectTitle, poster }
export async function getMyPoster(req, res) {
  if (req.user.role !== 'Student') {
    return res.json({ canPost: false, reason: 'Only students post their group’s poster.', poster: null });
  }
  if (!req.user.groupId) {
    return res.json({ canPost: false, reason: 'Join a group first to post your project poster.', poster: null });
  }

  const [group] = await query(
    `SELECT g.GroupName AS groupName, p.ProjectTitle AS projectTitle
       FROM project_group g LEFT JOIN graduation_project p ON p.GroupID = g.GroupID
      WHERE g.GroupID = ?`,
    [req.user.groupId]
  );
  const rows = await query(`${POSTER_SELECT} WHERE ps.GroupID = ?`, [req.user.groupId]);
  const [poster] = rows.length ? await toPosters(rows, req.user) : [null];

  res.json({
    canPost: true,
    groupName: group?.groupName || null,
    projectTitle: group?.projectTitle || null,
    poster,
  });
}

/**
 * PUT /api/posters/mine (multipart: poster?, title, summary?)
 * Posts the group's poster, or replaces it. The image is optional when only the text changes.
 */
export async function saveMyPoster(req, res) {
  if (req.user.role !== 'Student') throw new HttpError(403, 'Only students can post their group’s poster.');
  const groupId = req.user.groupId;
  if (!groupId) throw new HttpError(400, 'Join a group first to post your project poster.');

  const title = trimOrNull(req.body.title);
  if (isBlank(title)) throw new HttpError(400, 'Please enter a title for the poster.', { field: 'title' });
  checkMaxLength(title, MAX_TITLE, 'Title');
  const summary = trimOrNull(req.body.summary);
  checkMaxLength(summary, MAX_SUMMARY, 'Summary');

  const [existing] = await query('SELECT PosterID, FilePath FROM poster WHERE GroupID = ?', [groupId]);
  if (!existing && !req.file) {
    throw new HttpError(400, 'Please choose the poster image.', { field: 'poster' });
  }

  // Check the real file content, not just its name: only true images are accepted
  let image = null;
  if (req.file) {
    const head = await readStart(getUploadPath(req.file.filename), 2 * 1024 * 1024);
    image = imageInfo(head);
    if (!image) {
      throw new HttpError(400, 'This file is not a valid PNG, JPG or WebP image.', { field: 'poster' });
    }
    if (image.width < 300 || image.height < 300) {
      throw new HttpError(400, 'The poster image is too small. Please upload at least 300 × 300 pixels.', {
        field: 'poster',
      });
    }
  }

  if (existing) {
    if (image) {
      await query(
        `UPDATE poster SET Title = ?, Summary = ?, FileName = ?, FilePath = ?, MimeType = ?, FileSize = ?,
                ImageWidth = ?, ImageHeight = ?, UploadedByUserID = ? WHERE PosterID = ?`,
        [
          title, summary, req.file.originalname.slice(0, 255), req.file.filename, image.mime, req.file.size,
          image.width, image.height, req.user.id, existing.PosterID,
        ]
      );
      await deleteStoredFile(existing.FilePath); // the old image is no longer used
    } else {
      await query('UPDATE poster SET Title = ?, Summary = ?, UploadedByUserID = ? WHERE PosterID = ?', [
        title, summary, req.user.id, existing.PosterID,
      ]);
    }
  } else {
    await query(
      `INSERT INTO poster (GroupID, Title, Summary, FileName, FilePath, MimeType, FileSize, ImageWidth, ImageHeight, UploadedByUserID)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        groupId, title, summary, req.file.originalname.slice(0, 255), req.file.filename, image.mime,
        req.file.size, image.width, image.height, req.user.id,
      ]
    );
  }

  // Tell the rest of the team and the supervisor (not the student who posted it)
  if (!existing || image) {
    const recipients = (await getGroupUserIds(groupId, { students: true, supervisor: true, examiner: false })).filter(
      (id) => id !== req.user.id
    );
    await notify(recipients, {
      type: 'System',
      title: existing ? 'Your team’s poster was updated' : 'Your team posted its project poster',
      message: `${req.user.name} ${existing ? 'replaced' : 'posted'} the poster “${title}” on the public Posters page.`,
      link: '/posters',
    });
  }

  const rows = await query(`${POSTER_SELECT} WHERE ps.GroupID = ?`, [groupId]);
  const [poster] = await toPosters(rows, req.user);
  res.status(existing ? 200 : 201).json(poster);
}

// DELETE /api/posters/:id
export async function deletePoster(req, res) {
  const poster = await findPoster(toInt(req.params.id, 'Poster id'));
  if (!(await canManagePoster(req.user, poster.GroupID))) {
    throw new HttpError(403, 'You can only remove your own group’s poster.');
  }
  await query('DELETE FROM poster WHERE PosterID = ?', [poster.PosterID]);
  await deleteStoredFile(poster.FilePath);
  res.json({ message: 'Poster removed' });
}

// Reads the first `bytes` of a file (enough to recognise an image and read its size)
async function readStart(filePath, bytes) {
  const handle = await fs.promises.open(filePath, 'r');
  try {
    const buffer = Buffer.alloc(bytes);
    const { bytesRead } = await handle.read(buffer, 0, bytes, 0);
    return buffer.subarray(0, bytesRead);
  } finally {
    await handle.close();
  }
}
