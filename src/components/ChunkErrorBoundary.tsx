import * as React from 'react';

interface Props {
  children: React.ReactNode;
  /** Override the reload action — mainly so tests don't hit window.location. */
  onReload?: () => void;
}

/**
 * Catches a failed route-chunk load (network dropped mid-fetch on 2G, or any
 * render error) and offers a reload instead of white-screening the app for a
 * non-technical user. A full reload re-fetches a fresh module graph, which
 * recovers a chunk that failed to download.
 */
export class ChunkErrorBoundary extends React.Component<
  Props,
  { failed: boolean }
> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch(error: unknown) {
    // Keep the underlying error visible. A chunk miss is fixed by the reload
    // below; a genuine render bug (which also lands here) would otherwise be
    // invisible — this is the hook to wire remote logging into later.
    console.error('App chunk-load / render error:', error);
  }

  private handleReload = () => {
    if (this.props.onReload) this.props.onReload();
    else window.location.reload();
  };

  render() {
    if (this.state.failed) {
      return (
        <div className="flex min-h-full flex-col items-center justify-center gap-3 px-6 text-center">
          <p className="text-sm text-text-muted">
            कुछ लोड नहीं हो पाया।
            <br />
            <span className="text-text-subtle">Something didn’t load.</span>
          </p>
          <button
            type="button"
            onClick={this.handleReload}
            className="rounded-full bg-brand px-5 py-2 text-sm font-medium text-text-inverse"
          >
            दोबारा कोशिश करें · Try again
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
