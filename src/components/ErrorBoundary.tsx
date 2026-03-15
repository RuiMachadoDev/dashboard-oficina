import { Component, type ReactNode } from "react";

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError(): State {
    return { hasError: true };
  }

  componentDidCatch(error: unknown, info: { componentStack?: string | null }) {
    console.error("ErrorBoundary caught:", error, info.componentStack);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex min-h-screen items-center justify-center bg-zinc-50 px-6">
          <div className="w-full max-w-sm rounded-2xl border bg-white p-8 shadow-sm text-center">
            <div className="text-2xl font-bold text-zinc-900">Erro inesperado</div>
            <p className="mt-2 text-sm text-zinc-600">Ocorreu um erro inesperado.</p>
            <p className="text-sm text-zinc-600">Tenta recarregar a página.</p>
            <button
              onClick={() => window.location.reload()}
              className="mt-6 w-full rounded-xl bg-zinc-900 px-4 py-2 text-sm font-semibold text-white hover:bg-zinc-700"
            >
              Recarregar
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
