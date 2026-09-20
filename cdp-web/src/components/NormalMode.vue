<template>
  <div
    ref="workbenchLeftPanelRef"
    class="left-panel workbench-left-panel"
    :style="{ width: `${workbenchLeftWidth}px` }"
  >
    <button
      type="button"
      class="left-panel-edge-toggle"
      :class="{ 'is-solutions': leftPanelMode === 'solutions' }"
      data-tutorial-target="open-solution-picker"
      @click="toggleLeftPanelMode"
    >
      {{ leftPanelMode === 'packages' ? '选方案' : '组件库' }}
    </button>

    <section v-if="leftPanelMode === 'solutions'" class="workbench-section workbench-solution-section">
      <div class="workbench-section-head">
        <div>
          <div class="display-feature-title">已发布方案</div>
        </div>
        <el-tooltip content="刷新方案" placement="bottom">
          <el-button
            class="workbench-section-icon-btn"
            :icon="RefreshRight"
            circle
            aria-label="刷新方案"
            @click="refreshPublishedSolutions"
            :loading="loadingPublishedSolutions"
          />
        </el-tooltip>
      </div>

      <el-radio-group
        :model-value="publishedLibraryScope"
        size="small"
        class="intercom-radio-group solution-library-switch workbench-library-switch"
        aria-label="选择方案库"
        @change="switchPublishedLibrary"
      >
        <el-radio-button value="mine">我的方案</el-radio-button>
        <el-radio-button value="public">公共方案</el-radio-button>
      </el-radio-group>

      <FolderTree
        :folders="publishedFolderTree"
        :batch-counts="publishedBatchCountByFolder"
        :show-batch-badges="true"
        :tutorial-batch-folder-id="tutorialBatchFolderId"
        read-only
        @select-folder="onPublishedFolderSelect"
        @batch-apply="openBatchPreviewForFolder"
      />

      <el-input
        v-model="solutionSearch"
        placeholder="搜索方案..."
        size="small"
        clearable
        class="intercom-input pkg-search"
      >
        <template #prefix><el-icon class="search-prefix-icon"><Search /></el-icon></template>
      </el-input>

      <div class="published-solution-list">
        <button
          v-for="item in filteredPublishedSolutions"
          :key="item.id"
          type="button"
          class="published-solution-item"
          :class="{
            active: currentSolution?.id === item.id && workbenchMode === 'solution-use' && !batchMode,
            'batch-member': batchMode && batchEntries.some(entry => entry.id === item.id),
          }"
          :data-tutorial-target="getTutorialPublishedSolutionTarget(item)"
          @click="loadPublishedSolution(item)"
        >
          <div class="solution-list-item-head">
            <span class="solution-status-light published" role="img" aria-label="已发布"></span>
          </div>
          <div class="display-body strong solution-list-name published-solution-name">{{ item.name || '未命名方案' }}</div>
          <div class="solution-list-meta">
            <span>{{ item.nodes?.length || 0 }} 个节点</span>
          </div>
          <div v-if="loadingSolutionId === item.id" class="display-body-light published-solution-loading">
            正在加载...
          </div>
        </button>

        <div
          v-if="!loadingPublishedSolutions && filteredPublishedSolutions.length === 0"
          class="display-body-light workbench-empty-sm"
        >
          {{ publishedLibraryScope === 'public' ? '公共方案库暂无可用的已发布方案' : '我的方案库暂无可用的已发布方案' }}
        </div>
      </div>
    </section>

    <section
      v-else
      class="workbench-section workbench-package-section"
    >
      <div class="workbench-section-head">
        <div>
          <div class="display-feature-title">行为组件分区</div>
          <div class="behavior-component-library-caption">点击新建，或拖入运算池</div>
        </div>
        <span class="behavior-component-library-total">{{ availablePackages.length }}</span>
      </div>


      <el-input
        v-model="pkgSearch"
        placeholder="搜索组件..."
        size="small"
        clearable
        class="intercom-input pkg-search"
      >
        <template #prefix><el-icon class="search-prefix-icon"><Search /></el-icon></template>
      </el-input>

      <div class="behavior-component-library" aria-label="行为组件分区">
        <section
          v-for="group in groupedPackages"
          :key="group.name"
          class="behavior-component-group"
          :class="{ 'is-favorites': group.isFavorites }"
        >
          <div class="behavior-component-group-head">
            <h3 class="behavior-component-group-title">{{ group.name }}</h3>
            <span class="behavior-component-group-count">{{ group.packages.length }}</span>
          </div>
          <div class="behavior-component-group-items">
            <div
              v-for="pkg in group.packages"
              :key="pkg"
              class="behavior-component-item"
              :class="{
                'is-favorite': isFavoritePackage(pkg),
                'is-dragging': draggedPackageType === pkg,
              }"
            >
              <el-button
                type="default"
                class="behavior-component-add"
                :data-tutorial-target="getTutorialPackageTarget(pkg)"
                :aria-label="`添加 ${pkg}，也可拖入运算池`"
                title="拖入运算池，或点击新建独立运算池"
                draggable="true"
                @dragstart="onPackageDragStart($event, pkg)"
                @dragend="onPackageDragEnd"
                @click="addNode(pkg)"
                :loading="loadingPkg === pkg"
              >
                <span class="behavior-component-add-mark" aria-hidden="true">＋</span>
                <span>{{ pkg }}</span>
              </el-button>
              <button
                type="button"
                class="behavior-component-favorite"
                :class="{ 'is-active': isFavoritePackage(pkg) }"
                :aria-label="isFavoritePackage(pkg) ? `取消收藏 ${pkg}` : `收藏 ${pkg}`"
                :aria-pressed="isFavoritePackage(pkg)"
                :title="isFavoritePackage(pkg) ? '取消收藏' : '收藏组件'"
                @click.stop="toggleFavoritePackage(pkg)"
              >
                <el-icon aria-hidden="true">
                  <StarFilled v-if="isFavoritePackage(pkg)" />
                  <Star v-else />
                </el-icon>
              </button>
            </div>
          </div>
        </section>
      </div>

      <div
        v-if="pkgSearch && filteredPackages.length === 0"
        class="display-body-light workbench-empty-sm"
      >
        没有匹配的组件
      </div>
    </section>

    <div
      class="panel-resize-handle panel-resize-handle--right"
      :aria-valuenow="workbenchLeftWidth"
      aria-valuemin="240"
      aria-valuemax="360"
      aria-label="调整圈包页面左侧栏宽度"
      aria-orientation="vertical"
      role="separator"
      tabindex="0"
      @pointerdown="startWorkbenchLeftResize"
      @keydown="onWorkbenchLeftResizeKeydown"
    ></div>
  </div>

  <div class="center-panel" data-tutorial-target="clean-workbench">
    <div class="panel-toolbar">
      <div class="workbench-toolbar-copy">
        <div class="display-feature-title">
          {{
            batchMode
              ? (isParameterBatch
                ? `${batchFolderName || '单方案批量任务'} · ${batchEntries.length} 包`
                : `${batchFolderName || '组合方案'} · ${batchEntries.length} 个人群包`)
              : (workbenchMode === 'solution-use' ? (currentSolution?.name || '模板使用') : '自由搭建圈包')
          }}
        </div>
        <div v-if="batchMode" class="batch-toolbar-caption">
          {{ isParameterBatch
            ? `${parameterBatchFieldName} 按 Excel 行拆分 · 其余参数保持一致`
            : '参数按名称聚合 · 修改一次同步到所有匹配方案' }}
        </div>
        <div v-else-if="workbenchMode === 'solution-use' && derivedSolutionMeta.hasStructureChanges" class="display-body-light">
          当前内容已偏离原方案结构
        </div>
      </div>

      <div class="toolbar-actions workbench-toolbar-actions">
        <div
          class="workbench-phase-status"
          :class="{
            'is-free-build': workbenchMode === 'free-build',
            'is-solution-use': workbenchMode === 'solution-use',
            'is-batch': batchMode,
          }"
          aria-live="polite"
        >
          <span class="workbench-phase-dot"></span>
          <span class="display-body strong">
            {{ batchMode
              ? (isParameterBatch ? '批量任务使用中' : '组合方案使用中')
              : (workbenchMode === 'solution-use' ? '方案使用中' : '自由搭建中') }}
          </span>
        </div>

        <div class="workbench-secondary-actions">
          <template v-if="workbenchMode === 'solution-use'">
            <el-button
              v-if="!batchMode && deferredSolutionSplitSummary"
              class="workbench-compact-action pending-split"
              size="small"
              @click="confirmDeferredSolutionSplit"
            >
              最后确认拆分 · {{ deferredSolutionSplitSummary.nodeCount }} 处
            </el-button>
            <el-button
              v-if="batchMode"
              class="workbench-compact-action danger"
              size="small"
              text
              @click="clearCanvas"
            >
              {{ isParameterBatch ? '清空批量' : '清空组合' }}
            </el-button>
            <el-tooltip content="恢复方案默认值" placement="top">
              <el-button
                class="workbench-toolbar-icon-btn"
                size="small"
                text
                @click="restoreActiveDefaults"
                :disabled="batchMode ? !batchEntries.length : !loadedSolutionRecord"
              >
                <el-icon><RefreshLeft /></el-icon>
              </el-button>
            </el-tooltip>
            <el-tooltip v-if="!batchMode" content="另存为新方案" placement="top">
              <el-button
                class="workbench-toolbar-icon-btn"
                size="small"
                text
                data-tutorial-target="pull-save-as-solution"
                @click="saveAsNewDerivedDraft"
                :disabled="nodeList.length === 0"
                :loading="savingDraft"
              >
                <el-icon><FolderAdd /></el-icon>
              </el-button>
            </el-tooltip>
            <el-button
              v-if="nodeList.length > 0 && !batchMode"
              class="workbench-compact-action"
              size="small"
              text
              @click="toggleCollapseAll"
            >
              {{ allCollapsed ? '展开全部' : '收起全部' }}
            </el-button>
            <el-button
              v-if="nodeList.length > 0 && !batchMode"
              class="workbench-compact-action danger"
              size="small"
              text
              @click="clearCanvas"
            >
              清空
            </el-button>
          </template>
          <template v-else>
            <el-button
              class="workbench-compact-action save-draft"
              data-tutorial-target="save-workbench-solution"
              size="small"
              text
              @click="saveWorkbenchDraft"
              :disabled="nodeList.length === 0"
              :loading="savingDraft"
            >
              存草稿
            </el-button>
            <el-button
              v-if="nodeList.length > 0"
              class="workbench-compact-action"
              size="small"
              text
              @click="toggleCollapseAll"
            >
              {{ allCollapsed ? '展开全部' : '收起全部' }}
            </el-button>
            <el-button
              v-if="nodeList.length > 0"
              class="workbench-compact-action danger"
              size="small"
              text
              @click="clearCanvas"
            >
              清空
            </el-button>
          </template>

          <el-button class="workbench-compact-action icon-only" :disabled="!canUndo" @click="undo" size="small" text title="撤销 Ctrl+Z">↶</el-button>
          <el-button class="workbench-compact-action icon-only" :disabled="!canRedo" @click="redo" size="small" text title="重做 Ctrl+Shift+Z">↷</el-button>
        </div>
      </div>
    </div>

    <Transition name="mode-switch" mode="out-in">
    <div v-if="workbenchMode === 'solution-use'" key="solution-use" style="flex:1;display:flex;flex-direction:column;min-height:0;overflow:hidden">
      <div v-if="loadingSolutionId" class="solution-use-area">
        <div class="cf-loading-state">
          <div class="skeleton-bar skeleton-bar-header"></div>
          <div class="skeleton-bar skeleton-bar-body"></div>
          <div class="skeleton-bar skeleton-bar-body short"></div>
        </div>
      </div>
      <div v-else-if="!currentSolution" class="empty-hint display-body-light">
        请先从左侧选择一个已发布方案
      </div>
      <div v-else class="solution-use-area" data-tutorial-target="solution-use-area">
        <div v-if="batchMode" class="batch-compact-rail" data-tutorial-target="pull-package-tabs">
          <span class="batch-compact-label">人群包</span>
          <div class="batch-compact-tabs" role="tablist" aria-label="切换人群包">
            <button
              v-for="(entry, entryIndex) in batchEntries"
              :key="entry.id"
              type="button"
              role="tab"
              class="batch-compact-tab"
              :class="[
                { active: entryIndex === activeBatchIndex },
                `status-${entry.automationStatus || 'idle'}`,
              ]"
              :aria-selected="entryIndex === activeBatchIndex"
              :title="`来源方案：${entry.solutionName || '未命名方案'}`"
              :data-tutorial-target="`pull-batch-package-${entryIndex}`"
              :disabled="databankAutomating"
              @click="activateBatchEntry(entryIndex)"
            >
              <span>{{ String(entryIndex + 1).padStart(2, '0') }}</span>
              <strong>{{ entry.crowdName || '未命名人群包' }}</strong>
              <i aria-hidden="true"></i>
            </button>
          </div>
          <span class="batch-compact-meta">{{ batchEntries.length }} 包 · {{ customFieldSections.length }} 参数</span>
        </div>
        <div v-if="batchMode && batchFailedCount > 0" class="batch-recovery-bar" role="status">
          <div>
            <span>批量任务可恢复</span>
            <strong>{{ batchSucceededCount }} 个已完成，{{ batchFailedCount }} 个{{ batchInterruptedCount ? '因中断未完成' : '执行失败' }}</strong>
            <small>成功结果会保留，恢复时只重新提交未完成的包。</small>
          </div>
          <el-button
            class="intercom-btn-primary"
            size="small"
            :disabled="databankAutomating"
            @click="openBatchFailureRecovery"
          >重试 {{ batchFailedCount }} 个未完成项</el-button>
        </div>

        <div
          v-if="batchMode && customFieldSections.length > 0"
          class="batch-parameter-heading"
        >
          <div>
            <span class="batch-parameter-eyebrow">{{ isParameterBatch ? '批量参数' : '组合参数' }}</span>
            <strong>{{ isParameterBatch ? `${parameterBatchFieldName} 按行独立` : `按名称去重，共 ${customFieldSections.length} 项` }}</strong>
          </div>
          <span class="batch-parameter-rule">
            {{ isParameterBatch
              ? `其余参数修改一次，同步写入 ${batchEntries.length} 个人群包`
              : `同名参数同步写入 ${batchEntries.length} 个人群包` }}
          </span>
        </div>

        <div
          v-if="customFieldSections.length > 0"
          class="cf-cards-bar"
          ref="cfCardsBarRef"
          :data-tutorial-target="batchMode ? 'pull-aggregate-parameters' : undefined"
        >
          <div
            v-for="(section, cfIndex) in cfVisibleSections"
            :key="section.customFieldId"
            class="cf-use-card"
            :class="{
              'cf-use-card-active': highlightedCfId === section.customFieldId,
              'dragging': dragCfIndex === cfIndex,
              'drag-over': dragOverCfIndex === cfIndex && dragCfIndex !== cfIndex,
            }"
            :draggable="!batchMode"
            @dragstart="onCfDragStart($event, cfIndex)"
            @dragover.prevent="onCfDragOver($event, cfIndex)"
            @dragleave="onCfDragLeave"
            @drop.prevent="onCfDrop($event, cfIndex)"
            @dragend="onCfDragEnd"
            @click="onHighlightCf(section.customFieldId)"
          >
	            <span class="cf-type-indicator cf-use-card-dot" :class="getCfTypeClass(section.type)"></span>
	            <div class="cf-use-card-info">
	              <span class="cf-use-card-title-row">
	                <span class="display-body strong cf-use-card-name">{{ section.name }}</span>
	                <span v-if="isParameterBatchSection(section)" class="cf-parameter-row-badge">按行独立</span>
	              </span>
	              <span class="cf-use-card-value-row">
	                <span class="display-body-light cf-use-card-value">{{ getCfValueSummaryMeta(section).primaryText }}</span>
	                <el-tooltip
	                  v-if="getCfValueSummaryMeta(section).overflowCount > 0"
	                  :content="getCfValueSummaryMeta(section).overflowText"
	                  placement="top"
	                  effect="dark"
	                  popper-class="cf-value-tooltip"
	                >
	                  <span class="display-mono cf-use-card-more">+{{ getCfValueSummaryMeta(section).overflowCount }}</span>
	                </el-tooltip>
	              </span>
                <span v-if="batchMode" class="batch-parameter-scope">
                  {{ isParameterBatchSection(section)
                    ? `当前第 ${activeBatchEntry?.parameterBatchSourceRow || 1} 行`
                    : `适用于 ${section.entryCount || 0}/${batchEntries.length} 个包` }}
                </span>
	            </div>
	            <span
	              class="display-mono cf-use-card-count"
	              :title="isParameterBatchSection(section) ? '该参数由 Excel 行独立控制' : '点击编辑'"
                :data-tutorial-target="getTutorialCustomFieldTarget(section)"
              @click.stop="openCfEditDialog(section)"
            >{{ section.bindings.length }}</span>
          </div>
          <div
            ref="overflowBtnRef"
            v-if="cfHiddenCount > 0"
            class="cf-overflow-btn"
            @click="cfShowAll = !cfShowAll"
            :title="cfShowAll ? '收起' : '展开更多'"
          >{{ cfShowAll ? '−' : '+' + cfHiddenCount }}</div>
          <el-button
            v-if="highlightedCfId && !batchMode"
            class="cf-expand-all-btn"
            size="small"
            text
            @click="toggleCollapseMode"
          >
            {{ collapsedCfId ? '展开全部' : '收缩' }}
          </el-button>
        </div>
        <div v-if="operationPools.length > 0" class="canvas-with-minimap cf-use-node-area">
          <div class="canvas-scroll-area" ref="canvasScrollRef" @scroll="onCanvasScroll">
            <div v-for="(pool, poolIndex) in operationPools" :key="pool.id" class="operation-pool-block">
              <div v-if="poolIndex > 0" class="logic-connector operation-pool-connector">
                <div class="connector-line"></div>
                <span class="operation-pool-relation-label">运算池关系</span>
                <el-radio-group
                  :model-value="pool.operator"
                  size="small"
                  class="intercom-radio-group"
                  :disabled="batchMode"
                  @update:model-value="changePoolRelation(pool.id, $event)"
                >
                  <el-radio-button value="n">交</el-radio-button>
                  <el-radio-button value="u">并</el-radio-button>
                  <el-radio-button value="d">差</el-radio-button>
                </el-radio-group>
                <div class="connector-line"></div>
              </div>

              <section
                class="operation-pool"
                :class="[
                  `is-${pool.type === 'u' ? 'union' : 'intersection'}`,
                  {
                    'is-empty': pool.entries.length === 0,
                    'is-drag-over': dragOverPoolId === pool.id,
                    'is-package-target': Boolean(draggedPackageType),
                  },
                ]"
                @dragover.prevent="onPoolDragOver($event, pool.id)"
                @drop.prevent="onDropIntoPool($event, pool.id)"
                @dragleave="onDragLeave"
              >
                <header class="operation-pool-header">
                  <div class="operation-pool-title">
                    <span class="operation-pool-symbol" aria-hidden="true"></span>
                    <strong>{{ pool.type === 'u' ? '并集运算池' : '交集运算池' }} {{ poolIndex + 1 }}</strong>
                    <span class="operation-pool-count" :aria-label="`${pool.entries.length} 个行为`">{{ pool.entries.length }}</span>
                    <small>{{ pool.type === 'u' ? '满足以下任一行为' : '同时满足以下行为' }}</small>
                  </div>
                  <div class="operation-pool-actions">
                    <el-radio-group
                      :model-value="pool.type"
                      size="small"
                      class="operation-pool-type-switch"
                      :disabled="batchMode"
                      @update:model-value="changePoolType(pool.id, $event)"
                    >
                      <el-radio-button value="n">交集池</el-radio-button>
                      <el-radio-button value="u">并集池</el-radio-button>
                    </el-radio-group>
                    <button
                      v-if="!batchMode && !(pool.entries.length === 0 && operationPools.length === 1)"
                      type="button"
                      class="operation-pool-delete"
                      @click="removePool(pool)"
                    >删除运算池</button>
                  </div>
                </header>

                <div class="operation-pool-body">
                  <div
                    v-for="entry in pool.entries"
                    :key="entry.node.id"
                    v-show="!collapsedCfId || getNodeFocusBindings(entry.node.id).length > 0"
                    class="node-wrapper operation-pool-node"
                    :ref="(el) => { if (el) nodeRefs[entry.index] = el }"
                    @dragover.prevent="onDragOver($event, entry.index, pool.id)"
                    @drop.stop.prevent="onDropOnNode($event, entry.index, pool.id)"
                    @dragleave="onDragLeave"
                  >
	                <div class="intercom-card behavior-card" :class="{ collapsed: collapsedCfId || entry.node.collapsed, 'node-hydration-error': entry.node._hydrationError }">
	                  <div class="card-header-inner behavior-card-header" :class="{ 'drag-over': dragOverIndex === entry.index }">
	                    <span
                        v-if="!batchMode"
	                      class="drag-handle"
	                      draggable="true"
                        @dragstart="onDragStart($event, entry.index)"
                        @dragend="onDragEnd"
                        title="拖入其他运算池"
                      >⋮⋮</span>
	                    <span class="card-title-flex behavior-card-title-group" @click="collapsedCfId ? null : (entry.node.collapsed = !entry.node.collapsed)" :style="{ cursor: collapsedCfId ? 'default' : 'pointer' }">
	                      <span class="collapse-arrow behavior-card-collapse">{{ (collapsedCfId || entry.node.collapsed) ? '▶' : '▼' }}</span>
	                      <span class="display-card-title workbench-node-title">{{ entry.node.packageType }}</span>
	                      <span class="display-mono badge-mono behavior-card-node-badge">{{ getNodeDisplayName(entry.node, entry.index) }}</span>
	                      <span v-if="entry.node.collapsed" class="behavior-card-summary">{{ getCollapsedNodeSummary(entry.node) }}</span>
	                      <span v-if="entry.node._hydrationError" class="display-mono badge-error">加载失败</span>
	                    </span>
	                    <div v-if="!batchMode" class="behavior-card-action-group">
                        <button v-if="pool.entries.length > 1" type="button" class="operation-node-detach" @click.stop="detachNodeFromPool(entry.index)">移出池</button>
	                      <el-tooltip content="复制节点" placement="top">
	                        <el-button class="behavior-card-icon-btn" @click.stop="duplicateNode(entry.index)"><el-icon><CopyDocument /></el-icon></el-button>
	                      </el-tooltip>
	                      <el-tooltip content="移除节点" placement="top">
	                        <el-button class="behavior-card-icon-btn danger" aria-label="移除节点" @click.stop="removeNode(entry.index)"><el-icon><Delete /></el-icon></el-button>
	                      </el-tooltip>
	                    </div>
                    </div>
                    <div v-if="entry.node._hydrationError" v-show="!(collapsedCfId || entry.node.collapsed)" class="hydration-error-body">
                      <p class="display-body-light">该组件元数据加载失败，请检查后端服务后重新加载方案。</p>
                    </div>
                    <div v-else-if="collapsedCfId && getNodeFocusBindings(entry.node.id).length > 0" class="cf-focus-fields">
                      <div v-for="binding in getNodeFocusBindings(entry.node.id)" :key="binding.fieldKey" class="cf-focus-field-row">
                        <span class="display-body-light">{{ getFocusFieldDisplay(binding.fieldKey, entry.node).label }}</span>
                        <span class="display-body strong">{{ getFocusFieldDisplay(binding.fieldKey, entry.node).value }}</span>
                      </div>
                    </div>
                    <div v-else-if="collapsedCfId" class="cf-focus-fields">
                      <div class="display-body-light" style="opacity:0.4;font-size:12px;padding:4px 0">无映射字段</div>
                    </div>
                    <DynamicForm
                      v-else
                      v-show="!entry.node.collapsed"
                      :node="entry.node"
                      :node-index="entry.index"
                      :readonly="batchMode"
                      :overflow-policy="!batchMode ? 'solution-use' : 'legacy'"
                      @overflow-split="handleOverflowSplit"
                    />
                  </div>
                  </div>
                </div>
                <div v-if="!batchMode" class="operation-pool-drop-hint">
                  {{ pool.entries.length ? '继续拖入行为' : '从左侧拖入行为组件' }} · 池内自动{{ pool.type === 'u' ? '并集' : '交集' }}
                </div>
              </section>
            </div>
          </div>
        </div>
        <div v-else class="empty-hint display-body-light">
          当前方案没有节点
        </div>
        <div v-if="!batchMode" class="operation-pool-add-bar" aria-label="添加运算池">
          <span class="operation-pool-add-label">添加运算池</span>
          <button type="button" class="operation-pool-add-button is-intersection" @click="addEmptyOperationPool('n')">
            <span class="operation-pool-add-symbol" aria-hidden="true"></span> 添加交集运算池
          </button>
          <button type="button" class="operation-pool-add-button is-union" @click="addEmptyOperationPool('u')">
            <span class="operation-pool-add-symbol" aria-hidden="true"></span> 添加并集运算池
          </button>
        </div>
      </div>

      <CustomFieldEditDialog
        v-model="cfEditDialogVisible"
        :custom-field="editingCfSection"
        :bound-nodes="editingCfSection?.bindings || []"
        :current-value="editingCfCurrentValue"
        :node-list="editingCfNodeList.length ? editingCfNodeList : nodeList"
        :show-batch-action="canBatchParameterSection(editingCfSection)"
        @batch="openParameterBatchFromEditor"
        @save="onCfDialogSave"
      />
    </div>

    <div v-else key="free-build" style="flex:1;display:flex;flex-direction:column;min-height:0;overflow:hidden">
      <div v-if="operationPools.length === 0" class="empty-hint display-body-light">
        点击右下角 AI 图标，或从左侧手动添加行为组件
      </div>

      <div v-if="operationPools.length > 0" class="canvas-with-minimap" data-tutorial-target="split-result">
        <div class="canvas-scroll-area" ref="canvasScrollRef" @scroll="onCanvasScroll">
          <div v-for="(pool, poolIndex) in operationPools" :key="pool.id" class="operation-pool-block">
            <div v-if="poolIndex > 0" class="logic-connector operation-pool-connector">
              <div class="connector-line"></div>
              <span class="operation-pool-relation-label">运算池关系</span>
              <div
                class="tutorial-intersection-control"
                :data-tutorial-target="poolIndex === 1 ? 'solution-intersection' : undefined"
                aria-label="运算池关系：交集、并集、差集"
              >
                <el-radio-group
                  :model-value="pool.operator"
                  size="small"
                  class="intercom-radio-group"
                  @update:model-value="changePoolRelation(pool.id, $event)"
                >
	                <el-radio-button value="n">交</el-radio-button>
	                <el-radio-button value="u">并</el-radio-button>
	                <el-radio-button value="d">差</el-radio-button>
                </el-radio-group>
              </div>
              <div class="connector-line"></div>
            </div>

            <section
              class="operation-pool"
              :class="[
                `is-${pool.type === 'u' ? 'union' : 'intersection'}`,
                {
                  'is-empty': pool.entries.length === 0,
                  'is-drag-over': dragOverPoolId === pool.id,
                  'is-package-target': Boolean(draggedPackageType),
                },
              ]"
              @dragover.prevent="onPoolDragOver($event, pool.id)"
              @drop.prevent="onDropIntoPool($event, pool.id)"
              @dragleave="onDragLeave"
            >
              <header class="operation-pool-header">
                <div class="operation-pool-title">
                  <span class="operation-pool-symbol" aria-hidden="true"></span>
                  <strong>{{ pool.type === 'u' ? '并集运算池' : '交集运算池' }} {{ poolIndex + 1 }}</strong>
                  <span class="operation-pool-count" :aria-label="`${pool.entries.length} 个行为`">{{ pool.entries.length }}</span>
                  <small>{{ pool.type === 'u' ? '满足以下任一行为' : '同时满足以下行为' }}</small>
                </div>
                <div class="operation-pool-actions">
                  <el-radio-group
                    :model-value="pool.type"
                    size="small"
                    class="operation-pool-type-switch"
                    @update:model-value="changePoolType(pool.id, $event)"
                  >
                    <el-radio-button value="n">交集池</el-radio-button>
                    <el-radio-button value="u">并集池</el-radio-button>
                  </el-radio-group>
                  <button
                    v-if="!(pool.entries.length === 0 && operationPools.length === 1)"
                    type="button"
                    class="operation-pool-delete"
                    @click="removePool(pool)"
                  >删除运算池</button>
                </div>
              </header>

              <div class="operation-pool-body">
                <div
                  v-for="entry in pool.entries"
                  :key="entry.node.id"
                  class="node-wrapper operation-pool-node"
                  :class="{
                    'node-highlighted': highlightedCfId && isNodeHighlightedForCf(entry.node.id),
                    'tutorial-copy-source': tutorialCopySourceId === entry.node.id,
                    'tutorial-copy-arrival': tutorialCopyArrivalId === entry.node.id,
                  }"
                  :ref="(el) => { if (el) nodeRefs[entry.index] = el }"
                  @dragover.prevent="onDragOver($event, entry.index, pool.id)"
                  @drop.stop.prevent="onDropOnNode($event, entry.index, pool.id)"
                  @dragleave="onDragLeave"
                >
	              <div class="intercom-card behavior-card" :class="{ collapsed: entry.node.collapsed, 'node-hydration-error': entry.node._hydrationError }">
	                <div class="card-header-inner behavior-card-header" :class="{ 'drag-over': dragOverIndex === entry.index }">
	                  <span
	                    class="drag-handle"
	                    draggable="true"
                      @dragstart="onDragStart($event, entry.index)"
                      @dragend="onDragEnd"
                      title="拖入其他运算池"
                    >⠿</span>
	                  <span class="card-title-flex behavior-card-title-group" @click="entry.node.collapsed = !entry.node.collapsed" style="cursor:pointer">
	                    <span class="collapse-arrow behavior-card-collapse">{{ entry.node.collapsed ? '▶' : '▼' }}</span>
	                    <span class="display-card-title workbench-node-title">{{ entry.node.packageType }}</span>
	                    <span class="display-mono badge-mono behavior-card-node-badge">{{ getNodeDisplayName(entry.node, entry.index) }}</span>
	                    <span v-if="entry.node.collapsed" class="behavior-card-summary">{{ getCollapsedNodeSummary(entry.node) }}</span>
	                    <span v-if="entry.node._hydrationError" class="display-mono badge-error">加载失败</span>
	                  </span>
	                  <div class="behavior-card-action-group">
                      <button v-if="pool.entries.length > 1" type="button" class="operation-node-detach" @click.stop="detachNodeFromPool(entry.index)">移出池</button>
	                    <el-tooltip content="复制节点" placement="top">
	                      <el-button class="behavior-card-icon-btn" :data-tutorial-target="entry.index === 0 ? 'duplicate-solution-node-0' : undefined" @click.stop="duplicateNode(entry.index)">
	                        <el-icon><CopyDocument /></el-icon>
	                      </el-button>
	                    </el-tooltip>
	                    <el-tooltip content="移除节点" placement="top">
	                      <el-button class="behavior-card-icon-btn danger" aria-label="移除节点" @click.stop="removeNode(entry.index)"><el-icon><Delete /></el-icon></el-button>
	                    </el-tooltip>
	                  </div>
                  </div>
                  <div v-if="entry.node._hydrationError" v-show="!entry.node.collapsed" class="hydration-error-body">
                    <p class="display-body-light">该组件元数据加载失败，请检查后端服务后重新添加。</p>
                  </div>
                  <DynamicForm v-else v-show="!entry.node.collapsed" :node="entry.node" :node-index="entry.index" @overflow-split="handleOverflowSplit" />
                </div>
                </div>
              </div>
              <div class="operation-pool-drop-hint">
                {{ pool.entries.length ? '继续拖入行为' : '从左侧拖入行为组件' }} · 池内自动{{ pool.type === 'u' ? '并集' : '交集' }}
              </div>
            </section>
          </div>
        </div>

        <div v-if="nodeList.length > 1" class="node-minimap">
          <div
            v-for="(node, index) in nodeList"
            :key="'mm-' + node.id"
            class="minimap-dot"
            :class="{ active: activeNodeIndex === index }"
            @click="scrollToNode(index)"
            :title="getNodeDisplayName(node, index)"
          >
            <span class="minimap-num">{{ index + 1 }}</span>
          </div>
        </div>
      </div>
      <div class="operation-pool-add-bar" aria-label="添加运算池">
        <span class="operation-pool-add-label">添加运算池</span>
        <button type="button" class="operation-pool-add-button is-intersection" @click="addEmptyOperationPool('n')">
          <span class="operation-pool-add-symbol" aria-hidden="true"></span> 添加交集运算池
        </button>
        <button type="button" class="operation-pool-add-button is-union" @click="addEmptyOperationPool('u')">
          <span class="operation-pool-add-symbol" aria-hidden="true"></span> 添加并集运算池
        </button>
      </div>
    </div>
  </Transition>
  </div>

  <div
    ref="workbenchRightPanelRef"
    class="right-panel"
    :style="{ width: `${workbenchRightWidth}px` }"
  >
    <div
      class="panel-resize-handle panel-resize-handle--left"
      :aria-valuenow="workbenchRightWidth"
      aria-valuemin="280"
      aria-valuemax="400"
      aria-label="调整圈包页面右侧栏宽度"
      aria-orientation="vertical"
      role="separator"
      tabindex="0"
      @pointerdown="startWorkbenchRightResize"
      @keydown="onWorkbenchRightResizeKeydown"
    ></div>

    <div class="panel-name-area">
      <div class="workbench-name-top">
        <div class="display-body-light name-label-inline">人群包名称</div>
      </div>

      <div style="display:flex;align-items:center;gap:6px">
        <el-input
          v-model="crowdNameInput"
          data-tutorial-target="audience-name"
          placeholder="手动输入人群包名称"
          size="default"
          clearable
          class="intercom-input"
          style="flex:1"
          :disabled="batchMode"
          @input="onNameManualEdit"
        />
      </div>

      <div v-if="batchMode && currentSolution" class="batch-crowd-name-lock">
        <span class="batch-crowd-name-lock-mark">✓</span>
        {{ isParameterBatch
          ? '名称来自 Excel 批量预览，逐包执行期间保持锁定'
          : '名称来自数据引擎取数模板，组合执行期间保持锁定' }}
      </div>
      <div v-else-if="workbenchMode === 'solution-use' && currentSolution" class="display-body-light workbench-name-hint">
        来源模板：{{ currentSolution.name || '未命名模板' }}，当前改动仅保留在圈包画布
      </div>
    </div>

    <div class="json-area">
      <div class="json-toolbar">
        <div class="json-tabs">
          <span class="json-tab" :class="{ active: jsonViewMode === 'summary' }" @click="jsonViewMode = 'summary'">
            摘要
          </span>
          <span class="json-tab" :class="{ active: jsonViewMode === 'json' }" @click="jsonViewMode = 'json'">
            JSON
          </span>
        </div>
        <div class="json-actions">
          <button
            class="databank-engine-button"
            type="button"
            aria-label="打开数据引擎"
            title="打开数据引擎"
            @click="goToDataBank"
          >
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <ellipse cx="12" cy="5.5" rx="6.5" ry="2.5" />
              <path d="M5.5 5.5v5c0 1.4 2.9 2.5 6.5 2.5s6.5-1.1 6.5-2.5v-5" />
              <path d="M5.5 10.5v5c0 1.4 2.9 2.5 6.5 2.5s6.5-1.1 6.5-2.5v-5" />
            </svg>
          </button>
          <el-button class="intercom-btn-primary" size="small" :disabled="databankAutomating" @click="copyJson">
            {{ batchMode ? '复制参数' : '复制' }}
          </el-button>
          <el-button
            class="intercom-btn-outlined databank-automation-button"
            :data-tutorial-target="getTutorialAutomationTarget()"
            size="small"
            :disabled="databankAutomating"
            @click="handleDataBankCommand('auto')"
          >
            {{ databankAutomating ? '执行中…' : '自动化圈人' }}
          </el-button>
        </div>
      </div>

      <p v-if="jsonBuildStatus === 'failed' && jsonBuildError" class="json-build-error" role="alert">
        {{ jsonBuildError }}
      </p>

      <div v-if="jsonViewMode === 'summary'" class="json-summary">
        <div v-if="nodeList.length === 0" class="empty-state-sm display-body-light">
          请先在画布中添加行为组件或加载方案
        </div>

        <section v-for="(pool, poolIndex) in filledOperationPools" :key="`summary-${pool.id}`" class="summary-pool">
          <header class="summary-pool-head">
            <span>{{ pool.type === 'u' ? '并集运算池' : '交集运算池' }} {{ poolIndex + 1 }}</span>
            <span v-if="poolIndex > 0" class="summary-op">
              与前池{{ pool.operator === 'u' ? '并集' : pool.operator === 'd' ? '差集' : '交集' }}
            </span>
          </header>
          <div v-for="entry in pool.entries" :key="'s-' + entry.node.id" class="summary-node">
            <div class="summary-node-head">
              <span class="summary-idx">{{ entry.index + 1 }}</span>
              <span class="display-body strong">{{ getNodeSummaryDisplayName(entry.node, entry.index) }}</span>
            </div>

            <div class="summary-rows">
              <div
                v-for="item in getNodeSummary(entry.node)"
                :key="item.key"
                class="summary-row"
                :class="{ 'summary-row-highlighted': highlightedCfId && isSummaryRowHighlighted(entry.node.id, item.key) }"
              >
                <span class="summary-label">{{ item.label }}</span>
                <span class="summary-val">{{ item.value }}</span>
              </div>

              <div v-if="getNodeSummary(entry.node).length === 0" class="display-body-light" style="padding:8px 0;opacity:0.5">
                当前节点尚未配置可用参数
              </div>
            </div>
          </div>
        </section>

        <div v-if="nodeList.length > 1" class="summary-compute">
          <span class="display-body-light">运算链：</span>
          <span class="display-mono">{{ generatedJson.compute }}</span>
        </div>
      </div>

      <pre v-else class="json-code display-mono" aria-label="JSON 预览">{{ getPreviewJsonText() }}</pre>
    </div>
  </div>

  <el-dialog
    v-model="parameterBatchDialogVisible"
    width="860px"
    class="intercom-dialog parameter-batch-dialog"
    :close-on-click-modal="false"
    destroy-on-close
  >
    <template #header>
      <div class="parameter-batch-dialog-head">
        <div class="parameter-batch-kicker">EXCEL PASTE · {{ batchMode ? 'COMBINATION' : 'SINGLE SOLUTION' }}</div>
        <h3>批量设置 · {{ parameterBatchSection?.name || '方案参数' }}</h3>
        <p>保留当前方案中的时间、品类等参数，只按 Excel 的行拆分人群包。</p>
      </div>
    </template>

    <div class="parameter-batch-guide">
      <div class="parameter-batch-guide-index">01</div>
      <div>
        <strong>从 Excel 直接复制并粘贴</strong>
        <span>每一行生成 {{ parameterBatchSourceCount }} 个人群包；同一行的多个单元格作为该参数的多个选项。</span>
      </div>
      <div class="parameter-batch-guide-example" aria-label="粘贴格式示例">
        <span>品牌1</span><span>品牌2</span>
        <span>品牌3</span><span></span>
        <span>品牌4</span><span>品牌5</span>
      </div>
    </div>

    <div class="parameter-batch-editor-head">
      <div>
        <strong>粘贴区域</strong>
        <small v-if="getParameterBatchLimit(parameterBatchSection)">
          每行最多 {{ getParameterBatchLimit(parameterBatchSection) }} 项
        </small>
      </div>
      <button
        v-if="parameterBatchText"
        type="button"
        class="parameter-batch-clear"
        @click="clearParameterBatchInput"
      >清空</button>
    </div>
    <el-input
      v-model="parameterBatchText"
      type="textarea"
      :rows="5"
      resize="none"
      class="parameter-batch-textarea"
      :data-tutorial-target="['parameter-paste-brands', 'combo-paste'].some(isGuidedTutorialStep) ? 'parameter-batch-input' : undefined"
      placeholder="点击这里，从 Excel 复制后直接粘贴（Ctrl + V）"
      @input="refreshParameterBatchRows"
    />

    <div class="parameter-batch-metrics" aria-live="polite">
      <div><strong>{{ parameterBatchRows.length }}</strong><span>识别行数</span></div>
      <div><strong>{{ parameterBatchTotalValues }}</strong><span>参数值</span></div>
      <div :class="{ 'has-error': parameterBatchInvalidCount > 0 }">
        <strong>{{ parameterBatchInvalidCount }}</strong><span>需处理</span>
      </div>
      <p v-if="parameterBatchTaskCount > 100">单次最多生成 100 个人群包，请分批粘贴。</p>
      <p v-else-if="parameterBatchRows.length">已自动检查空值、行内重复、重复行、选项匹配和每行数量限制。</p>
      <p v-else>粘贴后会先预览，不会立即执行建包。</p>
    </div>

    <p v-if="batchMode" class="parameter-batch-equation" aria-live="polite">
      {{ parameterBatchRows.length }} 行参数 × {{ parameterBatchSourceCount }} 个方案 = {{ parameterBatchTaskCount }} 个建包任务。
      同名字段先聚合，再按每个方案自己的绑定关系生效。
      <strong v-if="parameterBatchSection?.entryCount !== parameterBatchSourceCount">该字段未覆盖全部方案，请先补齐绑定，避免生成条件重复的人群包。</strong>
    </p>
    <div v-if="batchMode && parameterBatchRows.length" class="parameter-batch-groups">
      <details v-for="row in parameterBatchRows" :key="`group-${row.id}`" class="parameter-batch-group">
        <summary>
          <span>{{ row.values.join(' + ') }}</span>
          <small>{{ parameterBatchSourceCount }} 个包 · 点击核对</small>
        </summary>
        <div>
          <p v-for="(source, sourceIndex) in batchEntries" :key="source.id">
            <i>{{ sourceIndex + 1 }}</i>
            <span>{{ source.solutionName }}</span>
            <b>{{ parameterBatchSection?.name }}：{{ row.values.join('、') }}</b>
          </p>
        </div>
      </details>
    </div>
    <div v-if="parameterBatchRows.length" class="parameter-batch-preview">
      <div class="parameter-batch-preview-head">
        <span>行</span>
        <span>{{ parameterBatchSection?.name || '参数值' }}</span>
        <span>{{ batchMode ? '分组名称' : '人群包名称' }}</span>
        <span>校验</span>
        <span></span>
      </div>
      <div
        v-for="(row, index) in parameterBatchRows"
        :key="row.id"
        class="parameter-batch-preview-row"
        :class="{ 'has-error': !row.valid || getParameterBatchNameIssue(row) }"
      >
        <span class="parameter-batch-row-number">{{ String(index + 1).padStart(2, '0') }}</span>
        <div class="parameter-batch-value-list">
          <span
            v-for="value in row.values"
            :key="value"
            :class="{ invalid: row.invalidValues.includes(value) }"
          >{{ value }}</span>
        </div>
        <el-input v-model="row.crowdName" size="small" maxlength="80" />
        <span class="parameter-batch-row-status">
          <i></i>{{ getParameterBatchRowStatus(row) }}
        </span>
        <button
          type="button"
          class="parameter-batch-row-remove"
          :aria-label="`移除第 ${index + 1} 行`"
          @click="removeParameterBatchRow(row.id)"
        >×</button>
      </div>
    </div>

    <template #footer>
      <div class="batch-dialog-footer parameter-batch-footer">
        <span>确认后仍需在右侧选择“自动化圈人”，系统才会逐包执行。</span>
        <div>
          <el-button class="intercom-btn-outlined" @click="parameterBatchDialogVisible = false">取消</el-button>
          <el-button
            class="batch-dialog-primary"
            :data-tutorial-target="['parameter-create-tasks', 'combo-create'].some(isGuidedTutorialStep) ? 'parameter-create-tasks' : undefined"
            :loading="parameterBatchCreating"
            :disabled="!parameterBatchCanCreate"
            @click="createParameterBatchEntries"
          >生成 {{ parameterBatchTaskCount }} 个建包任务</el-button>
        </div>
      </div>
    </template>
  </el-dialog>

  <el-dialog
    v-model="batchPreviewVisible"
    width="620px"
    class="intercom-dialog batch-composer-dialog"
    :close-on-click-modal="false"
    destroy-on-close
  >
    <template #header>
      <div class="batch-dialog-title-row">
        <span class="batch-dialog-sigil">✦</span>
        <div>
          <div class="batch-dialog-kicker">COMPOSE FROM FOLDER</div>
          <h3>应用方案组合</h3>
        </div>
      </div>
    </template>

    <div data-tutorial-target="pull-batch-preview">
    <div class="batch-dialog-summary">
      <div class="batch-dialog-stat">
        <strong>{{ batchPreviewSolutions.length }}</strong>
        <span>个人群包</span>
      </div>
      <div class="batch-dialog-stat">
        <strong>{{ batchPreviewParameterNames.length }}</strong>
        <span>个去重参数</span>
      </div>
      <div class="batch-dialog-stat is-wide">
        <small>来源文件夹</small>
        <strong>{{ selectedPublishedFolderName || '当前文件夹' }}</strong>
      </div>
    </div>

    <div class="batch-dialog-section-head">
      <span>即将生成的人群包</span>
      <small>名称取自数据引擎取数模板配置</small>
    </div>
    <div class="batch-preview-list">
      <div
        v-for="(item, index) in batchPreviewSolutions"
        :key="item.id"
        class="batch-preview-row"
      >
        <span class="batch-preview-index">{{ String(index + 1).padStart(2, '0') }}</span>
        <div class="batch-preview-copy">
          <strong>{{ item.defaultCrowdName || '未配置人群包名称' }}</strong>
          <small>{{ item.name || '未命名方案' }}</small>
        </div>
        <span
          class="batch-preview-health"
          :class="{ warning: !String(item.defaultCrowdName || '').trim() }"
        >
          {{ String(item.defaultCrowdName || '').trim() ? '就绪' : '需配置名称' }}
        </span>
      </div>
    </div>

    <div class="batch-dialog-section-head">
      <span>按名称聚合的参数</span>
      <small>同名参数只展示一次</small>
    </div>
    <div v-if="batchPreviewParameterNames.length" class="batch-preview-parameter-cloud">
      <span v-for="name in batchPreviewParameterNames" :key="name">{{ name }}</span>
    </div>
    <div v-else class="batch-preview-empty">
      这些方案暂未配置可聚合的自定义参数，进入后仍可逐包查看详情。
    </div>

    <div v-if="batchPreviewCompatibility.length" class="batch-compatibility-list">
      <div
        v-for="field in batchPreviewCompatibility"
        :key="field.name"
        class="batch-compatibility-row"
        :class="{ 'is-error': !field.compatible }"
      >
        <strong>{{ field.name }}</strong>
        <span>{{ field.solutionCount }}/{{ field.totalSolutionCount }} 个方案</span>
        <span>{{ field.bindingCount }} 处绑定</span>
        <small>{{ field.compatible ? (field.type || '同类型') : `类型冲突：${field.type}` }}</small>
      </div>
    </div>
    </div>

    <template #footer>
      <div class="batch-dialog-footer">
        <el-button class="intercom-btn-outlined" @click="batchPreviewVisible = false">取消</el-button>
        <el-button
          class="batch-dialog-primary"
          :loading="batchLoading"
          :disabled="batchPreviewHasInvalidNames"
          data-tutorial-target="pull-enter-group-action"
          @click="enterBatchMode"
        >
          进入组合圈包模式
        </el-button>
      </div>
    </template>
  </el-dialog>

  <el-dialog
    v-model="batchCopyDialogVisible"
    width="540px"
    class="intercom-dialog batch-composer-dialog"
    destroy-on-close
  >
    <template #header>
      <div class="batch-dialog-title-row">
        <span class="batch-dialog-sigil is-copy">⌘</span>
        <div>
          <div class="batch-dialog-kicker">COPY PACKAGE PARAMETERS</div>
          <h3>选择要复制的人群包参数</h3>
        </div>
      </div>
    </template>

    <el-radio-group v-model="batchCopyIndex" class="batch-choice-list">
      <el-radio
        v-for="(entry, index) in batchEntries"
        :key="entry.id"
        :value="index"
        class="batch-choice-row"
      >
        <span class="batch-choice-sequence">{{ String(index + 1).padStart(2, '0') }}</span>
        <span class="batch-choice-copy">
          <strong>{{ entry.crowdName || '未命名人群包' }}</strong>
          <small>来源：{{ entry.solutionName || '未命名方案' }}</small>
        </span>
        <span v-if="index === activeBatchIndex" class="batch-choice-current">当前查看</span>
      </el-radio>
    </el-radio-group>

    <template #footer>
      <div class="batch-dialog-footer">
        <el-button class="intercom-btn-outlined" @click="batchCopyDialogVisible = false">取消</el-button>
        <el-button
          class="batch-dialog-primary"
          :loading="batchCopying"
          @click="confirmBatchCopy"
        >
          复制所选参数
        </el-button>
      </div>
    </template>
  </el-dialog>

  <el-dialog
    v-model="batchAutomationDialogVisible"
    :width="batchMode ? '720px' : '440px'"
    class="intercom-dialog batch-composer-dialog"
    :close-on-click-modal="false"
    destroy-on-close
  >
    <template #header>
      <div class="batch-dialog-title-row">
        <span class="batch-dialog-sigil is-run">▶</span>
        <div>
          <div class="batch-dialog-kicker">{{ batchMode ? 'READY QUEUE' : 'READY TO RUN' }}</div>
          <h3>{{ batchMode ? '确认要圈的人群包' : '自动化圈人' }}</h3>
        </div>
      </div>
    </template>

    <div v-if="batchMode" class="batch-automation-picker">
      <div class="batch-automation-picker-head">
        <el-checkbox
          :model-value="batchAutomationAllSelected"
          :indeterminate="batchAutomationPartiallySelected"
          data-tutorial-target="pull-batch-queue"
          @change="toggleAllBatchAutomationEntries"
        >
          <strong>{{ batchAutomationScope === 'failed' ? '全选待重试项' : '全选本次人群包' }}</strong>
        </el-checkbox>
        <span>已选 {{ batchAutomationSelectedCount }} / {{ visibleBatchAutomationEntries.length }}</span>
      </div>
      <p class="batch-automation-picker-hint">
        {{ batchAutomationScope === 'failed'
          ? `已保留 ${batchSucceededCount} 个成功结果，默认选中全部失败或中断项`
          : '已默认全部选中；取消勾选本次不需要执行的人群包' }}
      </p>

      <div class="batch-ai-naming-bar">
        <div>
          <span>AI NAMING</span>
          <strong>执行前整理人群包名称</strong>
          <small>读取最终参数一次生成整批建议，不添加 XT；生成后仍可逐个修改。</small>
        </div>
        <el-button
          class="batch-ai-naming-button"
          size="small"
          :loading="batchNamingLoading"
          :disabled="batchNamingLoading || batchAutomationSelectedCount === 0"
          @click="suggestBatchAudienceNames"
        >{{ batchNamingLoading ? '正在生成' : 'AI 生成名称' }}</el-button>
      </div>
      <p v-if="batchNamingMessage" class="batch-ai-naming-message" aria-live="polite">
        {{ batchNamingMessage }}
      </p>

      <div class="batch-run-queue" role="list" aria-label="待圈人群包">
        <div
          v-for="row in visibleBatchAutomationEntries"
          :key="row.entry.id || row.index"
          class="batch-run-queue-row is-selectable"
          :class="{
            'is-selected': isBatchAutomationEntrySelected(row.index),
            'has-name-error': Boolean(getBatchCrowdNameIssue(row.index)),
          }"
        >
          <el-checkbox
            :model-value="isBatchAutomationEntrySelected(row.index)"
            :aria-label="`选择第 ${row.index + 1} 个人群包`"
            @change="checked => toggleBatchAutomationEntry(row.index, checked)"
          />
          <span class="batch-run-queue-index">{{ String(row.index + 1).padStart(2, '0') }}</span>
          <div class="batch-run-name-editor">
            <el-input
              :model-value="row.entry.crowdName"
              size="small"
              maxlength="80"
              :disabled="databankAutomating"
              :aria-label="`第 ${row.index + 1} 个人群包名称`"
              @update:model-value="value => updateBatchEntryCrowdName(row.index, value)"
            />
            <small v-if="getBatchCrowdNameIssue(row.index)" class="batch-run-name-error">
              {{ getBatchCrowdNameIssue(row.index) }}
            </small>
          </div>
          <small class="batch-run-status" :title="row.entry.automationError || ''">
            {{ getAutomationStatusLabel(row.entry.automationStatus) }}
          </small>
        </div>
      </div>
    </div>

    <div v-else class="automation-single-summary">
      <span>当前人群包</span>
      <strong>{{ crowdNameInput || DEFAULT_CROWD_NAME }}</strong>
    </div>

    <template #footer>
      <div class="batch-dialog-footer automation-dialog-footer">
        <button
          type="button"
          class="automation-calculate-toggle"
          :class="{ 'is-active': databankAutoCalculate }"
          :aria-pressed="databankAutoCalculate"
          aria-label="是否需要自动计算人数"
          title="参数导入后自动点击计算人数"
          :disabled="databankAutomating"
          @click="databankAutoCalculate = !databankAutoCalculate"
        >
          <span aria-hidden="true"></span>
          算人数
        </button>
        <div class="automation-dialog-actions">
          <el-button class="intercom-btn-outlined" @click="batchAutomationDialogVisible = false">取消</el-button>
          <el-button
            class="batch-dialog-primary"
            data-tutorial-target="pull-confirm-batch-run"
            :disabled="databankAutomating || (batchMode && (batchAutomationSelectedCount === 0 || !batchAutomationNamesValid))"
            @click="confirmBatchAutomation"
          >
            {{ batchMode
              ? (batchAutomationScope === 'failed'
                ? `确定并重试 ${batchAutomationSelectedCount} 个包`
                : `确定并开始圈选 ${batchAutomationSelectedCount} 个包`)
              : '开始自动化圈人' }}
          </el-button>
        </div>
      </div>
    </template>
  </el-dialog>

</template>

<script setup>
import { computed, nextTick, onActivated, onBeforeUnmount, onMounted, reactive, ref, toRaw, watch, provide } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { CopyDocument, Delete, FolderAdd, RefreshLeft, RefreshRight, Search, Star, StarFilled } from '@element-plus/icons-vue'
import DynamicForm from './DynamicForm.vue'
import FolderTree from './FolderTree.vue'
import CustomFieldEditDialog from './CustomFieldEditDialog.vue'
import { useCdpShared } from '../composables/useCdpShared'
import { useSolutionRuntime } from '../composables/useSolutionRuntime'
import { useSolutionsApi } from '../composables/useSolutionsApi'
import { useFoldersApi } from '../composables/useFoldersApi'
import { usePackagesApi } from '../composables/usePackagesApi'
import { usePanelResize } from '../composables/usePanelResize'
import { useGuidedTutorial } from '../composables/useGuidedTutorial.js'
import { CONFIG_VERSION_EVENT } from '../utils/configVersion'
import { groupBehaviorComponents } from '../utils/behaviorComponentGroups.js'
import {
  loadFavoriteBehaviorComponents,
  saveFavoriteBehaviorComponents,
  toggleFavoriteBehaviorComponent,
} from '../utils/favoriteBehaviorComponents.js'
import {
  fieldToken,
  getNodeDisplayName,
  getNodeSummaryDisplayName,
  serializeNodesForSolution,
  serializeCustomFieldsForSolution,
  buildCustomFieldSections,
  syncCustomFieldValue,
  cloneNodeForDuplicate,
  insertNodeAtPosition,
  buildNodeSplits,
  buildMultiFieldNodeSplits,
  chunkBySecondaryCategory,
} from '../utils/solutionState.js'
import {
  buildOperationPoolExpression,
  buildOperationPools,
  createOperationPoolId,
  insertOwnPoolNodesAfterPool,
  moveNodeToOperationPool,
  moveNodeToOwnOperationPool,
  normalizeOperationPoolNodes,
  prepareNodeAsOwnOperationPool,
  removeNodeFromOperationPools,
  removeOperationPool,
  setOperationPoolRelation,
  setOperationPoolType,
} from '../utils/operationPools.js'
import { getCfTypeClass, formatCfDisplayValue, summarizeCfDisplayValue } from '../utils/display.js'
import { getFieldUiLabel, getNumericSummaryPrefix } from '../utils/fieldUiConfig.js'
import {
  analyzeBatchCustomFieldCompatibility,
  buildBatchCustomFieldSections as composeBatchCustomFieldSections,
  collectUniqueCustomFieldNames,
} from '../utils/solutionBatch.js'
import {
  buildParameterBatchRows,
  collectBatchAllowedValues,
  isBatchableParameterSection,
} from '../utils/parameterBatch.js'
import { fetchWithTimeout } from '../utils/apiClient.js'
import { expandCombinationParameterRows } from '../utils/combinationParameterBatch.js'
import { matchesTutorialBrandColumn, getParameterTutorialProgress } from '../utils/parameterBatchTutorial.js'
import {
  readSessionWorkspace,
  removeSessionWorkspace,
  writeSessionWorkspace,
} from '../utils/sessionWorkspace.js'
import { validateWorkbenchOutput } from '../utils/workbenchValidation.js'
import {
  PARAMETER_BATCH_TUTORIAL_ID,
  COMBINATION_BATCH_TUTORIAL_ID,
  COMBINATION_BATCH_BRANDS,
  PARAMETER_BATCH_TUTORIAL_VALUES,
  PULL_ANALYSIS_GROUP_TUTORIAL_ID,
  PULL_ANALYSIS_GROUP_TUTORIAL_VALUES,
  SOLUTION_REUSE_TUTORIAL_ID,
  SOLUTION_REUSE_TUTORIAL_VALUES,
} from '../utils/guidedTutorialConfig.js'

const props = defineProps({
  sessionOwnerId: { type: String, default: '' },
  aiCommand: { type: Object, default: null },
})

const workbenchLeftPanelRef = ref(null)
const workbenchRightPanelRef = ref(null)
const WORKBENCH_MIN_CENTER_WIDTH = 520

function workbenchContainerWidth() {
  return workbenchLeftPanelRef.value?.parentElement?.clientWidth || window.innerWidth
}

function renderedPanelWidth(panelRef, fallback) {
  return panelRef.value?.getBoundingClientRect().width || fallback
}

const {
  width: workbenchLeftWidth,
  startResize: startWorkbenchLeftResize,
  onResizeKeydown: onWorkbenchLeftResizeKeydown,
} = usePanelResize({
  panelId: 'workbench-left',
  ownerId: props.sessionOwnerId,
  defaultWidth: window.innerWidth <= 1120 ? 280 : 260,
  minWidth: 240,
  maxWidth: 360,
  edge: 'right',
  applyWidth: width => workbenchLeftPanelRef.value?.style.setProperty('width', `${width}px`),
  getDynamicMaxWidth: () =>
    workbenchContainerWidth()
    - renderedPanelWidth(workbenchRightPanelRef, 340)
    - WORKBENCH_MIN_CENTER_WIDTH,
})

const {
  width: workbenchRightWidth,
  startResize: startWorkbenchRightResize,
  onResizeKeydown: onWorkbenchRightResizeKeydown,
} = usePanelResize({
  panelId: 'workbench-right',
  ownerId: props.sessionOwnerId,
  defaultWidth: window.innerWidth <= 1120 ? 300 : 320,
  minWidth: 280,
  maxWidth: 400,
  edge: 'left',
  applyWidth: width => workbenchRightPanelRef.value?.style.setProperty('width', `${width}px`),
  getDynamicMaxWidth: () =>
    workbenchContainerWidth()
    - renderedPanelWidth(workbenchLeftPanelRef, 280)
    - WORKBENCH_MIN_CENTER_WIDTH,
})

const DEFAULT_CROWD_NAME = '未命名人群包'
const CATEGORY_PUBLIC_PACKAGE = '类目公域行为'
const CATEGORY_ITEM_PACKAGE = '类目商品行为'
const COMMODITY_PACKAGE = '商品行为'
const SINGLE_MEDIA_PACKAGE = '单媒体智投'
const BRAND_PROMOTION_PACKAGE = '品牌推广'
const PRESERVE_FROM_POOL_ID_PACKAGES = new Set([
  BRAND_PROMOTION_PACKAGE,
  '全媒体智投',
  SINGLE_MEDIA_PACKAGE,
])
const OFFICIAL_DEFAULT_CROWD_NAME = '未命名'
const DEFAULT_DRAFT_NAME = '圈包方案草稿'
const MAX_HISTORY = 20
const DATABANK_URL = 'https://databank.tmall.com/#/userDefinedAnalyses'
const EXTENSION_MESSAGE_TYPE = 'CDP_AUTOMATE_DATABANK'
const EXTENSION_BRIDGE_SOURCE = 'databank-extension-bridge'
const EXTENSION_RESPONSE_TIMEOUT_MS = 170000
const EXTENSION_PING_TIMEOUT_MS = 3500
const AUTO_CALCULATE_EXTENSION_VERSION = '2.2.2'
const WORKBENCH_SESSION_KEY = 'workbench.v1'
const WORKBENCH_SESSION_VERSION = 1

function isSolutionReuseTutorialActive() {
  return guidedTutorialState.active && guidedTutorialState.taskId === SOLUTION_REUSE_TUTORIAL_ID
}

function isPullAnalysisTutorialActive() {
  return guidedTutorialState.active
    && guidedTutorialState.taskId === PULL_ANALYSIS_GROUP_TUTORIAL_ID
}

function isParameterBatchTutorialActive() {
  return guidedTutorialState.active
    && guidedTutorialState.taskId === PARAMETER_BATCH_TUTORIAL_ID
}

function getTutorialPackageTarget(packageType) {
  if (
    (isSolutionReuseTutorialActive() || isParameterBatchTutorialActive())
    && packageType === CATEGORY_PUBLIC_PACKAGE
  ) return 'add-category-public'
  if (packageType === CATEGORY_ITEM_PACKAGE) return 'add-category-item'
  return undefined
}

function getTutorialPublishedSolutionTarget(item) {
  if (isParameterBatchTutorialActive()) {
    const expectedId = String(guidedTutorialState.context.solutionId || '')
    const matches = expectedId
      ? String(item?.id || '') === expectedId
      : String(item?.name || '').trim() === PARAMETER_BATCH_TUTORIAL_VALUES.solutionName
    return matches ? 'load-tutorial-solution' : undefined
  }
  if (isSolutionReuseTutorialActive()) {
    const expectedId = String(guidedTutorialState.context.solutionId || '')
    const expectedName = isParameterBatchTutorialActive()
      ? PARAMETER_BATCH_TUTORIAL_VALUES.solutionName
      : SOLUTION_REUSE_TUTORIAL_VALUES.solutionName
    if ((expectedId && String(item?.id || '') === expectedId)
      || String(item?.name || '').trim() === expectedName) {
      return 'load-tutorial-solution'
    }
  }
  if (!isPullAnalysisTutorialActive()) return undefined
  const itemId = String(item?.id || '')
  const itemName = String(item?.name || '').trim()
  if (isGuidedTutorialStep('pull-load-base-solution')) {
    const expectedId = String(guidedTutorialState.context.pullBaseSolutionId || '')
    if ((expectedId && itemId === expectedId) || itemName === PULL_ANALYSIS_GROUP_TUTORIAL_VALUES.baseSolutionName) {
      return 'pull-load-base-solution'
    }
  }
  if (isGuidedTutorialStep('pull-load-own-solution')) {
    const expectedId = String(guidedTutorialState.context.pullOwnSolutionId || '')
    if ((expectedId && itemId === expectedId) || itemName === PULL_ANALYSIS_GROUP_TUTORIAL_VALUES.ownPurchaseSolutionName) {
      return 'pull-load-own-solution'
    }
  }
  return undefined
}

function isTutorialPublishedSolution(item) {
  return getTutorialPublishedSolutionTarget(item) === 'load-tutorial-solution'
}

function getTutorialCustomFieldTarget(section) {
  if (
    guidedTutorialState.taskId === COMBINATION_BATCH_TUTORIAL_ID
    && isGuidedTutorialStep('combo-open-field')
    && batchMode.value
    && section?.name === '竞争品牌'
  ) {
    return 'combo-edit-competitor'
  }
  if (isParameterBatchTutorialActive() && !batchMode.value) {
    if (section?.name === PARAMETER_BATCH_TUTORIAL_VALUES.customFieldName) return 'parameter-edit-brand'
  }
  if (isSolutionReuseTutorialActive()) {
    if (section?.name === '分析类目') return 'edit-analysis-field'
    if (section?.name === '竞争品牌') return 'edit-competitor-field'
  }
  if (isPullAnalysisTutorialActive() && batchMode.value) {
    if (section?.name === '分析类目') return 'pull-edit-batch-analysis'
    if (section?.name === '竞争品牌') return 'pull-edit-batch-competitor'
  }
  return undefined
}

const {
  getArray,
  getListLimit,
  isVisible,
  collectNodeOverflows,
  countUniqueSecondaryCategories,
} = useCdpShared()
const {
  cloneValue,
  createRuntimeNode,
  hydrateNodes,
  normalizeWorkbenchFieldIds,
  preloadAllPackageMeta,
} = useSolutionRuntime()
const { listSolutions, getSolution, createDraft } = useSolutionsApi()
const { listFolders } = useFoldersApi()
const { listPackages } = usePackagesApi()
const {
  state: guidedTutorialState,
  currentStep: guidedTutorialStep,
  completeStep: completeGuidedTutorialStep,
  isStep: isGuidedTutorialStep,
  updateContext: updateGuidedTutorialContext,
} = useGuidedTutorial()

function createEmptyOperationPoolDraft(type = 'n', operator = null) {
  const normalizedType = type === 'u' ? 'u' : 'n'
  return {
    id: createOperationPoolId(`empty-${normalizedType}`),
    type: normalizedType,
    operator: ['n', 'u', 'd'].includes(operator) ? operator : null,
  }
}

const jsonViewMode = ref('summary')
const workbenchMode = ref('free-build')
const availablePackages = ref([])
const favoritePackages = ref(loadFavoriteBehaviorComponents(props.sessionOwnerId))
const publishedSolutions = ref([])
const publishedLibraryScope = ref('mine')
const loadingPublishedSolutions = ref(false)
const loadingSolutionId = ref(null)
const loadingPkg = ref(null)
const savingDraft = ref(false)
const nodeList = ref([])
const emptyOperationPools = ref([createEmptyOperationPoolDraft('n')])
const currentSolution = ref(null)
const loadedSolutionRecord = ref(null)
const loadedSolutionFieldIds = ref([])
const crowdNameInput = ref('')
const pkgSearch = ref('')
const solutionSearch = ref('')
const leftPanelMode = ref('packages')
const activeNodeIndex = ref(0)
const canvasScrollRef = ref(null)
const nodeRefs = ref({})
const dragOverIndex = ref(-1)
const dragOverPoolId = ref('')
const draggedPackageType = ref('')
const historyStack = ref([])
const historyPos = ref(-1)
const generatedJson = ref({ crowdName: DEFAULT_CROWD_NAME, list: [], compute: '' })
const jsonBuildStatus = ref('empty')
const jsonBuildError = ref('')
const snapshotPaused = ref(false)
const databankAutomating = ref(false)
const highlightedCfId = ref(null)
const collapsedCfId = ref(null)
const publishedFolderTree = ref([])
const selectedPublishedFolderId = ref(null)
const cfEditDialogVisible = ref(false)
const editingCfSection = ref(null)
const editingCfCurrentValue = ref(null)
const editingCfNodeList = ref([])
const cfCardsBarRef = ref(null)
const overflowBtnRef = ref(null)
const cfShowAll = ref(false)
const cfVisibleCount = ref(10)
const dragCfIndex = ref(-1)
const dragOverCfIndex = ref(-1)
const batchMode = ref(false)
const batchKind = ref('solutions')
const batchEntries = ref([])
const activeBatchIndex = ref(0)
const batchFolderName = ref('')
const batchSourceFolderId = ref(null)
const batchPreviewVisible = ref(false)
const batchPreviewSolutions = ref([])
const batchLoading = ref(false)
const batchCopyDialogVisible = ref(false)
const batchCopyIndex = ref(0)
const batchCopying = ref(false)
const batchAutomationDialogVisible = ref(false)
const batchAutomationScope = ref('current')
const batchAutomationSelectedIndexes = ref([])
const databankAutoCalculate = ref(false)
const batchNamingLoading = ref(false)
const batchNamingMessage = ref('')
const parameterBatchDialogVisible = ref(false)
const parameterBatchSection = ref(null)
const parameterBatchText = ref('')
const parameterBatchRows = ref([])
const parameterBatchFieldName = ref('')
const parameterBatchFieldId = ref('')
const parameterBatchCreating = ref(false)
const tutorialCopySourceId = ref('')
const tutorialCopyArrivalId = ref('')
const derivedSolutionMeta = reactive({
  sourceSolutionId: null,
  sourceSolutionVersion: null,
  sourceSolutionName: '',
  hasStructureChanges: false,
  hasParamChanges: false,
})
let cfResizeObserver = null

let dragSrcIndex = null
let saveTimer = null
let jsonTimer = null
let jsonBuildAbort = null
let sessionSaveTimer = null
let sessionRestorePending = true
let sessionPersistenceDisabled = false

provide('solutionCenterContext', {
  isTutorialSolutionCenter: false,
  highlightedCustomFieldId: null,
  customFields: [],
  creatingCustomField: false,
  creatingCustomFieldType: '',
  creatingCustomFieldStep: 2,
  creatingCustomFieldBindings: [],
  onFieldClickForBinding: () => {},
  isFieldHighlighted: (nodeId, fieldKey) => {
    if (!highlightedCfId.value) return false
    const cf = findActiveCustomFieldByUiId(highlightedCfId.value)
    if (!cf) return false
    return (cf.bindings || []).some(b => b.nodeId === nodeId && b.fieldKey === fieldKey)
  },
  isNodeHighlighted: () => false,
  isFieldSelectableForBinding: () => false,
})

const filteredPackages = computed(() => {
  if (!pkgSearch.value) return availablePackages.value
  const keyword = pkgSearch.value.toLowerCase()
  return availablePackages.value.filter((pkg) => String(pkg).toLowerCase().includes(keyword))
})

const favoritePackageSet = computed(() => new Set(favoritePackages.value))

const groupedPackages = computed(() => {
  const filteredSet = new Set(filteredPackages.value)
  const favorites = favoritePackages.value.filter(packageName => filteredSet.has(packageName))
  const regularPackages = filteredPackages.value.filter(
    packageName => !favoritePackageSet.value.has(packageName),
  )
  return [
    ...(favorites.length
      ? [{ name: '我的常用', packages: favorites, isFavorites: true }]
      : []),
    ...groupBehaviorComponents(regularPackages).map(group => ({
      ...group,
      isFavorites: false,
    })),
  ]
})

function isFavoritePackage(packageName) {
  return favoritePackageSet.value.has(packageName)
}

function toggleFavoritePackage(packageName) {
  favoritePackages.value = saveFavoriteBehaviorComponents(
    props.sessionOwnerId,
    toggleFavoriteBehaviorComponent(favoritePackages.value, packageName),
  )
}

watch(
  () => props.sessionOwnerId,
  ownerId => {
    favoritePackages.value = loadFavoriteBehaviorComponents(ownerId)
  },
)

const filteredPublishedSolutions = computed(() => {
  const keyword = solutionSearch.value.trim().toLowerCase()
  const baseList = getPublishedSolutionsInFolder()

  if (!keyword) return baseList
  return baseList.filter((item) => {
    const name = String(item?.name || '').toLowerCase()
    const source = String(item?.source || '').toLowerCase()
    return name.includes(keyword) || source.includes(keyword)
  })
})

const selectedPublishedFolderName = computed(() =>
  findFolderNameById(publishedFolderTree.value, selectedPublishedFolderId.value),
)

const publishedBatchCountByFolder = computed(() => {
  return publishedSolutions.value.reduce((counts, solution) => {
    const folderId = solution?.folderId
    if (!folderId) return counts
    counts[folderId] = (counts[folderId] || 0) + 1
    return counts
  }, {})
})

const batchPreviewParameterNames = computed(() => {
  return collectUniqueCustomFieldNames(batchPreviewSolutions.value)
})

const tutorialBatchFolderId = computed(() => {
  const recordedId = String(guidedTutorialState.context.pullFolderId || '')
  if (recordedId && folderTreeContains(publishedFolderTree.value, recordedId)) return recordedId
  if (guidedTutorialState.taskId !== COMBINATION_BATCH_TUTORIAL_ID) return recordedId
  return findFolderIdByName(
    publishedFolderTree.value,
    PULL_ANALYSIS_GROUP_TUTORIAL_VALUES.folderName,
  ) || ''
})

const batchPreviewCompatibility = computed(() => (
  analyzeBatchCustomFieldCompatibility(batchPreviewSolutions.value)
))

const batchPreviewHasInvalidNames = computed(() =>
  batchPreviewSolutions.value.some((solution) => !String(solution?.defaultCrowdName || '').trim())
    || batchPreviewCompatibility.value.some(field => !field.compatible),
)

function pullAggregationReady(rows = batchPreviewCompatibility.value) {
  const expected = new Map([
    ['分析类目', 8],
    ['本品牌', 4],
    ['竞争品牌', 4],
  ])
  return rows.length === 3 && [...expected].every(([name, bindingCount]) => {
    const row = rows.find(item => item.name === name)
    return row?.compatible
      && row.coverageComplete
      && row.solutionCount === 3
      && row.bindingCount === bindingCount
  })
}

const activeBatchEntry = computed(() => batchEntries.value[activeBatchIndex.value] || null)
const batchSucceededCount = computed(() => batchEntries.value.filter(entry => entry.automationStatus === 'success').length)
const batchFailedCount = computed(() => batchEntries.value.filter(entry => entry.automationStatus === 'failed').length)
const batchInterruptedCount = computed(() => batchEntries.value.filter(entry => entry.automationInterrupted === true).length)
const visibleBatchAutomationEntries = computed(() => (
  batchEntries.value
    .map((entry, index) => ({ entry, index }))
    .filter(({ entry }) => batchAutomationScope.value !== 'failed' || entry.automationStatus === 'failed')
))
const batchAutomationSelectedCount = computed(() => batchAutomationSelectedIndexes.value.length)
const batchAutomationAllSelected = computed(() => (
  visibleBatchAutomationEntries.value.length > 0
  && batchAutomationSelectedCount.value === visibleBatchAutomationEntries.value.length
))
const batchAutomationPartiallySelected = computed(() => (
  batchAutomationSelectedCount.value > 0 && !batchAutomationAllSelected.value
))
const batchAutomationNamesValid = computed(() => (
  batchAutomationSelectedIndexes.value.every(index => !getBatchCrowdNameIssue(index))
))
const isParameterBatch = computed(() => batchMode.value && batchKind.value === 'parameter')
const parameterBatchSourceCount = computed(() => batchMode.value ? batchEntries.value.length : 1)
const parameterBatchTaskCount = computed(() => parameterBatchRows.value.length * parameterBatchSourceCount.value)
const parameterBatchTotalValues = computed(() => (
  parameterBatchRows.value.reduce((total, row) => total + row.values.length, 0)
))
const parameterBatchInvalidCount = computed(() => (
  parameterBatchRows.value.filter((row) => !row.valid || getParameterBatchNameIssue(row)).length
))
const parameterBatchCanCreate = computed(() => (
  parameterBatchRows.value.length > 0
  && parameterBatchTaskCount.value <= 100
  && (!batchMode.value || parameterBatchSection.value?.entryCount === parameterBatchSourceCount.value)
  && parameterBatchInvalidCount.value === 0
  && (!isParameterBatchTutorialActive() || parameterTutorialBrandRowsReady())
  && (guidedTutorialState.taskId !== COMBINATION_BATCH_TUTORIAL_ID || comboRowsReady())
))

function comboRowsReady() {
  const rows = parameterBatchRows.value
  return rows.length === 3 && rows.every(row => row.valid && row.values.length === 1)
    && COMBINATION_BATCH_BRANDS.every(brand => rows.some(row => row.values[0] === brand))
}

watch(() => [guidedTutorialState.active, guidedTutorialState.stepIndex, batchMode.value, batchEntries.value.length], () => {
  if (['combo-open-group', 'combo-confirm-group'].some(isGuidedTutorialStep)) leftPanelMode.value = 'solutions'
})

function parameterTutorialBrandRowsReady() {
  return matchesTutorialBrandColumn(parameterBatchRows.value.map(row => row.values))
    && parameterBatchRows.value.every(row => row.valid && !getParameterBatchNameIssue(row))
}

function parameterTutorialEntriesReady() {
  return batchKind.value === 'parameter'
    && matchesTutorialBrandColumn(batchEntries.value.map(entry => entry.parameterBatchValues))
}

function getTutorialAutomationTarget() {
  if (isGuidedTutorialStep('parameter-start-automation')) return 'parameter-start-automation'
  if (isGuidedTutorialStep('combo-start-automation')) return 'combo-start-automation'
  if (['pull-run-baseline', 'pull-run-second'].some(isGuidedTutorialStep)) return 'pull-run-batch'
  return 'start-automation'
}

const allCollapsed = computed(() => nodeList.value.length > 0 && nodeList.value.every((node) => node.collapsed))
const filledOperationPools = computed(() => buildOperationPools(nodeList.value))
const operationPools = computed(() => {
  const filledPools = filledOperationPools.value
  return [
    ...filledPools,
    ...emptyOperationPools.value.map((pool, index) => ({
      id: pool.id,
      type: pool.type === 'u' ? 'u' : 'n',
      operator: filledPools.length + index === 0
        ? null
        : (['n', 'u', 'd'].includes(pool.operator) ? pool.operator : 'n'),
      entries: [],
    })),
  ]
})
const canUndo = computed(() => !batchMode.value && historyPos.value > 0)
const canRedo = computed(() => !batchMode.value && historyPos.value < historyStack.value.length - 1)
const deferredSolutionSplitSummary = computed(() => {
  if (workbenchMode.value !== 'solution-use' || batchMode.value) return null
  const overflows = nodeList.value.flatMap(node => collectNodeOverflows(node).map(item => ({
    ...item,
    nodeId: node.id,
  })))
  if (overflows.length === 0) return null
  return {
    nodeCount: new Set(overflows.map(item => item.nodeId)).size,
    fieldCount: new Set(overflows.map(item => item.fieldKey)).size,
  }
})
const customFieldSections = computed(() =>
  batchMode.value
    ? buildBatchCustomFieldSections()
    : buildCustomFieldSections(
      currentSolution.value?.customFields || [],
      nodeList.value,
    ),
)
const isDerivedSolutionSession = computed(() => Boolean(derivedSolutionMeta.sourceSolutionId))

const cfVisibleSections = computed(() => {
  const sections = customFieldSections.value
  return sections
})

const cfHiddenCount = computed(() => {
  return 0
})

function findFolderNameById(folders, folderId) {
  if (!folderId) return ''
  for (const folder of Array.isArray(folders) ? folders : []) {
    if (folder?.id === folderId) return String(folder?.name || '').trim()
    const nested = findFolderNameById(folder?.children || [], folderId)
    if (nested) return nested
  }
  return ''
}

function buildBatchCustomFieldSections() {
  return composeBatchCustomFieldSections(
    batchEntries.value,
    buildCustomFieldSections,
  )
}

function getBatchSectionName(uiId) {
  const section = customFieldSections.value.find((item) => item.customFieldId === uiId)
  return String(section?.name || '').trim()
}

function findActiveCustomFieldByUiId(uiId) {
  const fields = currentSolution.value?.customFields || []
  if (!batchMode.value) return fields.find((field) => field.id === uiId)
  const name = getBatchSectionName(uiId)
  return fields.find((field) => String(field?.name || '').trim() === name)
}

function getBindingNode(binding) {
  if (batchMode.value && binding?.entryId) {
    const entry = batchEntries.value.find((item) => item.id === binding.entryId)
    return entry?.nodes?.find((node) => node.id === binding.nodeId)
  }
  return nodeList.value.find((node) => node.id === binding?.nodeId)
}

function findFolderIdByName(folders, folderName) {
  const expectedName = String(folderName || '').trim()
  for (const folder of folders || []) {
    if (String(folder?.name || '').trim() === expectedName) return String(folder.id || '')
    const nested = findFolderIdByName(folder?.children || [], expectedName)
    if (nested) return nested
  }
  return ''
}

function isParameterBatchSection(section) {
  return isParameterBatch.value
    && String(section?.name || '').trim() === parameterBatchFieldName.value
}

function getSectionDisplayBindings(section) {
  const bindings = Array.isArray(section?.bindings) ? section.bindings : []
  if (!isParameterBatchSection(section)) return bindings
  const activeEntryId = activeBatchEntry.value?.id
  return bindings.filter((binding) => binding.entryId === activeEntryId)
}

function canBatchParameterSection(section) {
  return workbenchMode.value === 'solution-use'
    && Boolean(currentSolution.value)
    && !isParameterBatch.value
    && Array.isArray(section?.bindings)
    && section.bindings.length > 0
    && isBatchableParameterSection(section)
}

function getParameterBatchLimit(section) {
  const limits = (Array.isArray(section?.bindings) ? section.bindings : [])
    .map((binding) => {
      const node = getBindingNode(binding)
      const field = (Array.isArray(node?.schema) ? node.schema : [])
        .find((item) => item.key === binding.fieldKey)
      return field && node ? Number(getListLimit(field, node)) : 0
    })
    .filter((limit) => Number.isFinite(limit) && limit > 0)
  return limits.length ? Math.min(...limits) : 0
}

function refreshParameterBatchRows() {
  const section = parameterBatchSection.value
  if (!section) {
    parameterBatchRows.value = []
    return
  }
  const existingNames = new Map(
    parameterBatchRows.value.map((row) => [JSON.stringify(row.values), row.crowdName]),
  )
  parameterBatchRows.value = buildParameterBatchRows(parameterBatchText.value, {
    allowedValues: collectBatchAllowedValues(section),
    maxItems: getParameterBatchLimit(section),
    baseName: batchMode.value
      ? '组合人群'
      : String(crowdNameInput.value || currentSolution.value?.defaultCrowdName || '人群包').trim(),
  }).map((row) => ({
    ...row,
    crowdName: existingNames.get(JSON.stringify(row.values)) || row.crowdName,
  }))
  if (isParameterBatchTutorialActive()) {
    updateGuidedTutorialContext({
      parameterBatchRows: parameterBatchRows.value.map(row => [...row.values]),
      parameterBatchError: parameterTutorialBrandRowsReady()
        ? ''
        : '请完整粘贴教程提供的 4 行品牌，并保持一行一个品牌。',
    })
    if (isGuidedTutorialStep('parameter-paste-brands') && parameterTutorialBrandRowsReady()) {
      completeGuidedTutorialStep('parameter-paste-brands')
    }
  }
}

watch(() => parameterBatchRows.value, () => {
  if (isGuidedTutorialStep('combo-paste') && comboRowsReady()) completeGuidedTutorialStep('combo-paste')
})

function openParameterBatch(section) {
  if (!canBatchParameterSection(section)) return
  const preserveTutorialInput = (
    isParameterBatchTutorialActive()
      || guidedTutorialState.taskId === COMBINATION_BATCH_TUTORIAL_ID
  )
    && section.customFieldId === parameterBatchSection.value?.customFieldId
  parameterBatchSection.value = section
  if (!preserveTutorialInput) {
    parameterBatchText.value = ''
    parameterBatchRows.value = []
  }
  parameterBatchDialogVisible.value = true
}

async function openParameterBatchFromEditor() {
  const section = customFieldSections.value.find(item => item.customFieldId === editingCfSection.value?.customFieldId) || editingCfSection.value
  if (!canBatchParameterSection(section)) return
  cfEditDialogVisible.value = false
  await nextTick()
  openParameterBatch(section)
  if (isGuidedTutorialStep('combo-open-excel') && section.name === '竞争品牌') completeGuidedTutorialStep('combo-open-excel')
  if (isGuidedTutorialStep('parameter-open-excel')) {
    completeGuidedTutorialStep('parameter-open-excel')
    refreshParameterBatchRows()
  }
}

function clearParameterBatchInput() {
  parameterBatchText.value = ''
  parameterBatchRows.value = []
  if (isParameterBatchTutorialActive()) {
    updateGuidedTutorialContext({
      parameterBatchRows: [],
      parameterBatchError: '请完整粘贴教程提供的 4 行品牌，并保持一行一个品牌。',
    })
  }
}

function removeParameterBatchRow(rowId) {
  const target = parameterBatchRows.value.find((row) => row.id === rowId)
  if (!target) return
  const remainingRows = parameterBatchRows.value.filter((row) => row.id !== rowId)
  parameterBatchText.value = remainingRows
    .map((row) => row.values.join('\t'))
    .join('\n')
  refreshParameterBatchRows()
}

function getParameterBatchNameIssue(row) {
  const name = String(row?.crowdName || '').trim()
  if (!name) return '请填写人群包名称'
  const duplicateCount = parameterBatchRows.value.filter(
    (item) => String(item?.crowdName || '').trim() === name,
  ).length
  return duplicateCount > 1 ? '人群包名称重复' : ''
}

function getParameterBatchRowStatus(row) {
  const nameIssue = getParameterBatchNameIssue(row)
  if (nameIssue) return nameIssue
  return row.valid ? '可生成' : row.issues.join('；')
}

function resetDerivedSolutionMeta() {
  derivedSolutionMeta.sourceSolutionId = null
  derivedSolutionMeta.sourceSolutionVersion = null
  derivedSolutionMeta.sourceSolutionName = ''
  derivedSolutionMeta.hasStructureChanges = false
  derivedSolutionMeta.hasParamChanges = false
}

function markDerivedStructureChange() {
  if (!isDerivedSolutionSession.value) return
  derivedSolutionMeta.hasStructureChanges = true
  derivedSolutionMeta.hasParamChanges = true
}

function markDerivedParamChange() {
  if (!isDerivedSolutionSession.value) return
  derivedSolutionMeta.hasParamChanges = true
}

function setCurrentCustomFields(customFields) {
  if (!currentSolution.value) return
  currentSolution.value = {
    ...currentSolution.value,
    customFields,
  }
  markDerivedParamChange()
}

function removeBindingsForNode(nodeId) {
  if (!currentSolution.value?.customFields?.length) return
  const nextFields = currentSolution.value.customFields
    .map((cf) => ({
      ...cf,
      bindings: (cf.bindings || []).filter((binding) => binding.nodeId !== nodeId),
    }))
    .filter((cf) => (cf.bindings || []).length > 0)
  setCurrentCustomFields(nextFields)
}

function buildDraftPayload(nameOverride) {
  const trimmedCrowdName = String(crowdNameInput.value || '').trim()
  const trimmedName = String(nameOverride || '').trim()
  const baseName = trimmedName || trimmedCrowdName || DEFAULT_DRAFT_NAME

  return {
    name: baseName,
    defaultCrowdName: trimmedCrowdName || baseName,
    source: isDerivedSolutionSession.value ? 'workbench-derived' : 'workbench',
    nodes: serializeNodesForSolution(nodeList.value),
    workbenchFieldIds: buildDraftWorkbenchFieldIds(nodeList.value),
    customFields: serializeCustomFieldsForSolution(currentSolution.value?.customFields || []),
    folderId: currentSolution.value?.folderId || null,
    derivedFromSolutionId: derivedSolutionMeta.sourceSolutionId,
    derivedFromSolutionVersion: derivedSolutionMeta.sourceSolutionVersion,
  }
}

function updateCfOverflow() {
  cfVisibleCount.value = customFieldSections.value.length
}

function onCfDragStart(event, index) {
  if (batchMode.value) return
  dragCfIndex.value = index
  event.dataTransfer.effectAllowed = 'move'
  event.dataTransfer.setData('text/plain', String(index))
}

function onCfDragOver(event, index) {
  if (dragCfIndex.value < 0) return
  dragOverCfIndex.value = index
}

function onCfDragLeave() {
  dragOverCfIndex.value = -1
}

function onCfDrop(_event, targetIndex) {
  if (batchMode.value) return
  const srcIndex = dragCfIndex.value
  dragOverCfIndex.value = -1
  dragCfIndex.value = -1
  if (srcIndex < 0 || srcIndex === targetIndex) return

  // Reorder within customFieldSections by reordering the solution's customFields
  const cfs = [...(currentSolution.value?.customFields || [])]
  const sections = customFieldSections.value
  const srcId = sections[srcIndex]?.customFieldId
  const targetId = sections[targetIndex]?.customFieldId
  const srcIdx = cfs.findIndex(c => c.id === srcId)
  const targetIdx = cfs.findIndex(c => c.id === targetId)
  if (srcIdx < 0 || targetIdx < 0) return

  const [moved] = cfs.splice(srcIdx, 1)
  cfs.splice(targetIdx, 0, moved)
  setCurrentCustomFields(cfs)
}

function onCfDragEnd() {
  dragCfIndex.value = -1
  dragOverCfIndex.value = -1
}

function onHighlightCf(cfId) {
  if (highlightedCfId.value === cfId) {
    // Click same card again -> unhighlight + expand
    highlightedCfId.value = null
    if (collapsedCfId.value) toggleCollapseMode()
  } else {
    // Click different card -> switch highlight, keep collapse state
    highlightedCfId.value = cfId
    if (collapsedCfId.value) {
      // Already collapsed on another field, switch collapse to this one
      collapsedCfId.value = cfId
    }
  }
}

function toggleCollapseMode() {
  if (collapsedCfId.value) {
    // Currently collapsed -> expand
    collapsedCfId.value = null
    nodeList.value.forEach(n => { n.collapsed = false })
  } else {
    // Currently expanded -> collapse on highlighted field
    if (!highlightedCfId.value) return
    collapsedCfId.value = highlightedCfId.value
    nodeList.value.forEach(n => { n.collapsed = true })
  }
}

function getNodeFocusBindings(nodeId) {
  if (!collapsedCfId.value) return []
  const cf = findActiveCustomFieldByUiId(collapsedCfId.value)
  if (!cf) return []
  return (cf.bindings || []).filter(b => b.nodeId === nodeId)
}

function getFocusFieldDisplay(fieldKey, node) {
  const schema = Array.isArray(node.schema) ? node.schema : []
  const field = schema.find(f => f.key === fieldKey)
  const label = field?.Label || field?.label || fieldKey
  const value = node.formData?.[fieldKey]
  const mode = node.modeData?.[fieldKey]
  return { label, value: formatCfDisplayValue(value, mode, field?.Widget_Type) }
}

function getCfValueSummary(section) {
  const bindings = getSectionDisplayBindings(section)
  if (bindings.length === 0) return ''
  const values = bindings
    .map((binding) => {
      const node = getBindingNode(binding)
      const value = node?.formData?.[binding.fieldKey]
      const mode = node?.modeData?.[binding.fieldKey]
      return {
        key: JSON.stringify({ value, mode }),
        value,
        mode,
      }
    })
    .filter((item) => item.value !== undefined)
  if (values.length > 1 && new Set(values.map((item) => item.key)).size > 1) {
    return '已分化'
  }
  const { value, mode } = values[0] || {}
  if (Array.isArray(value) && value.length > 0) return value.slice(0, 3).join('、') + (value.length > 3 ? '…' : '')
  const formatted = formatCfDisplayValue(value, mode, section.type)
  if (typeof value === 'object' && !Array.isArray(value)) return formatted
  if (typeof value === 'string' && formatted.length > 20) return formatted.slice(0, 20) + '…'
  return formatted
}

function getCfValueSummaryMeta(section) {
  const bindings = getSectionDisplayBindings(section)
  if (bindings.length === 0) {
    return {
      primaryText: '',
      overflowCount: 0,
      overflowText: '',
    }
  }

  const values = bindings
    .map((binding) => {
      const node = getBindingNode(binding)
      const value = node?.formData?.[binding.fieldKey]
      const mode = node?.modeData?.[binding.fieldKey]
      return {
        key: JSON.stringify({ value, mode }),
        value,
        mode,
      }
    })
    .filter((item) => item.value !== undefined)

  if (values.length > 1 && new Set(values.map((item) => item.key)).size > 1) {
    return {
      primaryText: '已分歧',
      overflowCount: 0,
      overflowText: '',
    }
  }

  const { value, mode } = values[0] || {}
  const summary = summarizeCfDisplayValue(value, mode, section.type)
  if (summary.overflowCount > 0) return summary

  return {
    primaryText: getCfValueSummary(section),
    overflowCount: 0,
    overflowText: '',
  }
}

function openCfEditDialog(section) {
  if (isParameterBatchSection(section)) {
    ElMessage.info(`“${parameterBatchFieldName.value}”已按 Excel 行拆分，如需调整请重新创建批量任务`)
    return
  }
  const activeEntryId = activeBatchEntry.value?.id
  const sectionBindings = section.bindings || []
  const activeBindings = batchMode.value
    ? sectionBindings.filter((binding) => binding.entryId === activeEntryId)
    : sectionBindings
  const dialogEntryId = activeBindings[0]?.entryId || sectionBindings[0]?.entryId
  const dialogBindings = batchMode.value
    ? sectionBindings.filter((binding) => binding.entryId === dialogEntryId)
    : activeBindings
  editingCfSection.value = batchMode.value
    ? { ...section, bindings: dialogBindings }
    : section
  editingCfNodeList.value = batchMode.value
    ? (batchEntries.value.find((entry) => entry.id === dialogEntryId)?.nodes || [])
    : nodeList.value
  // Read current value from the first bound node
  const firstBinding = dialogBindings[0]
  editingCfCurrentValue.value = null
  if (firstBinding) {
    const node = getBindingNode(firstBinding)
    const fieldValue = node?.formData?.[firstBinding.fieldKey]
    const modeValue = node?.modeData?.[firstBinding.fieldKey]
    if (section.type?.includes('日期') || section.type?.includes('数值')) {
      editingCfCurrentValue.value = { ...(fieldValue || {}), mode: modeValue }
    } else {
      editingCfCurrentValue.value = fieldValue
    }
  }
  cfEditDialogVisible.value = true
  if (
    section?.name === PARAMETER_BATCH_TUTORIAL_VALUES.customFieldName
    && isGuidedTutorialStep('parameter-open-brand-editor')
  ) {
    completeGuidedTutorialStep('parameter-open-brand-editor')
  }
  if (section?.name === '分析类目' && isGuidedTutorialStep('open-analysis-field')) {
    completeGuidedTutorialStep('open-analysis-field')
  }
  if (section?.name === '竞争品牌' && isGuidedTutorialStep('open-competitor-field')) {
    completeGuidedTutorialStep('open-competitor-field')
  }
  if (section?.name === '分析类目' && isGuidedTutorialStep('pull-open-batch-analysis')) {
    completeGuidedTutorialStep('pull-open-batch-analysis')
  }
  if (section?.name === '竞争品牌' && isGuidedTutorialStep('pull-open-batch-competitor')) {
    completeGuidedTutorialStep('pull-open-batch-competitor')
  }
  if (section?.name === '竞争品牌' && isGuidedTutorialStep('combo-open-field')) {
    completeGuidedTutorialStep('combo-open-field')
  }
}

function pullBatchValueApplied(fieldName, expectedValue) {
  if (batchEntries.value.length !== 3) return false
  return batchEntries.value.every((entry) => {
    const fields = Array.isArray(entry?.record?.customFields) ? entry.record.customFields : []
    const field = fields.find(item => String(item?.name || '').trim() === fieldName)
    const bindings = Array.isArray(field?.bindings) ? field.bindings : []
    if (!field || bindings.length === 0) return false
    return bindings.every((binding) => {
      const node = entry.nodes.find(item => item.id === binding.nodeId)
      return getArray(node?.formData?.[binding.fieldKey]).map(String).includes(expectedValue)
    })
  })
}

async function applyPullTutorialFinalCrowdNames() {
  const names = PULL_ANALYSIS_GROUP_TUTORIAL_VALUES.finalCrowdNames
  if (!Array.isArray(names) || names.length !== batchEntries.value.length) return

  const nameBySolution = new Map([
    [PULL_ANALYSIS_GROUP_TUTORIAL_VALUES.baseSolutionName, names[0]],
    [PULL_ANALYSIS_GROUP_TUTORIAL_VALUES.ownPurchaseSolutionName, names[1]],
    [PULL_ANALYSIS_GROUP_TUTORIAL_VALUES.competitorPurchaseSolutionName, names[2]],
  ])

  batchEntries.value.forEach((entry, index) => {
    const crowdName = nameBySolution.get(String(entry.solutionName || '').trim()) || names[index]
    entry.crowdName = crowdName
    entry.generatedJson = null
    entry.record = {
      ...entry.record,
      defaultCrowdName: crowdName,
    }
  })
  const activeEntry = activeBatchEntry.value
  if (activeEntry) crowdNameInput.value = activeEntry.crowdName
  batchEntries.value = [...batchEntries.value]
  updateGuidedTutorialContext({
    pullBatchPackageNames: batchEntries.value.map(entry => entry.crowdName),
  })
  await nextTick()
  await buildFinalJson()
}

function tutorialCustomFieldApplied(fieldName) {
  const [ownNode, competitorNode] = nodeList.value
  const firstValue = (node, key) => getArray(node?.formData?.[key])[0] || ''
  if (fieldName === '分析类目') {
    return firstValue(ownNode, 'leafCates') === SOLUTION_REUSE_TUTORIAL_VALUES.secondCategory
      && firstValue(competitorNode, 'leafCates') === SOLUTION_REUSE_TUTORIAL_VALUES.secondCategory
  }
  if (fieldName === '竞争品牌') {
    return firstValue(ownNode, 'stdBrand') === SOLUTION_REUSE_TUTORIAL_VALUES.ownBrand
      && firstValue(competitorNode, 'stdBrand') === SOLUTION_REUSE_TUTORIAL_VALUES.secondCompetitorBrand
      && nodeList.value.length === 2
  }
  return false
}

function getCustomFieldOverflowBindings(customField, value) {
  if (!customField) return []

  // Validate the complete post-save state on a clone. This catches an already
  // overflowing second field, while also allowing a user to reduce the value
  // that was previously over the limit.
  const previewNodes = cloneValue(nodeList.value)
  syncCustomFieldValue(
    previewNodes,
    customField.id,
    [customField],
    cloneValue(value),
  )
  const seen = new Set()
  const overflows = []

  previewNodes.forEach((node) => {
    collectNodeOverflows(node).forEach((overflow) => {
      const identity = `${node.id}:${overflow.fieldKey}`
      if (seen.has(identity)) return
      seen.add(identity)
      overflows.push({
        ...overflow,
        nodeId: node.id,
        packageType: node.packageType,
        effectiveCount: overflow.fieldKey === 'leafCates'
          ? countUniqueSecondaryCategories(overflow.allValues)
          : overflow.allValues.length,
      })
    })
  })

  return overflows
}

function applyCustomFieldValue(customFieldId, value) {
  const cfs = currentSolution.value?.customFields || []
  const cf = cfs.find(item => item.id === customFieldId)
  if (!cf) return null

  syncCustomFieldValue(nodeList.value, customFieldId, cfs, value)
  setCurrentCustomFields(cfs.map((item) => (
    item.id === customFieldId
      ? { ...item, defaultValue: cloneValue(value) }
      : item
  )))
  return cf
}

async function onCfDialogSave({ customFieldId, value }) {
  if (batchMode.value) {
    const fieldName = String(editingCfSection.value?.name || '').trim()
    applyBatchCustomFieldValue(fieldName, value)
    if (
      fieldName === '分析类目'
      && isGuidedTutorialStep('pull-save-batch-category')
      && pullBatchValueApplied('分析类目', PULL_ANALYSIS_GROUP_TUTORIAL_VALUES.batchCategory)
    ) {
      updateGuidedTutorialContext({ pullBatchCategoryApplied: true })
      completeGuidedTutorialStep('pull-save-batch-category')
    }
    if (
      fieldName === '竞争品牌'
      && isGuidedTutorialStep('pull-save-batch-competitor')
      && pullBatchValueApplied('竞争品牌', PULL_ANALYSIS_GROUP_TUTORIAL_VALUES.batchCompetitorBrand)
    ) {
      updateGuidedTutorialContext({ pullBatchCompetitorApplied: true })
      await applyPullTutorialFinalCrowdNames()
      completeGuidedTutorialStep('pull-save-batch-competitor')
    }
    return
  }

  const cfs = currentSolution.value?.customFields || []
  const cf = cfs.find(c => c.id === customFieldId)
  if (!cf) return

  const overflows = workbenchMode.value === 'solution-use'
    ? getCustomFieldOverflowBindings(cf, value)
    : []
  const overflowFieldKeys = [...new Set(overflows.map(item => item.fieldKey))]

  if (overflowFieldKeys.length > 1) {
    const fieldList = overflowFieldKeys.map((fieldKey) => {
      const overflow = overflows.find(item => item.fieldKey === fieldKey)
      return `「${overflow.fieldLabel}」${overflow.effectiveCount}/${overflow.limit}`
    }).join('、')
    ElMessage.warning(`当前有多个字段超限：${fieldList}。一次只能处理一个超限字段，请先删除多余超限值`)
    return
  }

  if (overflows.length > 0) {
    const overflow = overflows[0]
    const affectedNodes = new Set(overflows.map(item => item.nodeId)).size
    applyCustomFieldValue(customFieldId, value)
    ElMessage.info(`「${overflow.fieldLabel}」的完整 ${overflow.effectiveCount} 项已同步到 ${affectedNodes} 个组件。请完成其他参数后，再点击顶部“最后确认拆分”`)
    return
  }

  applyCustomFieldValue(customFieldId, value)
  const uniqueNodes = new Set((cf.bindings || []).map(b => b.nodeId))
  if (uniqueNodes.size > 0) {
    ElMessage.success(`已同步到 ${uniqueNodes.size} 个组件`)
  }
  if (
    cf.name === '分析类目'
    && isGuidedTutorialStep('save-analysis-category')
    && tutorialCustomFieldApplied('分析类目')
  ) {
    completeGuidedTutorialStep('save-analysis-category')
  }
  if (
    cf.name === '竞争品牌'
    && isGuidedTutorialStep('save-competitor-brand')
    && tutorialCustomFieldApplied('竞争品牌')
  ) {
    completeGuidedTutorialStep('save-competitor-brand')
  }
}

function applyBatchCustomFieldValue(rawName, value) {
  const name = String(rawName || '').trim()
  if (!name) return
  if (isParameterBatch.value && name === parameterBatchFieldName.value) {
    ElMessage.warning(`“${name}”是本次按行拆分的参数，不能同步覆盖`)
    return
  }

  let affectedPackages = 0
  batchEntries.value.forEach((entry) => {
    const fields = Array.isArray(entry?.record?.customFields)
      ? entry.record.customFields
      : []
    const matches = fields.filter((field) => String(field?.name || '').trim() === name)
    if (matches.length === 0) return

    matches.forEach((field) => {
      syncCustomFieldValue(entry.nodes, field.id, fields, cloneValue(value))
    })
    entry.record = {
      ...entry.record,
      customFields: fields.map((field) => (
        String(field?.name || '').trim() === name
          ? { ...field, defaultValue: cloneValue(value) }
          : field
      )),
    }
    entry.generatedJson = null
    affectedPackages += 1
  })

  const activeEntry = activeBatchEntry.value
  if (activeEntry) {
    nodeList.value = activeEntry.nodes
    currentSolution.value = activeEntry.record
  }
  batchEntries.value = [...batchEntries.value]
  markDerivedParamChange()
  ElMessage.success(`“${name}”已同步到 ${affectedPackages} 个人群包`)
}

function isNodeHighlightedForCf(nodeId) {
  if (!highlightedCfId.value) return false
  const cf = findActiveCustomFieldByUiId(highlightedCfId.value)
  if (!cf) return false
  return (cf.bindings || []).some(b => b.nodeId === nodeId)
}

function isSummaryRowHighlighted(nodeId, fieldKey) {
  if (!highlightedCfId.value) return false
  const cf = batchMode.value
    ? findActiveCustomFieldByUiId(highlightedCfId.value)
    : (currentSolution.value?.customFields || []).find(c => c.id === highlightedCfId.value)
  if (!cf) return false
  return (cf.bindings || []).some(b => b.nodeId === nodeId && b.fieldKey === fieldKey)
}

function toggleLeftPanelMode() {
  leftPanelMode.value = leftPanelMode.value === 'packages' ? 'solutions' : 'packages'
  if (leftPanelMode.value === 'solutions' && isGuidedTutorialStep('open-solution-picker')) {
    completeGuidedTutorialStep('open-solution-picker')
  }
  if (leftPanelMode.value === 'solutions' && isGuidedTutorialStep('pull-open-picker-base')) {
    completeGuidedTutorialStep('pull-open-picker-base')
  }
  if (leftPanelMode.value === 'solutions' && isGuidedTutorialStep('pull-open-picker-group')) {
    completeGuidedTutorialStep('pull-open-picker-group')
  }
}

function onNameManualEdit(value) {
  markDerivedParamChange()
  if (guidedTutorialState.active) {
    updateGuidedTutorialContext({ audienceName: String(value || '') })
  }
}

function getDroppedPackageType(event) {
  const transferred = String(
    event?.dataTransfer?.getData('application/x-cdp-behavior-package') || '',
  ).trim()
  if (transferred) return transferred

  const plainText = String(event?.dataTransfer?.getData('text/plain') || '')
  if (plainText.startsWith('behavior-package:')) {
    return plainText.slice('behavior-package:'.length).trim()
  }
  return String(draggedPackageType.value || '').trim()
}

function onPackageDragStart(event, packageType) {
  if (batchMode.value || loadingPkg.value) {
    event.preventDefault()
    return
  }
  dragSrcIndex = null
  draggedPackageType.value = String(packageType || '')
  event.dataTransfer.effectAllowed = 'copy'
  event.dataTransfer.setData('application/x-cdp-behavior-package', draggedPackageType.value)
  event.dataTransfer.setData('text/plain', `behavior-package:${draggedPackageType.value}`)
}

function onPackageDragEnd() {
  draggedPackageType.value = ''
  onDragLeave()
}

function onDragStart(event, index) {
  draggedPackageType.value = ''
  dragSrcIndex = index
  event.dataTransfer.effectAllowed = 'move'
  event.dataTransfer.setData('text/plain', String(index))
}

function onDragOver(event, index, poolId = '') {
  if (batchMode.value) return
  dragOverIndex.value = index
  dragOverPoolId.value = String(poolId || '')
  if (event?.dataTransfer) {
    event.dataTransfer.dropEffect = draggedPackageType.value ? 'copy' : 'move'
  }
}

function onDragLeave() {
  dragOverIndex.value = -1
  dragOverPoolId.value = ''
}

function onPoolDragOver(event, poolId) {
  if (batchMode.value) return
  dragOverPoolId.value = String(poolId || '')
  if (event?.dataTransfer) {
    event.dataTransfer.dropEffect = draggedPackageType.value ? 'copy' : 'move'
  }
}

function findEmptyOperationPool(poolId) {
  return emptyOperationPools.value.find((pool) => pool.id === String(poolId)) || null
}

function removeEmptyOperationPool(poolId) {
  const index = emptyOperationPools.value.findIndex((pool) => pool.id === String(poolId))
  if (index < 0) return null
  return emptyOperationPools.value.splice(index, 1)[0]
}

function moveExistingNodeToPool(sourceIndex, poolId) {
  const emptyPool = findEmptyOperationPool(poolId)
  if (!emptyPool) {
    moveNodeToOperationPool(nodeList.value, sourceIndex, poolId)
    return
  }

  const movedNode = removeNodeFromOperationPools(nodeList.value, sourceIndex)
  if (!movedNode) return
  movedNode.poolId = emptyPool.id
  movedNode.poolOperator = emptyPool.type
  movedNode.operator = emptyPool.operator || 'n'
  nodeList.value.push(movedNode)
  removeEmptyOperationPool(emptyPool.id)
  normalizeOperationPoolNodes(nodeList.value)
}

async function onDropIntoPool(event, poolId) {
  dragOverIndex.value = -1
  dragOverPoolId.value = ''
  if (batchMode.value) return

  const packageType = getDroppedPackageType(event)
  if (packageType) {
    dragSrcIndex = null
    draggedPackageType.value = ''
    await addPackageToPool(packageType, poolId)
    return
  }
  if (dragSrcIndex === null) return

  takeSnapshot()
  moveExistingNodeToPool(dragSrcIndex, poolId)
  dragSrcIndex = null
  markDerivedStructureChange()
}

async function onDropOnNode(event, targetIndex, poolId) {
  dragOverIndex.value = -1
  dragOverPoolId.value = ''
  if (batchMode.value) return

  const packageType = getDroppedPackageType(event)
  if (packageType) {
    dragSrcIndex = null
    draggedPackageType.value = ''
    await addPackageToPool(packageType, poolId)
    return
  }
  if (dragSrcIndex === null || dragSrcIndex === targetIndex) return

  takeSnapshot()
  moveNodeToOperationPool(nodeList.value, dragSrcIndex, poolId, targetIndex)
  dragSrcIndex = null
  markDerivedStructureChange()
}

function onDragEnd() {
  dragOverIndex.value = -1
  dragOverPoolId.value = ''
  dragSrcIndex = null
}

function changePoolType(poolId, type) {
  takeSnapshot()
  const emptyPool = findEmptyOperationPool(poolId)
  if (emptyPool) {
    emptyPool.type = type === 'u' ? 'u' : 'n'
  } else {
    setOperationPoolType(nodeList.value, poolId, type)
  }
  markDerivedStructureChange()
}

function changePoolRelation(poolId, operator) {
  takeSnapshot()
  const emptyPool = findEmptyOperationPool(poolId)
  if (emptyPool) {
    emptyPool.operator = ['n', 'u', 'd'].includes(operator) ? operator : 'n'
  } else {
    setOperationPoolRelation(nodeList.value, poolId, operator)
  }
  markDerivedStructureChange()
}

function addEmptyOperationPool(type = 'n') {
  if (batchMode.value) return
  takeSnapshot()
  emptyOperationPools.value.push(createEmptyOperationPoolDraft(
    type,
    operationPools.value.length === 0 ? null : 'n',
  ))
  markDerivedStructureChange()
  nextTick(() => {
    if (canvasScrollRef.value) {
      canvasScrollRef.value.scrollTop = canvasScrollRef.value.scrollHeight
    }
  })
}

function ensureDefaultOperationPool() {
  if (batchMode.value || nodeList.value.length > 0 || emptyOperationPools.value.length > 0) return
  emptyOperationPools.value = [createEmptyOperationPoolDraft('n')]
}

function detachNodeFromPool(index) {
  takeSnapshot()
  moveNodeToOwnOperationPool(nodeList.value, index)
  markDerivedStructureChange()
}

async function removePool(pool) {
  if (!pool) return
  if (!pool.entries?.length) {
    takeSnapshot()
    removeEmptyOperationPool(pool.id)
    ensureDefaultOperationPool()
    markDerivedStructureChange()
    return
  }
  if (pool.entries.length > 1) {
    try {
      await ElMessageBox.confirm(
        `该运算池包含 ${pool.entries.length} 个行为，删除后将一并移除。`,
        '删除运算池',
        { confirmButtonText: '删除', cancelButtonText: '取消', type: 'warning' },
      )
    } catch {
      return
    }
  }

  takeSnapshot()
  const removedNodes = removeOperationPool(nodeList.value, pool.id)
  removedNodes.forEach((node) => removeBindingsForNode(node.id))
  ensureDefaultOperationPool()
  markDerivedStructureChange()
}

function resetBatchContext() {
  batchMode.value = false
  batchKind.value = 'solutions'
  batchEntries.value = []
  activeBatchIndex.value = 0
  batchFolderName.value = ''
  batchSourceFolderId.value = null
  batchPreviewVisible.value = false
  batchCopyDialogVisible.value = false
  batchAutomationDialogVisible.value = false
  batchAutomationScope.value = 'current'
  batchAutomationSelectedIndexes.value = []
  batchNamingLoading.value = false
  batchNamingMessage.value = ''
  parameterBatchDialogVisible.value = false
  parameterBatchSection.value = null
  parameterBatchText.value = ''
  parameterBatchRows.value = []
  parameterBatchFieldName.value = ''
  parameterBatchFieldId.value = ''
}

function resetWorkbenchContext({ withDefaultPool = true } = {}) {
  resetBatchContext()
  emptyOperationPools.value = withDefaultPool ? [createEmptyOperationPoolDraft('n')] : []
  currentSolution.value = null
  loadedSolutionRecord.value = null
  loadedSolutionFieldIds.value = []
  workbenchMode.value = 'free-build'
  resetDerivedSolutionMeta()
}

function resetHistory() {
  clearTimeout(saveTimer)
  historyStack.value = []
  historyPos.value = -1
  takeSnapshot()
}

function clearCanvas() {
  if (nodeList.value.length === 0 && emptyOperationPools.value.length === 0 && !currentSolution.value) return

  takeSnapshot()
  nodeList.value = []
  nodeRefs.value = {}
  activeNodeIndex.value = 0
  crowdNameInput.value = ''
  resetWorkbenchContext()
  ElMessage.success('圈包画布已清空')
}

function prepareCleanGuidedTutorialWorkbench() {
  if (guidedTutorialState.taskId === COMBINATION_BATCH_TUTORIAL_ID) {
    leftPanelMode.value = 'solutions'
    return
  }
  const hadContent = nodeList.value.length > 0
    || emptyOperationPools.value.length > 0
    || Boolean(currentSolution.value)
    || Boolean(String(crowdNameInput.value || '').trim())

  if (nodeList.value.length > 0 || emptyOperationPools.value.length > 0 || currentSolution.value) takeSnapshot()
  nodeList.value = []
  nodeRefs.value = {}
  activeNodeIndex.value = 0
  crowdNameInput.value = ''
  resetWorkbenchContext()

  if (hadContent) ElMessage.success('已为教程自动清空圈包画布')
}

function toggleCollapseAll() {
  const target = !allCollapsed.value
  nodeList.value.forEach((node) => {
    node.collapsed = target
  })
}

function onCanvasScroll() {
  const container = canvasScrollRef.value
  if (!container) return

  const midPoint = container.scrollTop + container.clientHeight / 2
  let closestIndex = 0
  let closestDistance = Number.POSITIVE_INFINITY

  Object.entries(nodeRefs.value).forEach(([index, element]) => {
    if (!element) return
    const elementMidPoint = element.offsetTop + element.offsetHeight / 2
    const distance = Math.abs(midPoint - elementMidPoint)
    if (distance < closestDistance) {
      closestDistance = distance
      closestIndex = Number.parseInt(index, 10)
    }
  })

  activeNodeIndex.value = closestIndex
}

function scrollToNode(index) {
  const element = nodeRefs.value[index]
  if (element) {
    element.scrollIntoView({ behavior: 'smooth', block: 'center' })
  }
}

function takeSnapshot() {
  const snapshot = {
    nodeList: nodeList.value.map((node) => {
      const rawNode = toRaw(node)
      const { schema, logicMatrix, ...editableState } = rawNode
      return {
        // editableState may contain nested Vue proxies after a form edit.
        // Always unwrap those proxies before cloning; native structuredClone
        // throws and surfaces a yellow toast when it receives one directly.
        ...cloneValue(editableState),
        schema,
        logicMatrix,
      }
    }),
    emptyOperationPools: cloneValue(toRaw(emptyOperationPools.value)),
    crowdNameInput: crowdNameInput.value,
  }

  historyStack.value = historyStack.value.slice(0, historyPos.value + 1)
  historyStack.value.push(snapshot)
  if (historyStack.value.length > MAX_HISTORY) {
    historyStack.value.shift()
  }
  historyPos.value = historyStack.value.length - 1
}

function restoreSnapshot() {
  const snapshot = historyStack.value[historyPos.value]
  if (!snapshot) return

  nodeList.value = snapshot.nodeList || []
  emptyOperationPools.value = cloneValue(snapshot.emptyOperationPools || [])
  crowdNameInput.value = snapshot.crowdNameInput ?? ''
}

function undo() {
  if (!canUndo.value) return
  historyPos.value -= 1
  restoreSnapshot()
}

function redo() {
  if (!canRedo.value) return
  historyPos.value += 1
  restoreSnapshot()
}

function debouncedSnapshot() {
  clearTimeout(saveTimer)
  saveTimer = setTimeout(() => {
    if (!snapshotPaused.value) {
      takeSnapshot()
    }
  }, 1500)
}

async function loadPackages() {
  try {
    availablePackages.value = await listPackages()
  } catch (error) {
    ElMessage.error(error.message || '组件列表加载失败')
  }
}

let publishedSolutionsRequestId = 0
let publishedSolutionsAbort = null

async function loadPublishedSolutions({ fresh = false, notify = false } = {}) {
  const requestId = ++publishedSolutionsRequestId
  publishedSolutionsAbort?.abort()
  const controller = new AbortController()
  publishedSolutionsAbort = controller
  const scope = publishedLibraryScope.value
  loadingPublishedSolutions.value = true
  try {
    const nextSolutions = await listSolutions(
      'published',
      scope,
      { signal: controller.signal, fresh },
    )
    const nextFolderTree = await loadPublishedFolders({
      scope,
      solutions: nextSolutions,
      signal: controller.signal,
      fresh,
    })
    if (requestId !== publishedSolutionsRequestId) return false

    publishedSolutions.value = nextSolutions
    publishedFolderTree.value = nextFolderTree
    if (
      selectedPublishedFolderId.value
      && !folderTreeContains(nextFolderTree, selectedPublishedFolderId.value)
    ) {
      selectedPublishedFolderId.value = null
    }
    if (notify) {
      ElMessage.success(`${scope === 'public' ? '公共方案' : '我的方案'}已刷新`)
    }
    return true
  } catch (error) {
    if (error.name === 'AbortError') return false
    if (requestId === publishedSolutionsRequestId) {
      ElMessage.error(error.message || (notify ? '方案列表刷新失败' : '已发布方案列表加载失败'))
    }
    return false
  } finally {
    if (requestId === publishedSolutionsRequestId) {
      loadingPublishedSolutions.value = false
      if (publishedSolutionsAbort === controller) publishedSolutionsAbort = null
    }
  }
}

async function loadPublishedFolders({ scope, solutions, signal, fresh = false }) {
  const allFolders = await listFolders(scope, { signal, fresh })
  const publishedIds = new Set(
    solutions.map(s => s.folderId).filter(Boolean)
  )
  return filterFoldersByPublished(allFolders, publishedIds)
}

function folderTreeContains(folders, folderId) {
  return folders.some(folder => (
    folder.id === folderId
    || folderTreeContains(folder.children || [], folderId)
  ))
}

async function refreshPublishedSolutions() {
  await loadPublishedSolutions({ fresh: true, notify: true })
}

async function switchPublishedLibrary(nextScope) {
  if (nextScope === publishedLibraryScope.value) return
  publishedLibraryScope.value = nextScope
  selectedPublishedFolderId.value = null
  publishedSolutions.value = []
  publishedFolderTree.value = []
  await loadPublishedSolutions({ fresh: true })
}

function filterFoldersByPublished(folders, publishedIds) {
  return folders.reduce((acc, f) => {
    const childResults = f.children ? filterFoldersByPublished(f.children, publishedIds) : []
    const hasPublishedInTree = publishedIds.has(f.id) || childResults.length > 0
    if (hasPublishedInTree) {
      acc.push({ ...f, children: childResults.length > 0 ? childResults : (f.children || []) })
    }
    return acc
  }, [])
}

function onPublishedFolderSelect(folderId) {
  selectedPublishedFolderId.value = folderId
}

function getPublishedSolutionsInFolder() {
  if (!selectedPublishedFolderId.value) return publishedSolutions.value
  if (selectedPublishedFolderId.value === '__uncategorized__') {
    return publishedSolutions.value.filter(s => !s.folderId)
  }
  return publishedSolutions.value.filter(s => s.folderId === selectedPublishedFolderId.value)
}

function openBatchPreview() {
  const solutions = getPublishedSolutionsInFolder()
  if (solutions.length < 2) {
    ElMessage.info('当前文件夹至少需要 2 个已发布方案才能组合应用')
    return
  }
  batchPreviewSolutions.value = solutions.map((solution) => cloneValue(solution))
  batchPreviewVisible.value = true
}

async function openBatchPreviewForFolder(folderId) {
  selectedPublishedFolderId.value = folderId
  openBatchPreview()
  if (
    guidedTutorialState.taskId === COMBINATION_BATCH_TUTORIAL_ID
    && isGuidedTutorialStep('combo-open-group')
    && String(folderId || '') === tutorialBatchFolderId.value
  ) {
    await nextTick()
    completeGuidedTutorialStep('combo-open-group')
    return
  }
  if (
    isPullAnalysisTutorialActive()
    && isGuidedTutorialStep('pull-open-group-preview')
    && String(folderId || '') === String(guidedTutorialState.context.pullFolderId || '')
  ) {
    await nextTick()
    completeGuidedTutorialStep('pull-open-group-preview')
  }
}

function persistActiveBatchEntry() {
  if (!batchMode.value) return
  const entry = batchEntries.value[activeBatchIndex.value]
  if (!entry) return
  entry.nodes = nodeList.value
  entry.record = currentSolution.value
  entry.crowdName = String(crowdNameInput.value || entry.crowdName || '').trim()
  entry.generatedJson = cloneValue(generatedJson.value)
}

async function activateBatchEntry(index, options = {}) {
  const { skipPersist = false, rebuild = true } = options
  const nextEntry = batchEntries.value[index]
  if (!batchMode.value || !nextEntry) return

  if (!skipPersist) persistActiveBatchEntry()
  activeBatchIndex.value = index
  snapshotPaused.value = true
  try {
    currentSolution.value = nextEntry.record
    loadedSolutionRecord.value = nextEntry.sourceRecord
    loadedSolutionFieldIds.value = normalizeWorkbenchFieldIds(
      nextEntry.record?.workbenchFieldIds || [],
      nextEntry.nodes,
    )
    derivedSolutionMeta.sourceSolutionId = nextEntry.record?.id || null
    derivedSolutionMeta.sourceSolutionVersion = nextEntry.record?._version ?? null
    derivedSolutionMeta.sourceSolutionName = nextEntry.solutionName || ''
    derivedSolutionMeta.hasStructureChanges = false
    derivedSolutionMeta.hasParamChanges = false
    emptyOperationPools.value = []
    nodeList.value = nextEntry.nodes
    nodeRefs.value = {}
    activeNodeIndex.value = 0
    crowdNameInput.value = nextEntry.crowdName
    generatedJson.value = nextEntry.generatedJson || {
      crowdName: nextEntry.crowdName || DEFAULT_CROWD_NAME,
      list: [],
      compute: '',
    }
    highlightedCfId.value = null
    collapsedCfId.value = null
    workbenchMode.value = 'solution-use'
  } finally {
    snapshotPaused.value = false
  }

  await nextTick()
  if (rebuild) await buildFinalJson()

  if (isGuidedTutorialStep('pull-inspect-group-packages')) {
    const visited = [...new Set([
      ...(guidedTutorialState.context.pullVisitedPackageIndexes || []),
      index,
    ])].sort((a, b) => a - b)
    updateGuidedTutorialContext({ pullVisitedPackageIndexes: visited })
    if (visited.length === batchEntries.value.length) {
      completeGuidedTutorialStep('pull-inspect-group-packages')
    }
  }
}

async function enterBatchMode() {
  if (batchLoading.value || batchPreviewSolutions.value.length < 2) return
  if (isGuidedTutorialStep('pull-enter-group')) {
    const expectedIds = [
      guidedTutorialState.context.pullBaseSolutionId,
      guidedTutorialState.context.pullOwnSolutionId,
      guidedTutorialState.context.pullCompetitorSolutionId,
    ].map(value => String(value || '')).filter(Boolean)
    const previewIds = batchPreviewSolutions.value.map(item => String(item?.id || ''))
    if (
      expectedIds.length !== 3
      || previewIds.length !== 3
      || expectedIds.some(id => !previewIds.includes(id))
      || !pullAggregationReady()
    ) {
      ElMessage.warning('方案组必须包含本教程生成的三个方案，且同名字段类型一致')
      return
    }
  }
  if (isGuidedTutorialStep('combo-confirm-group')) {
    const allHaveCompetitorField = batchPreviewSolutions.value.length === 3
      && batchPreviewSolutions.value.every((solution) => (
        (solution?.customFields || []).some(field => String(field?.name || '').trim() === '竞争品牌')
      ))
    if (!allHaveCompetitorField) {
      ElMessage.warning('方案组必须包含三份方案，且每份方案都有“竞争品牌”自定义字段')
      return
    }
  }
  const shouldContinue = await confirmReplaceCanvas(
    '当前圈包画布已有内容，进入组合圈包模式后会替换现有状态，是否继续？',
    '进入组合圈包模式',
    '继续组合应用',
  )
  if (!shouldContinue) return

  batchLoading.value = true
  try {
    const entries = []
    for (let index = 0; index < batchPreviewSolutions.value.length; index += 1) {
      const item = batchPreviewSolutions.value[index]
      const detail = await getSolution(item.id)
      const hydratedNodes = await hydrateNodes(detail?.nodes || [])
      const crowdName = String(detail?.defaultCrowdName || '').trim()
      entries.push({
        id: detail.id,
        solutionName: String(detail?.name || '').trim() || '未命名方案',
        crowdName,
        record: cloneValue(detail),
        sourceRecord: cloneValue(detail),
        nodes: hydratedNodes,
        sourceNodes: cloneValue(hydratedNodes),
        generatedJson: null,
        automationStatus: 'idle',
      })
    }

    batchKind.value = 'solutions'
    parameterBatchFieldName.value = ''
    parameterBatchFieldId.value = ''
    batchEntries.value = entries
    activeBatchIndex.value = 0
    batchFolderName.value = selectedPublishedFolderName.value || '组合方案'
    batchSourceFolderId.value = selectedPublishedFolderId.value
    batchMode.value = true
    batchPreviewVisible.value = false
    await activateBatchEntry(0, { skipPersist: true })
    resetHistory()
    ElMessage.success(`已加载 ${entries.length} 个人群包，参数已按名称聚合`)
    if (isGuidedTutorialStep('pull-enter-group')) {
      const compatibility = analyzeBatchCustomFieldCompatibility(entries.map(entry => entry.record))
      updateGuidedTutorialContext({
        pullNodeCount: entries.reduce((sum, entry) => sum + entry.nodes.length, 0),
        pullBatchStatus: 'idle',
        pullBatchCompletedCount: 0,
        pullBatchFailedNames: [],
        pullBatchError: '',
        pullBatchCategoryApplied: false,
        pullBatchCompetitorApplied: false,
        pullBatchCompatibility: compatibility,
        pullBatchPackageNames: entries.map(entry => entry.crowdName),
        pullVisitedPackageIndexes: [0],
        pullBatchRound: '',
        pullBaselineStatus: 'idle',
        pullBaselineCompletedCount: 0,
        pullBaselineFailedNames: [],
        pullBaselineError: '',
        pullSecondStatus: 'idle',
        pullSecondCompletedCount: 0,
        pullSecondFailedNames: [],
        pullSecondError: '',
      })
      completeGuidedTutorialStep('pull-enter-group')
    }
    if (isGuidedTutorialStep('combo-confirm-group')) {
      completeGuidedTutorialStep('combo-confirm-group')
    }
  } catch (error) {
    resetBatchContext()
    ElMessage.error(error?.message || '组合方案加载失败，请稍后重试')
  } finally {
    batchLoading.value = false
  }
}

async function createParameterBatchEntries() {
  if (parameterBatchCreating.value || !parameterBatchCanCreate.value) return
  if (batchMode.value && !isParameterBatch.value) {
    parameterBatchCreating.value = true
    try {
      persistActiveBatchEntry()
      const fieldName = String(parameterBatchSection.value?.name || '').trim()
      const entries = expandCombinationParameterRows(cloneValue(batchEntries.value), cloneValue(parameterBatchRows.value), fieldName, syncCustomFieldValue)
      batchEntries.value = entries
      batchKind.value = 'parameter'
      parameterBatchFieldName.value = fieldName
      parameterBatchFieldId.value = String(parameterBatchSection.value?.customFieldId || '')
      parameterBatchDialogVisible.value = false
      await activateBatchEntry(0, { skipPersist: true })
      resetHistory()
      if (isGuidedTutorialStep('combo-create')) completeGuidedTutorialStep('combo-create')
      ElMessage.success(`已生成 ${entries.length} 个建包任务，点击自动化圈人即可核对并开始`)
    } catch (error) {
      ElMessage.error(error?.message || '组合批量展开失败，请检查参数')
    } finally {
      parameterBatchCreating.value = false
    }
    return
  }
  if (isParameterBatchTutorialActive() && !parameterTutorialBrandRowsReady()) {
    ElMessage.warning('本次教程请粘贴提供的 4 个竞争品牌，每行一个')
    return
  }
  if (workbenchMode.value !== 'solution-use' || !currentSolution.value || batchMode.value) {
    ElMessage.warning('批量参数只能从正在使用的单个方案中创建')
    return
  }

  const section = parameterBatchSection.value
  const customFieldId = String(section?.customFieldId || '')
  const fieldName = String(section?.name || '').trim()
  const baseRecord = cloneValue(currentSolution.value)
  const baseNodes = cloneValue(nodeList.value)
  const sourceField = (baseRecord?.customFields || []).find((field) => field.id === customFieldId)
  if (!sourceField || !fieldName) {
    ElMessage.error('未找到要批量设置的方案参数，请重新打开批量设置')
    return
  }

  parameterBatchCreating.value = true
  try {
    const nonce = Date.now()
    const entries = parameterBatchRows.value.map((row, index) => {
      const record = cloneValue(baseRecord)
      const nodes = cloneValue(baseNodes)
      const customFields = Array.isArray(record.customFields) ? record.customFields : []
      syncCustomFieldValue(nodes, customFieldId, customFields, cloneValue(row.values))
      record.customFields = customFields.map((field) => (
        field.id === customFieldId
          ? { ...field, defaultValue: cloneValue(row.values) }
          : field
      ))
      record.defaultCrowdName = String(row.crowdName || '').trim()

      return {
        id: `parameter_${record.id || 'solution'}_${nonce}_${index}`,
        solutionName: String(record.name || '').trim() || '未命名方案',
        crowdName: record.defaultCrowdName,
        record,
        sourceRecord: cloneValue(record),
        nodes,
        sourceNodes: cloneValue(nodes),
        generatedJson: null,
        automationStatus: 'idle',
        parameterBatchValues: cloneValue(row.values),
        parameterBatchSourceRow: row.sourceRow,
      }
    })

    batchKind.value = 'parameter'
    parameterBatchFieldName.value = fieldName
    parameterBatchFieldId.value = customFieldId
    batchEntries.value = entries
    activeBatchIndex.value = 0
    batchFolderName.value = String(baseRecord.name || '单方案批量任务').trim()
    batchSourceFolderId.value = null
    batchMode.value = true
    parameterBatchDialogVisible.value = false
    await activateBatchEntry(0, { skipPersist: true })
    resetHistory()
    if (isParameterBatchTutorialActive() && isGuidedTutorialStep('parameter-create-tasks')) {
      updateGuidedTutorialContext({
        parameterBatchRows: parameterBatchRows.value.map(row => [...row.values]),
        parameterBatchPackageNames: entries.map(entry => entry.crowdName),
        parameterBatchStatus: 'idle',
        parameterBatchCompletedCount: 0,
        parameterBatchFailedNames: [],
        parameterBatchError: '',
      })
      completeGuidedTutorialStep('parameter-create-tasks')
    }
    ElMessage.success(`已按 ${entries.length} 行生成 ${entries.length} 个建包任务`)
  } catch (error) {
    resetBatchContext()
    ElMessage.error(error?.message || '批量任务生成失败，请检查粘贴内容后重试')
  } finally {
    parameterBatchCreating.value = false
  }
}

function completePackageAddTutorial(packageType) {
  if (packageType === CATEGORY_ITEM_PACKAGE) {
    completeGuidedTutorialStep('add-category-item')
  }
  if (packageType === CATEGORY_PUBLIC_PACKAGE && isGuidedTutorialStep('add-public-behavior')) {
    completeGuidedTutorialStep('add-public-behavior')
  }
}

async function addPackageToPool(packageType, poolId) {
  if (!packageType || loadingPkg.value || batchMode.value) return
  loadingPkg.value = packageType
  try {
    const node = await createRuntimeNode({ packageType }, nodeList.value.length)
    const targetPool = operationPools.value.find((pool) => pool.id === String(poolId))
    if (!targetPool) throw new Error('目标运算池已变化，请重新拖入')

    takeSnapshot()
    node.poolId = targetPool.id
    node.poolOperator = targetPool.type
    node.operator = targetPool.entries.length > 0 ? null : (targetPool.operator || 'n')

    if (targetPool.entries.length > 0) {
      const insertIndex = Math.max(...targetPool.entries.map((entry) => entry.index)) + 1
      nodeList.value.splice(insertIndex, 0, node)
    } else {
      nodeList.value.push(node)
      removeEmptyOperationPool(targetPool.id)
    }
    normalizeOperationPoolNodes(nodeList.value)
    markDerivedStructureChange()
    completePackageAddTutorial(packageType)
  } catch (error) {
    ElMessage.error(error.message || '组件加载失败，请检查后端连接')
  } finally {
    loadingPkg.value = null
  }
}

async function addNode(packageType) {
  if (loadingPkg.value || batchMode.value) return
  const defaultEmptyPool = emptyOperationPools.value[0]
  if (defaultEmptyPool) {
    await addPackageToPool(packageType, defaultEmptyPool.id)
    return
  }
  loadingPkg.value = packageType
  try {
    const node = await createRuntimeNode({ packageType }, nodeList.value.length)
    prepareNodeAsOwnOperationPool(node, nodeList.value.length === 0 ? null : 'n')
    takeSnapshot()
    nodeList.value.push(node)
    normalizeOperationPoolNodes(nodeList.value)
    markDerivedStructureChange()
    completePackageAddTutorial(packageType)
  } catch (error) {
    ElMessage.error(error.message || '组件加载失败，请检查后端连接')
  } finally {
    loadingPkg.value = null
  }
}

function removeNode(index) {
  takeSnapshot()
  const removedNode = removeNodeFromOperationPools(nodeList.value, index)
  if (removedNode) {
    removeBindingsForNode(removedNode.id)
  }
  ensureDefaultOperationPool()
  markDerivedStructureChange()
}

function duplicateNode(index) {
  const source = nodeList.value[index]
  if (!source) return

  takeSnapshot()
  const duplicated = cloneNodeForDuplicate(source, index)
  const tutorialCopy = isGuidedTutorialStep('duplicate-own-node') && index === 0
  if (tutorialCopy) duplicated.operator = 'n'
  insertOwnPoolNodesAfterPool(nodeList.value, index, [duplicated], duplicated.operator || 'n')
  markDerivedStructureChange()

  if (tutorialCopy) {
    tutorialCopySourceId.value = source.id
    tutorialCopyArrivalId.value = duplicated.id
    updateGuidedTutorialContext({ copiedNodeId: duplicated.id })
    completeGuidedTutorialStep('duplicate-own-node')
    window.setTimeout(() => {
      tutorialCopySourceId.value = ''
      tutorialCopyArrivalId.value = ''
    }, 620)
  }

  const cfs = currentSolution.value?.customFields || []
  const relatedCfs = cfs.filter(cf =>
    (cf.bindings || []).some(b => b.nodeId === source.id)
  )
  if (relatedCfs.length > 0) {
    const names = relatedCfs.map(cf => cf.name).join('、')
    ElMessageBox.confirm(
      `自定义字段「${names}」绑定了源节点的字段，是否也将新节点（${getNodeDisplayName(duplicated, index + 1)}）的对应字段绑定到这些自定义字段？`,
      '复制节点',
      { confirmButtonText: '自动绑定', cancelButtonText: '跳过', type: 'info' }
    ).then(() => {
      const nextFields = cfs.map((cf) => {
        const sourceBinding = (cf.bindings || []).find(b => b.nodeId === source.id)
        if (!sourceBinding) return cf
        return {
          ...cf,
          bindings: [
            ...(cf.bindings || []),
            { nodeId: duplicated.id, fieldKey: sourceBinding.fieldKey },
          ],
        }
      })
      setCurrentCustomFields(nextFields)
      ElMessage.success(`已自动绑定 ${relatedCfs.length} 个自定义字段到新节点`)
    }).catch(() => {})
  } else {
    ElMessage.success('节点已复制')
  }
}

function handleOverflowSplit(payload) {
  if (payload?.deferred) return
  const { nodeId, overflows } = payload
  const srcIndex = nodeList.value.findIndex(n => n.id === nodeId)
  if (srcIndex < 0) return
  const sourceNode = nodeList.value[srcIndex]

  let allOverflows = overflows
  if (!allOverflows) {
    allOverflows = [{ fieldKey: payload.fieldKey, allValues: payload.allValues, limit: payload.limit }]
  }

  const splits = buildMultiFieldNodeSplits(sourceNode, allOverflows)
  if (splits.length === 0) return
  takeSnapshot()
  for (const ov of allOverflows) {
    if (ov.fieldKey === 'leafCates') {
      const chunks = chunkBySecondaryCategory(ov.allValues, ov.limit)
      sourceNode.formData[ov.fieldKey] = chunks[0] || []
    } else {
      sourceNode.formData[ov.fieldKey] = ov.allValues.slice(0, ov.limit)
    }
  }
  insertOwnPoolNodesAfterPool(nodeList.value, srcIndex, splits, 'u')

  const customFields = currentSolution.value?.customFields || []
  if (customFields.some(cf => (cf.bindings || []).some(binding => binding.nodeId === sourceNode.id))) {
    const nextFields = customFields.map((cf) => {
      const sourceBindings = (cf.bindings || []).filter(binding => binding.nodeId === sourceNode.id)
      if (sourceBindings.length === 0) return cf
      const derivedBindings = splits.flatMap(split => sourceBindings.map(binding => ({
        ...binding,
        nodeId: split.id,
      })))
      return {
        ...cf,
        bindings: [...(cf.bindings || []), ...derivedBindings],
      }
    })
    setCurrentCustomFields(nextFields)
  }
  markDerivedStructureChange()
}

async function confirmDeferredSolutionSplit() {
  const overflows = getUnresolvedSolutionUseOverflows()
  if (overflows.length === 0) return
  const distinctFields = [...new Map(overflows.map(item => [item.fieldKey, item])).values()]
  if (distinctFields.length > 1) {
    const fieldList = distinctFields
      .map(item => `「${item.fieldLabel}」${item.allValues.length}/${item.limit}`)
      .join('、')
    ElMessage.warning(`当前有多个字段超限：${fieldList}。一次只能拆分一个字段，请先删减其他超限值`)
    return
  }

  const overflow = distinctFields[0]
  const nodeGroups = new Map()
  overflows.forEach((item) => {
    if (!nodeGroups.has(item.nodeId)) nodeGroups.set(item.nodeId, [])
    nodeGroups.get(item.nodeId).push({
      fieldKey: item.fieldKey,
      fieldLabel: item.fieldLabel,
      allValues: item.allValues,
      limit: item.limit,
    })
  })
  const chunkCount = overflow.fieldKey === 'leafCates'
    ? chunkBySecondaryCategory(overflow.allValues, overflow.limit).length
    : Math.ceil(overflow.allValues.length / overflow.limit)

  try {
    await ElMessageBox.confirm(
      `请确认品牌、分析类目、行为、渠道和日期等其余参数均已完成。继续后将把「${overflow.fieldLabel}」拆成每组最多 ${overflow.limit} 项，并让拆分节点继承当前全部参数。`,
      '最后确认拆分',
      { confirmButtonText: '参数已完成，确认拆分', cancelButtonText: '继续填写参数', type: 'warning' },
    )
  } catch {
    return
  }

  nodeGroups.forEach((nodeOverflows, nodeId) => {
    handleOverflowSplit({ nodeId, overflows: nodeOverflows })
  })
  ElMessage.success(`已将 ${nodeGroups.size} 个关联组件各拆为 ${chunkCount} 组，所有其余参数已完整继承`)
}

function buildDraftWorkbenchFieldIds(nodes) {
  const ids = []
  ;(Array.isArray(nodes) ? nodes : []).forEach((node) => {
    ;(Array.isArray(node?.schema) ? node.schema : []).forEach((field) => {
      if (isVisible(field, node)) {
        ids.push(fieldToken(node.id, field.key))
      }
    })
  })
  return normalizeWorkbenchFieldIds(ids, nodes)
}

async function saveWorkbenchDraft() {
  if (workbenchMode.value !== 'free-build' || nodeList.value.length === 0) return

  savingDraft.value = true
  try {
    const tutorialDraft = isGuidedTutorialStep('save-workbench-solution')
    const created = await createDraft(buildDraftPayload(tutorialDraft ? '圈包草稿' : undefined))
    if (tutorialDraft) {
      updateGuidedTutorialContext({
        workbenchDraftId: String(created?.id || ''),
        workbenchDraftSyncStatus: 'pending',
        workbenchDraftSyncError: '',
      })
      completeGuidedTutorialStep('save-workbench-solution')
    }
    ElMessage.success('当前画布已存为方案草稿')
  } catch (error) {
    ElMessage.error(error.message || '方案草稿保存失败')
  } finally {
    savingDraft.value = false
  }
}

async function saveAsNewDerivedDraft() {
  if (!isDerivedSolutionSession.value || nodeList.value.length === 0) return

  const pullCopyMode = isGuidedTutorialStep('pull-save-own-copy')
    ? 'own'
    : isGuidedTutorialStep('pull-save-competitor-copy')
      ? 'competitor'
      : ''
  const expectedPullName = pullCopyMode === 'own'
    ? PULL_ANALYSIS_GROUP_TUTORIAL_VALUES.ownPurchaseSolutionName
    : PULL_ANALYSIS_GROUP_TUTORIAL_VALUES.competitorPurchaseSolutionName
  if (pullCopyMode) completeGuidedTutorialStep(`pull-save-${pullCopyMode}-copy`)

  try {
    const { value } = await ElMessageBox.prompt(
      '请输入新方案名称',
      '另存为新方案',
      {
        confirmButtonText: '保存',
        cancelButtonText: '取消',
        inputValue: pullCopyMode
          ? ''
          : String(crowdNameInput.value || currentSolution.value?.name || DEFAULT_DRAFT_NAME).trim(),
        inputValidator: pullCopyMode
          ? input => String(input || '').trim() === expectedPullName || '请粘贴教程提供的完整方案名称'
          : input => Boolean(String(input || '').trim()) || '方案名称不能为空',
        closeOnClickModal: !pullCopyMode,
        closeOnPressEscape: !pullCopyMode,
      },
    )

    savingDraft.value = true
    const created = await createDraft(buildDraftPayload(value))
    ElMessage.success('当前圈包画布已另存为新方案草稿')
    if (pullCopyMode && isGuidedTutorialStep(`pull-name-${pullCopyMode}-draft`)) {
      updateGuidedTutorialContext(pullCopyMode === 'own'
        ? { pullOwnDraftId: String(created?.id || '') }
        : { pullCompetitorDraftId: String(created?.id || '') })
      completeGuidedTutorialStep(`pull-name-${pullCopyMode}-draft`)
    }
  } catch (error) {
    if (error !== 'cancel' && error?.message !== 'cancel') {
      ElMessage.error(error.message || '另存为新方案失败')
    }
  } finally {
    savingDraft.value = false
  }
}

async function confirmReplaceCanvas(
  message = '当前画布已有内容，加载已发布方案后会替换现有状态，是否继续？',
  title = '替换当前画布',
  confirmButtonText = '继续加载',
) {
  if (nodeList.value.length === 0) return true

  try {
    await ElMessageBox.confirm(
      message,
      title,
      {
        confirmButtonText,
        cancelButtonText: '取消',
        type: 'warning',
      },
    )
    return true
  } catch {
    return false
  }
}

async function applyAiAudiencePlan({ nodes, audienceName, workflow } = {}) {
  if (!Array.isArray(nodes) || nodes.length === 0) {
    ElMessage.warning('AI方案中没有可应用的工作台节点')
    return
  }
  const confirmed = await confirmReplaceCanvas(
    '当前画布已有内容，应用AI方案会替换现有状态，是否继续？',
    '应用AI圈包方案',
    '确认替换',
  )
  if (!confirmed) return

  snapshotPaused.value = true
  try {
    const hydratedNodes = await hydrateNodes(nodes)
    if (hydratedNodes.some(node => node._hydrationError)) {
      throw new Error('部分AI节点加载失败，请检查组件配置后重试')
    }
    resetWorkbenchContext({ withDefaultPool: false })
    nodeList.value = hydratedNodes
    nodeRefs.value = {}
    activeNodeIndex.value = 0
    crowdNameInput.value = String(audienceName || '').trim()
    resetHistory()
    await nextTick()
    const workflowName = String(workflow?.shortTitle || workflow?.title || '').trim()
    const nextHint = workflow?.applicationMode === 'staged'
      ? `，已按“${workflowName}”路径准备基础方案`
      : '，可继续修改或计算人数'
    ElMessage.success(`AI方案已应用：${hydratedNodes.length}个节点${nextHint}`)
  } catch (error) {
    ElMessage.error(error.message || 'AI方案应用失败，请稍后重试')
  } finally {
    snapshotPaused.value = false
  }
}

let queuedAiCommand = null
let lastAiCommandToken = ''

async function consumeAiCommand(command) {
  const token = String(command?.token || '')
  if (!token || token === lastAiCommandToken || command?.action !== 'apply_ai_audience_plan') return
  if (sessionRestorePending) {
    queuedAiCommand = command
    return
  }
  lastAiCommandToken = token
  await applyAiAudiencePlan(command.payload || {})
}

watch(() => props.aiCommand, command => { void consumeAiCommand(command) }, { deep: true, immediate: true })

async function setWorkbenchFromSolution(record) {
  snapshotPaused.value = true
  try {
    const hydratedNodes = await hydrateNodes(record?.nodes || [])
    currentSolution.value = cloneValue(record)
    loadedSolutionRecord.value = cloneValue(record)
    loadedSolutionFieldIds.value = normalizeWorkbenchFieldIds(record?.workbenchFieldIds || [], hydratedNodes)
    derivedSolutionMeta.sourceSolutionId = record?.id || null
    derivedSolutionMeta.sourceSolutionVersion = record?._version ?? null
    derivedSolutionMeta.sourceSolutionName = record?.name || ''
    derivedSolutionMeta.hasStructureChanges = false
    derivedSolutionMeta.hasParamChanges = false
    emptyOperationPools.value = []
    nodeList.value = hydratedNodes
    nodeRefs.value = {}
    activeNodeIndex.value = 0
    crowdNameInput.value = String(record?.defaultCrowdName ?? '').trim()
    workbenchMode.value = 'solution-use'
    resetHistory()
  } finally {
    snapshotPaused.value = false
  }
}

let loadSolutionAbort = null

async function loadPublishedSolution(item) {
  if (!item?.id) return
  if (currentSolution.value?.id === item.id && workbenchMode.value === 'solution-use' && !batchMode.value) {
    const target = getTutorialPublishedSolutionTarget(item)
    if (target === 'load-tutorial-solution') {
      updateGuidedTutorialContext({
        solutionId: String(item.id),
        solutionNodeCount: nodeList.value.length,
        solutionStructureChanged: false,
      })
      completeGuidedTutorialStep('load-tutorial-solution')
    } else if (target === 'pull-load-base-solution') {
      updateGuidedTutorialContext({ pullBaseSolutionId: String(item.id) })
      completeGuidedTutorialStep('pull-load-base-solution')
    } else if (target === 'pull-load-own-solution') {
      updateGuidedTutorialContext({ pullOwnSolutionId: String(item.id) })
      completeGuidedTutorialStep('pull-load-own-solution')
    }
    return
  }

  const shouldContinue = await confirmReplaceCanvas(
    batchMode.value
      ? '当前正在使用组合方案，切换到单个方案后将退出组合圈包模式，是否继续？'
      : undefined,
    batchMode.value ? '退出组合圈包模式' : undefined,
    batchMode.value ? '切换到单方案' : undefined,
  )
  if (!shouldContinue) return
  if (batchMode.value) resetBatchContext()

  if (loadSolutionAbort) {
    loadSolutionAbort.abort()
  }
  loadSolutionAbort = new AbortController()
  const { signal } = loadSolutionAbort

  loadingSolutionId.value = item.id
  try {
    const detail = await getSolution(item.id, { signal })
    await setWorkbenchFromSolution(detail)
    ElMessage.success('已加载发布方案')
    if (isGuidedTutorialStep('load-tutorial-solution') && isTutorialPublishedSolution(detail)) {
      updateGuidedTutorialContext({
        solutionId: String(detail?.id || ''),
        solutionNodeCount: nodeList.value.length,
        solutionStructureChanged: false,
      })
      completeGuidedTutorialStep('load-tutorial-solution')
    }
    const pullTarget = getTutorialPublishedSolutionTarget(detail)
    if (pullTarget === 'pull-load-base-solution') {
      updateGuidedTutorialContext({ pullBaseSolutionId: String(detail?.id || '') })
      completeGuidedTutorialStep('pull-load-base-solution')
    }
    if (pullTarget === 'pull-load-own-solution') {
      updateGuidedTutorialContext({ pullOwnSolutionId: String(detail?.id || '') })
      completeGuidedTutorialStep('pull-load-own-solution')
    }
  } catch (error) {
    if (error.name !== 'AbortError') {
      ElMessage.error(error.message || '方案加载失败')
    }
  } finally {
    loadingSolutionId.value = null
  }
}

async function restoreSolutionDefaults() {
  if (!loadedSolutionRecord.value) return
  await setWorkbenchFromSolution(loadedSolutionRecord.value)
  ElMessage.success('已恢复到方案默认值')
}

async function restoreActiveDefaults() {
  if (!batchMode.value) {
    await restoreSolutionDefaults()
    return
  }

  const currentIndex = activeBatchIndex.value
  batchEntries.value = batchEntries.value.map((entry) => ({
    ...entry,
    record: cloneValue(entry.sourceRecord),
    nodes: cloneValue(entry.sourceNodes),
    crowdName: String(entry.sourceRecord?.defaultCrowdName || '').trim(),
    generatedJson: null,
    automationStatus: 'idle',
  }))
  await activateBatchEntry(currentIndex, { skipPersist: true })
  ElMessage.success('已恢复全部人群包的方案默认值')
}

async function buildFinalJson() {
  clearTimeout(jsonTimer)
  jsonTimer = null
  jsonBuildAbort?.abort()
  const buildAbort = new AbortController()
  jsonBuildAbort = buildAbort
  jsonBuildStatus.value = 'building'
  jsonBuildError.value = ''

  if (nodeList.value.length === 0) {
    generatedJson.value = { crowdName: DEFAULT_CROWD_NAME, list: [], compute: '' }
    jsonBuildStatus.value = 'empty'
    if (batchMode.value && activeBatchEntry.value) {
      activeBatchEntry.value.generatedJson = cloneValue(generatedJson.value)
    }
    if (jsonBuildAbort === buildAbort) jsonBuildAbort = null
    return
  }

  const list = []
  const poolExpression = buildOperationPoolExpression(nodeList.value)
  const compute = poolExpression.compute
  let generationFailed = false

  for (let index = 0; index < nodeList.value.length; index += 1) {
    const node = nodeList.value[index]
    const payload = { _package: node.packageType }

    ;(Array.isArray(node.schema) ? node.schema : []).forEach((field) => {
      if (!isVisible(field, node)) return

      const key = field.key
      const value = node.formData?.[key]
      const mode = node.modeData?.[key]

      if (field.Widget_Type === '数值_切换') {
        if (mode === 'unlimited') {
          payload[key] = { min: '', max: '' }
        } else if (mode === 'min') {
          payload[key] = { min: value?.min, max: '' }
        } else if (mode === 'range') {
          payload[key] = { min: value?.min, max: value?.max }
        }
        return
      }

      if (field.Widget_Type === '日期_切换') {
        if (mode === 'recent') {
          payload[key] = { val: { days: value?.days }, min: 'recent' }
        } else if (mode === 'range' && Array.isArray(value?.dateRange) && value.dateRange.length === 2) {
          payload[key] = {
            val: {
              start: String(value.dateRange[0]).replaceAll('-', ''),
              end: String(value.dateRange[1]).replaceAll('-', ''),
            },
            min: 'range',
          }
        }
        return
      }

      if (Array.isArray(value)) {
        if (value.length > 0) payload[key] = value
        return
      }

      if (value !== undefined && value !== null && value !== '') {
        payload[key] = value
      }
    })

    try {
      const response = await fetchWithTimeout('/api/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        signal: buildAbort.signal,
      })
      if (!response.ok) {
        const errorBody = await response.json().catch(() => null)
        throw new Error(errorBody?.message || `生成接口返回 ${response.status}`)
      }
      const nodeJson = await response.json()
      if (nodeJson?.list?.length > 0) {
        const baseTemplate = nodeJson.list[0]
        if (!PRESERVE_FROM_POOL_ID_PACKAGES.has(node.packageType)) {
          baseTemplate.fromPoolId = poolExpression.fromPoolIdByIndex.get(index) ?? index
        }
        if (index > 0) {
          baseTemplate.op = 'INIT'
        }
        list.push(baseTemplate)
      } else {
        throw new Error('生成接口未返回有效结果')
      }
    } catch (error) {
      if (error.name === 'AbortError') return
      generationFailed = true
      if (!jsonBuildError.value) jsonBuildError.value = error.message || 'JSON 生成失败'
      console.error('JSON 生成失败，请检查后端服务状态', error)
    }
  }

  if (buildAbort.signal.aborted) return
  generatedJson.value = {
    crowdName: String(crowdNameInput.value || '').trim() || (
      isPureOfficialParityOutput() ? OFFICIAL_DEFAULT_CROWD_NAME : DEFAULT_CROWD_NAME
    ),
    list,
    compute,
  }
  if (batchMode.value && activeBatchEntry.value) {
    activeBatchEntry.value.generatedJson = cloneValue(generatedJson.value)
  }
  jsonBuildStatus.value = generationFailed ? 'failed' : 'ready'
  if (jsonBuildAbort === buildAbort) jsonBuildAbort = null
}

function enforceWorkbenchFieldConstraints(nodes) {
  nodes.forEach((node) => {
    if (node.packageType !== '商品行为') return

    const channels = getArray(node.formData?.channel)
    const isTmallGlobal = channels.includes('天猫国际直营')
    const isTmall = channels.includes('天猫')
    const currentShop = node.formData?.shop

    if (!isTmall && currentShop !== '全淘宝天猫') {
      node.formData.shop = '全淘宝天猫'
    }

    const latestShop = node.formData?.shop
    if ((latestShop === '全淘宝天猫' || !latestShop) && !isTmallGlobal) {
      if (node.formData.selectedGoodsType !== '任意品牌商品') {
        node.formData.selectedGoodsType = '任意品牌商品'
      }
      if (Array.isArray(node.formData.item) && node.formData.item.length > 0) {
        node.formData.item = []
      }
    }
  })
}

function getNodeSummary(node) {
  const items = []

  ;(Array.isArray(node.schema) ? node.schema : []).forEach((field) => {
    if (!isVisible(field, node)) return

    const key = field.key
    const value = node.formData?.[key]
    const mode = node.modeData?.[key]
    if (value === undefined || value === null || value === '') return
    if (Array.isArray(value) && value.length === 0) return

    let display = ''

    if (field.Widget_Type === '数值_切换') {
      if (mode === 'unlimited') return
      if (mode === 'min' && value?.min !== null && value?.min !== undefined) {
        display = `${getNumericSummaryPrefix(field)}${value.min}`
      } else if (mode === 'range') {
        display = `${value?.min ?? '?'} - ${value?.max ?? '?'}`
      }
    } else if (field.Widget_Type === '日期_切换') {
      if (mode === 'recent' && value?.days) {
        display = `${getFieldUiLabel(field, 'recentPrefix', '过去')} ${value.days} 天`
      } else if (mode === 'range' && Array.isArray(value?.dateRange) && value.dateRange.length === 2) {
        display = `${value.dateRange[0]} ~ ${value.dateRange[1]}`
      }
    } else if (Array.isArray(value)) {
      display = value.slice(0, 6).join('、')
      if (value.length > 6) {
        display += ` ...共${value.length}项`
      }
    } else if (typeof value === 'object') {
      display = JSON.stringify(value)
    } else {
      display = String(value)
    }

    if (display) {
      items.push({
        key,
        label: field.Label || field.label || key,
        value: display,
      })
    }
  })

  return items
}

function getCollapsedNodeSummary(node) {
  return getNodeSummary(node)
    .slice(0, 2)
    .map(item => `${item.label}：${item.value}`)
    .join(' · ')
}

function isPureOfficialParityOutput() {
  if (nodeList.value.length === 0) return false
  const packageType = nodeList.value[0]?.packageType
  if (![CATEGORY_PUBLIC_PACKAGE, COMMODITY_PACKAGE, BRAND_PROMOTION_PACKAGE, SINGLE_MEDIA_PACKAGE].includes(packageType)) return false
  return nodeList.value.every((node) => node.packageType === packageType)
}

function getGeneratedJsonText() {
  return JSON.stringify(generatedJson.value, null, isPureOfficialParityOutput() ? '\t' : 4)
}

function getUnresolvedSolutionUseOverflows() {
  if (workbenchMode.value !== 'solution-use' || batchMode.value) return []
  return nodeList.value.flatMap((node, index) => collectNodeOverflows(node).map(overflow => ({
    ...overflow,
    nodeId: node.id,
    nodeName: getNodeDisplayName(node, index),
  })))
}

function ensureGeneratedOutputReady(actionLabel = '继续') {
  const unresolvedOverflows = getUnresolvedSolutionUseOverflows()
  if (unresolvedOverflows.length > 0) {
    const distinctFields = [...new Map(unresolvedOverflows.map(item => [item.fieldKey, item])).values()]
    const fieldList = distinctFields.map(item => `「${item.fieldLabel}」${item.allValues.length}/${item.limit}`).join('、')
    const instruction = distinctFields.length > 1
      ? '一次只能处理一个超限字段，请先删除其余字段的多余值'
      : '请先完成其余参数，再点击页面顶部“最后确认拆分”'
    ElMessage.warning(`${actionLabel}前发现超限字段：${fieldList}。${instruction}`)
    return false
  }

  const validation = validateWorkbenchOutput({
    nodes: nodeList.value,
    generatedJson: generatedJson.value,
    generationStatus: jsonBuildStatus.value,
  })
  if (validation.valid) return true
  ElMessage.warning(`${actionLabel}前请完成检查：${validation.issues.join('；')}`)
  return false
}

function getPreviewJsonText() {
  return JSON.stringify(generatedJson.value, null, 2)
}

async function copyJson() {
  if (batchMode.value) {
    batchCopyIndex.value = activeBatchIndex.value
    batchCopyDialogVisible.value = true
    return
  }

  if (!ensureGeneratedOutputReady('复制')) return

  try {
    await navigator.clipboard.writeText(getGeneratedJsonText())
    ElMessage.success('JSON 已复制到剪贴板')
  } catch {
    ElMessage.error('复制失败，请手动选择后复制')
  }
}

async function confirmBatchCopy() {
  if (batchCopying.value) return
  batchCopying.value = true
  try {
    await activateBatchEntry(Number(batchCopyIndex.value))
    if (!ensureGeneratedOutputReady('复制')) return
    await navigator.clipboard.writeText(getGeneratedJsonText())
    batchCopyDialogVisible.value = false
    ElMessage.success(`已复制“${activeBatchEntry.value?.crowdName || '当前人群包'}”参数`)
  } catch {
    ElMessage.error('复制失败，请稍后重试')
  } finally {
    batchCopying.value = false
  }
}

function goToDataBank() {
  window.open(DATABANK_URL, '_blank', 'noopener,noreferrer')
}

function isExtensionVersionAtLeast(version, minimumVersion) {
  const actual = String(version || '').split('.').slice(0, 3).map(Number)
  const expected = String(minimumVersion || '').split('.').slice(0, 3).map(Number)
  if (actual.length === 0 || actual.some(Number.isNaN)) return false
  while (actual.length < 3) actual.push(0)
  while (expected.length < 3) expected.push(0)
  for (let index = 0; index < 3; index += 1) {
    if (actual[index] !== expected[index]) return actual[index] > expected[index]
  }
  return true
}

function getDatabankExtensionVersion() {
  return new Promise((resolve, reject) => {
    const requestId = `ping_auto_calculate_${Date.now()}_${Math.random().toString(36).slice(2)}`
    const cleanup = (handler, timer) => {
      window.removeEventListener('message', handler)
      window.clearTimeout(timer)
    }
    const handleMessage = (event) => {
      if (event.source !== window) return
      const payload = event.data
      if (payload?.source !== EXTENSION_BRIDGE_SOURCE || payload?.requestId !== requestId) return
      cleanup(handleMessage, timeoutId)
      resolve(String(payload.version || ''))
    }
    const timeoutId = window.setTimeout(() => {
      cleanup(handleMessage, timeoutId)
      reject(new Error('未检测到自动化插件'))
    }, EXTENSION_PING_TIMEOUT_MS)

    window.addEventListener('message', handleMessage)
    window.postMessage({
      source: 'cdp-web',
      type: EXTENSION_MESSAGE_TYPE,
      requestId,
      jsonText: '{}',
    }, window.location.origin)
  })
}

async function ensureAutoCalculateExtensionReady() {
  if (!databankAutoCalculate.value) return true
  try {
    const version = await getDatabankExtensionVersion()
    if (isExtensionVersionAtLeast(version, AUTO_CALCULATE_EXTENSION_VERSION)) return true
    ElMessage.warning(`自动计算人数需要 V${AUTO_CALCULATE_EXTENSION_VERSION} 插件；当前为 V${version || '未知'}，请更新并重新加载插件`)
  } catch {
    ElMessage.warning(`未检测到 V${AUTO_CALCULATE_EXTENSION_VERSION} 插件，请更新并重新加载后再试`)
  }
  return false
}

function sendMessageToDatabankExtension(jsonText, autoCalculate = databankAutoCalculate.value) {
  return new Promise((resolve, reject) => {
    const requestId = `databank_${Date.now()}_${Math.random().toString(36).slice(2)}`

    const cleanup = (handler, timer) => {
      window.removeEventListener('message', handler)
      window.clearTimeout(timer)
    }

    const handleMessage = (event) => {
      if (event.source !== window) return
      const payload = event.data
      if (payload?.source !== EXTENSION_BRIDGE_SOURCE) return
      if (payload?.requestId !== requestId) return

      cleanup(handleMessage, timeoutId)
      if (!payload.ok) {
        reject(new Error(payload.error || '自动化圈人失败'))
        return
      }
      if (autoCalculate === true && payload.autoCalculated !== true) {
        reject(new Error(`插件未确认人数计算，请重新加载 V${AUTO_CALCULATE_EXTENSION_VERSION} 插件后重试`))
        return
      }
      resolve(payload)
    }

    const timeoutId = window.setTimeout(() => {
      cleanup(handleMessage, timeoutId)
      reject(new Error('自动化插件响应超时，请确认插件已加载并检查后台日志'))
    }, EXTENSION_RESPONSE_TIMEOUT_MS)

    window.addEventListener('message', handleMessage)
    window.postMessage(
      {
        source: 'cdp-web',
        type: EXTENSION_MESSAGE_TYPE,
        requestId,
        jsonText,
        autoCalculate: autoCalculate === true,
      },
      window.location.origin,
    )
  })
}

function handleDataBankCommand(command) {
  if (command === 'auto') {
    if (isGuidedTutorialStep('start-automation')) {
      completeGuidedTutorialStep('start-automation')
      return
    }
    if (isGuidedTutorialStep('run-first-solution-automation')) {
      completeGuidedTutorialStep('run-first-solution-automation')
      return
    }
    if (isGuidedTutorialStep('run-second-solution-automation')) {
      completeGuidedTutorialStep('run-second-solution-automation')
      return
    }
    if (batchMode.value) {
      if (isGuidedTutorialStep('combo-start-automation')) {
        if (batchEntries.value.length !== 9 || !isParameterBatch.value) {
          ElMessage.warning('请先生成教程指定的九个建包任务')
          return
        }
        openBatchAutomationDialog('all')
        completeGuidedTutorialStep('combo-start-automation')
        return
      }
      if (isGuidedTutorialStep('parameter-start-automation')) {
        if (!parameterTutorialEntriesReady()) {
          ElMessage.warning('请先生成教程指定的 4 个竞争品牌建包任务')
          return
        }
        openBatchAutomationDialog('all')
        completeGuidedTutorialStep('parameter-start-automation')
        return
      }
      if (isGuidedTutorialStep('pull-run-second')) {
        batchEntries.value.forEach((entry) => { entry.automationStatus = 'idle' })
        batchEntries.value = [...batchEntries.value]
      }
      openBatchAutomationDialog(batchFailedCount.value > 0 ? 'failed' : 'all')
      if (isGuidedTutorialStep('pull-run-baseline')) {
        updateGuidedTutorialContext({ pullBatchRound: 'baseline' })
        completeGuidedTutorialStep('pull-run-baseline')
      } else if (isGuidedTutorialStep('pull-run-second')) {
        updateGuidedTutorialContext({ pullBatchRound: 'second' })
        completeGuidedTutorialStep('pull-run-second')
      }
      return
    }
    batchAutomationDialogVisible.value = true
  }
}

function openBatchFailureRecovery() {
  if (!batchMode.value || batchFailedCount.value === 0) return
  openBatchAutomationDialog('failed')
}

function openBatchAutomationDialog(scope = 'all') {
  persistActiveBatchEntry()
  batchAutomationScope.value = scope === 'failed' ? 'failed' : 'all'
  batchAutomationSelectedIndexes.value = batchEntries.value
    .map((entry, index) => ({ entry, index }))
    .filter(({ entry }) => batchAutomationScope.value !== 'failed' || entry.automationStatus === 'failed')
    .map(({ index }) => index)
  batchNamingMessage.value = ''
  batchAutomationDialogVisible.value = true
}

function getBatchCrowdNameIssue(index) {
  const name = String(batchEntries.value[index]?.crowdName || '').trim()
  if (!name) return '请填写人群包名称'
  const duplicateCount = batchEntries.value.filter(
    entry => String(entry?.crowdName || '').trim().toLocaleLowerCase() === name.toLocaleLowerCase(),
  ).length
  return duplicateCount > 1 ? '人群包名称重复' : ''
}

function updateBatchEntryCrowdName(index, value) {
  const entry = batchEntries.value[index]
  if (!entry) return
  const crowdName = String(value || '').slice(0, 80)
  entry.crowdName = crowdName
  if (entry.record) entry.record.defaultCrowdName = crowdName
  if (entry.sourceRecord) entry.sourceRecord.defaultCrowdName = crowdName
  if (entry.generatedJson) entry.generatedJson.crowdName = crowdName
  if (index === activeBatchIndex.value) {
    crowdNameInput.value = crowdName
    if (generatedJson.value) generatedJson.value.crowdName = crowdName
  }
  batchEntries.value = [...batchEntries.value]
}

function buildBatchNamingEntry(entry, index) {
  return {
    id: String(entry?.id || `batch-${index + 1}`),
    currentName: String(entry?.crowdName || ''),
    solutionName: String(entry?.solutionName || entry?.record?.name || ''),
    parameterField: String(parameterBatchFieldName.value || ''),
    parameterValues: Array.isArray(entry?.parameterBatchValues)
      ? entry.parameterBatchValues.slice(0, 20)
      : [],
    nodes: (Array.isArray(entry?.nodes) ? entry.nodes : []).slice(0, 20).map((node, nodeIndex) => ({
      component: String(node?.packageType || ''),
      name: getNodeDisplayName(node, nodeIndex),
      relation: nodeIndex === 0
        ? '起始条件'
        : node?.operator === 'n'
          ? '交集'
          : node?.operator === 'u'
            ? '并集'
            : '差集',
      parameters: getNodeSummary(node).slice(0, 16).map(item => ({
        label: item.label,
        value: item.value,
      })),
    })),
  }
}

async function suggestBatchAudienceNames() {
  if (batchNamingLoading.value || !batchMode.value || batchAutomationSelectedCount.value === 0) return
  batchNamingLoading.value = true
  batchNamingMessage.value = ''
  try {
    const selectedRows = batchAutomationSelectedIndexes.value
      .map(index => ({ entry: batchEntries.value[index], index }))
      .filter(row => row.entry)
    const response = await fetchWithTimeout('/api/ai/batch-names', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        entries: selectedRows.map(row => buildBatchNamingEntry(row.entry, row.index)),
      }),
    })
    const data = await response.json().catch(() => ({}))
    if (!response.ok) throw new Error(data?.message || data?.error || 'AI名称生成失败')
    const indexById = new Map(
      selectedRows.map(row => [String(row.entry.id || `batch-${row.index + 1}`), row.index]),
    )
    let applied = 0
    ;(Array.isArray(data?.suggestions) ? data.suggestions : []).forEach((suggestion) => {
      const index = indexById.get(String(suggestion?.id || ''))
      if (index === undefined || !String(suggestion?.name || '').trim()) return
      updateBatchEntryCrowdName(index, suggestion.name)
      applied += 1
    })
    if (!applied) throw new Error('AI没有返回可用的名称建议')
    batchNamingMessage.value = data?.assistantMessage || `已生成 ${applied} 个名称，可继续逐个修改。`
    ElMessage.success(`已为 ${applied} 个人群包生成名称`)
  } catch (error) {
    batchNamingMessage.value = `${error?.message || 'AI名称生成失败'}；你仍可以手动修改名称。`
    ElMessage.error(batchNamingMessage.value)
  } finally {
    batchNamingLoading.value = false
  }
}

function isBatchAutomationEntrySelected(index) {
  return batchAutomationSelectedIndexes.value.includes(index)
}

function toggleBatchAutomationEntry(index, checked) {
  const selected = new Set(batchAutomationSelectedIndexes.value)
  if (checked) selected.add(index)
  else selected.delete(index)
  batchAutomationSelectedIndexes.value = [...selected].sort((a, b) => a - b)
}

function toggleAllBatchAutomationEntries(checked) {
  batchAutomationSelectedIndexes.value = checked
    ? visibleBatchAutomationEntries.value.map(row => row.index)
    : []
}

function getAutomationStatusLabel(status) {
  return {
    idle: '等待执行',
    running: '执行中',
    success: '已完成',
    failed: '执行失败',
  }[status] || '等待执行'
}

async function confirmBatchAutomation() {
  if (!(await ensureAutoCalculateExtensionReady())) return
  if (!batchMode.value) {
    batchAutomationDialogVisible.value = false
    void startAutoDataBankFlow()
    return
  }
  if (!batchAutomationNamesValid.value) {
    ElMessage.warning('请先处理空名称或重复名称，再开始批量圈人')
    return
  }
  if (isGuidedTutorialStep('combo-confirm-run')) {
    if (batchEntries.value.length !== 9 || !isParameterBatch.value || batchAutomationSelectedCount.value !== 9) {
      ElMessage.warning('请保留九个人群包全部勾选后再开始')
      return
    }
    updateGuidedTutorialContext({ comboCompletedCount: 0, comboError: '' })
    completeGuidedTutorialStep('combo-confirm-run')
  }
  if (isGuidedTutorialStep('parameter-confirm-run')) {
    if (!parameterTutorialEntriesReady()) {
      ElMessage.warning('四个建包任务与教程品牌不一致，请重新生成')
      return
    }
    if (batchAutomationSelectedCount.value !== 4) {
      ElMessage.warning('本次教程要一次圈完四个包，请保留四项全部勾选')
      return
    }
    updateGuidedTutorialContext({
      parameterBatchStatus: 'running',
      parameterBatchCompletedCount: 0,
      parameterBatchFailedNames: [],
      parameterBatchError: '',
    })
    completeGuidedTutorialStep('parameter-confirm-run')
  }
  const tutorialRound = isGuidedTutorialStep('pull-confirm-baseline')
    ? 'baseline'
    : isGuidedTutorialStep('pull-confirm-second')
      ? 'second'
      : ''
  if (tutorialRound) {
    if (batchAutomationSelectedCount.value !== 3) {
      ElMessage.warning('本次教程要一次圈完三个包，请保留三项全部勾选')
      return
    }
    updateGuidedTutorialContext({
      pullBatchStatus: 'running',
      pullBatchCompletedCount: batchEntries.value.filter(entry => entry.automationStatus === 'success').length,
      pullBatchFailedNames: [],
      pullBatchError: '',
      pullBatchRound: tutorialRound,
      ...(tutorialRound === 'baseline'
        ? {
            pullBaselineStatus: 'running',
            pullBaselineCompletedCount: 0,
            pullBaselineFailedNames: [],
            pullBaselineError: '',
          }
        : {
            pullSecondStatus: 'running',
            pullSecondCompletedCount: 0,
            pullSecondFailedNames: [],
            pullSecondError: '',
          }),
    })
    completeGuidedTutorialStep(
      tutorialRound === 'baseline' ? 'pull-confirm-baseline' : 'pull-confirm-second',
    )
  }
  batchAutomationDialogVisible.value = false
  void startBatchAutomationFlow(batchAutomationScope.value, batchAutomationSelectedIndexes.value)
}

function syncPullBatchTutorialStatus(errorMessage = '') {
  const succeeded = batchEntries.value.filter(entry => entry.automationStatus === 'success')
  const failed = batchEntries.value.filter(entry => entry.automationStatus === 'failed')
  const running = batchEntries.value.some(entry => entry.automationStatus === 'running')
  const allSucceeded = batchEntries.value.length > 0 && succeeded.length === batchEntries.value.length
  if (isGuidedTutorialStep('combo-wait')) {
    updateGuidedTutorialContext({ comboCompletedCount: succeeded.length, comboError: errorMessage })
    if (batchEntries.value.length === 9 && allSucceeded) completeGuidedTutorialStep('combo-wait')
    return
  }
  const status = allSucceeded
    ? 'completed'
    : running
      ? 'running'
      : failed.length > 0
        ? (succeeded.length > 0 ? 'partial' : 'failed')
        : 'idle'
  if (isParameterBatchTutorialActive()) {
    const progress = getParameterTutorialProgress(batchEntries.value, {
      batchKind: batchKind.value,
      running: databankAutomating.value,
      errorMessage,
    })
    updateGuidedTutorialContext(progress)
    if (progress.parameterBatchStatus === 'completed' && isGuidedTutorialStep('parameter-wait-automation')) {
      completeGuidedTutorialStep('parameter-wait-automation')
    }
    return
  }
  if (!isPullAnalysisTutorialActive()) return
  const round = guidedTutorialState.context.pullBatchRound
  const roundPatch = round === 'baseline'
    ? {
        pullBaselineStatus: status,
        pullBaselineCompletedCount: succeeded.length,
        pullBaselineFailedNames: failed.map(entry => entry.crowdName || entry.solutionName || '未命名人群包'),
        pullBaselineError: errorMessage,
      }
    : round === 'second'
      ? {
          pullSecondStatus: status,
          pullSecondCompletedCount: succeeded.length,
          pullSecondFailedNames: failed.map(entry => entry.crowdName || entry.solutionName || '未命名人群包'),
          pullSecondError: errorMessage,
        }
      : {}
  updateGuidedTutorialContext({
    pullBatchStatus: status,
    pullBatchCompletedCount: succeeded.length,
    pullBatchFailedNames: failed.map(entry => entry.crowdName || entry.solutionName || '未命名人群包'),
    pullBatchError: errorMessage,
    ...roundPatch,
  })
  if (allSucceeded && round === 'baseline' && isGuidedTutorialStep('pull-wait-baseline')) {
    completeGuidedTutorialStep('pull-wait-baseline')
  }
  if (allSucceeded && round === 'second' && isGuidedTutorialStep('pull-wait-second')) {
    completeGuidedTutorialStep('pull-wait-second')
  }
}

async function startBatchAutomationFlow(scope = 'current', selectedIndexes = null) {
  if (databankAutomating.value || !batchMode.value) return

  const targetIndexes = Array.isArray(selectedIndexes)
    ? [...new Set(selectedIndexes)]
        .filter(index => Number.isInteger(index) && index >= 0 && index < batchEntries.value.length)
        .sort((a, b) => a - b)
    : scope === 'all'
      ? batchEntries.value.map((_entry, index) => index)
      : scope === 'failed'
        ? batchEntries.value
            .map((entry, index) => ({ entry, index }))
            .filter(({ entry }) => entry.automationStatus === 'failed')
            .map(({ index }) => index)
        : [activeBatchIndex.value]
  if (targetIndexes.length === 0) {
    syncPullBatchTutorialStatus()
    ElMessage.info('当前没有需要重试的失败任务')
    return
  }
  databankAutomating.value = true
  const pendingMessage = ElMessage({
    message: `正在自动化圈人：0 / ${targetIndexes.length}`,
    type: 'info',
    duration: 0,
  })

  let completed = 0
  let lastErrorMessage = ''
  try {
    for (const index of targetIndexes) {
      const entry = batchEntries.value[index]
      entry.automationStatus = 'running'
      entry.automationError = ''
      entry.automationInterrupted = false
      batchEntries.value = [...batchEntries.value]
      syncPullBatchTutorialStatus()
      try {
        await activateBatchEntry(index)
      } catch (error) {
        entry.automationStatus = 'failed'
        lastErrorMessage = error?.message || '任务准备失败，请稍后重试'
        entry.automationError = lastErrorMessage
        syncPullBatchTutorialStatus(lastErrorMessage)
        continue
      }
      pendingMessage.close()

      if (!ensureGeneratedOutputReady('自动化执行')) {
        entry.automationStatus = 'failed'
        lastErrorMessage = '生成接口暂未就绪，请稍后重试'
        entry.automationError = lastErrorMessage
        batchEntries.value = [...batchEntries.value]
        syncPullBatchTutorialStatus(lastErrorMessage)
        continue
      }

      const currentPendingMessage = ElMessage({
        message: `正在圈选“${entry.crowdName}” · ${completed + 1}/${targetIndexes.length}`,
        type: 'info',
        duration: 0,
      })
      try {
        const result = await sendMessageToDatabankExtension(getGeneratedJsonText())
        if (!result?.ok) {
          throw new Error(result?.error || result?.message || '自动化圈人失败')
        }
        entry.automationStatus = 'success'
        entry.automationError = ''
        completed += 1
        currentPendingMessage.close()
      } catch (error) {
        entry.automationStatus = 'failed'
        currentPendingMessage.close()
        batchEntries.value = [...batchEntries.value]
        lastErrorMessage = error?.message || '自动化圈人失败'
        entry.automationError = lastErrorMessage
        syncPullBatchTutorialStatus(lastErrorMessage)
        continue
      }
      batchEntries.value = [...batchEntries.value]
      syncPullBatchTutorialStatus()
    }

    const failedCount = targetIndexes.filter(index => batchEntries.value[index]?.automationStatus === 'failed').length
    if (failedCount > 0) {
      ElMessage.warning(`已完成 ${completed} 个，${failedCount} 个执行失败，可仅重试失败任务`)
    } else {
      ElMessage.success(`已完成 ${completed} 个人群包的自动化圈人`)
    }
  } catch (error) {
    ElMessage.error(
      `${activeBatchEntry.value?.crowdName || '当前人群包'}执行失败：${error?.message || '请稍后重试'}`,
    )
  } finally {
    pendingMessage.close()
    databankAutomating.value = false
    syncPullBatchTutorialStatus(lastErrorMessage)
  }
}

function retryPullAnalysisBatch() {
  void startBatchAutomationFlow('failed')
}

async function startAutoDataBankFlow() {
  if (databankAutomating.value) return { ok: false, error: '自动化任务正在执行中' }
  await buildFinalJson()
  if (!ensureGeneratedOutputReady('自动化执行')) {
    return { ok: false, error: '当前参数还没有通过执行前检查' }
  }

  databankAutomating.value = true
  const pendingMessage = ElMessage({
    message: '自动化圈人后台处理中，请稍候...',
    type: 'info',
    duration: 0,
  })
  try {
    const result = await sendMessageToDatabankExtension(getGeneratedJsonText())
    if (!result?.ok) {
      pendingMessage.close()
      const errorMessage = result?.error || result?.message || '自动化圈人失败'
      ElMessage.error(errorMessage)
      return { ok: false, error: errorMessage }
    }
    pendingMessage.close()
    ElMessage.success(result?.message || '已完成自动化圈人操作')
    return { ok: true, message: result?.message || '已完成自动化圈人操作' }
  } catch (error) {
    pendingMessage.close()
    const errorMessage = error?.message || '自动化圈人失败'
    ElMessage.error(errorMessage)
    return { ok: false, error: errorMessage }
  } finally {
    databankAutomating.value = false
  }
}

function getSolutionTutorialSnapshot(run) {
  const [ownNode, competitorNode] = nodeList.value
  const firstValue = (node, key) => getArray(node?.formData?.[key])[0] || ''
  const category = run === 'first'
    ? SOLUTION_REUSE_TUTORIAL_VALUES.initialCategory
    : SOLUTION_REUSE_TUTORIAL_VALUES.secondCategory
  const competitorBrand = run === 'first'
    ? SOLUTION_REUSE_TUTORIAL_VALUES.initialCompetitorBrand
    : SOLUTION_REUSE_TUTORIAL_VALUES.secondCompetitorBrand
  const crowdName = run === 'first'
    ? SOLUTION_REUSE_TUTORIAL_VALUES.defaultCrowdName
    : SOLUTION_REUSE_TUTORIAL_VALUES.secondCrowdName
  const timeIsReady = (node) => {
    const timeField = node?.schema?.find(field => field.key === 'time' || field.Widget_Type === '日期_切换')
    const timeKey = timeField?.key || 'time'
    return node?.modeData?.[timeKey] === 'recent'
      && Number(node?.formData?.[timeKey]?.days) === SOLUTION_REUSE_TUTORIAL_VALUES.recentDays
  }
  const valid = workbenchMode.value === 'solution-use'
    && Boolean(currentSolution.value?.id)
    && nodeList.value.length === 2
    && ownNode?.packageType === SOLUTION_REUSE_TUTORIAL_VALUES.packageType
    && competitorNode?.packageType === SOLUTION_REUSE_TUTORIAL_VALUES.packageType
    && competitorNode?.operator === 'n'
    && getArray(ownNode?.formData?.bhv).includes(SOLUTION_REUSE_TUTORIAL_VALUES.behavior)
    && getArray(competitorNode?.formData?.bhv).includes(SOLUTION_REUSE_TUTORIAL_VALUES.behavior)
    && firstValue(ownNode, 'leafCates') === category
    && firstValue(competitorNode, 'leafCates') === category
    && firstValue(ownNode, 'stdBrand') === SOLUTION_REUSE_TUTORIAL_VALUES.ownBrand
    && firstValue(competitorNode, 'stdBrand') === competitorBrand
    && getArray(ownNode?.formData?.channel).includes(SOLUTION_REUSE_TUTORIAL_VALUES.channel)
    && getArray(competitorNode?.formData?.channel).includes(SOLUTION_REUSE_TUTORIAL_VALUES.channel)
    && timeIsReady(ownNode)
    && timeIsReady(competitorNode)
    && String(crowdNameInput.value || '').trim() === crowdName
    && derivedSolutionMeta.hasStructureChanges === false

  return {
    valid,
    run,
    solutionId: String(currentSolution.value?.id || ''),
    category,
    ownBrand: firstValue(ownNode, 'stdBrand'),
    competitorBrand: firstValue(competitorNode, 'stdBrand'),
    crowdName: String(crowdNameInput.value || '').trim(),
    nodeCount: nodeList.value.length,
    structureChanged: derivedSolutionMeta.hasStructureChanges,
  }
}

async function handleSolutionTutorialAutomationConfirmed(event) {
  const run = event?.detail?.run === 'second' ? 'second' : 'first'
  const waitStep = run === 'first'
    ? 'wait-first-solution-automation'
    : 'wait-second-solution-automation'
  if (!isGuidedTutorialStep(waitStep)) return

  const snapshot = getSolutionTutorialSnapshot(run)
  if (!snapshot.valid) {
    const patch = run === 'first'
      ? { firstAutomationStatus: 'failed', firstAutomationError: '当前方案参数与教程任务不一致，请检查两个节点、交集关系和人群包名称后重试。' }
      : { secondAutomationStatus: 'failed', secondAutomationError: '第二次参数尚未完整同步，请确认两个类目都已更新、竞品为 CPB，且没有新增节点。' }
    updateGuidedTutorialContext(patch)
    return
  }

  const result = await startAutoDataBankFlow()
  if (!result?.ok) {
    updateGuidedTutorialContext(run === 'first'
      ? { firstAutomationStatus: 'failed', firstAutomationError: result?.error || '第一次自动化圈人失败，请检查后重试。' }
      : { secondAutomationStatus: 'failed', secondAutomationError: result?.error || '第二次自动化圈人失败，请检查后重试。' })
    return
  }

  if (run === 'first') {
    updateGuidedTutorialContext({
      firstAutomationStatus: 'success',
      firstAutomationError: '',
      firstAutomationSnapshot: snapshot,
    })
    completeGuidedTutorialStep(waitStep)
    return
  }

  const first = guidedTutorialState.context.firstAutomationSnapshot
  const resultsAreDistinct = first
    && first.solutionId === snapshot.solutionId
    && first.category !== snapshot.category
    && first.competitorBrand !== snapshot.competitorBrand
    && first.crowdName !== snapshot.crowdName
    && first.nodeCount === snapshot.nodeCount
  if (!resultsAreDistinct) {
    updateGuidedTutorialContext({
      secondAutomationStatus: 'failed',
      secondAutomationError: '两次结果未形成“同一方案、不同参数”的有效对照，请检查后重试。',
    })
    return
  }
  updateGuidedTutorialContext({
    secondAutomationStatus: 'success',
    secondAutomationError: '',
    secondAutomationSnapshot: snapshot,
  })
  completeGuidedTutorialStep(waitStep)
}

async function handleTutorialAutomationConfirmed() {
  if (!isGuidedTutorialStep('automation-running')) return
  updateGuidedTutorialContext({ automationStatus: 'running', automationError: '' })
  const result = await startAutoDataBankFlow()
  if (result?.ok) {
    updateGuidedTutorialContext({ automationStatus: 'success', automationError: '' })
    completeGuidedTutorialStep('automation-running')
    return
  }
  updateGuidedTutorialContext({
    automationStatus: 'failed',
    automationError: result?.error || '自动化圈人失败，请检查后重试。',
  })
}

function serializeBatchEntryForSession(entry, index) {
  const isActive = index === activeBatchIndex.value
  const nodes = isActive ? nodeList.value : entry?.nodes
  const record = isActive ? currentSolution.value : entry?.record
  const crowdName = isActive ? crowdNameInput.value : entry?.crowdName
  const entryGeneratedJson = isActive ? generatedJson.value : entry?.generatedJson

  return {
    ...cloneValue(entry || {}),
    record: cloneValue(record),
    sourceRecord: cloneValue(entry?.sourceRecord),
    crowdName: String(crowdName || '').trim(),
    nodes: serializeNodesForSolution(nodes),
    sourceNodes: serializeNodesForSolution(entry?.sourceNodes),
    generatedJson: cloneValue(entryGeneratedJson),
  }
}

function buildWorkbenchSessionPayload() {
  return {
    version: WORKBENCH_SESSION_VERSION,
    savedAt: new Date().toISOString(),
    workbenchMode: workbenchMode.value,
    nodeList: serializeNodesForSolution(nodeList.value),
    emptyOperationPools: cloneValue(toRaw(emptyOperationPools.value)),
    crowdNameInput: crowdNameInput.value,
    currentSolution: cloneValue(currentSolution.value),
    loadedSolutionRecord: cloneValue(loadedSolutionRecord.value),
    loadedSolutionFieldIds: [...loadedSolutionFieldIds.value],
    generatedJson: cloneValue(generatedJson.value),
    derivedSolutionMeta: cloneValue(toRaw(derivedSolutionMeta)),
    ui: {
      jsonViewMode: jsonViewMode.value,
      publishedLibraryScope: publishedLibraryScope.value,
      pkgSearch: pkgSearch.value,
      solutionSearch: solutionSearch.value,
      leftPanelMode: leftPanelMode.value,
      activeNodeIndex: activeNodeIndex.value,
      selectedPublishedFolderId: selectedPublishedFolderId.value,
      highlightedCfId: highlightedCfId.value,
      collapsedCfId: collapsedCfId.value,
    },
    batch: {
      enabled: batchMode.value,
      kind: batchKind.value,
      entries: batchEntries.value.map(serializeBatchEntryForSession),
      activeIndex: activeBatchIndex.value,
      folderName: batchFolderName.value,
      sourceFolderId: batchSourceFolderId.value,
      automationScope: batchAutomationScope.value,
      parameterFieldName: parameterBatchFieldName.value,
      parameterFieldId: parameterBatchFieldId.value,
    },
  }
}

function persistWorkbenchSession() {
  if (sessionRestorePending || sessionPersistenceDisabled || !props.sessionOwnerId) return
  writeSessionWorkspace(
    WORKBENCH_SESSION_KEY,
    props.sessionOwnerId,
    buildWorkbenchSessionPayload(),
  )
}

function scheduleWorkbenchSessionSave() {
  if (sessionRestorePending || sessionPersistenceDisabled) return
  clearTimeout(sessionSaveTimer)
  sessionSaveTimer = setTimeout(persistWorkbenchSession, 250)
}

async function restoreWorkbenchSession() {
  const stored = readSessionWorkspace(WORKBENCH_SESSION_KEY, props.sessionOwnerId)
  if (!stored) return false
  if (stored.version !== WORKBENCH_SESSION_VERSION) {
    removeSessionWorkspace(WORKBENCH_SESSION_KEY)
    return false
  }

  snapshotPaused.value = true
  try {
    const ui = stored.ui || {}
    emptyOperationPools.value = []
    jsonViewMode.value = ['summary', 'json'].includes(ui.jsonViewMode) ? ui.jsonViewMode : 'summary'
    publishedLibraryScope.value = ['mine', 'public'].includes(ui.publishedLibraryScope)
      ? ui.publishedLibraryScope
      : 'mine'
    pkgSearch.value = String(ui.pkgSearch || '')
    solutionSearch.value = String(ui.solutionSearch || '')
    leftPanelMode.value = ['packages', 'solutions'].includes(ui.leftPanelMode)
      ? ui.leftPanelMode
      : 'packages'
    selectedPublishedFolderId.value = ui.selectedPublishedFolderId || null
    highlightedCfId.value = ui.highlightedCfId || null
    collapsedCfId.value = ui.collapsedCfId || null

    const savedBatchEntries = Array.isArray(stored.batch?.entries) ? stored.batch.entries : []
    if (stored.batch?.enabled && savedBatchEntries.length > 0) {
      const restoredEntries = []
      for (const entry of savedBatchEntries) {
        const [nodes, sourceNodes] = await Promise.all([
          hydrateNodes(entry?.nodes || []),
          hydrateNodes(entry?.sourceNodes || entry?.nodes || []),
        ])
        const wasInterrupted = entry?.automationStatus === 'running'
        restoredEntries.push({
          ...cloneValue(entry),
          nodes,
          sourceNodes,
          automationStatus: wasInterrupted ? 'failed' : (entry?.automationStatus || 'idle'),
          automationInterrupted: wasInterrupted || entry?.automationInterrupted === true,
          automationError: wasInterrupted
            ? '上次执行在完成前中断，请仅重试该任务'
            : String(entry?.automationError || ''),
        })
      }
      batchEntries.value = restoredEntries
      activeBatchIndex.value = Math.min(
        Math.max(Number(stored.batch.activeIndex) || 0, 0),
        restoredEntries.length - 1,
      )
      batchFolderName.value = String(stored.batch.folderName || '')
      batchSourceFolderId.value = stored.batch.sourceFolderId || null
      batchAutomationScope.value = ['all', 'failed'].includes(stored.batch.automationScope)
        ? stored.batch.automationScope
        : 'current'
      batchKind.value = stored.batch.kind === 'parameter' ? 'parameter' : 'solutions'
      parameterBatchFieldName.value = String(stored.batch.parameterFieldName || '')
      parameterBatchFieldId.value = String(stored.batch.parameterFieldId || '')
      batchMode.value = true

      const activeEntry = restoredEntries[activeBatchIndex.value]
      nodeList.value = activeEntry.nodes
      currentSolution.value = activeEntry.record || null
      loadedSolutionRecord.value = activeEntry.sourceRecord || null
      loadedSolutionFieldIds.value = normalizeWorkbenchFieldIds(
        activeEntry.record?.workbenchFieldIds || [],
        activeEntry.nodes,
      )
      crowdNameInput.value = String(activeEntry.crowdName || '')
      generatedJson.value = activeEntry.generatedJson || {
        crowdName: crowdNameInput.value || DEFAULT_CROWD_NAME,
        list: [],
        compute: '',
      }
      workbenchMode.value = 'solution-use'
    } else {
      resetBatchContext()
      nodeList.value = await hydrateNodes(stored.nodeList || [])
      emptyOperationPools.value = (Array.isArray(stored.emptyOperationPools)
        ? stored.emptyOperationPools
        : []).map((pool) => ({
        id: String(pool?.id || createOperationPoolId('restored-empty')),
        type: pool?.type === 'u' ? 'u' : 'n',
        operator: ['n', 'u', 'd'].includes(pool?.operator) ? pool.operator : 'n',
      }))
      currentSolution.value = cloneValue(stored.currentSolution)
      loadedSolutionRecord.value = cloneValue(stored.loadedSolutionRecord)
      loadedSolutionFieldIds.value = normalizeWorkbenchFieldIds(
        stored.loadedSolutionFieldIds || [],
        nodeList.value,
      )
      crowdNameInput.value = String(stored.crowdNameInput || '')
      generatedJson.value = stored.generatedJson || {
        crowdName: crowdNameInput.value || DEFAULT_CROWD_NAME,
        list: [],
        compute: '',
      }
      workbenchMode.value = stored.workbenchMode === 'solution-use' ? 'solution-use' : 'free-build'
      ensureDefaultOperationPool()
    }

    Object.assign(derivedSolutionMeta, {
      sourceSolutionId: stored.derivedSolutionMeta?.sourceSolutionId || null,
      sourceSolutionVersion: stored.derivedSolutionMeta?.sourceSolutionVersion ?? null,
      sourceSolutionName: stored.derivedSolutionMeta?.sourceSolutionName || '',
      hasStructureChanges: stored.derivedSolutionMeta?.hasStructureChanges === true,
      hasParamChanges: stored.derivedSolutionMeta?.hasParamChanges === true,
    })
    activeNodeIndex.value = Math.min(
      Math.max(Number(ui.activeNodeIndex) || 0, 0),
      Math.max(nodeList.value.length - 1, 0),
    )
    nodeRefs.value = {}
    await nextTick()
    resetHistory()
    return true
  } catch {
    removeSessionWorkspace(WORKBENCH_SESSION_KEY)
    nodeList.value = []
    crowdNameInput.value = ''
    generatedJson.value = { crowdName: DEFAULT_CROWD_NAME, list: [], compute: '' }
    resetWorkbenchContext()
    ElMessage.warning('上次圈包画布恢复失败，已回到安全的空白状态')
    return false
  } finally {
    snapshotPaused.value = false
  }
}

function handleKeydown(event) {
  if ((event.ctrlKey || event.metaKey) && event.key === 'z' && !event.shiftKey) {
    event.preventDefault()
    undo()
  }
  if ((event.ctrlKey || event.metaKey) && ((event.key === 'z' && event.shiftKey) || event.key === 'Z')) {
    event.preventDefault()
    redo()
  }
}

function syncGuidedTutorialContext() {
  if (!guidedTutorialState.active) return
  if (guidedTutorialState.taskId === PARAMETER_BATCH_TUTORIAL_ID) {
    const tutorialNode = nodeList.value.find(
      node => node.packageType === PARAMETER_BATCH_TUTORIAL_VALUES.packageType,
    )
    const timeField = tutorialNode?.schema?.find(
      field => field.key === 'time' || field.Widget_Type === '日期_切换',
    )
    const timeKey = timeField?.key || 'time'
    updateGuidedTutorialContext({
      nodeCount: nodeList.value.length,
      behaviors: Array.isArray(tutorialNode?.formData?.bhv)
        ? [...tutorialNode.formData.bhv]
        : [],
      recentDays: tutorialNode?.formData?.[timeKey]?.days ?? null,
      dateMode: tutorialNode?.modeData?.[timeKey] || '',
      dateRange: Array.isArray(tutorialNode?.formData?.[timeKey]?.dateRange)
        ? [...tutorialNode.formData[timeKey].dateRange]
        : [],
      audienceName: String(crowdNameInput.value || ''),
      solutionId: String(currentSolution.value?.id || guidedTutorialState.context.solutionId || ''),
      solutionName: String(currentSolution.value?.name || ''),
      defaultCrowdName: String(crowdNameInput.value || ''),
    })
    return
  }
  if (guidedTutorialState.taskId === PULL_ANALYSIS_GROUP_TUTORIAL_ID) {
    updateGuidedTutorialContext({
      pullNodeCount: batchMode.value
        ? batchEntries.value.reduce((sum, entry) => sum + (entry.nodes?.length || 0), 0)
        : nodeList.value.length,
      pullOperators: nodeList.value.slice(1).map(node => node?.operator || ''),
      solutionName: String(currentSolution.value?.name || ''),
      defaultCrowdName: String(crowdNameInput.value || ''),
    })
    return
  }
  if (guidedTutorialState.taskId === SOLUTION_REUSE_TUTORIAL_ID) {
    const tutorialNodes = nodeList.value.filter(
      node => node.packageType === SOLUTION_REUSE_TUTORIAL_VALUES.packageType,
    )
    const ownNode = tutorialNodes[0]
    const timeField = ownNode?.schema?.find(
      field => field.key === 'time' || field.Widget_Type === '日期_切换',
    )
    const timeKey = timeField?.key || 'time'
    updateGuidedTutorialContext({
      nodeCount: nodeList.value.length,
      solutionNodeCount: tutorialNodes.length,
      solutionOperator: tutorialNodes[1]?.operator || '',
      recentDays: ownNode?.formData?.[timeKey]?.days ?? null,
      dateMode: ownNode?.modeData?.[timeKey] || '',
      dateRange: Array.isArray(ownNode?.formData?.[timeKey]?.dateRange)
        ? [...ownNode.formData[timeKey].dateRange]
        : [],
      audienceName: String(crowdNameInput.value || ''),
      solutionId: String(currentSolution.value?.id || guidedTutorialState.context.solutionId || ''),
      solutionStructureChanged: derivedSolutionMeta.hasStructureChanges,
    })
    return
  }
  const tutorialNode = nodeList.value.find((node) => node.packageType === CATEGORY_ITEM_PACKAGE)
  const timeField = tutorialNode?.schema?.find((field) => field.key === 'time' || field.Widget_Type === '日期_切换')
  const timeKey = timeField?.key || 'time'
  updateGuidedTutorialContext({
    nodeCount: nodeList.value.length,
    behaviors: Array.isArray(tutorialNode?.formData?.bhv)
      ? [...tutorialNode.formData.bhv]
      : [],
    recentDays: tutorialNode?.formData?.[timeKey]?.days ?? null,
    dateMode: tutorialNode?.modeData?.[timeKey] || '',
    dateRange: Array.isArray(tutorialNode?.formData?.[timeKey]?.dateRange)
      ? [...tutorialNode.formData[timeKey].dateRange]
      : [],
    audienceName: String(crowdNameInput.value || ''),
  })
}

watch(
  () => guidedTutorialState.active,
  async (active) => {
    if (!active) return
    if (guidedTutorialState.resumed) {
      await restoreWorkbenchSession()
    } else {
      leftPanelMode.value = 'packages'
      pkgSearch.value = ''
      prepareCleanGuidedTutorialWorkbench()
    }
    await nextTick()
    syncGuidedTutorialContext()
  },
  { immediate: true },
)

watch(
  [nodeList, crowdNameInput],
  syncGuidedTutorialContext,
  { deep: true, immediate: true },
)

watch(
  () => guidedTutorialStep.value?.id,
  async () => {
    // Some tutorial actions both mutate the canvas and advance the step in the
    // same event loop. Re-read the rendered canvas on step entry so a default
    // operator such as intersection is not left behind in stale tutorial state.
    await nextTick()
    syncGuidedTutorialContext()
  },
  { flush: 'post' },
)

watch(
  [nodeList, crowdNameInput, emptyOperationPools],
  ([nextNodes]) => {
    enforceWorkbenchFieldConstraints(nextNodes)
    clearTimeout(jsonTimer)
    jsonTimer = setTimeout(async () => {
      await buildFinalJson()
    }, 300)

    if (!snapshotPaused.value && !batchMode.value) {
      markDerivedParamChange()
      debouncedSnapshot()
    }
    scheduleWorkbenchSessionSave()
  },
  { deep: true },
)

watch(
  [
    workbenchMode,
    currentSolution,
    loadedSolutionRecord,
    loadedSolutionFieldIds,
    jsonViewMode,
    publishedLibraryScope,
    pkgSearch,
    solutionSearch,
    leftPanelMode,
    activeNodeIndex,
    selectedPublishedFolderId,
    highlightedCfId,
    collapsedCfId,
    batchMode,
    batchKind,
    batchEntries,
    activeBatchIndex,
    batchFolderName,
    batchSourceFolderId,
    batchAutomationScope,
    parameterBatchFieldName,
    parameterBatchFieldId,
    emptyOperationPools,
  ],
  scheduleWorkbenchSessionSave,
  { deep: true },
)

watch(customFieldSections, () => {
  nextTick(() => updateCfOverflow())
})

watch(cfHiddenCount, (newVal, oldVal) => {
  if (newVal !== oldVal && newVal > 0 && overflowBtnRef.value) {
    overflowBtnRef.value.classList.remove('count-bounce')
    void overflowBtnRef.value.offsetWidth
    overflowBtnRef.value.classList.add('count-bounce')
  }
})

let configRefreshInFlight = false

async function handleConfigVersionChanged(event) {
  if (configRefreshInFlight) return
  configRefreshInFlight = true
  const previousSnapshotPause = snapshotPaused.value
  try {
    await preloadAllPackageMeta()
    if (nodeList.value.length) {
      const currentNodes = nodeList.value
      const refreshedNodes = await hydrateNodes(currentNodes)
      snapshotPaused.value = true
      nodeList.value = currentNodes.map((node, index) => {
        const refreshed = refreshedNodes[index]
        if (!refreshed || refreshed._hydrationError) return node
        return {
          ...node,
          schema: refreshed.schema,
          logicMatrix: refreshed.logicMatrix,
          formData: refreshed.formData,
          modeData: refreshed.modeData,
        }
      })
      await nextTick()
      resetHistory()
    }
    ElMessage.success(`配置 V${event.detail?.version ?? 0} 已自动同步`)
  } catch (error) {
    ElMessage.warning(error.message || '新配置同步失败，请刷新页面重试')
  } finally {
    snapshotPaused.value = previousSnapshotPause
    configRefreshInFlight = false
  }
}

function disableSessionPersistence() {
  sessionPersistenceDisabled = true
  clearTimeout(sessionSaveTimer)
}

onMounted(async () => {
  window.addEventListener(CONFIG_VERSION_EVENT, handleConfigVersionChanged)
  window.addEventListener('cdp:workspace-session-clearing', disableSessionPersistence)
  window.addEventListener('cdp:tutorial-confirm-automation', handleTutorialAutomationConfirmed)
  window.addEventListener('cdp:tutorial-confirm-solution-automation', handleSolutionTutorialAutomationConfirmed)
  window.addEventListener('cdp:tutorial-retry-pull-batch', retryPullAnalysisBatch)
  void preloadAllPackageMeta().catch(() => {
    // Individual component loads remain available if background preloading fails.
  })
  await Promise.all([loadPackages(), loadPublishedSolutions()])
  const restored = await restoreWorkbenchSession()
  sessionRestorePending = false
  if (queuedAiCommand) {
    const command = queuedAiCommand
    queuedAiCommand = null
    await consumeAiCommand(command)
  }
  if (guidedTutorialState.active) {
    leftPanelMode.value = 'packages'
    pkgSearch.value = ''
    prepareCleanGuidedTutorialWorkbench()
    resetHistory()
    syncGuidedTutorialContext()
  } else if (!restored) {
    resetHistory()
  }
  scheduleWorkbenchSessionSave()
  window.addEventListener('keydown', handleKeydown)
  window.addEventListener('beforeunload', persistWorkbenchSession)
  cfResizeObserver = new ResizeObserver(() => {
    nextTick(() => updateCfOverflow())
  })
  if (cfCardsBarRef.value) {
    cfResizeObserver.observe(cfCardsBarRef.value)
  }
})

onActivated(() => {
  if (
    (isSolutionReuseTutorialActive() || isParameterBatchTutorialActive())
    && ['open-solution-picker', 'load-tutorial-solution'].some(step => isGuidedTutorialStep(step))
  ) {
    void loadPublishedSolutions({ fresh: true })
  }
  if (
    isPullAnalysisTutorialActive()
    && [
      'pull-open-picker-base',
      'pull-load-base-solution',
      'pull-load-own-solution',
      'pull-open-picker-group',
      'pull-open-group-preview',
    ].some(step => isGuidedTutorialStep(step))
  ) {
    publishedLibraryScope.value = 'mine'
    void loadPublishedSolutions({ fresh: true })
  }
})

onBeforeUnmount(() => {
  clearTimeout(saveTimer)
  clearTimeout(jsonTimer)
  clearTimeout(sessionSaveTimer)
  persistWorkbenchSession()
  publishedSolutionsAbort?.abort()
  jsonBuildAbort?.abort()
  window.removeEventListener('keydown', handleKeydown)
  window.removeEventListener('beforeunload', persistWorkbenchSession)
  window.removeEventListener('cdp:workspace-session-clearing', disableSessionPersistence)
  window.removeEventListener('cdp:tutorial-confirm-automation', handleTutorialAutomationConfirmed)
  window.removeEventListener('cdp:tutorial-confirm-solution-automation', handleSolutionTutorialAutomationConfirmed)
  window.removeEventListener('cdp:tutorial-retry-pull-batch', retryPullAnalysisBatch)
  window.removeEventListener(CONFIG_VERSION_EVENT, handleConfigVersionChanged)
  if (cfResizeObserver) {
    cfResizeObserver.disconnect()
    cfResizeObserver = null
  }
})
</script>

<style scoped>
.ai-library-launcher {
  position: relative;
  display: grid;
  width: 100%;
  grid-template-columns: 43px minmax(0, 1fr) 24px;
  align-items: center;
  gap: 11px;
  min-height: 82px;
  margin: 1px 0 15px;
  padding: 12px 12px 12px 13px;
  overflow: hidden;
  color: #20283a;
  font: inherit;
  text-align: left;
  background:
    radial-gradient(circle at 100% 0, rgba(63, 112, 255, .16), transparent 44%),
    linear-gradient(145deg, #f8faff, #eef3ff);
  border: 1px solid rgba(63, 112, 255, .22);
  border-radius: 14px;
  box-shadow: 0 10px 26px rgba(45, 66, 115, .08), inset 0 1px 0 rgba(255, 255, 255, .9);
  cursor: pointer;
  transition: transform .2s ease, border-color .2s ease, box-shadow .2s ease;
}

.ai-library-launcher::after {
  position: absolute;
  right: -28px;
  bottom: -38px;
  width: 88px;
  height: 88px;
  content: '';
  border: 1px solid rgba(63, 112, 255, .12);
  border-radius: 50%;
  box-shadow: 0 0 0 12px rgba(63, 112, 255, .025);
}

.ai-library-launcher:hover:not(:disabled) {
  transform: translateY(-2px);
  border-color: rgba(63, 112, 255, .42);
  box-shadow: 0 15px 34px rgba(45, 66, 115, .13), inset 0 1px 0 #fff;
}

.ai-library-launcher:focus-visible {
  outline: 3px solid rgba(63, 112, 255, .2);
  outline-offset: 2px;
}

.ai-library-launcher:disabled {
  opacity: .42;
  cursor: not-allowed;
}

.ai-library-sigil {
  position: relative;
  display: grid;
  width: 43px;
  height: 43px;
  place-items: center;
  color: #fff;
  background: linear-gradient(145deg, #4a79ff, #315dd8);
  border-radius: 13px 13px 4px 13px;
  box-shadow: 0 8px 18px rgba(63, 112, 255, .24);
}

.ai-library-sigil b {
  z-index: 1;
  font: 800 10px/1 "DIN Alternate", ui-monospace, monospace;
  letter-spacing: .08em;
}

.ai-library-sigil i {
  position: absolute;
  width: 3px;
  height: 3px;
  background: rgba(255, 255, 255, .8);
  border-radius: 50%;
}

.ai-library-sigil i:nth-child(1) { transform: translate(-11px, -10px); }
.ai-library-sigil i:nth-child(2) { transform: translate(12px, -4px); }
.ai-library-sigil i:nth-child(3) { transform: translate(8px, 12px); background: #ffbd98; }

.ai-library-copy { display: grid; min-width: 0; gap: 2px; }
.ai-library-copy strong { color: #1a2131; font-size: 15px; font-weight: 720; letter-spacing: -.02em; }
.ai-library-copy small { overflow: hidden; color: #707a91; font-size: 10px; line-height: 1.45; text-overflow: ellipsis; white-space: nowrap; }
.ai-library-kicker { display: inline-flex; align-items: center; gap: 5px; margin-bottom: 1px; color: #4969bc; font: 700 8px/1.3 "DIN Alternate", ui-monospace, monospace; letter-spacing: .08em; }
.ai-library-kicker i { width: 5px; height: 5px; background: #3f70ff; border-radius: 50%; box-shadow: 0 0 0 3px rgba(63, 112, 255, .1); animation: ai-library-online 1.8s ease-in-out infinite; }
.ai-library-arrow { z-index: 1; color: #6e82b7; font-size: 17px; transition: color .2s ease, transform .2s ease; }
.ai-library-launcher:hover:not(:disabled) .ai-library-arrow { color: #315fdc; transform: translate(2px, -2px); }

.package-library-divider { display: flex; align-items: center; gap: 9px; margin: 0 0 10px; color: #9399a7; font-size: 9px; }
.package-library-divider::before, .package-library-divider::after { height: 1px; flex: 1; content: ''; background: #e6e8ed; }
.package-library-divider span { flex: 0 0 auto; }

@keyframes ai-library-online {
  0%, 100% { opacity: .45; transform: scale(.9); }
  50% { opacity: 1; transform: scale(1.08); }
}

.batch-compatibility-list {
  display: grid;
  gap: 8px;
  margin-top: 12px;
}

.batch-compatibility-row {
  display: grid;
  grid-template-columns: minmax(110px, 1.2fr) auto auto minmax(100px, .9fr);
  align-items: center;
  gap: 10px;
  min-height: 42px;
  padding: 8px 12px;
  color: #2e4f68;
  background: linear-gradient(105deg, rgba(232, 245, 255, .86), rgba(248, 252, 255, .98));
  border: 1px solid rgba(93, 158, 209, .26);
  border-radius: 10px;
}

.batch-compatibility-row strong {
  color: #103552;
}

.batch-compatibility-row span,
.batch-compatibility-row small {
  font-size: 12px;
}

.batch-compatibility-row small {
  color: #648096;
  text-align: right;
}

.batch-compatibility-row.is-error {
  color: #984a35;
  background: #fff4ee;
  border-color: #f0b49f;
}

.tutorial-copy-source .behavior-card {
  animation: tutorial-copy-source 420ms cubic-bezier(.2, .8, .2, 1) both;
}

.tutorial-copy-arrival .behavior-card {
  transform-origin: 50% 0;
  animation: tutorial-copy-arrival 560ms cubic-bezier(.16, 1, .3, 1) both;
}

@keyframes tutorial-copy-source {
  0%, 100% { transform: translateY(0); }
  45% { transform: translateY(-4px); box-shadow: 0 15px 32px rgba(33, 112, 174, .14); }
}

@keyframes tutorial-copy-arrival {
  from { opacity: 0; transform: translateY(-18px) scale(.985); }
  65% { opacity: 1; transform: translateY(3px) scale(1.005); }
  to { opacity: 1; transform: translateY(0) scale(1); }
}

@media (prefers-reduced-motion: reduce) {
  .tutorial-copy-source .behavior-card,
  .tutorial-copy-arrival .behavior-card { animation: none; }
}

.operation-pool-block {
  position: relative;
  margin: 0 0 10px;
}

.operation-pool {
  --pool-accent: #f26b2d;
  --pool-soft: #fff4ec;
  position: relative;
  padding: 0 10px 10px;
  overflow: hidden;
  background: #fff;
  border: 1px solid #e6e8ed;
  border-left: 3px solid var(--pool-accent);
  border-radius: 10px;
  box-shadow: none;
  transition: border-color .18s ease, box-shadow .18s ease, background .18s ease;
}

.operation-pool.is-union {
  --pool-accent: #2878e8;
  --pool-soft: #eff6ff;
}

.operation-pool.is-drag-over {
  background: var(--pool-soft);
  border-color: var(--pool-accent);
  box-shadow: 0 0 0 3px color-mix(in srgb, var(--pool-accent) 14%, transparent);
}

.operation-pool-header {
  display: flex;
  min-height: 40px;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  padding: 5px 2px 5px 0;
}

.operation-pool-title,
.operation-pool-actions {
  display: flex;
  align-items: center;
}

.operation-pool-title {
  min-width: 0;
  gap: 8px;
}

.operation-pool-title strong {
  color: #202124;
  font-size: 12px;
  font-weight: 680;
  white-space: nowrap;
}

.operation-pool-title small {
  overflow: hidden;
  margin-left: 2px;
  padding-left: 10px;
  color: #92969f;
  font-size: 10px;
  border-left: 1px solid #e1e3e8;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.operation-pool-symbol {
  position: relative;
  display: inline-block;
  width: 28px;
  height: 18px;
  flex: 0 0 28px;
}

.operation-pool-symbol::before,
.operation-pool-symbol::after,
.operation-pool-add-symbol::before,
.operation-pool-add-symbol::after {
  position: absolute;
  top: 2px;
  width: 14px;
  height: 14px;
  box-sizing: border-box;
  border: 1.5px solid currentColor;
  border-radius: 50%;
  content: '';
}

.operation-pool-symbol::before,
.operation-pool-add-symbol::before { left: 2px; }
.operation-pool-symbol::after,
.operation-pool-add-symbol::after { left: 10px; }

.operation-pool-symbol { color: var(--pool-accent); }

.operation-pool-count {
  display: inline-grid;
  min-width: 19px;
  height: 19px;
  padding: 0 5px;
  place-items: center;
  color: var(--pool-accent);
  font: 700 9px/1 ui-monospace, monospace;
  background: var(--pool-soft);
  border-radius: 999px;
}

.operation-pool-actions {
  flex-shrink: 0;
  gap: 6px;
}

.operation-pool-type-switch {
  padding: 2px;
  background: #fff;
  border: 1px solid #dfe2e8;
  border-radius: 7px;
}

.operation-pool-type-switch :deep(.el-radio-button__inner) {
  min-width: 48px;
  min-height: 24px;
  padding: 0 9px;
  color: #737b8b;
  font-size: 10px;
  line-height: 24px;
  background: transparent;
  border: 0;
  box-shadow: none;
}

.operation-pool-type-switch :deep(.el-radio-button:first-child .el-radio-button__inner) {
  border-radius: 4px 0 0 4px;
}

.operation-pool-type-switch :deep(.el-radio-button:last-child .el-radio-button__inner) {
  border-radius: 0 4px 4px 0;
}

.operation-pool-type-switch :deep(.el-radio-button__original-radio:checked + .el-radio-button__inner) {
  color: #fff;
  background: var(--pool-accent);
  border-radius: 5px;
}

.operation-pool.is-union .operation-pool-type-switch :deep(.el-radio-button__original-radio:checked + .el-radio-button__inner) {
  color: #fff;
}

.operation-pool-delete,
.operation-node-detach {
  padding: 0;
  color: #777d88;
  font: inherit;
  font-size: 10px;
  background: transparent;
  border: 0;
  cursor: pointer;
  opacity: .42;
  transition: color .16s ease, opacity .16s ease;
}

.operation-pool-delete:hover { color: #c94e31; opacity: 1; }
.operation-node-detach:hover { color: #202124; opacity: 1; }

.operation-pool-body {
  display: grid;
  gap: 8px;
}

.operation-pool-node.node-wrapper {
  margin: 0;
}

.operation-pool-node .intercom-card {
  border: 1px solid #e6e8ed !important;
  border-radius: 8px !important;
  box-shadow: none !important;
}

.operation-pool-node .intercom-card:hover {
  transform: none;
}

.operation-pool-node .card-header-inner {
  min-height: 40px;
  padding: 5px 8px;
  border-bottom: 1px solid #eceef2;
  border-radius: 8px 8px 0 0;
}

.operation-pool-node .intercom-card.collapsed .card-header-inner {
  min-height: 42px;
  border-bottom: 0;
  border-radius: 8px;
}

.operation-pool-drop-hint {
  display: flex;
  min-height: 24px;
  align-items: center;
  justify-content: center;
  margin-top: 7px;
  color: #878783;
  font-size: 9px;
  background: transparent;
  border: 1px dashed #eceef2;
  border-radius: 5px;
}

.operation-pool.is-drag-over .operation-pool-drop-hint {
  color: var(--pool-accent);
  background: rgba(255, 255, 255, .78);
  border-color: var(--pool-accent);
}

.operation-pool-connector {
  margin-bottom: 4px;
}

.operation-pool-connector .connector-line {
  height: 7px;
}

.operation-pool-relation-label {
  margin: 1px 0 3px;
  color: #9ba1ad;
  font-size: 9px;
}

/* Official-style dense workbench: small chrome, single-line labels, wide canvas. */
.workbench-left-panel {
  padding: 20px 14px 14px;
}

.center-panel {
  padding: 18px 22px 14px;
}

.right-panel {
  gap: 12px;
  padding: 16px 18px;
}

.panel-toolbar {
  min-height: 42px;
  margin-bottom: 12px;
  padding-bottom: 10px;
}

.workbench-toolbar-copy .display-feature-title {
  font-size: 18px !important;
  font-weight: 600 !important;
  line-height: 1.2 !important;
  letter-spacing: -.02em !important;
}

.workbench-package-section .workbench-section-head .display-feature-title,
.workbench-solution-section .workbench-section-head .display-feature-title {
  font-size: 15px !important;
  font-weight: 650 !important;
  line-height: 1.25 !important;
  letter-spacing: 0 !important;
}

.canvas-scroll-area {
  padding-top: 2px;
  padding-right: 10px;
}

.node-minimap {
  width: 30px;
  gap: 5px;
  padding: 6px 0;
}

.minimap-dot {
  width: 20px;
  height: 20px;
}

.operation-pool-node .behavior-card-header {
  min-height: 34px;
}

.operation-pool-node .drag-handle {
  width: 13px;
  font-size: 12px;
}

.operation-pool-node .behavior-card-title-group {
  gap: 5px;
}

.operation-pool-node .behavior-card-summary {
  min-width: 0;
  margin-left: 7px;
  padding-left: 10px;
  overflow: hidden;
  color: #8c919b;
  font-size: 10px;
  font-weight: 400;
  line-height: 1.25;
  text-overflow: ellipsis;
  white-space: nowrap;
  border-left: 1px solid #e3e5e9;
}

.operation-pool-node .behavior-card-collapse {
  width: 18px;
  height: 18px;
  font-size: 8px;
}

.operation-pool-node .workbench-node-title {
  min-width: 0;
  overflow: hidden;
  font-size: 14px !important;
  font-weight: 600 !important;
  line-height: 1.2 !important;
  letter-spacing: 0 !important;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.operation-pool-node .behavior-card-node-badge {
  flex: 0 0 auto;
  padding: 2px 5px;
  color: #868b94;
  background: #f5f6f8;
  font-size: 9px;
}

.operation-pool-node .behavior-card-icon-btn.el-button {
  width: 24px !important;
  min-width: 24px !important;
  height: 24px !important;
}

.operation-pool-node .behavior-card-action-group {
  opacity: .3;
  transition: opacity .16s ease;
}

.operation-pool-node .behavior-card-header:hover .behavior-card-action-group,
.operation-pool-node .behavior-card-action-group:focus-within {
  opacity: 1;
}

.operation-pool-connector .tutorial-intersection-control {
  padding: 1px;
  border-radius: 6px;
  box-shadow: none;
}

.operation-pool-connector .tutorial-intersection-control :deep(.intercom-radio-group) {
  gap: 1px;
}

.operation-pool-connector .tutorial-intersection-control :deep(.el-radio-button__inner) {
  min-width: 34px;
  min-height: 24px;
  padding: 0 8px !important;
  font-size: 11px !important;
  line-height: 24px !important;
  border-radius: 5px !important;
}

.operation-pool-node :deep(.dynamic-form) {
  padding: 10px 12px 14px;
}

.operation-pool-node :deep(.dynamic-form .el-form-item) {
  min-height: 30px;
  margin-bottom: 6px;
}

.operation-pool-node :deep(.dynamic-form .el-form-item__label) {
  height: 30px;
  padding-right: 12px !important;
  overflow: visible;
  font-size: 12px !important;
  line-height: 30px;
  white-space: nowrap;
}

.operation-pool-node :deep(.dynamic-form .el-form-item__label .display-body),
.operation-pool-node :deep(.dynamic-form .el-form-item__content),
.operation-pool-node :deep(.dynamic-form .display-body) {
  font-size: 12px !important;
}

.operation-pool-node :deep(.dynamic-form .el-form-item__content) {
  min-height: 30px;
  line-height: 30px;
}

.operation-pool-node :deep(.dynamic-form .el-input__wrapper),
.operation-pool-node :deep(.dynamic-form .el-select__wrapper),
.operation-pool-node :deep(.dynamic-form .el-select-v2__wrapper) {
  height: 30px !important;
  min-height: 30px !important;
  padding-top: 0 !important;
  padding-bottom: 0 !important;
  border-radius: 6px !important;
}

.operation-pool-node :deep(.dynamic-form .select-auto-height .el-select__wrapper),
.operation-pool-node :deep(.dynamic-form .select-auto-height .el-select-v2__wrapper) {
  height: auto !important;
  min-height: 28px !important;
  padding: 1px 8px !important;
}

.operation-pool-node :deep(.dynamic-form .el-input__inner),
.operation-pool-node :deep(.dynamic-form .el-select__placeholder),
.operation-pool-node :deep(.dynamic-form .el-select__selected-item) {
  font-size: 12px !important;
}

.operation-pool-node :deep(.dynamic-form .el-radio__label),
.operation-pool-node :deep(.dynamic-form .el-checkbox__label) {
  font-size: 12px !important;
}

.operation-pool-node :deep(.dynamic-form .plain-radio-row),
.operation-pool-node :deep(.dynamic-form .custom-checkbox-group) {
  column-gap: 16px;
  row-gap: 3px;
}

.operation-pool-node :deep(.dynamic-form .intercom-radio-group .el-radio-button__inner) {
  min-height: 24px !important;
  padding: 0 8px !important;
  font-size: 11px !important;
  line-height: 24px !important;
  border-radius: 5px !important;
}

.operation-pool-node :deep(.dynamic-form .range-block) {
  gap: 6px 10px;
}

.operation-pool-add-symbol {
  position: relative;
  display: inline-block;
  width: 24px;
  height: 18px;
  flex: 0 0 24px;
}

.operation-pool-add-button.is-intersection .operation-pool-add-symbol { color: #f26b2d; }
.operation-pool-add-button.is-union .operation-pool-add-symbol { color: #2878e8; }

.summary-pool {
  margin-bottom: 13px;
  padding: 8px;
  background: #fff;
  border: 0;
  border-radius: 0;
}

.summary-pool-head {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 2px 4px 8px;
  color: #686f7e;
  font-size: 10px;
  font-weight: 650;
}

.summary-pool .summary-node {
  margin-bottom: 7px;
  background: #fff;
}

.summary-pool .summary-node:last-child { margin-bottom: 0; }

.behavior-component-add {
  cursor: grab;
}

.behavior-component-add:active {
  cursor: grabbing;
}

.behavior-component-item.is-dragging {
  opacity: .5;
}

.behavior-component-item.is-dragging .behavior-component-add {
  color: #ff7043;
  border-color: #ffad91;
  background: #fff7f3;
}

.operation-pool.is-package-target:not(.is-drag-over) .operation-pool-drop-hint {
  color: color-mix(in srgb, var(--pool-accent) 78%, #707887);
  border-color: color-mix(in srgb, var(--pool-accent) 42%, #dfe3ea);
}

.operation-pool.is-empty {
  padding-bottom: 8px;
}

.operation-pool.is-empty .operation-pool-body:empty {
  display: none;
}

.operation-pool.is-empty .operation-pool-drop-hint {
  min-height: 72px;
  margin-top: 2px;
  color: #8d95a4;
  font-size: 10px;
  background: color-mix(in srgb, var(--pool-soft) 58%, #fff);
  border-color: color-mix(in srgb, var(--pool-accent) 26%, #dfe3ea);
}

.operation-pool.is-empty.is-drag-over .operation-pool-drop-hint {
  color: var(--pool-accent);
  background: var(--pool-soft);
  border-style: solid;
}

.operation-pool-add-bar {
  display: flex;
  flex: 0 0 auto;
  min-height: 44px;
  align-items: center;
  gap: 8px;
  margin-top: 8px;
  padding: 7px 10px;
  background: #fff;
  border: 1px solid #e7e9ee;
  border-radius: 8px;
}

.operation-pool-add-label {
  margin-right: 2px;
  color: #242831;
  font-size: 11px;
  font-weight: 650;
  white-space: nowrap;
}

.operation-pool-add-button {
  display: inline-flex;
  height: 28px;
  align-items: center;
  gap: 5px;
  padding: 0 10px;
  color: #505767;
  font: inherit;
  font-size: 11px;
  background: #f8f9fb;
  border: 1px solid #e1e4ea;
  border-radius: 5px;
  cursor: pointer;
  transition: color .16s ease, border-color .16s ease, background .16s ease;
}

.operation-pool-add-button span {
  font-size: 13px;
  line-height: 1;
}

.operation-pool-add-button.is-intersection span { color: #f47b38; }
.operation-pool-add-button.is-union span { color: #5f91ed; }

.operation-pool-add-button.is-intersection:hover {
  color: #c75a20;
  background: #fff7f1;
  border-color: #f4b18c;
}

.operation-pool-add-button.is-union:hover {
  color: #3f70ca;
  background: #f2f7ff;
  border-color: #a9c4f5;
}

@media (max-width: 1180px) {
  .operation-pool-header { align-items: flex-start; }
  .operation-pool-title small { display: none; }
  .operation-pool-actions { align-items: flex-end; flex-direction: column; gap: 5px; }

  .operation-pool-add-bar {
    flex-wrap: wrap;
  }
}
</style>
