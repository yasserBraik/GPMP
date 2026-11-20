// ChatSummaryPanel: the "Catch me up" summary shown above the messages of a channel.
// It lists the gist, decisions, action items and open questions of the unread (or recent)
// messages. The summary is made on request only and is never stored.
//
// Props:
//   state    object    { loading, data, error } of the summary request
//   onClose  function  hides the panel
//   onRetry  function  asks for the summary again
import Icon from '../common/Icon.jsx';
import AiNote from '../common/AiNote.jsx';

function List({ title, icon, items, render = (item) => item }) {
  if (!items || items.length === 0) return null;
  return (
    <div className="chat-summary-block">
      <h4>
        <Icon name={icon} size={14} /> {title}
      </h4>
      <ul>
        {items.map((item, index) => (
          <li key={index}>{render(item)}</li>
        ))}
      </ul>
    </div>
  );
}

export default function ChatSummaryPanel({ state, onClose, onRetry }) {
  const { loading, data, error } = state;

  return (
    <section className="chat-summary" aria-label="Chat summary" aria-busy={loading}>
      <header className="chat-summary-head">
        <h3>
          <Icon name="sparkles" size={16} /> Catch me up
          {data && !data.empty && (
            <span className="chat-summary-scope">
              {data.unread > 0 ? `${data.unread} unread` : `last ${data.messageCount} messages`}
            </span>
          )}
        </h3>
        <div className="chat-summary-actions">
          {!loading && (
            <button type="button" className="btn btn-ghost btn-small" onClick={onRetry}>
              <Icon name="refresh" size={14} /> Refresh
            </button>
          )}
          <button type="button" className="btn btn-ghost btn-icon btn-small" onClick={onClose} aria-label="Close the summary">
            <Icon name="x" size={16} />
          </button>
        </div>
      </header>

      {loading && (
        <div className="chat-summary-loading" role="status">
          <span className="spinner spinner-small" aria-hidden="true" /> Reading the conversation…
        </div>
      )}
      {error && <p className="field-error">{error.message}</p>}
      {data?.empty && <p className="muted small">There are no messages to summarise yet.</p>}

      {data && !data.empty && (
        <div className="chat-summary-body">
          <p className="chat-summary-overview">{data.overview}</p>
          <div className="chat-summary-grid">
            <List title="Key points" icon="star" items={data.keyPoints} />
            <List title="Decisions" icon="check" items={data.decisions} />
            <List
              title="Action items"
              icon="tasks"
              items={data.actionItems}
              render={(item) => (
                <>
                  {item.task}
                  {item.owner && <span className="chat-summary-owner"> — {item.owner}</span>}
                </>
              )}
            />
            <List title="Open questions" icon="info" items={data.openQuestions} />
          </div>
          <AiNote source={data.source} />
        </div>
      )}
    </section>
  );
}
