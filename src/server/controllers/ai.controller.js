// AI helpers (see services/ai.js). Each endpoint checks access with the SAME rules as the
// normal feature, so the AI can never show a user data they could not open themselves.
//   GET  /api/ai/status          -> { enabled, model }
//   POST /api/ai/chat-summary    -> "Catch me up": summary of a chat channel
//   POST /api/ai/feedback-draft  -> supervisor: a first draft of feedback on a submission
//   POST /api/ai/poster-summary  -> student: a short public description for the group's poster
// Every answer has source: 'ai' (Claude wrote it) or 'basic' (built-in rules, no AI key set).

import fs from 'node:fs';
import path from 'node:path';
import { query } from '../config/db.js';
import { HttpError } from '../utils/HttpError.js';
import { toInt } from '../utils/validate.js';
import { aiEnabled, aiStatus, askJson, cleanText, cleanList } from '../services/ai.js';
import { assertChannelMember, getChannelUnreadCount } from './chat.controller.js';
import { findSubmission, assertCanReview } from './feedback.controller.js';
import { getUploadPath, storedFileExists } from '../utils/paths.js';

// GET /api/ai/status
export function getAiStatus(req, res) {
  res.json(aiStatus());
}

// Formats a date for the AI and the basic summaries, e.g. "Mon 16 Nov, 14:05"
function shortDate(value) {
  return new Date(value).toLocaleString('en-GB', {
    weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Riyadh',
  });
}

// ---------------------------------------------------------------------
// Chat: "Catch me up"
// ---------------------------------------------------------------------

const ACTION_WORDS = /\b(will|need to|needs to|have to|please|todo|to do|deadline|due|by (?:mon|tue|wed|thu|fri|sat|sun|tomorrow|tonight|next)|should|must|let'?s)\b/i;

// The simple built-in summary used when no AI key is set
function basicChatSummary(messages, unread) {
  const people = [...new Set(messages.map((m) => m.senderName))];
  const first = messages[0];
  const last = messages[messages.length - 1];
  const latestPerPerson = people
    .map((name) => [...messages].reverse().find((m) => m.senderName === name))
    .slice(0, 4)
    .map((m) => `${m.senderName}: ${cleanText(m.text, 160)}`);

  return {
    overview:
      `${messages.length} message${messages.length === 1 ? '' : 's'} from ${people.join(', ')}` +
      ` between ${shortDate(first.date)} and ${shortDate(last.date)}` +
      (unread > 0 ? ` (${unread} unread).` : '.'),
    keyPoints: latestPerPerson,
    decisions: [],
    actionItems: messages
      .filter((m) => ACTION_WORDS.test(m.text))
      .slice(-4)
      .map((m) => ({ task: cleanText(m.text, 200), owner: m.senderName })),
    openQuestions: messages
      .filter((m) => m.text.trim().endsWith('?'))
      .slice(-3)
      .map((m) => `${m.senderName}: ${cleanText(m.text, 200)}`),
  };
}

/**
 * POST /api/ai/chat-summary { groupId, channel }
 * (body may also have `unread`: how many messages were unread when the user opened the channel)
 * Summarises the unread messages (with a little earlier context), or the recent conversation
 * when nothing is unread.
 */
export async function summarizeChat(req, res) {
  const { groupId, groupName, channel } = await assertChannelMember(req.user, req.body.groupId, req.body.channel);
  // Opening a channel marks it as read, so the page sends how many messages were unread when the
  // user opened it. It only decides what the summary focuses on (all messages are the user's anyway).
  const stillUnread = await getChannelUnreadCount(req.user, groupId, channel);
  const unreadHint = Number.isInteger(req.body.unread) ? Math.min(Math.max(req.body.unread, 0), 100) : 0;
  const unread = Math.max(stillUnread, unreadHint);
  const limit = Math.min(Math.max(unread + 10, 40), 120);

  const rows = await query(
    `SELECT m.ChatID AS id, m.MessageText AS text, m.MsgDate AS date,
            COALESCE(u.Name, 'Former user') AS senderName, u.Role AS senderRole
       FROM chat_message m LEFT JOIN \`user\` u ON u.UserID = m.SenderUserID
      WHERE m.GroupID = ? AND m.MsgType = ?
      ORDER BY m.ChatID DESC LIMIT ?`,
    [groupId, channel, limit]
  );
  const messages = rows.reverse();
  if (messages.length === 0) {
    return res.json({ source: 'basic', empty: true, messageCount: 0, unread: 0 });
  }

  const base = { messageCount: messages.length, unread, groupName, channel };
  if (!aiEnabled()) return res.json({ source: 'basic', ...base, ...basicChatSummary(messages, unread) });

  const firstUnread = unread > 0 ? messages.length - unread : messages.length;
  const transcript = messages
    .map((m, i) => `${i === firstUnread ? '--- UNREAD FROM HERE ---\n' : ''}[${shortDate(m.date)}] ${m.senderName} (${m.senderRole || 'user'}): ${m.text}`)
    .join('\n');

  const answer = await askJson({
    task:
      `Summarise this graduation-project chat of ${groupName} for ${req.user.name} (${req.user.role}). ` +
      (unread > 0
        ? `Focus on the ${unread} unread message(s) after the UNREAD marker; use earlier messages only as context.`
        : 'Summarise the recent conversation.') +
      ' Name who said what when it matters. Keep every item short.',
    shape:
      '{"overview": "2-3 sentence summary", "keyPoints": ["..."], "decisions": ["decisions that were agreed"], ' +
      '"actionItems": [{"task": "what must be done", "owner": "name or null"}], "openQuestions": ["questions still unanswered"]}',
    data: transcript,
  });

  res.json({
    source: 'ai',
    ...base,
    overview: cleanText(answer.overview, 800),
    keyPoints: cleanList(answer.keyPoints, 6),
    decisions: cleanList(answer.decisions, 5),
    actionItems: (Array.isArray(answer.actionItems) ? answer.actionItems : [])
      .map((a) => ({ task: cleanText(a?.task ?? a, 250), owner: cleanText(a?.owner, 80) || null }))
      .filter((a) => a.task)
      .slice(0, 6),
    openQuestions: cleanList(answer.openQuestions, 4),
  });
}

// ---------------------------------------------------------------------
// Feedback draft for supervisors
// ---------------------------------------------------------------------

const MAX_EXCERPT = 6000;
const READABLE = new Set(['.txt', '.csv', '.md', '.pdf']);

// Reads a little text from a submitted file: plain text files, and simple (uncompressed) PDFs.
// Returns '' when the text cannot be read; the AI is then told it only saw the file name.
async function readExcerpt(file) {
  const extension = path.extname(file.name).toLowerCase();
  if (!READABLE.has(extension) || !storedFileExists(file.path)) return '';
  try {
    const handle = await fs.promises.open(getUploadPath(file.path), 'r');
    const buffer = Buffer.alloc(2 * 1024 * 1024);
    const { bytesRead } = await handle.read(buffer, 0, buffer.length, 0);
    await handle.close();
    const raw = buffer.subarray(0, bytesRead).toString('latin1');

    if (extension !== '.pdf') return Buffer.from(raw, 'latin1').toString('utf8').slice(0, MAX_EXCERPT);
    const parts = [...raw.matchAll(/\(((?:\\.|[^\\)])*)\)\s*Tj/g)].map((m) => m[1].replace(/\\([()\\])/g, '$1'));
    return parts.join('\n').slice(0, MAX_EXCERPT);
  } catch {
    return '';
  }
}

// Collects everything the reviewer can see about a submission
async function loadSubmissionContext(submissionId) {
  const [details] = await query(
    `SELECT s.SubmissionID AS id, s.SubmissionDate AS submittedAt, s.SubmissionDeadline AS deadline,
            s.SubmissionSource AS link, s.Notes AS notes, s.TaskID AS taskId,
            t.Title AS taskTitle, t.Description AS taskDescription, t.DueDate AS dueDate, t.IsMilestone AS isMilestone,
            g.GroupName AS groupName, p.ProjectTitle AS projectTitle, u.Name AS submittedBy
       FROM submission s
       JOIN task t ON t.TaskID = s.TaskID
       JOIN project_group g ON g.GroupID = s.GroupID
       LEFT JOIN graduation_project p ON p.GroupID = s.GroupID
       LEFT JOIN student st ON st.StudentID = s.SubmittedByStudentID
       LEFT JOIN \`user\` u ON u.UserID = st.UserID
      WHERE s.SubmissionID = ?`,
    [submissionId]
  );
  const files = await query(
    'SELECT FileName AS name, FilePath AS path, FileSize AS size FROM `file` WHERE SubmissionID = ? ORDER BY FileID',
    [submissionId]
  );
  // Earlier feedback on the same task, so the draft can check if requested changes were made
  const earlier = await query(
    `SELECT fb.Decision AS decision, fb.Comments AS comments, fb.Improvements AS improvements
       FROM feedback fb JOIN submission s ON s.SubmissionID = fb.SubmissionID
      WHERE s.TaskID = ? AND s.SubmissionID <> ? ORDER BY fb.CreatedAt DESC LIMIT 3`,
    [details.taskId, submissionId]
  );
  for (const file of files) file.excerpt = await readExcerpt(file);

  const due = details.deadline || details.dueDate;
  const late = due ? new Date(details.submittedAt) > new Date(`${new Date(due).toISOString().slice(0, 10)}T23:59:59+03:00`) : false;
  return { ...details, files, earlier, late };
}

function basicFeedbackDraft(ctx) {
  const strengths = [];
  const improvements = [];
  if (!ctx.late) strengths.push('The work was submitted on time.');
  if (ctx.files.length > 0) strengths.push(`The submission includes ${ctx.files.length} file${ctx.files.length === 1 ? '' : 's'} (${ctx.files.map((f) => f.name).join(', ')}).`);
  if (ctx.link) strengths.push('A link to the work was shared, which makes reviewing easier.');
  if (ctx.late) improvements.push('The submission arrived after the deadline; please plan the remaining tasks with more buffer.');
  if (!ctx.notes) improvements.push('Add a short note with each submission that explains what changed and what you want feedback on.');
  if (ctx.earlier.length > 0 && ctx.earlier[0].decision === 'Needs Revision') {
    improvements.push('Check that every change requested in the previous feedback has been made.');
  }
  return {
    decision: null, // the supervisor chooses; the rules cannot judge the quality of the work
    strengths: strengths.join(' '),
    improvements: improvements.join(' '),
    comments:
      `Thank you for submitting "${ctx.taskTitle}". [Write your main assessment here: does the work meet the ` +
      'task requirements, and what are the most important next steps?]',
  };
}

/**
 * POST /api/ai/feedback-draft { submissionId }
 * Returns { decision, strengths, improvements, comments, filesRead, filesTotal, source }.
 * Nothing is saved: the supervisor reviews and edits the draft in the feedback form.
 */
export async function draftFeedback(req, res) {
  const submission = await findSubmission(toInt(req.body.submissionId, 'Submission id'));
  await assertCanReview(req.user, submission.groupId);
  const ctx = await loadSubmissionContext(submission.id);

  const filesRead = ctx.files.filter((f) => f.excerpt).length;
  const base = { filesRead, filesTotal: ctx.files.length, late: ctx.late };
  if (!aiEnabled()) return res.json({ source: 'basic', ...base, ...basicFeedbackDraft(ctx) });

  const data = [
    `Project: ${ctx.projectTitle || '(no title)'} — group ${ctx.groupName}`,
    `Task: ${ctx.taskTitle}${ctx.isMilestone ? ' (milestone)' : ''}`,
    `Task description: ${ctx.taskDescription || '(none)'}`,
    `Due: ${ctx.dueDate ? new Date(ctx.dueDate).toISOString().slice(0, 10) : 'no due date'}; submitted ${shortDate(ctx.submittedAt)}${ctx.late ? ' (LATE)' : ' (on time)'} by ${ctx.submittedBy || 'a student'}`,
    `Student note: ${ctx.notes || '(none)'}`,
    `Link: ${ctx.link || '(none)'}`,
    ...ctx.files.map((f) =>
      f.excerpt ? `File "${f.name}" — text excerpt:\n${f.excerpt}` : `File "${f.name}" — content not readable, only the name is known`
    ),
    ...ctx.earlier.map((e) => `Earlier feedback on this task (${e.decision}): ${e.comments}${e.improvements ? ` | To improve: ${e.improvements}` : ''}`),
  ].join('\n\n');

  const answer = await askJson({
    task:
      `Draft feedback that ${req.user.name}, the supervisor, could give the students on this submission. ` +
      'Be specific to the content you can see and refer to the task requirements. If you could only see file ' +
      'names, say the supervisor should check the files and keep the judgement cautious. If earlier feedback ' +
      'asked for changes, check whether they appear to be addressed. Address the students directly ("you").',
    shape:
      '{"decision": "Approved" or "Needs Revision", "strengths": "2-4 sentences", ' +
      '"improvements": "2-4 sentences, concrete", "comments": "the main feedback, 3-6 sentences"}',
    data,
  });

  res.json({
    source: 'ai',
    ...base,
    decision: ['Approved', 'Needs Revision'].includes(answer.decision) ? answer.decision : null,
    strengths: cleanText(answer.strengths, 1500),
    improvements: cleanText(answer.improvements, 1500),
    comments: cleanText(answer.comments, 3000),
  });
}

// ---------------------------------------------------------------------
// Poster summary for students
// ---------------------------------------------------------------------

const POSTER_SUMMARY_MAX = 400;

// First sentences of a text that fit in `max` characters
function firstSentences(text, max) {
  const sentences = String(text || '').match(/[^.!?]+[.!?]+/g) || [String(text || '')];
  let result = '';
  for (const sentence of sentences) {
    if ((result + sentence).trim().length > max) break;
    result += sentence;
  }
  return (result || String(text || '').slice(0, max)).trim();
}

/**
 * POST /api/ai/poster-summary { title? } -> { summary, source }
 * A short, public-friendly description of the student's project for the Posters page.
 */
export async function draftPosterSummary(req, res) {
  if (!req.user.groupId) throw new HttpError(400, 'Join a group first to post your project poster.');
  const [project] = await query(
    `SELECT p.ProjectTitle AS title, p.ProjectDescription AS description, p.ShowcaseDescription AS showcase,
            pr.ProposalComments AS proposal
       FROM graduation_project p
       LEFT JOIN proposal pr ON pr.ProjectID = p.ProjectID
      WHERE p.GroupID = ? ORDER BY pr.ProposalID DESC LIMIT 1`,
    [req.user.groupId]
  );
  if (!project) throw new HttpError(400, 'Create your project first, so there is something to describe.');

  if (!aiEnabled()) {
    return res.json({ source: 'basic', summary: firstSentences(project.showcase || project.description, POSTER_SUMMARY_MAX) });
  }

  const answer = await askJson({
    task:
      `Write the short description shown under this graduation project's poster on a PUBLIC page that visitors, ` +
      `students and staff browse. At most ${POSTER_SUMMARY_MAX} characters, 2-3 sentences, plain and inviting, ` +
      'no hype words, no hashtags, no emojis. Say what problem it solves and how.',
    shape: '{"summary": "..."}',
    data: [
      `Poster title: ${cleanText(req.body.title, 200) || project.title}`,
      `Project: ${project.title}`,
      `Description: ${project.description || ''}`,
      project.showcase ? `Showcase text: ${project.showcase}` : '',
      project.proposal ? `Proposal note: ${project.proposal}` : '',
    ].filter(Boolean).join('\n'),
    maxTokens: 1200,
  });

  res.json({ source: 'ai', summary: firstSentences(cleanText(answer.summary, 1000), POSTER_SUMMARY_MAX) });
}
