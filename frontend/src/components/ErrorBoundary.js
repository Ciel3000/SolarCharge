// =============================================================================
// ERROR BOUNDARY COMPONENT
// =============================================================================
// This component catches JavaScript errors in the React component tree.
// It displays a fallback UI when an error occurs instead of crashing the app.

import React from 'react';

class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null, errorInfo: null };
  }

  // Update state when an error is caught
  static getDerivedStateFromError(error) {
    return { hasError: true };
  }

  // Log error details for debugging
  componentDidCatch(error, errorInfo) {
    console.error('ErrorBoundary caught an error:', error, errorInfo);
    this.setState({
      error: error,
      errorInfo: errorInfo
    });
  }

  // Retry handler - clears error state and tries to recover
  handleRetry = () => {
    this.setState({ hasError: false, error: null, errorInfo: null });

    if (this.props.onRetry) {
      this.props.onRetry();
    } else {
      window.location.reload();
    }
  };

  // Navigate to home page
  handleGoHome = () => {
    this.setState({ hasError: false, error: null, errorInfo: null });
    window.location.href = '/';
  };

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen flex items-center justify-center bg-gray-100">
          <div className="max-w-md mx-auto bg-white rounded-xl shadow-2xl p-8 text-center">
            <div className="text-6xl mb-4">⚡</div>
            <h1 className="text-2xl font-bold text-gray-800 mb-4">
              Oops! Something went wrong
            </h1>
            <p className="text-gray-600 mb-6">
              The app encountered an unexpected error. This usually happens due to network issues or when returning to the app after being away.
            </p>

            <div className="space-y-3">
              <button
                onClick={this.handleRetry}
                className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-3 px-6 rounded-lg transition-colors duration-200"
              >
                🔄 Try Again
              </button>

              <button
                onClick={this.handleGoHome}
                className="w-full bg-gray-500 hover:bg-gray-600 text-white font-bold py-3 px-6 rounded-lg transition-colors duration-200"
              >
                🏠 Go to Home
              </button>
            </div>

            {process.env.NODE_ENV === 'development' && this.state.error && (
              <details className="mt-6 text-left">
                <summary className="cursor-pointer text-red-600 font-semibold">
                  Error Details (Development)
                </summary>
                <div className="mt-2 p-4 bg-red-50 rounded border text-sm font-mono">
                  <div className="text-red-800 font-bold mb-2">Error:</div>
                  <div className="text-red-700 mb-4">{this.state.error && this.state.error.toString()}</div>

                  <div className="text-red-800 font-bold mb-2">Stack Trace:</div>
                  <div className="text-red-700 text-xs whitespace-pre-wrap">
                    {this.state.errorInfo.componentStack}
                  </div>
                </div>
              </details>
            )}
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary; 