import { Component, type ReactNode } from 'react'

interface Props {
  children: ReactNode
  fallback?: ReactNode
}

interface State {
  hasError: boolean
  error?: Error
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props)
    this.state = { hasError: false }
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error }
  }

  handleReset = () => {
    this.setState({ hasError: false, error: undefined })
  }

  render() {
    if (this.state.hasError) {
      return this.props.fallback ?? (
        <div className="flex flex-col items-center justify-center h-full gap-4 p-8">
          <div className="text-5xl">⚠️</div>
          <h2 className="font-bangers text-2xl tracking-widest text-white">
            Something went wrong
          </h2>
          <p className="text-slate-400 text-sm text-center max-w-xs">
            {this.state.error?.message ?? 'An unexpected error occurred.'}
          </p>
          <button className="btn-primary" onClick={this.handleReset}>
            Try again
          </button>
        </div>
      )
    }
    return this.props.children
  }
}
