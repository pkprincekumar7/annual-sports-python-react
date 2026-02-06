import { Component } from 'react'
import logger from '../utils/logger'

class ErrorBoundary extends Component {
  constructor(props) {
    super(props)
    this.state = { hasError: false, error: null, errorInfo: null }
  }

  static getDerivedStateFromError(error) {
    // Update state so the next render will show the fallback UI
    return { hasError: true }
  }

  componentDidCatch(error, errorInfo) {
    // Log error to our logging utility
    logger.error('ErrorBoundary caught an error:', error, errorInfo)
    
    // Update state with error details
    this.setState({
      error,
      errorInfo,
    })

    // In production, you could send error details to an error tracking service
    // Example: sendToErrorTrackingService(error, errorInfo)
  }

  handleReset = () => {
    this.setState({ hasError: false, error: null, errorInfo: null })
  }

  render() {
    if (this.state.hasError) {
      // Custom fallback UI
      return (
        <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-[rgba(12,16,40,0.98)] to-[rgba(9,9,26,0.94)] p-4">
          <div className="max-w-[600px] w-full bg-gradient-to-br from-[rgba(12,16,40,0.98)] to-[rgba(9,9,26,0.94)] rounded-[20px] px-[1.4rem] py-[1.6rem] border border-[rgba(255,255,255,0.12)] shadow-[0_22px_55px_rgba(0,0,0,0.8)] backdrop-blur-[20px]">
            <div className="text-center">
              <div className="text-[3rem] mb-4">⚠️</div>
              <div className="text-[1.5rem] font-extrabold text-[#ffe66d] mb-2">
                Something went wrong
              </div>
              <div className="text-[#e5e7eb] text-[0.95rem] mb-6">
                We're sorry, but something unexpected happened. Please try refreshing the page.
              </div>
              
              {import.meta.env.DEV && this.state.error && (
                <div className="mb-6 p-4 bg-[rgba(239,68,68,0.1)] border border-[rgba(239,68,68,0.3)] rounded-[10px] text-left">
                  <div className="text-[#ff6b6b] font-semibold mb-2 text-[0.9rem]">
                    Error Details (Development Only):
                  </div>
                  <div className="text-[#cbd5ff] text-[0.8rem] font-mono break-all">
                    {this.state.error.toString()}
                  </div>
                  {this.state.errorInfo && (
                    <details className="mt-2">
                      <summary className="text-[#cbd5ff] text-[0.8rem] cursor-pointer">
                        Stack Trace
                      </summary>
                      <pre className="text-[#cbd5ff] text-[0.7rem] mt-2 overflow-auto max-h-[200px]">
                        {this.state.errorInfo.componentStack}
                      </pre>
                    </details>
                  )}
                </div>
              )}

              <div className="flex gap-4 justify-center">
                <button
                  onClick={this.handleReset}
                  className="px-6 py-2 rounded-full border-none text-[0.9rem] font-bold uppercase tracking-[0.1em] cursor-pointer bg-gradient-to-r from-[#ffe66d] to-[#ff9f1c] text-[#111827] shadow-[0_10px_24px_rgba(250,204,21,0.6)] transition-all duration-[0.12s] ease-in-out hover:-translate-y-0.5 hover:shadow-[0_16px_36px_rgba(250,204,21,0.75)]"
                >
                  Try Again
                </button>
                <button
                  onClick={() => window.location.reload()}
                  className="px-6 py-2 rounded-full border border-[rgba(148,163,184,0.7)] text-[0.9rem] font-bold uppercase tracking-[0.1em] cursor-pointer bg-[rgba(15,23,42,0.95)] text-[#e5e7eb] transition-all duration-[0.12s] ease-in-out hover:-translate-y-0.5 hover:shadow-[0_10px_26px_rgba(15,23,42,0.9)]"
                >
                  Refresh Page
                </button>
              </div>
            </div>
          </div>
        </div>
      )
    }

    return this.props.children
  }
}

export default ErrorBoundary

