"use client";

import { Component, type ReactNode } from "react";

type Props = { children: ReactNode; tabLabel?: string };
type State = { error: Error | null };

export class TabErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  render() {
    if (this.state.error) {
      return (
        <div className="max-w-lg mx-auto card-glass rounded-2xl p-6 border border-red-500/30 bg-red-500/5 text-center">
          <p className="text-sm font-medium text-red-300">
            {this.props.tabLabel ? `${this.props.tabLabel} could not load` : "This section could not load"}
          </p>
          <p className="text-xs text-zinc-500 mt-2 leading-relaxed">
            Please refresh the page or switch network to HyperEVM Testnet. If the problem persists, try disconnecting
            your wallet.
          </p>
          <button
            type="button"
            onClick={() => this.setState({ error: null })}
            className="mt-4 text-xs px-3 py-1.5 rounded-lg bg-zinc-800 border border-zinc-700 text-zinc-300 hover:border-cyan-500/40"
          >
            Try again
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
