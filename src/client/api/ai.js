// API functions for the AI helpers. Backend: /api/ai
// Every answer has `source`: 'ai' (written by Claude) or 'basic' (built-in rules, no AI key set).
import { api } from './client.js';

// { enabled, model }
export const getAiStatus = () => api.get('/ai/status');

// "Catch me up": { overview, keyPoints, decisions, actionItems: [{ task, owner }], openQuestions, unread, ... }
// `unread`: how many messages were unread when the user opened the channel (the summary focuses on them)
export const summarizeChat = (groupId, channel, unread = 0) => api.post('/ai/chat-summary', { groupId, channel, unread });

// Supervisor: { decision, strengths, improvements, comments, filesRead, filesTotal, late }
export const draftFeedback = (submissionId) => api.post('/ai/feedback-draft', { submissionId });

// Student: { summary } for the group's poster
export const draftPosterSummary = (title) => api.post('/ai/poster-summary', { title });
