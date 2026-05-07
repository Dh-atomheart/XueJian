import { type ReactNode, useDeferredValue, useEffect, useState } from 'react'
import { BookOpen, Filter, FolderPlus, Layers3, PencilLine, Plus, Search, Trash2 } from 'lucide-react'
import {
  Badge,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  CenteredLoading,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  EmptyState,
  ErrorState,
  InlineError,
  Input,
} from '@/shared/ui'
import { cn } from '@/lib/utils'
import {
  useBasicCardGroupsQuery,
  useBasicCardsQuery,
  useCreateBasicCardGroupMutation,
  useCreateBasicCardMutation,
  useDeleteBasicCardGroupMutation,
  useDeleteBasicCardMutation,
  useDeleteBasicCardsMutation,
  useSetBasicCardGroupEnabledMutation,
  useUpdateBasicCardGroupMutation,
  useUpdateBasicCardMutation,
} from '@/queries'
import { CardPreview } from '@/components/cards'
import { useDocumentsQuery } from '@/queries/documents'
import { useAppUiStore } from '@/store'
import type { BasicCard, BasicCardGroup, Document } from '@/types'

type CardEditorState = {
  mode: 'create' | 'edit'
  cardId: string | null
  groupId: string
  sourceDocumentId: string
  sourceAnchorId: string | null
  title: string
  front: string
  back: string
  tags: string
}

type GroupEditorState = {
  mode: 'create' | 'edit'
  groupId: string | null
  name: string
  description: string
  color: string
}

const ALL_FILTER = '__all__'
const EMPTY_GROUPS: BasicCardGroup[] = []
const EMPTY_DOCUMENTS: Document[] = []
const EMPTY_CARDS: BasicCard[] = []

export function BasicCardsPage() {
  const setActiveNavItem = useAppUiStore((state) => state.setActiveNavItem)
  const openReader = useAppUiStore((state) => state.openReader)
  const preferredBasicCardsDocumentId = useAppUiStore((state) => state.preferredBasicCardsDocumentId)
  const setPreferredBasicCardsDocumentId = useAppUiStore((state) => state.setPreferredBasicCardsDocumentId)
  const [selectedGroupId, setSelectedGroupId] = useState(ALL_FILTER)
  const [selectedDocumentId, setSelectedDocumentId] = useState(ALL_FILTER)
  const [searchQuery, setSearchQuery] = useState('')
  const [tagQuery, setTagQuery] = useState('')
  const [actionError, setActionError] = useState<string | null>(null)
  const [selectedCardIds, setSelectedCardIds] = useState<string[]>([])
  const [cardEditor, setCardEditor] = useState<CardEditorState | null>(null)
  const [groupEditor, setGroupEditor] = useState<GroupEditorState | null>(null)
  const [deleteDialog, setDeleteDialog] = useState<
    | { type: 'card'; card: BasicCard }
    | { type: 'bulk'; count: number }
    | { type: 'group'; group: BasicCardGroup }
    | null
  >(null)

  const deferredSearchQuery = useDeferredValue(searchQuery)
  const deferredTagQuery = useDeferredValue(tagQuery)

  const groupsQuery = useBasicCardGroupsQuery()
  const documentsQuery = useDocumentsQuery()
  const cardsQuery = useBasicCardsQuery({
    groupId: selectedGroupId === ALL_FILTER ? null : selectedGroupId,
    sourceDocumentId: selectedDocumentId === ALL_FILTER ? null : selectedDocumentId,
    searchQuery: deferredSearchQuery.trim() || null,
    tags: parseTagString(deferredTagQuery),
  })

  const createCardMutation = useCreateBasicCardMutation()
  const updateCardMutation = useUpdateBasicCardMutation()
  const deleteCardMutation = useDeleteBasicCardMutation()
  const deleteCardsMutation = useDeleteBasicCardsMutation()
  const createGroupMutation = useCreateBasicCardGroupMutation()
  const updateGroupMutation = useUpdateBasicCardGroupMutation()
  const setGroupEnabledMutation = useSetBasicCardGroupEnabledMutation()
  const deleteGroupMutation = useDeleteBasicCardGroupMutation()

  const groups = groupsQuery.data ?? EMPTY_GROUPS
  const documents = documentsQuery.data ?? EMPTY_DOCUMENTS
  const cards = cardsQuery.data ?? EMPTY_CARDS
  const activeGroups = groups.filter((group) => !group.deletedAt)
  const enabledGroups = activeGroups.filter((group) => group.isEnabled)
  const isBusy =
    createCardMutation.isPending ||
    updateCardMutation.isPending ||
    deleteCardMutation.isPending ||
    deleteCardsMutation.isPending ||
    createGroupMutation.isPending ||
    updateGroupMutation.isPending ||
    setGroupEnabledMutation.isPending ||
    deleteGroupMutation.isPending

  useEffect(() => {
    if (!preferredBasicCardsDocumentId) return
    setSelectedDocumentId(preferredBasicCardsDocumentId)
    setPreferredBasicCardsDocumentId(null)
  }, [preferredBasicCardsDocumentId, setPreferredBasicCardsDocumentId])

  useEffect(() => {
    if (!cardsQuery.data) return
    setSelectedCardIds((current) => current.filter((id) => cards.some((card) => card.id === id)))
  }, [cards, cardsQuery.data])

  function openCreateCard() {
    if (activeGroups.length === 0) {
      setActionError('请先创建一个卡片分组。')
      setGroupEditor({ mode: 'create', groupId: null, name: '', description: '', color: '' })
      return
    }

    const preferredGroup = activeGroups.find((group) => group.id === selectedGroupId) ?? activeGroups[0]
    setActionError(null)
    setCardEditor({
      mode: 'create',
      cardId: null,
      groupId: preferredGroup.id,
      sourceDocumentId: selectedDocumentId === ALL_FILTER ? '' : selectedDocumentId,
      sourceAnchorId: null,
      title: '',
      front: '',
      back: '',
      tags: '',
    })
  }

  function openEditCard(card: BasicCard) {
    setActionError(null)
    setCardEditor({
      mode: 'edit',
      cardId: card.id,
      groupId: card.groupId,
      sourceDocumentId: card.source.documentId ?? '',
      sourceAnchorId: card.source.anchorId,
      title: card.title,
      front: card.front,
      back: card.back,
      tags: card.tags.join(', '),
    })
  }

  function openCreateGroup() {
    setActionError(null)
    setGroupEditor({ mode: 'create', groupId: null, name: '', description: '', color: '' })
  }

  function openEditGroup(group: BasicCardGroup) {
    setActionError(null)
    setGroupEditor({
      mode: 'edit',
      groupId: group.id,
      name: group.name,
      description: group.description ?? '',
      color: group.color ?? '',
    })
  }

  async function handleCardSubmit(state: CardEditorState) {
    try {
      setActionError(null)
      const payload = {
        groupId: state.groupId,
        sourceDocumentId: state.sourceDocumentId || null,
        sourceAnchorId: state.sourceDocumentId ? state.sourceAnchorId : null,
        title: state.title,
        front: state.front,
        back: state.back,
        tags: parseTagString(state.tags) ?? [],
      }
      if (state.mode === 'create') {
        await createCardMutation.mutateAsync(payload)
      } else if (state.cardId) {
        await updateCardMutation.mutateAsync({ id: state.cardId, data: payload })
      }
      setCardEditor(null)
    } catch (error) {
      setActionError(getErrorMessage(error))
    }
  }

  async function handleGroupSubmit(state: GroupEditorState) {
    try {
      setActionError(null)
      const payload = {
        name: state.name,
        description: state.description || null,
        color: state.color || null,
      }
      if (state.mode === 'create') {
        const created = await createGroupMutation.mutateAsync(payload)
        setSelectedGroupId(created.id)
      } else if (state.groupId) {
        await updateGroupMutation.mutateAsync({ id: state.groupId, data: payload })
      }
      setGroupEditor(null)
    } catch (error) {
      setActionError(getErrorMessage(error))
    }
  }

  async function handleDeleteCard(card: BasicCard) {
    try {
      setActionError(null)
      await deleteCardMutation.mutateAsync(card.id)
    } catch (error) {
      setActionError(getErrorMessage(error))
    }
  }

  async function handleBulkDeleteCards() {
    if (selectedCardIds.length === 0) return
    try {
      setActionError(null)
      await deleteCardsMutation.mutateAsync(selectedCardIds)
      setSelectedCardIds([])
    } catch (error) {
      setActionError(getErrorMessage(error))
    }
  }

  async function handleToggleGroup(group: BasicCardGroup) {
    try {
      setActionError(null)
      await setGroupEnabledMutation.mutateAsync({ id: group.id, isEnabled: !group.isEnabled })
    } catch (error) {
      setActionError(getErrorMessage(error))
    }
  }

  async function handleDeleteGroup(group: BasicCardGroup) {
    try {
      setActionError(null)
      await deleteGroupMutation.mutateAsync(group.id)
      if (selectedGroupId === group.id) setSelectedGroupId(ALL_FILTER)
    } catch (error) {
      setActionError(getErrorMessage(error))
    }
  }

  function toggleCardSelection(cardId: string) {
    setSelectedCardIds((current) =>
      current.includes(cardId) ? current.filter((id) => id !== cardId) : [...current, cardId]
    )
  }

  const allVisibleSelected = cards.length > 0 && cards.every((card) => selectedCardIds.includes(card.id))

  function openCardSource(card: BasicCard) {
    if (!card.source.documentId) return
    const document = documents.find((item) => item.id === card.source.documentId)
    openReader(card.source.documentId, document?.pageCount ?? card.source.page ?? 1, {
      page: card.source.page,
      selectedCardId: card.id,
    })
  }

  if (groupsQuery.isLoading || documentsQuery.isLoading) {
    return <CenteredLoading label="正在加载卡片工作台..." />
  }

  if (groupsQuery.error) {
    return (
      <ErrorState
        title="卡片分组加载失败"
        description={getErrorMessage(groupsQuery.error)}
        onRetry={() => void groupsQuery.refetch()}
      />
    )
  }

  if (documentsQuery.error) {
    return (
      <ErrorState
        title="文档列表加载失败"
        description={getErrorMessage(documentsQuery.error)}
        onRetry={() => void documentsQuery.refetch()}
      />
    )
  }

  return (
    <div className="mx-auto flex w-full max-w-7xl flex-col gap-4 px-5 py-5">
      <section className="flex flex-col gap-4">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <p className="text-[11px] uppercase tracking-[0.2em] text-ink-soft">Card Workbench</p>
            <h1 className="mt-1 text-2xl font-medium text-ink" data-testid="app-shell-page-title">
              Basic 卡片
            </h1>
            <p className="mt-1 max-w-3xl text-sm leading-6 text-ink-muted">
              管理手工沉淀的 Basic 卡片，按分组、文档和标签整理素材，为单卡复习保留稳定来源。
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" onClick={openCreateGroup}>
              <FolderPlus className="h-4 w-4" />
              新建分组
            </Button>
            <Button onClick={openCreateCard}>
              <Plus className="h-4 w-4" />
              新建卡片
            </Button>
          </div>
        </div>

        <div className="grid gap-3 sm:grid-cols-3">
          <StatCard label="分组" value={String(activeGroups.length)} hint={`${enabledGroups.length} 个已启用`} />
          <StatCard label="当前结果" value={String(cards.length)} hint="受筛选条件影响的卡片数量" />
          <StatCard label="来源文档" value={String(documents.length)} hint="可作为卡片来源的文档" />
        </div>
      </section>

      {actionError ? <InlineError message={actionError} /> : null}

      <div className="grid gap-4 xl:grid-cols-[300px_minmax(0,1fr)]">
        <Card>
          <CardHeader className="border-b border-line-soft">
            <CardTitle className="flex items-center gap-2 text-base">
              <BookOpen className="h-4 w-4 text-ink-soft" />
              分组
            </CardTitle>
            <CardDescription>切换复习分组，或暂时停用不参与队列的卡片集。</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2 p-4">
            <GroupButton
              active={selectedGroupId === ALL_FILTER}
              name="全部分组"
              description="显示所有 Basic 卡片"
              count={cards.length}
              onClick={() => setSelectedGroupId(ALL_FILTER)}
            />
            {activeGroups.length === 0 ? (
              <EmptyState
                icon={FolderPlus}
                title="还没有分组"
                description="先创建一个分组，再把 Basic 卡片放进去。"
                action={{ label: '新建分组', onClick: openCreateGroup }}
              />
            ) : (
              activeGroups.map((group) => (
                <div
                  key={group.id}
                  className={cn(
                    'rounded-lg border p-3',
                    selectedGroupId === group.id ? 'border-ink/20 bg-paper-base' : 'border-line-soft bg-paper-card'
                  )}
                >
                  <button
                    type="button"
                    className="flex w-full items-start justify-between gap-3 text-left"
                    onClick={() => setSelectedGroupId(group.id)}
                  >
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="truncate text-sm font-medium text-ink">{group.name}</span>
                        <Badge variant={group.isEnabled ? 'secondary' : 'outline'}>
                          {group.isEnabled ? '已启用' : '已停用'}
                        </Badge>
                      </div>
                      {group.description ? (
                        <p className="mt-1 line-clamp-2 text-xs leading-5 text-ink-muted">{group.description}</p>
                      ) : null}
                    </div>
                    <Badge variant="outline">{group.cardCount}</Badge>
                  </button>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <Button variant="outline" size="sm" onClick={() => openEditGroup(group)}>
                      编辑
                    </Button>
                    <Button variant="outline" size="sm" onClick={() => void handleToggleGroup(group)}>
                      {group.isEnabled ? '停用' : '启用'}
                    </Button>
                    <Button variant="ghost" size="sm" className="text-destructive" onClick={() => setDeleteDialog({ type: 'group', group })}>
                      删除
                    </Button>
                  </div>
                </div>
              ))
            )}
          </CardContent>
        </Card>

        <div className="space-y-4">
          <Card>
            <CardHeader className="border-b border-line-soft">
              <CardTitle className="flex items-center gap-2 text-base">
                <Filter className="h-4 w-4 text-ink-soft" />
                筛选
              </CardTitle>
              <CardDescription>按搜索词、来源文档或标签缩小 Basic 卡片范围。</CardDescription>
            </CardHeader>
            <CardContent className="grid gap-4 p-4 md:grid-cols-2 xl:grid-cols-4">
              <FormField label="搜索卡片">
                <div className="relative">
                  <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-soft" />
                  <Input
                    aria-label="搜索卡片"
                    value={searchQuery}
                    onChange={(event) => setSearchQuery(event.target.value)}
                    placeholder="标题 / 正面 / 背面"
                    className="pl-9"
                  />
                </div>
              </FormField>
              <FormField label="来源文档">
                <select
                  aria-label="来源文档"
                  value={selectedDocumentId}
                  onChange={(event) => setSelectedDocumentId(event.target.value)}
                  className="border-input h-10 w-full rounded-lg border bg-paper-card px-3 text-sm outline-none focus-visible:border-ring"
                >
                  <option value={ALL_FILTER}>全部文档</option>
                  {documents.map((document) => (
                    <option key={document.id} value={document.id}>
                      {document.title}
                    </option>
                  ))}
                </select>
              </FormField>
              <FormField label="标签">
                <Input
                  aria-label="标签"
                  value={tagQuery}
                  onChange={(event) => setTagQuery(event.target.value)}
                  placeholder="memory, reader"
                />
              </FormField>
              <div className="flex flex-wrap items-end gap-2 md:col-span-2 xl:col-span-1">
                <Button
                  variant="outline"
                  onClick={() => {
                    setSelectedGroupId(ALL_FILTER)
                    setSelectedDocumentId(ALL_FILTER)
                    setSearchQuery('')
                    setTagQuery('')
                  }}
                >
                  清空筛选
                </Button>
                <Button variant="ghost" onClick={() => setActiveNavItem('library')}>
                  去文档页
                </Button>
              </div>
              <div className="flex flex-wrap gap-2 md:col-span-2 xl:col-span-4">
                <Button
                  variant="outline"
                  onClick={() => setSelectedCardIds(allVisibleSelected ? [] : cards.map((card) => card.id))}
                  disabled={cards.length === 0}
                  data-testid="basic-cards-select-visible"
                >
                  {allVisibleSelected ? '取消全选' : '选择当前结果'}
                </Button>
                <Button variant="ghost" onClick={() => setSelectedCardIds([])} disabled={selectedCardIds.length === 0}>
                  清空选择
                </Button>
                <Button
                  variant="outline"
                  className="text-destructive"
                  onClick={() => setDeleteDialog({ type: 'bulk', count: selectedCardIds.length })}
                  disabled={selectedCardIds.length === 0 || isBusy}
                  data-testid="basic-cards-bulk-delete"
                >
                  <Trash2 className="h-4 w-4" />
                  批量删除 {selectedCardIds.length > 0 ? `(${selectedCardIds.length})` : ''}
                </Button>
              </div>
            </CardContent>
          </Card>

          {cardsQuery.isLoading ? (
            <CenteredLoading label="正在加载卡片..." />
          ) : cardsQuery.error ? (
            <ErrorState title="卡片加载失败" description={getErrorMessage(cardsQuery.error)} onRetry={() => void cardsQuery.refetch()} />
          ) : cards.length === 0 ? (
            <Card>
              <CardContent className="p-6">
                <EmptyState
                  icon={Layers3}
                  title="没有匹配的 Basic 卡片"
                  description="清空筛选条件，或新建一张卡片。"
                  action={{ label: '新建卡片', onClick: openCreateCard }}
                  secondaryAction={{ label: '新建分组', onClick: openCreateGroup }}
                />
              </CardContent>
            </Card>
          ) : (
            <div className="grid gap-4 xl:grid-cols-2">
              {cards.map((card) => (
                <Card key={card.id} data-testid={`basic-card-${card.id}`}>
                  <CardHeader className="border-b border-line-soft">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="flex min-w-0 gap-3">
                        <input
                          type="checkbox"
                          aria-label={`选择卡片 ${card.title}`}
                          checked={selectedCardIds.includes(card.id)}
                          onChange={() => toggleCardSelection(card.id)}
                          className="mt-1 h-4 w-4 rounded border-line-soft"
                          data-testid={`basic-card-select-${card.id}`}
                        />
                        <div className="min-w-0 space-y-2">
                          <CardTitle className="text-base leading-6">{card.title}</CardTitle>
                          <div className="flex flex-wrap gap-2">
                            <Badge variant="secondary">{card.groupName}</Badge>
                            {card.origin === 'ai' ? <Badge variant="outline">AI 生成</Badge> : null}
                            {card.source.documentTitle ? (
                              <Badge variant="outline">
                                文档：{card.source.documentTitle}
                                {card.source.page ? ` · p.${card.source.page}` : ''}
                              </Badge>
                            ) : (
                              <Badge variant="outline">手动来源</Badge>
                            )}
                          </div>
                        </div>
                      </div>
                      <div className="flex gap-2">
                        <Button variant="outline" size="sm" onClick={() => openEditCard(card)}>
                          <PencilLine className="h-3.5 w-3.5" />
                          编辑
                        </Button>
                        <Button variant="ghost" size="sm" className="text-destructive" onClick={() => setDeleteDialog({ type: 'card', card })}>
                          <Trash2 className="h-3.5 w-3.5" />
                          删除
                        </Button>
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-4 p-4">
                    <CardPreview
                      front={card.front}
                      back={card.back}
                      tags={card.tags}
                      documentTitle={card.source.documentTitle}
                      pageLabel={card.source.page}
                      sourceQuote={card.source.quote}
                      onOpenSource={card.source.documentId ? () => openCardSource(card) : undefined}
                    />
                    <div className="flex flex-wrap gap-2">
                      {card.tags.length > 0 ? (
                        card.tags.map((tag) => (
                          <button
                            key={tag}
                            type="button"
                            className="rounded-md border border-line-soft px-2 py-1 text-xs text-ink-muted hover:text-ink"
                            onClick={() => setTagQuery(tag)}
                          >
                            #{tag}
                          </button>
                        ))
                      ) : (
                        <span className="text-xs text-ink-soft">没有标签</span>
                      )}
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </div>
      </div>

      {cardEditor ? (
        <CardEditorDialog
          state={cardEditor}
          groups={activeGroups}
          documents={documents}
          isBusy={isBusy}
          onClose={() => setCardEditor(null)}
          onChange={setCardEditor}
          onSubmit={() => void handleCardSubmit(cardEditor)}
        />
      ) : null}

      {groupEditor ? (
        <GroupEditorDialog
          state={groupEditor}
          isBusy={isBusy}
          onClose={() => setGroupEditor(null)}
          onChange={setGroupEditor}
          onSubmit={() => void handleGroupSubmit(groupEditor)}
        />
      ) : null}

      <DeleteConfirmationDialog
        state={deleteDialog}
        isBusy={isBusy}
        onClose={() => setDeleteDialog(null)}
        onConfirm={() => {
          if (!deleteDialog) return
          const current = deleteDialog
          setDeleteDialog(null)
          if (current.type === 'card') void handleDeleteCard(current.card)
          if (current.type === 'bulk') void handleBulkDeleteCards()
          if (current.type === 'group') void handleDeleteGroup(current.group)
        }}
      />
    </div>
  )
}

function DeleteConfirmationDialog({
  state,
  isBusy,
  onClose,
  onConfirm,
}: {
  state:
    | { type: 'card'; card: BasicCard }
    | { type: 'bulk'; count: number }
    | { type: 'group'; group: BasicCardGroup }
    | null
  isBusy: boolean
  onClose: () => void
  onConfirm: () => void
}) {
  const title =
    state?.type === 'group'
      ? `删除分组「${state.group.name}」`
      : state?.type === 'bulk'
        ? `删除 ${state.count} 张卡片`
        : state
          ? `删除「${state.card.title}」`
          : '删除'
  const description =
    state?.type === 'group'
      ? '分组删除后将不再参与学习队列；如果分组仍有卡片，后端会阻止删除并返回原因。'
      : state?.type === 'bulk'
        ? '选中的 Basic 卡片会从卡片资产中移除，今日复习队列也会随之更新。'
        : '这张 Basic 卡片会从卡片资产中移除，关联来源记录不会被删除。'

  return (
    <Dialog open={Boolean(state)} onOpenChange={(open) => (!open ? onClose() : undefined)}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            取消
          </Button>
          <Button variant="destructive" onClick={onConfirm} disabled={isBusy}>
            确认删除
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function StatCard({ label, value, hint }: { label: string; value: string; hint: string }) {
  return (
    <div className="rounded-lg border border-line-soft bg-paper-card/90 px-4 py-4">
      <div className="text-xs font-semibold uppercase tracking-[0.16em] text-ink-soft">{label}</div>
      <div className="mt-2 text-2xl font-semibold text-ink">{value}</div>
      <div className="mt-1 text-xs text-ink-muted">{hint}</div>
    </div>
  )
}

function GroupButton({
  active,
  name,
  description,
  count,
  onClick,
}: {
  active: boolean
  name: string
  description: string
  count: number
  onClick: () => void
}) {
  return (
    <button
      type="button"
      className={cn(
        'flex w-full items-center justify-between rounded-lg border px-4 py-3 text-left',
        active ? 'border-ink/20 bg-paper-base' : 'border-line-soft bg-paper-card hover:bg-paper-muted'
      )}
      onClick={onClick}
    >
      <div>
        <div className="text-sm font-medium text-ink">{name}</div>
        <div className="text-xs text-ink-muted">{description}</div>
      </div>
      <Badge variant="secondary">{count}</Badge>
    </button>
  )
}

function CardEditorDialog({
  state,
  groups,
  documents,
  isBusy,
  onClose,
  onChange,
  onSubmit,
}: {
  state: CardEditorState
  groups: BasicCardGroup[]
  documents: Document[]
  isBusy: boolean
  onClose: () => void
  onChange: (nextState: CardEditorState) => void
  onSubmit: () => void
}) {
  return (
    <DialogShell title={state.mode === 'create' ? '新建 Basic 卡片' : '编辑 Basic 卡片'} onClose={onClose}>
      <div className="space-y-4">
        <FormField label="卡片分组">
          <select
            aria-label="卡片分组"
            value={state.groupId}
            onChange={(event) => onChange({ ...state, groupId: event.target.value })}
            className="border-input h-10 w-full rounded-lg border bg-paper-card px-3 text-sm outline-none focus-visible:border-ring"
          >
            {groups.map((group) => (
              <option key={group.id} value={group.id}>
                {group.name}
                {group.isEnabled ? '' : '（已停用）'}
              </option>
            ))}
          </select>
        </FormField>
        <FormField label="标题">
          <Input aria-label="标题" value={state.title} onChange={(event) => onChange({ ...state, title: event.target.value })} placeholder="卡片标题" />
        </FormField>
        <FormField label="正面">
          <textarea
            aria-label="正面"
            value={state.front}
            onChange={(event) => onChange({ ...state, front: event.target.value })}
            placeholder="问题、线索或需要回忆的内容"
            className="border-input min-h-28 w-full rounded-lg border bg-paper-card px-3 py-2 text-sm outline-none focus-visible:border-ring"
          />
        </FormField>
        <FormField label="背面">
          <textarea
            aria-label="背面"
            value={state.back}
            onChange={(event) => onChange({ ...state, back: event.target.value })}
            placeholder="答案或解释"
            className="border-input min-h-28 w-full rounded-lg border bg-paper-card px-3 py-2 text-sm outline-none focus-visible:border-ring"
          />
        </FormField>
        <FormField label="来源文档">
          <select
            aria-label="来源文档"
            value={state.sourceDocumentId}
            onChange={(event) =>
              onChange({
                ...state,
                sourceDocumentId: event.target.value,
                sourceAnchorId: event.target.value === state.sourceDocumentId ? state.sourceAnchorId : null,
              })
            }
            className="border-input h-10 w-full rounded-lg border bg-paper-card px-3 text-sm outline-none focus-visible:border-ring"
          >
            <option value="">手动来源</option>
            {documents.map((document) => (
              <option key={document.id} value={document.id}>
                {document.title}
              </option>
            ))}
          </select>
        </FormField>
        <FormField label="标签">
          <Input aria-label="标签" value={state.tags} onChange={(event) => onChange({ ...state, tags: event.target.value })} placeholder="memory, reader" />
        </FormField>
      </div>

      <div className="mt-6 flex justify-end gap-3">
        <Button variant="outline" onClick={onClose}>
          取消
        </Button>
        <Button disabled={isBusy} onClick={onSubmit}>
          {state.mode === 'create' ? '创建卡片' : '保存卡片'}
        </Button>
      </div>
    </DialogShell>
  )
}

function GroupEditorDialog({
  state,
  isBusy,
  onClose,
  onChange,
  onSubmit,
}: {
  state: GroupEditorState
  isBusy: boolean
  onClose: () => void
  onChange: (nextState: GroupEditorState) => void
  onSubmit: () => void
}) {
  return (
    <DialogShell title={state.mode === 'create' ? '新建分组' : '编辑分组'} onClose={onClose}>
      <div className="space-y-4">
        <FormField label="分组名称">
          <Input
            aria-label="分组名称"
            value={state.name}
            onChange={(event) => onChange({ ...state, name: event.target.value })}
            placeholder="例如：论文摘记"
          />
        </FormField>
        <FormField label="分组描述">
          <textarea
            aria-label="分组描述"
            value={state.description}
            onChange={(event) => onChange({ ...state, description: event.target.value })}
            placeholder="说明这个分组的学习范围"
            className="border-input min-h-24 w-full rounded-lg border bg-paper-card px-3 py-2 text-sm outline-none focus-visible:border-ring"
          />
        </FormField>
        <FormField label="颜色">
          <Input aria-label="颜色" value={state.color} onChange={(event) => onChange({ ...state, color: event.target.value })} placeholder="#5A7CFF" />
        </FormField>
      </div>

      <div className="mt-6 flex justify-end gap-3">
        <Button variant="outline" onClick={onClose}>
          取消
        </Button>
        <Button disabled={isBusy} onClick={onSubmit}>
          {state.mode === 'create' ? '创建分组' : '保存分组'}
        </Button>
      </div>
    </DialogShell>
  )
}

function DialogShell({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[rgb(var(--overlay-backdrop))] px-4 py-10">
      <div className="w-full max-w-2xl rounded-lg border border-line-soft bg-paper-base p-5 shadow-2xl">
        <div className="flex items-start justify-between gap-4 border-b border-line-soft pb-4">
          <div>
            <h2 className="text-xl font-semibold text-ink">{title}</h2>
            <p className="mt-1 text-sm text-ink-muted">填写 Basic 卡片的正反面、标签和可选来源文档。</p>
          </div>
          <Button variant="ghost" size="sm" onClick={onClose}>
            关闭
          </Button>
        </div>
        <div className="pt-5">{children}</div>
      </div>
    </div>
  )
}

function FormField({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="block space-y-2 text-sm">
      <span className="font-medium text-ink">{label}</span>
      {children}
    </label>
  )
}

function parseTagString(value: string): string[] | null {
  const tags = value
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean)
  return tags.length > 0 ? Array.from(new Set(tags)) : null
}

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : '操作失败，请稍后重试。'
}
