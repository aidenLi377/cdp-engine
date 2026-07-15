<template>
  <div class="left-panel workbench-left-panel">
    <button
      type="button"
      class="left-panel-edge-toggle"
      :class="{ 'is-solutions': leftPanelMode === 'solutions' }"
      @click="toggleLeftPanelMode"
    >
      {{ leftPanelMode === 'packages' ? '选方案' : '组件库' }}
    </button>

    <section v-if="leftPanelMode === 'solutions'" class="workbench-section workbench-solution-section">
      <div class="workbench-section-head">
        <div>
          <div class="display-feature-title">已发布方案</div>
          <div class="display-body-light">加载后进入工作台方案使用态</div>
        </div>
        <el-button
          class="intercom-btn-outlined btn-small"
          @click="loadPublishedSolutions"
          :loading="loadingPublishedSolutions"
        >
          刷新
        </el-button>
      </div>

      <el-radio-group
        :model-value="publishedLibraryScope"
        size="small"
        class="intercom-radio-group solution-library-switch workbench-library-switch"
        aria-label="选择方案库"
        @change="switchPublishedLibrary"
      >
        <el-radio-button label="mine">我的方案</el-radio-button>
        <el-radio-button label="public">公共方案</el-radio-button>
      </el-radio-group>

      <FolderTree
        :folders="publishedFolderTree"
        read-only
        @select-folder="onPublishedFolderSelect"
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
          :class="{ active: currentSolution?.id === item.id && workbenchMode === 'solution-use' }"
          @click="loadPublishedSolution(item)"
        >
          <div class="published-solution-top">
            <span class="solution-status-chip published">已发布</span>
            <span class="display-mono">{{ item.nodes?.length || 0 }} 节点</span>
          </div>
          <div class="display-body strong published-solution-name">{{ item.name || '未命名方案' }}</div>
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
          <div class="display-feature-title">行为组件库</div>
          <div class="display-body-light">
            {{ workbenchMode === 'solution-use'
              ? '已应用方案，仍可继续增删节点和调整逻辑关系'
              : '自由搭建时可继续增删节点' }}
          </div>
        </div>
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

      <div class="btn-group">
        <el-button
          v-for="pkg in filteredPackages"
          :key="pkg"
          type="default"
          class="intercom-btn-outlined"
          @click="addNode(pkg)"
          :loading="loadingPkg === pkg"
        >
          添加 {{ pkg }}
        </el-button>
      </div>

      <div
        v-if="pkgSearch && filteredPackages.length === 0"
        class="display-body-light workbench-empty-sm"
      >
        没有匹配的组件
      </div>
    </section>
  </div>

  <div class="center-panel">
    <div class="panel-toolbar">
      <div class="workbench-toolbar-copy">
        <div class="display-feature-title">
          {{ workbenchMode === 'solution-use' ? (currentSolution?.name || '方案使用') : '自由搭建工作台' }}
        </div>
        <div v-if="workbenchMode !== 'solution-use'" class="display-body-light">自由搭建当前画布，并可直接存为方案草稿</div>
        <div v-if="workbenchMode === 'solution-use' && derivedSolutionMeta.hasStructureChanges" class="display-body-light">
          当前内容已偏离原方案结构
        </div>
      </div>

      <div class="toolbar-actions workbench-toolbar-actions">
        <div
          class="workbench-phase-status"
          :class="{
            'is-free-build': workbenchMode === 'free-build',
            'is-solution-use': workbenchMode === 'solution-use',
          }"
          aria-live="polite"
        >
          <span class="workbench-phase-dot"></span>
          <span class="display-body strong">
            {{ workbenchMode === 'solution-use' ? '方案使用中' : '自由搭建中' }}
          </span>
        </div>

        <div class="workbench-secondary-actions">
          <template v-if="workbenchMode === 'solution-use'">
            <el-tooltip content="恢复方案默认值" placement="top">
              <el-button
                class="workbench-toolbar-icon-btn"
                size="small"
                text
                @click="restoreSolutionDefaults"
                :disabled="!loadedSolutionRecord"
              >
                <el-icon><RefreshLeft /></el-icon>
              </el-button>
            </el-tooltip>
            <el-tooltip content="另存为新方案" placement="top">
              <el-button
                class="workbench-toolbar-icon-btn"
                size="small"
                text
                @click="saveAsNewDerivedDraft"
                :disabled="nodeList.length === 0"
                :loading="savingDraft"
              >
                <el-icon><FolderAdd /></el-icon>
              </el-button>
            </el-tooltip>
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
          <template v-else>
            <el-button
              class="workbench-compact-action save-draft"
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
      <div v-else class="solution-use-area">
        <div v-if="customFieldSections.length > 0" class="cf-cards-bar" ref="cfCardsBarRef">
          <div
            v-for="(section, cfIndex) in cfVisibleSections"
            :key="section.customFieldId"
            class="cf-use-card"
            :class="{
              'cf-use-card-active': highlightedCfId === section.customFieldId,
              'dragging': dragCfIndex === cfIndex,
              'drag-over': dragOverCfIndex === cfIndex && dragCfIndex !== cfIndex,
            }"
            draggable="true"
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
	            </div>
	            <span
	              class="display-mono cf-use-card-count"
              title="点击编辑"
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
            v-if="highlightedCfId"
            class="cf-expand-all-btn"
            size="small"
            text
            @click="toggleCollapseMode"
          >
            {{ collapsedCfId ? '展开全部' : '收缩' }}
          </el-button>
        </div>
        <div v-if="nodeList.length > 0" class="canvas-with-minimap cf-use-node-area">
          <div class="canvas-scroll-area" ref="canvasScrollRef" @scroll="onCanvasScroll">
            <div
              v-for="(node, index) in nodeList"
              :key="node.id"
              v-show="!collapsedCfId || getNodeFocusBindings(node.id).length > 0"
              class="node-wrapper"
              :class="{ 'node-highlighted': highlightedCfId && isNodeHighlightedForCf(node.id) }"
              :ref="(el) => { if (el) nodeRefs[index] = el }"
              @dragover.prevent="onDragOver(index)"
              @drop="onDrop(index)"
              @dragleave="onDragLeave"
            >
              <div v-if="index > 0" class="logic-connector">
                <div class="connector-line"></div>
                <el-radio-group v-model="node.operator" size="small" class="intercom-radio-group">
                  <el-radio-button label="n">交集</el-radio-button>
                  <el-radio-button label="u">并集</el-radio-button>
                  <el-radio-button label="d">差集</el-radio-button>
                </el-radio-group>
                <div class="connector-line"></div>
              </div>
	              <div class="intercom-card behavior-card" :class="{ collapsed: collapsedCfId || node.collapsed, 'node-hydration-error': node._hydrationError }">
	                <div class="card-header-inner behavior-card-header" :class="{ 'drag-over': dragOverIndex === index }">
	                  <span
	                    class="drag-handle"
	                    draggable="true"
                    @dragstart="onDragStart($event, index)"
                    @dragend="onDragEnd"
                    title="拖拽排序"
                  >
                    ⋮⋮
                  </span>
	                  <span class="card-title-flex behavior-card-title-group" @click="collapsedCfId ? null : (node.collapsed = !node.collapsed)" :style="{ cursor: collapsedCfId ? 'default' : 'pointer' }">
	                    <span class="collapse-arrow behavior-card-collapse">{{ (collapsedCfId || node.collapsed) ? '▶' : '▼' }}</span>
	                    <span class="display-card-title workbench-node-title">{{ node.packageType }}</span>
	                    <span class="display-mono badge-mono behavior-card-node-badge">{{ getNodeDisplayName(node, index) }}</span>
	                    <span v-if="node._hydrationError" class="display-mono badge-error">加载失败</span>
	                  </span>
	                  <div class="behavior-card-action-group">
	                    <el-tooltip content="复制节点" placement="top">
	                      <el-button class="behavior-card-icon-btn" @click.stop="duplicateNode(index)">
	                        <el-icon><CopyDocument /></el-icon>
	                      </el-button>
	                    </el-tooltip>
	                    <el-popconfirm
	                      title="确定移除这个节点？"
	                      confirm-button-text="移除"
	                      cancel-button-text="取消"
	                      @confirm="removeNode(index)"
	                    >
	                      <template #reference>
	                        <el-tooltip content="移除节点" placement="top">
	                          <el-button class="behavior-card-icon-btn danger" @click.stop="removeNode(index)">
	                            <el-icon><Delete /></el-icon>
	                          </el-button>
	                        </el-tooltip>
	                      </template>
	                    </el-popconfirm>
	                  </div>
                </div>
                <div v-if="node._hydrationError" v-show="!(collapsedCfId || node.collapsed)" class="hydration-error-body">
                  <p class="display-body-light">该组件元数据加载失败，请检查后端服务后重新加载方案。</p>
                </div>
                <!-- Collapse mode: show only bound fields -->
                <div v-else-if="collapsedCfId && getNodeFocusBindings(node.id).length > 0" class="cf-focus-fields">
                  <div
                    v-for="binding in getNodeFocusBindings(node.id)"
                    :key="binding.fieldKey"
                    class="cf-focus-field-row"
                  >
                    <span class="display-body-light">{{ getFocusFieldDisplay(binding.fieldKey, node).label }}</span>
                    <span class="display-body strong">{{ getFocusFieldDisplay(binding.fieldKey, node).value }}</span>
                  </div>
                </div>
                <!-- No matching bindings in collapse mode: subtle hint -->
                <div v-else-if="collapsedCfId" class="cf-focus-fields">
                  <div class="display-body-light" style="opacity:0.4;font-size:12px;padding:4px 0">无映射字段</div>
                </div>
                <!-- Normal mode: full DynamicForm -->
                <DynamicForm v-else v-show="!node.collapsed" :node="node" @overflow-split="handleOverflowSplit" />
              </div>
            </div>
          </div>
        </div>
        <div v-else class="empty-hint display-body-light">
          当前方案没有节点
        </div>
      </div>

      <CustomFieldEditDialog
        v-model="cfEditDialogVisible"
        :custom-field="editingCfSection"
        :bound-nodes="editingCfSection?.bindings || []"
        :current-value="editingCfCurrentValue"
        :node-list="nodeList"
        @save="onCfDialogSave"
      />
    </div>

    <div v-else key="free-build" style="flex:1;display:flex;flex-direction:column;min-height:0;overflow:hidden">
      <div v-if="nodeList.length === 0" class="empty-hint display-body-light">
        请从左侧点击添加行为组件，或直接加载已发布方案
      </div>

      <div v-if="nodeList.length > 0" class="canvas-with-minimap">
        <div class="canvas-scroll-area" ref="canvasScrollRef" @scroll="onCanvasScroll">
          <div
            v-for="(node, index) in nodeList"
            :key="node.id"
            class="node-wrapper"
            :class="{ 'node-highlighted': highlightedCfId && isNodeHighlightedForCf(node.id) }"
            :ref="(el) => { if (el) nodeRefs[index] = el }"
            @dragover.prevent="onDragOver(index)"
            @drop="onDrop(index)"
            @dragleave="onDragLeave"
          >
            <div v-if="index > 0" class="logic-connector">
              <div class="connector-line"></div>
              <el-radio-group v-model="node.operator" size="small" class="intercom-radio-group">
                <el-radio-button label="n">交集 (n)</el-radio-button>
                <el-radio-button label="u">并集 (u)</el-radio-button>
                <el-radio-button label="d">差集 (d)</el-radio-button>
              </el-radio-group>
              <div class="connector-line"></div>
            </div>

	            <div class="intercom-card behavior-card" :class="{ collapsed: node.collapsed, 'node-hydration-error': node._hydrationError }">
	              <div class="card-header-inner behavior-card-header" :class="{ 'drag-over': dragOverIndex === index }">
	                <span
	                  class="drag-handle"
	                  draggable="true"
                  @dragstart="onDragStart($event, index)"
                  @dragend="onDragEnd"
                  title="拖拽排序"
                >
                  ⠿
                </span>
	                <span class="card-title-flex behavior-card-title-group" @click="node.collapsed = !node.collapsed" style="cursor:pointer">
	                  <span class="collapse-arrow behavior-card-collapse">{{ node.collapsed ? '▶' : '▼' }}</span>
	                  <span class="display-card-title workbench-node-title">{{ node.packageType }}</span>
	                  <span class="display-mono badge-mono behavior-card-node-badge">{{ getNodeDisplayName(node, index) }}</span>
	                  <span v-if="node._hydrationError" class="display-mono badge-error">加载失败</span>
	                </span>
	                <div class="behavior-card-action-group">
	                  <el-tooltip content="复制节点" placement="top">
	                    <el-button class="behavior-card-icon-btn" @click.stop="duplicateNode(index)">
	                      <el-icon><CopyDocument /></el-icon>
	                    </el-button>
	                  </el-tooltip>
	                  <el-popconfirm
	                    title="确定移除这个节点？"
	                    confirm-button-text="移除"
	                    cancel-button-text="取消"
	                    @confirm="removeNode(index)"
	                  >
	                    <template #reference>
	                      <el-tooltip content="移除节点" placement="top">
	                        <el-button class="behavior-card-icon-btn danger" @click.stop="removeNode(index)">
	                          <el-icon><Delete /></el-icon>
	                        </el-button>
	                      </el-tooltip>
	                    </template>
	                  </el-popconfirm>
	                </div>
              </div>
              <div v-if="node._hydrationError" v-show="!node.collapsed" class="hydration-error-body">
                <p class="display-body-light">该组件元数据加载失败，请检查后端服务后重新添加。</p>
              </div>
              <DynamicForm v-else v-show="!node.collapsed" :node="node" @overflow-split="handleOverflowSplit" />
            </div>
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
    </div>
  </Transition>
  </div>

  <div class="right-panel">
    <div class="panel-name-area">
      <div class="workbench-name-top">
        <div class="display-body-light name-label-inline">人群包名称</div>
      </div>

      <div style="display:flex;align-items:center;gap:6px">
        <el-input
          v-model="crowdNameInput"
          placeholder="自动生成或手动输入"
          size="default"
          clearable
          class="intercom-input"
          style="flex:1"
          @input="onNameManualEdit"
        />
        <el-tooltip v-if="nameAuto" content="名称会随当前自由搭建参数自动生成" placement="top">
          <span style="font-size:11px;color:#ff6b4a;cursor:default;flex-shrink:0">自动</span>
        </el-tooltip>
      </div>

      <div v-if="workbenchMode === 'solution-use' && currentSolution" class="display-body-light workbench-name-hint">
        来源方案：{{ currentSolution.name || '未命名方案' }}，当前改动仅保留在工作台
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
          <el-button class="intercom-btn-primary" size="small" @click="copyJson">复制</el-button>
          <el-dropdown split-button type="default" size="small" class="go-databank-dropdown" @click="goToDataBank" @command="handleDataBankCommand">
            去圈人
            <template #dropdown>
              <el-dropdown-menu>
                <el-dropdown-item command="auto" :disabled="databankAutomating">
                  {{ databankAutomating ? '自动化执行中...' : '自动化圈人' }}
                </el-dropdown-item>
              </el-dropdown-menu>
            </template>
          </el-dropdown>
        </div>
      </div>

      <div v-if="jsonViewMode === 'summary'" class="json-summary">
        <div v-if="nodeList.length === 0" class="empty-state-sm display-body-light">
          请先在画布中添加行为组件或加载方案
        </div>

        <div v-for="(node, index) in nodeList" :key="'s-' + node.id" class="summary-node">
          <div class="summary-node-head">
            <span class="summary-idx">{{ index + 1 }}</span>
            <span class="display-body strong">{{ getNodeDisplayName(node, index) }}</span>
            <span v-if="index > 0" class="summary-op">
              {{ node.operator === 'n' ? '交集' : node.operator === 'u' ? '并集' : '差集' }}
            </span>
          </div>

          <div class="summary-rows">
            <div
              v-for="item in getNodeSummary(node)"
              :key="item.key"
              class="summary-row"
              :class="{ 'summary-row-highlighted': collapsedCfId && isSummaryRowHighlighted(node.id, item.key) }"
            >
              <span class="summary-label">{{ item.label }}</span>
              <span class="summary-val">{{ item.value }}</span>
            </div>

            <div v-if="getNodeSummary(node).length === 0" class="display-body-light" style="padding:8px 0;opacity:0.5">
              当前节点尚未配置可用参数
            </div>
          </div>
        </div>

        <div v-if="nodeList.length > 1" class="summary-compute">
          <span class="display-body-light">运算链：</span>
          <span class="display-mono">{{ generatedJson.compute }}</span>
        </div>
      </div>

      <pre v-else class="json-code display-mono">{{ JSON.stringify(generatedJson, null, 2) }}</pre>
    </div>
  </div>
</template>

<script setup>
import { computed, nextTick, onBeforeUnmount, onMounted, reactive, ref, toRaw, watch, provide } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { CopyDocument, Delete, FolderAdd, RefreshLeft, Search } from '@element-plus/icons-vue'
import DynamicForm from './DynamicForm.vue'
import FolderTree from './FolderTree.vue'
import CustomFieldEditDialog from './CustomFieldEditDialog.vue'
import { useCdpShared } from '../composables/useCdpShared'
import { useSolutionRuntime } from '../composables/useSolutionRuntime'
import { useSolutionsApi } from '../composables/useSolutionsApi'
import { useFoldersApi } from '../composables/useFoldersApi'
import { usePackagesApi } from '../composables/usePackagesApi'
import {
  fieldToken,
  getNodeDisplayName,
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
import { getCfTypeClass, formatCfDisplayValue, summarizeCfDisplayValue } from '../utils/display.js'

const DEFAULT_CROWD_NAME = '未命名人群包'
const DEFAULT_DRAFT_NAME = '工作台方案草稿'
const MAX_HISTORY = 20
const DATABANK_URL = 'https://databank.tmall.com/#/userDefinedAnalyses'
const EXTENSION_MESSAGE_TYPE = 'CDP_AUTOMATE_DATABANK'
const EXTENSION_BRIDGE_SOURCE = 'databank-extension-bridge'
const EXTENSION_RESPONSE_TIMEOUT_MS = 45000

const { getArray, isVisible } = useCdpShared()
const {
  cloneValue,
  createRuntimeNode,
  hydrateNodes,
  normalizeWorkbenchFieldIds,
} = useSolutionRuntime()
const { listSolutions, getSolution, createDraft } = useSolutionsApi()
const { listFolders } = useFoldersApi()
const { listPackages } = usePackagesApi()

const jsonViewMode = ref('summary')
const workbenchMode = ref('free-build')
const availablePackages = ref([])
const publishedSolutions = ref([])
const publishedLibraryScope = ref('mine')
const loadingPublishedSolutions = ref(false)
const loadingSolutionId = ref(null)
const loadingPkg = ref(null)
const savingDraft = ref(false)
const nodeList = ref([])
const currentSolution = ref(null)
const loadedSolutionRecord = ref(null)
const loadedSolutionFieldIds = ref([])
const crowdNameInput = ref(DEFAULT_CROWD_NAME)
const nameAuto = ref(true)
const pkgSearch = ref('')
const solutionSearch = ref('')
const leftPanelMode = ref('packages')
const activeNodeIndex = ref(0)
const canvasScrollRef = ref(null)
const nodeRefs = ref({})
const dragOverIndex = ref(-1)
const historyStack = ref([])
const historyPos = ref(-1)
const generatedJson = ref({ crowdName: DEFAULT_CROWD_NAME, list: [], compute: '' })
const snapshotPaused = ref(false)
const databankAutomating = ref(false)
const highlightedCfId = ref(null)
const collapsedCfId = ref(null)
const publishedFolderTree = ref([])
const selectedPublishedFolderId = ref(null)
const cfEditDialogVisible = ref(false)
const editingCfSection = ref(null)
const editingCfCurrentValue = ref(null)
const cfCardsBarRef = ref(null)
const overflowBtnRef = ref(null)
const cfShowAll = ref(false)
const cfVisibleCount = ref(10)
const dragCfIndex = ref(-1)
const dragOverCfIndex = ref(-1)
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

provide('solutionCenterContext', {
  highlightedCustomFieldId: null,
  customFields: [],
  creatingCustomField: false,
  creatingCustomFieldType: '',
  creatingCustomFieldStep: 2,
  creatingCustomFieldBindings: [],
  onFieldClickForBinding: () => {},
  isFieldHighlighted: (nodeId, fieldKey) => {
    if (!highlightedCfId.value) return false
    const cfs = currentSolution.value?.customFields || []
    const cf = cfs.find(c => c.id === highlightedCfId.value)
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

const allCollapsed = computed(() => nodeList.value.length > 0 && nodeList.value.every((node) => node.collapsed))
const canUndo = computed(() => historyPos.value > 0)
const canRedo = computed(() => historyPos.value < historyStack.value.length - 1)
const customFieldSections = computed(() =>
  buildCustomFieldSections(
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
  const cfs = currentSolution.value?.customFields || []
  const cf = cfs.find(c => c.id === collapsedCfId.value)
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
  const bindings = Array.isArray(section.bindings) ? section.bindings : []
  if (bindings.length === 0) return ''
  const values = bindings
    .map((binding) => {
      const node = nodeList.value.find(n => n.id === binding.nodeId)
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
  const bindings = Array.isArray(section.bindings) ? section.bindings : []
  if (bindings.length === 0) {
    return {
      primaryText: '',
      overflowCount: 0,
      overflowText: '',
    }
  }

  const values = bindings
    .map((binding) => {
      const node = nodeList.value.find(n => n.id === binding.nodeId)
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

  editingCfSection.value = section
  // Read current value from the first bound node
  const firstBinding = section.bindings?.[0]
  if (firstBinding) {
    const node = nodeList.value.find(n => n.id === firstBinding.nodeId)
    const fieldValue = node?.formData?.[firstBinding.fieldKey]
    const modeValue = node?.modeData?.[firstBinding.fieldKey]
    if (section.type?.includes('日期') || section.type?.includes('数值')) {
      editingCfCurrentValue.value = { ...(fieldValue || {}), mode: modeValue }
    } else {
      editingCfCurrentValue.value = fieldValue
    }
  }
  cfEditDialogVisible.value = true
}

function onCfDialogSave({ customFieldId, value }) {
  syncCustomFieldValue(
    nodeList.value,
    customFieldId,
    currentSolution.value?.customFields || [],
    value,
  )
  const cfs = currentSolution.value?.customFields || []
  const cf = cfs.find(c => c.id === customFieldId)
  if (cf) {
    const nextFields = cfs.map((item) => (
      item.id === customFieldId
        ? { ...item, defaultValue: cloneValue(value) }
        : item
    ))
    setCurrentCustomFields(nextFields)
    const uniqueNodes = new Set((cf.bindings || []).map(b => b.nodeId))
    if (uniqueNodes.size > 0) {
      ElMessage.success(`已同步到 ${uniqueNodes.size} 个组件`)
    }
  }
}

function isNodeHighlightedForCf(nodeId) {
  if (!highlightedCfId.value) return false
  const cfs = currentSolution.value?.customFields || []
  const cf = cfs.find(c => c.id === highlightedCfId.value)
  if (!cf) return false
  return (cf.bindings || []).some(b => b.nodeId === nodeId)
}

function isSummaryRowHighlighted(nodeId, fieldKey) {
  if (!collapsedCfId.value) return false
  const cfs = currentSolution.value?.customFields || []
  const cf = cfs.find(c => c.id === collapsedCfId.value)
  if (!cf) return false
  return (cf.bindings || []).some(b => b.nodeId === nodeId && b.fieldKey === fieldKey)
}

function toggleLeftPanelMode() {
  leftPanelMode.value = leftPanelMode.value === 'packages' ? 'solutions' : 'packages'
}

function onNameManualEdit() {
  nameAuto.value = false
  markDerivedParamChange()
}

function onDragStart(event, index) {
  dragSrcIndex = index
  event.dataTransfer.effectAllowed = 'move'
  event.dataTransfer.setData('text/plain', String(index))
}

function onDragOver(index) {
  dragOverIndex.value = index
}

function onDragLeave() {
  dragOverIndex.value = -1
}

function onDrop(targetIndex) {
  dragOverIndex.value = -1
  if (dragSrcIndex === null || dragSrcIndex === targetIndex) return

  takeSnapshot()
  const [moved] = nodeList.value.splice(dragSrcIndex, 1)
  nodeList.value.splice(targetIndex, 0, moved)
  nodeList.value.forEach((node, index) => {
    if (index === 0) node.operator = null
  })
  dragSrcIndex = null
  markDerivedStructureChange()
}

function onDragEnd() {
  dragOverIndex.value = -1
}

function resetWorkbenchContext() {
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
  if (nodeList.value.length === 0 && !currentSolution.value) return

  takeSnapshot()
  nodeList.value = []
  nodeRefs.value = {}
  activeNodeIndex.value = 0
  crowdNameInput.value = DEFAULT_CROWD_NAME
  nameAuto.value = true
  resetWorkbenchContext()
  ElMessage.success('工作台已清空')
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
  const snapshot = structuredClone({
    nodeList: toRaw(nodeList.value),
    crowdNameInput: crowdNameInput.value,
    nameAuto: nameAuto.value,
  })

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
  crowdNameInput.value = snapshot.crowdNameInput || DEFAULT_CROWD_NAME
  nameAuto.value = snapshot.nameAuto !== undefined ? snapshot.nameAuto : false
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

async function loadPublishedSolutions() {
  loadingPublishedSolutions.value = true
  try {
    publishedSolutions.value = await listSolutions(
      'published',
      publishedLibraryScope.value,
    )
    await loadPublishedFolders()
  } catch (error) {
    ElMessage.error(error.message || '已发布方案列表加载失败')
  } finally {
    loadingPublishedSolutions.value = false
  }
}

async function loadPublishedFolders() {
  try {
    const allFolders = await listFolders(publishedLibraryScope.value)
    const publishedIds = new Set(
      publishedSolutions.value.map(s => s.folderId).filter(Boolean)
    )
    publishedFolderTree.value = filterFoldersByPublished(allFolders, publishedIds)
  } catch (error) {
    console.error('加载已发布方案文件夹失败:', error)
  }
}

async function switchPublishedLibrary(nextScope) {
  if (nextScope === publishedLibraryScope.value) return
  publishedLibraryScope.value = nextScope
  selectedPublishedFolderId.value = null
  publishedSolutions.value = []
  publishedFolderTree.value = []
  await loadPublishedSolutions()
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

async function addNode(packageType) {
  loadingPkg.value = packageType
  try {
    const node = await createRuntimeNode({ packageType }, nodeList.value.length)
    takeSnapshot()
    nodeList.value.push(node)
    if (!currentSolution.value) {
      nameAuto.value = true
    }
    markDerivedStructureChange()
  } catch (error) {
    ElMessage.error(error.message || '组件加载失败，请检查后端连接')
  } finally {
    loadingPkg.value = null
  }
}

function removeNode(index) {
  takeSnapshot()
  const [removedNode] = nodeList.value.splice(index, 1)
  nodeList.value.forEach((node, nodeIndex) => {
    if (nodeIndex === 0) node.operator = null
  })
  if (removedNode) {
    removeBindingsForNode(removedNode.id)
  }
  markDerivedStructureChange()
}

function duplicateNode(index) {
  const source = nodeList.value[index]
  if (!source) return

  takeSnapshot()
  const duplicated = cloneNodeForDuplicate(source, index)
  insertNodeAtPosition(nodeList.value, duplicated, index)
  markDerivedStructureChange()

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
  nodeList.value.splice(srcIndex + 1, 0, ...splits)
  nodeList.value.forEach((node, idx) => {
    if (idx === 0) node.operator = null
  })
  markDerivedStructureChange()
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
    await createDraft(buildDraftPayload())
    ElMessage.success('当前画布已存为方案草稿')
  } catch (error) {
    ElMessage.error(error.message || '方案草稿保存失败')
  } finally {
    savingDraft.value = false
  }
}

async function saveAsNewDerivedDraft() {
  if (!isDerivedSolutionSession.value || nodeList.value.length === 0) return

  try {
    const { value } = await ElMessageBox.prompt(
      '请输入新方案名称',
      '另存为新方案',
      {
        confirmButtonText: '保存',
        cancelButtonText: '取消',
        inputValue: String(crowdNameInput.value || currentSolution.value?.name || DEFAULT_DRAFT_NAME).trim(),
        inputPattern: /\S+/,
        inputErrorMessage: '方案名称不能为空',
      },
    )

    savingDraft.value = true
    await createDraft(buildDraftPayload(value))
    ElMessage.success('当前工作台已另存为新方案草稿')
  } catch (error) {
    if (error !== 'cancel' && error?.message !== 'cancel') {
      ElMessage.error(error.message || '另存为新方案失败')
    }
  } finally {
    savingDraft.value = false
  }
}

async function confirmReplaceCanvas() {
  if (nodeList.value.length === 0) return true

  try {
    await ElMessageBox.confirm(
      '当前画布已有内容，加载已发布方案后会替换现有状态，是否继续？',
      '替换当前画布',
      {
        confirmButtonText: '继续加载',
        cancelButtonText: '取消',
        type: 'warning',
      },
    )
    return true
  } catch {
    return false
  }
}

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
    nodeList.value = hydratedNodes
    nodeRefs.value = {}
    activeNodeIndex.value = 0
    crowdNameInput.value =
      String(record?.defaultCrowdName || record?.name || DEFAULT_CROWD_NAME).trim() || DEFAULT_CROWD_NAME
    nameAuto.value = false
    workbenchMode.value = 'solution-use'
    resetHistory()
  } finally {
    snapshotPaused.value = false
  }
}

let loadSolutionAbort = null

async function loadPublishedSolution(item) {
  if (!item?.id) return
  if (currentSolution.value?.id === item.id && workbenchMode.value === 'solution-use') return

  const shouldContinue = await confirmReplaceCanvas()
  if (!shouldContinue) return

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

async function buildFinalJson() {
  if (nodeList.value.length === 0) {
    generatedJson.value = { crowdName: DEFAULT_CROWD_NAME, list: [], compute: '' }
    return
  }

  const list = []
  let compute = '(0)'

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
            val: { start: value.dateRange[0], end: value.dateRange[1] },
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
      const response = await fetch('/api/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      const nodeJson = await response.json()
      if (nodeJson?.list?.length > 0) {
        const baseTemplate = nodeJson.list[0]
        baseTemplate.fromPoolId = index
        if (index > 0) {
          baseTemplate.op = 'INIT'
          compute += `${node.operator}(${index})`
        }
        list.push(baseTemplate)
      }
    } catch (error) {
      console.error('JSON 生成失败，请检查后端服务状态', error)
    }
  }

  generatedJson.value = {
    crowdName: crowdNameInput.value || DEFAULT_CROWD_NAME,
    list,
    compute,
  }
}

function generateCrowdName() {
  if (!nameAuto.value) return

  const node = nodeList.value[0]
  if (!node) {
    crowdNameInput.value = DEFAULT_CROWD_NAME
    return
  }

  const parts = []
  const channels = getArray(node.formData?.channel)
    .filter((item) => item !== '全部销售渠道' && item !== '全部')
    .slice(0, 2)
  if (channels.length > 0) parts.push(channels.join('/'))

  const behaviors = getArray(node.formData?.bhv).slice(0, 2)
  if (behaviors.length > 0) parts.push(behaviors.join('/'))

  const categoryValues = getArray(node.formData?.cate)
    .concat(getArray(node.formData?.leafCates))
    .filter((item) => item !== '全部')
    .slice(0, 2)
  if (categoryValues.length > 0) parts.push(categoryValues.join('/'))

  const brands = getArray(node.formData?.stdBrand).slice(0, 1)
  if (brands.length > 0) parts.push(brands.join(''))

  const dateKey = Object.keys(node.modeData || {}).find((key) =>
    node.schema?.some((field) => field.key === key && field.Widget_Type === '日期_切换'),
  )
  if (dateKey) {
    const mode = node.modeData[dateKey]
    const dateValue = node.formData?.[dateKey]
    if (mode === 'recent' && dateValue?.days) {
      parts.push(`${dateValue.days}天`)
    } else if (mode === 'range' && Array.isArray(dateValue?.dateRange) && dateValue.dateRange.length === 2) {
      parts.push(`${dateValue.dateRange[0]}-${dateValue.dateRange[1]}`)
    }
  }

  const numberKey = Object.keys(node.modeData || {}).find((key) =>
    node.schema?.some((field) => field.key === key && field.Widget_Type === '数值_切换'),
  )
  if (numberKey) {
    const mode = node.modeData[numberKey]
    const numberValue = node.formData?.[numberKey]
    if (mode === 'min' && numberValue?.min !== null && numberValue?.min !== undefined) {
      parts.push(`≥${numberValue.min}`)
    } else if (mode === 'range' && numberValue?.min !== null && numberValue?.min !== undefined) {
      parts.push(`${numberValue.min}-${numberValue?.max ?? '不限'}`)
    }
  }

  const generatedName = parts.join('_')
  crowdNameInput.value = nodeList.value.length > 1
    ? `${generatedName || node.packageType}_共${nodeList.value.length}组`
    : generatedName || node.packageType || DEFAULT_CROWD_NAME
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
        display = `≥${value.min}`
      } else if (mode === 'range') {
        display = `${value?.min ?? '?'} - ${value?.max ?? '?'}`
      }
    } else if (field.Widget_Type === '日期_切换') {
      if (mode === 'recent' && value?.days) {
        display = `过去 ${value.days} 天`
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

function getGeneratedJsonText() {
  return JSON.stringify(generatedJson.value, null, 4)
}

async function copyJson() {
  try {
    await navigator.clipboard.writeText(getGeneratedJsonText())
    ElMessage.success('JSON 已复制到剪贴板')
  } catch {
    ElMessage.error('复制失败，请手动选择后复制')
  }
}

function goToDataBank() {
  window.open(DATABANK_URL, '_blank', 'noopener,noreferrer')
}

function sendMessageToDatabankExtension(jsonText) {
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
      },
      window.location.origin,
    )
  })
}

function handleDataBankCommand(command) {
  if (command === 'auto') {
    void startAutoDataBankFlow()
  }
}

async function startAutoDataBankFlow() {
  if (databankAutomating.value) return

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
      ElMessage.error(result?.error || result?.message || '自动化圈人失败')
      return
    }
    pendingMessage.close()
    ElMessage.success(result?.message || '已完成自动化圈人操作')
  } catch (error) {
    pendingMessage.close()
    ElMessage.error(error?.message || '自动化圈人失败')
  } finally {
    databankAutomating.value = false
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

watch(
  [nodeList, crowdNameInput],
  ([nextNodes]) => {
    generateCrowdName()
    enforceWorkbenchFieldConstraints(nextNodes)
    clearTimeout(jsonTimer)
    jsonTimer = setTimeout(async () => {
      await buildFinalJson()
    }, 300)

    if (!snapshotPaused.value) {
      markDerivedParamChange()
      debouncedSnapshot()
    }
  },
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

onMounted(async () => {
  await Promise.all([loadPackages(), loadPublishedSolutions()])
  resetHistory()
  window.addEventListener('keydown', handleKeydown)
  cfResizeObserver = new ResizeObserver(() => {
    nextTick(() => updateCfOverflow())
  })
  if (cfCardsBarRef.value) {
    cfResizeObserver.observe(cfCardsBarRef.value)
  }
})

onBeforeUnmount(() => {
  clearTimeout(saveTimer)
  clearTimeout(jsonTimer)
  window.removeEventListener('keydown', handleKeydown)
  if (cfResizeObserver) {
    cfResizeObserver.disconnect()
    cfResizeObserver = null
  }
})
</script>
