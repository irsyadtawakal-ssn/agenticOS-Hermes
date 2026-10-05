import { Component, type ErrorInfo, type ReactNode } from 'react';

interface Props {
  children: ReactNode;
  fallbackTitle?: string;
  onReset?: () => void;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  public override state: State = {
    hasError: false,
    error: null,
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  public override componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('ErrorBoundary caught an error:', error, errorInfo);
  }

  private handleReset = () => {
    this.setState({ hasError: false, error: null });
    this.props.onReset?.();
  };

  public override render() {
    if (this.state.hasError) {
      return (
        <div className="p-6 m-4 bg-slate-900/90 border border-red-500/40 rounded-xl text-slate-100 flex flex-col gap-3 shadow-xl backdrop-blur-md">
          <div className="flex items-center gap-2 text-red-400 font-bold text-sm">
            <span className="text-xl">⚠️</span>
            <span>{this.props.fallbackTitle || 'Terjadi Gangguan Komponen'}</span>
          </div>
          <p className="text-xs text-slate-300">
            {this.state.error?.message || 'Komponen mengalami error tak terduga.'}
          </p>
          <div className="flex gap-2 mt-2">
            <button
              type="button"
              onClick={this.handleReset}
              className="px-3 py-1.5 bg-sky-600 hover:bg-sky-500 text-white rounded-lg text-xs font-semibold shadow cursor-pointer transition"
            >
              🔄 Coba Lagi
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
