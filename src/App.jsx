import { useEffect, useMemo, useState, Component } from 'react';
import { io } from 'socket.io-client';
import INDRAEngine from './INDRAEngine';
import AnalystDashboard from './AnalystDashboard';
import PolicyMakerView from './PolicyMakerView';
import StrategicView from './StrategicView';
import { AgentSwarmViz, CrawlerPipelineViz, MarkovGraphViz, RAGPipelineViz, SentimentWaveformViz, SystemArchitectureViz } from './SystemVisualizations';

/* ── Error Boundary ─────────────────────────────────────────────── */
class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }
  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }
  componentDidCatch(error, info) {
    console.error(`[ErrorBoundary:${this.props.label}]`, error, info);
  }
  render() {
    if (this.state.hasError) {
      return (
        <div style={{
          padding: 24, margin: 12, background: '#1a1a2e',
          border: '1px solid #e74c3c', borderRadius: 8, color: '#e5e7eb',
          textAlign: 'center'
        }}>
          <div style={{ fontSize: 28, marginBottom: 8 }}>⚠️</div>
          <div style={{ fontWeight: 700, marginBottom: 4 }}>
            {this.props.label || 'Section'} — Rendering Error
          </div>
          <div style={{ fontSize: 13, color: '#94a3b8', marginBottom: 12 }}>
            {this.state.error?.message || 'An unexpected error occurred.'}
          </div>
          <button
            onClick={() => this.setState({ hasError: false, error: null })}
            style={{
              padding: '6px 16px', background: '#e74c3c', color: '#fff',
              border: 'none', borderRadius: 4, cursor: 'pointer'
            }}
          >
            Retry
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

/* ── App ────────────────────────────────────────────────────────── */
function App() {
  const [roles, setRoles] = useState([]);
  const [session, setSession] = useState({ username: 'Admin', role: 'analyst', token: 'auto' });
  const [alerts, setAlerts] = useState([]);
  const [view, setView] = useState('engine');

  useEffect(() => {
    fetch('http://localhost:3001/api/config/public')
      .then(r => r.json())
      .then(cfg => setRoles(cfg.roles || []))
      .catch(() => setRoles([]));
  }, []);

  useEffect(() => {
    const socket = io('http://localhost:3001');
    socket.on('alert:new', payload => {
      setAlerts(prev => [payload, ...prev].slice(0, 8));
    });
    return () => socket.disconnect();
  }, []);

  const currentRole = session?.role;
  const roleLabel = useMemo(() => roles.find(r => r.id === currentRole)?.label || currentRole, [roles, currentRole]);

  return (
    <div>
      {/* Top bar */}
      <div style={{ padding: 10, background: '#111827', color: '#e5e7eb', display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
        <span>⚡ <strong>{session.username}</strong> ({roleLabel})</span>
        <button onClick={() => setView('engine')}>Engine</button>
        <button onClick={() => setView('viz')}>Visualization</button>
      </div>

      {alerts.length > 0 && (
        <div style={{ padding: 8, background: '#7f1d1d', color: '#fee2e2' }}>
          Realtime Alerts: {alerts.map((a, i) => <span key={i} style={{ marginRight: 12 }}>{a.message}</span>)}
        </div>
      )}

      {view === 'engine' && (
        <ErrorBoundary label="INDRA Engine">
          <INDRAEngine />
        </ErrorBoundary>
      )}

      {view === 'role' && session?.token && (
        <ErrorBoundary label="Role Dashboard">
          {session.role === 'analyst' && <AnalystDashboard token={session.token} />}
          {session.role === 'policy' && <PolicyMakerView token={session.token} />}
          {session.role === 'strategic' && <StrategicView token={session.token} />}
        </ErrorBoundary>
      )}

      {view === 'viz' && (
        <ErrorBoundary label="Visualization">
          <div style={{ padding: '16px 12px', background: '#0a0a1a' }}>
            <div style={{ marginBottom: 12, textAlign: 'center' }}>
              <h2 style={{ fontSize: 20, fontWeight: 800, color: '#e5e7eb', margin: 0, letterSpacing: 1 }}>
                ⚡ INDRA System Internals
              </h2>
              <div style={{ fontSize: 12, color: '#64748b' }}>Real-time visualization of all engine subsystems</div>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(380px, 1fr))', gap: 14 }}>
              <ErrorBoundary label="Agent Swarm"><AgentSwarmViz /></ErrorBoundary>
              <ErrorBoundary label="Crawler Pipeline"><CrawlerPipelineViz /></ErrorBoundary>
              <ErrorBoundary label="Markov Graph"><MarkovGraphViz /></ErrorBoundary>
              <ErrorBoundary label="RAG Pipeline"><RAGPipelineViz /></ErrorBoundary>
              <ErrorBoundary label="Sentiment"><SentimentWaveformViz /></ErrorBoundary>
              <ErrorBoundary label="Architecture"><SystemArchitectureViz /></ErrorBoundary>
            </div>
          </div>
        </ErrorBoundary>
      )}
    </div>
  );
}

export default App;
