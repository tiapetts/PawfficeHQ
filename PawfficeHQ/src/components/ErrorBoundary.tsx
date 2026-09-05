import { Component, type ErrorInfo, type ReactNode } from "react";
import "./ErrorBoundary.css";

type Props = { children: ReactNode };
type State = { hasError: boolean };

export default class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError(): State { return { hasError: true }; }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("PawfficeHQ application error", error, info);
  }

  render() {
    if (!this.state.hasError) return this.props.children;
    return <main className="crash-page"><section className="crash-card" role="alert">
      <img src="/pwa-icon.png" alt="PawfficeHQ" />
      <p className="eyebrow">Something went wrong</p>
      <h1>Your information is still safe.</h1>
      <p>PawfficeHQ could not finish loading this screen. Refresh the app to try again. If it continues, contact support and tell us what you were doing when this appeared.</p>
      <button type="button" onClick={() => window.location.reload()}>Refresh PawfficeHQ</button>
      <a href="/support.html">Contact support</a>
    </section></main>;
  }
}
