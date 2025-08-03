import React from 'react';

class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    console.error('Error caught by boundary:', error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="bg-gradient flex flex-col items-center justify-center py-6">
          <h1 className="text-3xl font-bold text-white mb-4">Noe gikk galt</h1>
          <p className="text-white text-center mb-4">
            Det oppstod en feil i applikasjonen. Vennligst prøv å laste siden på nytt.
          </p>
          <button
            onClick={() => window.location.reload()}
            className="bg-white text-fuchsia-700 px-6 py-3 rounded-lg font-semibold hover:bg-gray-100 transition-colors"
          >
            Last siden på nytt
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary; 