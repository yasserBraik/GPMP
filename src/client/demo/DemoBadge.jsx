// DemoBadge: a small label in the corner of the online demo, so nobody mistakes the sample
// data for a real system. Clicking it shows what the demo can and cannot do.
import { useState } from 'react';
import Icon from '../components/common/Icon.jsx';
import { DEMO_PASSWORD_HINT } from '../config/demo.js';
import './demo.css';

export default function DemoBadge() {
  const [open, setOpen] = useState(false);
  return (
    <div className="demo-badge">
      {open && (
        <div className="demo-badge-panel" id="demo-badge-panel">
          <strong>Online demo</strong>
          <p>
            This copy of GPMP runs in your browser on sample data. You can sign in with the demo accounts
            (password <code>{DEMO_PASSWORD_HINT}</code>) and open every page, but changes are not saved.
          </p>
        </div>
      )}
      <button
        type="button"
        className="demo-badge-button"
        aria-expanded={open}
        aria-controls="demo-badge-panel"
        onClick={() => setOpen((value) => !value)}
      >
        <Icon name="info" size={14} /> Demo · sample data
      </button>
    </div>
  );
}
