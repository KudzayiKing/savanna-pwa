import { cn } from "@/lib/utils";
import { AlertTriangle, RotateCcw } from "lucide-react";
import { Component, type ErrorInfo, type ReactNode } from "react";

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
  /**
   * Short, non-reversible fingerprint of the failure. Rendered to the user so
   * they can quote it in a support ticket, and logged so the same ticket can be
   * matched to a server-side entry once P3.1 ships structured request logging.
   */
  digest: string | null;
}

/**
 * Stable-ish 8 hex char fingerprint (FNV-1a).
 *
 * Deliberately not a hash of the stack: the stack contains build-specific file
 * paths and line numbers, so it would differ between otherwise identical
 * failures. Fingerprinting `name + message` groups the same bug across users
 * while revealing nothing about the code.
 */
function fingerprint(error: Error): string {
  const input = `${error.name}:${error.message}`;
  let hash = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null, digest: null };
  }

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { hasError: true, error, digest: fingerprint(error) };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    // Full detail to the console only. In a production build `error.stack` may
    // expose internal module paths, dependency versions and source structure,
    // so it is never rendered into the DOM.
    console.error("[ErrorBoundary]", error, info.componentStack);
    // The pre-React splash overlay in index.html sits above everything; drop it
    // so the error screen is visible instead of hiding behind it.
    document.getElementById("splash")?.remove();
  }

  render() {
    if (this.state.hasError) {
      const showDetail = import.meta.env.DEV;

      return (
        <div className="flex items-center justify-center min-h-screen p-8 bg-background">
          <div className="flex flex-col items-center w-full max-w-2xl p-8">
            <AlertTriangle
              size={48}
              className="text-destructive mb-6 flex-shrink-0"
            />

            <h2 className="text-xl mb-4">Something went wrong.</h2>

            <p className="text-sm text-muted-foreground text-center mb-6">
              The page hit an unexpected error and could not continue. Reloading
              usually clears it &mdash; if it keeps happening, quote the
              reference below when you contact support.
            </p>

            {this.state.digest ? (
              <p className="text-xs text-muted-foreground mb-6 font-mono">
                Reference: {this.state.digest}
              </p>
            ) : null}

            {showDetail && this.state.error?.stack ? (
              <div className="p-4 w-full rounded bg-muted overflow-auto mb-6">
                <pre className="text-sm text-muted-foreground whitespace-break-spaces">
                  {this.state.error.stack}
                </pre>
              </div>
            ) : null}

            <button
              onClick={() => window.location.reload()}
              className={cn(
                "flex items-center gap-2 px-4 py-2 rounded-lg",
                "bg-primary text-primary-foreground",
                "hover:opacity-90 cursor-pointer"
              )}
            >
              <RotateCcw size={16} />
              Reload Page
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;
