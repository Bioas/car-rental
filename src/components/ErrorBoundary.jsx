import React from 'react'

// Catches render-time errors anywhere below it and shows a recovery screen
// instead of unmounting the whole SPA to a blank page.
export default class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props)
    this.state = { error: null }
  }

  static getDerivedStateFromError(error) {
    return { error }
  }

  componentDidCatch(error, info) {
    console.error('[ErrorBoundary]', error, info)
  }

  handleReload = () => {
    this.setState({ error: null })
    window.location.reload()
  }

  render() {
    if (!this.state.error) return this.props.children

    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-950 px-6">
        <div className="max-w-md w-full text-center card p-8">
          <div className="w-16 h-16 rounded-2xl bg-red-50 dark:bg-red-900/30 flex items-center justify-center mx-auto mb-5">
            <i className="bx bx-error-circle text-3xl text-red-500"></i>
          </div>
          <h1 className="text-xl font-bold font-heading text-gray-900 dark:text-white mb-2">
            เกิดข้อผิดพลาดบางอย่าง
          </h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 mb-6">
            ระบบพบข้อผิดพลาดที่ไม่คาดคิด กรุณาลองโหลดหน้าใหม่อีกครั้ง
          </p>
          <button onClick={this.handleReload} className="btn-primary w-full">
            โหลดหน้าใหม่
          </button>
        </div>
      </div>
    )
  }
}
