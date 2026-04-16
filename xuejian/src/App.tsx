import { AppShell } from '@/components/shell'
import { Button, Panel, Divider } from '@/components/ui'

function App() {
  return (
    <AppShell>
      <div className="flex flex-col gap-6">
        {/* 欢迎区域 */}
        <Panel variant="panel">
          <h1 className="font-display text-2xl text-ink mb-2">
            欢迎使用学笺
          </h1>
          <p className="font-body text-ink-muted">
            上传文档，一键生成卡片，卡片贴在原文旁边——像在书中贴便签一样学习。
          </p>
        </Panel>

        <Divider />

        {/* 快速操作区域 */}
        <div className="grid grid-cols-2 gap-4">
          <Panel variant="paperCard">
            <h2 className="font-ui text-lg text-ink mb-3">快速开始</h2>
            <div className="flex flex-col gap-2">
              <Button variant="sketch" className="w-full justify-start">
                📄 上传 PDF 文档
              </Button>
              <Button variant="outline" className="w-full justify-start">
                ⚙️ 配置 API Key
              </Button>
            </div>
          </Panel>

          <Panel variant="paperCard">
            <h2 className="font-ui text-lg text-ink mb-3">今日学习</h2>
            <div className="flex flex-col gap-2 text-sm text-ink-muted">
              <div className="flex justify-between">
                <span>待复习卡片</span>
                <span className="text-ink font-latin">0 张</span>
              </div>
              <div className="flex justify-between">
                <span>新卡片</span>
                <span className="text-ink font-latin">0 张</span>
              </div>
              <div className="flex justify-between">
                <span>学习时长</span>
                <span className="text-ink font-latin">0 分钟</span>
              </div>
            </div>
          </Panel>
        </div>

        {/* 文档列表区域 */}
        <Panel variant="canvas">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-ui text-lg text-ink">最近文档</h2>
            <Button variant="ghost" size="sm">
              查看全部
            </Button>
          </div>
          <div className="text-center py-8 text-ink-soft">
            暂无文档，点击"上传 PDF 文档"开始学习
          </div>
        </Panel>
      </div>
    </AppShell>
  )
}

export default App
