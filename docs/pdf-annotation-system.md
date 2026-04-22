# 学笺 PDF 贴笺系统实现规格

> 文档版本：1.0.0  
> 最后更新：2026-04-21  
> 状态：Approved For Implementation  
> 适用范围：XueJian PDF 阅读器、原文高亮、贴笺侧栏、卡片原文联动  
> 文档定位：本轮开发的直接实现依据

---

## 0. 文档约束

本文件描述的是“本轮必须落地”的 PDF 贴笺系统实现范围。只有本文件中标记为“本轮交付”的能力，才属于当前开发必须完成的目标。

本文件与其他文档的关系如下：

- `docs/spec.md`：本文件负责兑现“卡片贴在原文旁边学习”的产品目标。
- `docs/card-system-v2.md`：沿用现有卡片模型，只扩展高亮与阅读器状态。
- `docs/agent-driven-document-to-card-workflow.md`：在 `finalize` 后新增“自动创建高亮”步骤，但不改变候选生成与审阅的核心流程。

本文件未列入“本轮交付”的内容，不属于本次开发阻塞项。

---

## 1. 背景与问题

XueJian 目前已经具备以下基础：

- PDF.js 页面渲染能力
- `ReaderPage` 阅读器骨架
- `HighlightLayer` SVG 高亮层
- `StickyNotesPanel` 右侧贴笺栏骨架
- `Card` / `Highlight` / `DocumentAnchor` 数据模型
- `finalize_card_generation_workflow` 卡片入库流程

但当前系统仍存在关键缺口：

1. 阅读器没有稳定的三栏式工作布局。
2. 文档库页没有真实接入阅读器入口。
3. AI finalize 完成后不会自动把卡片锚到原文。
4. 当前手动选区只能创建简化高亮，缺少用户友好交互。
5. 右侧贴笺栏只具备基础展示，没有折叠展开、搜索、过滤和缺失高亮修复提示。
6. 阅读器内缺少 PDF 搜索与标签过滤。
7. 缺少“导出带注释 PDF”的闭环能力。

---

## 2. 本轮目标

### 2.1 总目标

把当前 PDF 阅读器升级为一套完整、稳定、可直接使用的“原文 + 高亮 + 贴笺”学习工作台。

### 2.2 本轮交付

以下功能必须在本轮实现完成：

1. 文档库页接入真实文档查询，并支持打开阅读器。
2. 阅读器升级为三栏布局：左页码导航、中 PDF、右贴笺侧栏。
3. finalize 后自动为已入库卡片批量创建原文高亮。
4. 高亮颜色按“同页卡片顺序”循环分配。
5. 点击高亮与点击贴笺实现双向定位。
6. 选中文本后出现浮动操作气泡，可执行：创建高亮、创建卡片、忽略。
7. 右侧贴笺支持折叠/展开、按当前页或全文显示、卡片搜索、标签过滤。
8. 对没有对应高亮的卡片显示“未关联提示”，并支持手动圈选关联。
9. 工具栏支持页码输入、缩放、搜索、跳转候选卡片面板、导出带注释 PDF。
10. 支持 PDF 文本搜索（Ctrl+F / Cmd+F）。
11. 支持导出带注释 PDF。

### 2.3 本轮不交付

以下内容本轮不实现，但允许保留接口或数据位：

1. 阅读器内 FSRS 评分与快速复习。
2. 批注文本 `note` 的完整编辑 UI。
3. 真正的多对多高亮-卡片可视化关系编辑器。
4. 连续滚动式多页 PDF 阅读模式。
5. OCR 识别与图片 PDF 文本重建。
6. 云端同步与多人协作标注。

---

## 3. 设计决策

这些决策已经确认并锁定为本轮默认行为：

1. 布局采用：左侧轻量页码导航条 + 中间 PDF + 右侧抽屉式贴笺面板。
2. 页码导航条不渲染缩略图，只显示页码与颜色点，优先性能。
3. finalize 后才自动批量创建高亮，不在候选审阅阶段创建。
4. 同页卡片颜色按序号循环：黄 → 蓝 → 绿 → 粉。
5. 阅读器不承载复习评分职责，复习仍由 `ReviewPage` 负责。
6. 悬停高亮只做视觉增强和贴笺定位，不弹气泡预览。
7. 跨页卡片只在 `sourcePage` 所属页显示主高亮。
8. 高亮必须有有效矩形；缺失坐标的卡片视为“未关联”，不创建伪高亮。

---

## 4. 数据模型

### 4.1 Highlight 扩展

本轮将扩展 `Highlight`：

```ts
interface Highlight {
  id: string;
  cardId: string | null;
  documentId: string;
  anchorId: string | null;
  pageNumber: number;
  rectangles: Array<{
    x: number;
    y: number;
    width: number;
    height: number;
  }>;
  textContent: string;
  color: string;
  createdAt: Date;

  note: string | null;
  pageCardIndex: number | null;
}
```

说明：

- `note`：本轮只读保留，后续再开放编辑。
- `pageCardIndex`：用于同页颜色循环与贴笺排序。

### 4.2 卡片与高亮关系

本轮采用“一张卡片最多一个主高亮”的实现策略，但结构上保留未来扩展空间。

实际规则：

- 如果卡片已有 `anchorId` 且锚点存在矩形，则使用锚点矩形创建高亮。
- 否则如果卡片有 `sourceCoordinates`，则使用该矩形创建高亮。
- 两者都没有时，不创建高亮，卡片进入“未关联”状态。

### 4.3 阅读器状态扩展

`ReaderState` 新增：

```ts
interface ReaderState {
  documentId: string | null;
  currentPage: number;
  totalPages: number;
  scale: number;
  selectedHighlightId: string | null;
  selectedCardId: string | null;
  hoveredHighlightId: string | null;
  isSearchOpen: boolean;
  searchQuery: string;
  searchMatchIndex: number;
  searchResults: Array<{
    page: number;
    rects: Array<{ x: number; y: number; width: number; height: number }>;
    excerpt: string;
  }>;
  annotationFilterTags: string[];
  annotationScope: "page" | "all";
  isLinkingMode: boolean;
  linkingTargetCardId: string | null;
}
```

---

## 5. 布局规格

### 5.1 三栏结构

阅读器采用以下结构：

```text
┌───────────────────────────────────────────────────────────────┐
│ Toolbar                                                      │
├──────────┬───────────────────────────────────┬───────────────┤
│ PageNav  │ PDF Page + Highlight Layer        │ Sticky Notes  │
│          │ Text Selection Popover            │               │
└──────────┴───────────────────────────────────┴───────────────┘
```

建议尺寸：

- 左栏：56px
- 中栏：自适应剩余宽度
- 右栏：360px

### 5.2 页面导航条

左栏职责：

- 显示文档页码列表
- 高亮当前页
- 显示该页已有卡片颜色点
- 点击切换页码

本轮不渲染缩略图。

### 5.3 贴笺侧栏

右栏职责：

- 默认展示当前页卡片
- 可切换为全文模式
- 展示卡片折叠摘要
- 支持展开查看 front/back/tags
- 支持搜索、过滤、定位、编辑、删除

---

## 6. 颜色系统

使用现有主题颜色变量：

- 黄：`#F8E16C`
- 蓝：`#BBDEFB`
- 绿：`#C8E6C9`
- 粉：`#F8BBD9`

循环规则：

```ts
const palette = ["#F8E16C", "#BBDEFB", "#C8E6C9", "#F8BBD9"];
color = palette[pageCardIndex % palette.length];
```

该颜色要同时用于：

1. PDF 高亮填充色
2. 贴笺卡片顶部纸胶带
3. 左侧页码条的颜色点

---

## 7. 自动高亮创建流程

### 7.1 触发时机

在 `finalize_card_generation_workflow` 成功完成后，立即执行一次批量高亮创建。

### 7.2 创建规则

对该 workflow run 本次新建的正式卡片执行：

1. 按 `sourcePage` 分组。
2. 每页内按 `created_at` 升序排序。
3. 为每张卡片分配 `pageCardIndex`。
4. 如果存在 anchor rect，则优先用 anchor rect。
5. 否则若存在 `sourceCoordinates`，则用其作为单矩形高亮。
6. 若无矩形，跳过创建并记录为“未关联”。

### 7.3 需要新增的命令

本轮新增 Tauri 命令：

- `batch_create_highlights_for_cards`
- `export_annotated_pdf`

---

## 8. 手动选区与卡片创建

### 8.1 选区操作气泡

用户在 PDF 页内选择文本后，出现浮动气泡，提供三个操作：

1. 创建高亮
2. 创建卡片
3. 忽略

### 8.2 创建高亮

手动创建高亮时：

- 使用选区矩形
- 使用当前页下一个颜色
- 不绑定卡片

### 8.3 创建卡片

点击“创建卡片”时：

- 打开现有 `CardEditorModal`
- 预填 `front = 选中文本`
- 保存后自动创建绑定该卡片的高亮

### 8.4 手动圈选关联

对未关联卡片，用户可进入“圈选关联模式”：

1. 点击“手动圈选关联”
2. 阅读器进入 linking mode
3. 用户在 PDF 里重新选区
4. 提交后创建高亮并绑定卡片

---

## 9. 搜索与过滤

### 9.1 PDF 文本搜索

工具栏支持 `Ctrl+F / Cmd+F`：

- 搜索所有页面缓存文本层
- 给当前匹配结果渲染橙色搜索高亮
- 支持上一条 / 下一条导航
- 命中跨页时自动跳页

### 9.2 卡片搜索

贴笺侧栏支持对当前文档卡片进行全文搜索：

- 搜索字段：front / back / tags
- 搜索时自动切换到“全文模式”
- 结果按页码分组显示

### 9.3 标签过滤

侧栏聚合展示标签 chips。

规则：

- 多标签采用 AND 过滤
- 不匹配的高亮在 PDF 中降低透明度
- 匹配的高亮与卡片保持正常显示

---

## 10. 导出带注释 PDF

### 10.1 目标

把当前文档中的所有高亮嵌入到新导出的 PDF 中。

### 10.2 实现策略

本轮采用“生成带注释副本文件”的方式，不修改原 PDF。

导出流程：

1. 打开保存文件对话框
2. 读取原 PDF 二进制
3. 查询该文档所有高亮
4. 将归一化坐标转换为 PDF 页面坐标
5. 写入高亮注释对象
6. 输出新文件

---

## 11. 组件实施清单

本轮需要新增或重构以下组件：

### 11.1 新增组件

- `src/components/documents/PageNavBar.tsx`
- `src/components/documents/TextSelectionPopover.tsx`
- `src/components/documents/PdfViewer/PdfSearchBar.tsx`
- `src/components/documents/StickyNotes/StickyNoteCard.tsx`
- `src/components/documents/StickyNotes/UnlinkedCardNotice.tsx`
- `src/lib/annotationPalette.ts`

### 11.2 重构组件

- `src/features/documents/LibraryPage.tsx`
- `src/features/documents/ReaderPage.tsx`
- `src/components/documents/PdfViewer/HighlightLayer.tsx`
- `src/components/documents/PdfViewer/PdfToolbar.tsx`
- `src/components/documents/StickyNotes/StickyNotesPanel.tsx`
- `src/store/ui.ts`
- `src/services/gateway/cards.ts`
- `src/queries/cards.ts`
- `src/types/document.ts`
- `src/types/schema.ts`

### 11.3 后端与存储

- `src-tauri/src/commands/cards.rs`
- `src-tauri/src/db/card_repo.rs`
- `src-tauri/src/migrations/*`
- `src-tauri/src/lib.rs`
- `src-tauri/src/gateway/mod.rs`

---

## 12. 验收标准

### 12.1 主链路验收

以下全部满足，才视为本轮完成：

1. 文档库中点击文档可进入阅读器。
2. 阅读器显示三栏布局。
3. finalize 后有坐标的卡片自动显示高亮。
4. 点击高亮可在右侧定位卡片。
5. 点击卡片可在 PDF 中聚焦高亮。
6. 选中文字后能弹出操作气泡。
7. 通过选区新建卡片后，高亮与卡片自动绑定。
8. 未关联卡片显示修复提示并可手动补绑。
9. Ctrl+F 可以搜索 PDF 文本并跳转命中项。
10. 贴笺侧栏可执行搜索和标签过滤。
11. 能导出带注释 PDF。

### 12.2 性能底线

1. 100 页文档的页码导航不出现明显卡顿。
2. 单页 24 个高亮渲染稳定，无严重掉帧。
3. 阅读器切页保持在可接受范围内。

---

## 13. 本轮实施顺序

严格按以下顺序开发：

1. 写入本文档
2. 扩展类型、schema、store
3. 扩展 Tauri 高亮命令与 migration
4. 打通 finalize → 自动创建高亮
5. 重构 LibraryPage 与 ReaderPage 主布局
6. 重构 StickyNotesPanel 与新建 StickyNoteCard
7. 实现选区气泡、手动创建与手动关联
8. 实现 PDF 搜索与卡片过滤
9. 实现导出带注释 PDF
10. 补测试并验证

---

## 14. 结束条件

只有当本文件第 12 节的验收标准全部满足时，本轮开发才允许结束。
