import { Component, type ErrorInfo, type ReactNode } from 'react'
import { Button } from './Button'
import { Panel } from './Panel'

interface Props {
  children: ReactNode
  fallback?: ReactNode
}

interface State {
  hasError: boolean
  error: Error | null
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false, error: null }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error }
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('[ErrorBoundary]', error, errorInfo.componentStack)
  }

  private handleReset = () => {
    this.setState({ hasError: false, error: null })
  }

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) return this.props.fallback

      return (
        <Panel
          variant="paperCard"
          className="flex flex-col items-center justify-center gap-4 p-8 text-center"
        >
          <h2 className="font-display text-xl text-ink">出了点问题</h2>
          <p className="text-sm text-ink-muted max-w-md">
            {this.state.error?.message || '应用遇到了意外错误'}
          </p>
          <Button variant="outline" onClick={this.handleReset}>
            重试
          </Button>
        </Panel>
      )
    }

    return this.props.children
  }
}
