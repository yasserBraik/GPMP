// AiNote: a small line under AI-generated text that says where it came from, so people
// always know what to check before they use it.
//
// Props:
//   source  string  'ai' (written by Claude) or 'basic' (built-in rules, no AI key set)
//   children node   optional extra text
import Icon from './Icon.jsx';

export default function AiNote({ source, children }) {
  if (!source) return null;
  return (
    <p className={`ai-note ${source === 'ai' ? 'ai-note-ai' : 'ai-note-basic'}`} role="status">
      <Icon name={source === 'ai' ? 'sparkles' : 'info'} size={14} />
      <span>
        {source === 'ai'
          ? 'Suggested by AI — read it and edit before you use it.'
          : 'Basic suggestion from simple rules (the AI is not switched on for this server).'}
        {children ? <> {children}</> : null}
      </span>
    </p>
  );
}
