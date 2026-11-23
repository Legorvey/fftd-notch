import { Component, type ErrorInfo, type ReactNode } from 'react';

interface Props {
  children: ReactNode;
  inline?: boolean;
}

interface State {
  hasError: boolean;
  message: string;
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false, message: '' };

  static getDerivedStateFromError(error: Error): State {
    const fallback = 'Terjadi kesalahan saat menampilkan komponen. Coba muat ulang tampilan.';
    return {
      hasError: true,
      message: import.meta.env.DEV && error.message ? error.message : fallback,
    };
  }

  componentDidCatch(_error: Error, _info: ErrorInfo): void {
    // Error details are captured in state for user recovery.
  }

  private handleReset = () => {
    this.setState({ hasError: false, message: '' });
  };

  render() {
    if (this.state.hasError) {
      const content = (
        <div className="status-banner status-banner-error" role="alert">
          <span className="status-prefix">GALAT</span>
          <div>
            <strong>Aplikasi mengalami kesalahan tampilan.</strong>
            <p style={{ margin: '0.35rem 0 0.75rem' }}>{this.state.message}</p>
            <button type="button" className="btn btn-primary" onClick={this.handleReset}>
              Muat ulang tampilan
            </button>
          </div>
        </div>
      );
      if (this.props.inline) return content;
      return (
        <main id="main-content" className="main-workspace">
          <div className="workspace-inner">{content}</div>
        </main>
      );
    }
    return this.props.children;
  }
}
