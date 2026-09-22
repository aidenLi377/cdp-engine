<template>
  <el-drawer
    v-model="drawerOpen"
    class="ai-audience-drawer"
    direction="rtl"
    size="min(640px, 96vw)"
    :with-header="false"
    :append-to-body="true"
    :close-on-click-modal="false"
  >
    <div class="ai-shell" :class="{ 'is-busy': sending }">
      <div class="ai-ambient" aria-hidden="true">
        <span></span><span></span><span></span>
      </div>
      <header class="ai-head">
        <div class="ai-head-mark" aria-hidden="true">
          <span class="ai-core"></span>
          <b>AI</b>
        </div>
        <div class="ai-head-copy">
          <p>AUDIENCE INTELLIGENCE · {{ modelLabel }}</p>
          <h2>AI 人群策略师</h2>
          <span>把一句业务语言，推演成可以直接执行的圈包方案。</span>
        </div>
        <button class="ai-close" type="button" title="关闭" aria-label="关闭AI圈人" @click="drawerOpen = false">×</button>
      </header>

      <div class="ai-status" :class="statusClass" role="status">
        <i aria-hidden="true"><span></span></i>
        <span v-if="statusLoading">正在检查大模型配置…</span>
        <template v-else-if="modelStatus?.configured">
          <strong>模型在线</strong>
          <span class="ai-status-meta">{{ modelStatus.model }} / {{ formatContextWindow(modelStatus.maxInputTokens) }} context / {{ modelThinkingLabel }} / {{ modelStatus.solutionKnowledgeCount || 0 }} 个公共方案 / {{ modelStatus.systemFeatureCount || 0 }} 项系统功能</span>
        </template>
        <template v-else>
          <strong>等待管理员配置大模型</strong>
          <span>配置完成并重启后，此处会自动变为可用。</span>
        </template>
      </div>

      <main ref="scrollRef" class="ai-body">
        <section v-if="!messages.length" class="ai-welcome">
          <div class="ai-orbit" aria-hidden="true">
            <span class="ai-orbit-ring is-outer"></span>
            <span class="ai-orbit-ring is-inner"></span>
            <span class="ai-orbit-dot is-one"></span>
            <span class="ai-orbit-dot is-two"></span>
            <strong>AI</strong>
          </div>
          <p class="ai-welcome-kicker">SAY IT. SEE THE LOGIC. BUILD THE AUDIENCE.</p>
          <h3>说人话，剩下的交给 AI</h3>
          <p>我会理解人群目标，选择公域或自店组件，校验品牌账号与商品 ID，再编排交并差关系。</p>
          <div class="ai-examples">
            <button
              v-for="(example, index) in examples"
              :key="example"
              type="button"
              :disabled="!modelStatus?.configured || sending"
              @click="useExample(example)"
            >
              <span>{{ String(index + 1).padStart(2, '0') }}</span>
              <b>{{ example }}</b>
              <i aria-hidden="true">↗</i>
            </button>
          </div>
        </section>

        <section v-else class="ai-conversation" aria-live="polite">
          <template v-for="(item, index) in messages" :key="item.id || `${item.role}-${index}`">
            <article v-if="item.role === 'process' && isLatestProcess(item)" class="ai-process" :class="`is-${item.status}`">
              <button type="button" class="ai-process-head" @click="item.expanded = !item.expanded">
                <span class="ai-process-symbol" aria-hidden="true">
                  <i></i><i></i><i></i>
                </span>
                <span>
                  <strong>{{ item.status === 'running' ? '正在推演圈包路径' : item.status === 'error' ? '推演中断' : '推演过程已完成' }}</strong>
                  <small>{{ item.status === 'running' ? `已运行 ${item.elapsed}s · 正在调用业务知识` : `共 ${item.elapsed}s · ${thinkingStages.length} 个处理阶段` }}</small>
                </span>
                <b>{{ item.expanded ? '收起' : '展开' }}</b>
              </button>
              <ol v-if="item.expanded" class="ai-process-steps">
                <li
                  v-for="(stage, stageIndex) in thinkingStages"
                  :key="stage.label"
                  :class="processStageClass(item, stageIndex)"
                >
                  <span>{{ stageIndex < item.stageIndex || item.status === 'complete' ? '✓' : String(stageIndex + 1).padStart(2, '0') }}</span>
                  <div><strong>{{ stage.label }}</strong><small>{{ stage.detail }}</small></div>
                </li>
              </ol>
            </article>

            <article v-else-if="!isGuidanceEcho(item)" class="ai-message" :class="`is-${item.role}`">
              <span class="ai-message-role">{{ item.role === 'user' ? 'YOU' : 'AI' }}</span>
              <p>
                <span
                  v-for="(paragraph, paragraphIndex) in messageParagraphs(item.displayContent ?? item.content)"
                  :key="`${item.id || index}-${paragraphIndex}`"
                  class="ai-message-paragraph"
                >{{ paragraph }}</span>
                <i v-if="item.typing" class="ai-type-cursor" aria-hidden="true"></i>
              </p>
            </article>
          </template>
        </section>

        <section v-if="currentOperation" class="ai-operation" :class="`is-${operationDisplayStatus}`">
          <header>
            <span class="ai-operation-icon" aria-hidden="true">↗</span>
            <div>
              <small>将调用系统真实功能</small>
              <strong>达摩盘批量画像 · 横向对比</strong>
            </div>
            <b>{{ operationStatusLabel }}</b>
          </header>
          <dl>
            <div>
              <dt>人群包</dt>
              <dd><span v-for="name in currentOperation.crowdNames || []" :key="name" :title="name">{{ name }}</span></dd>
            </div>
            <div>
              <dt>画像标签</dt>
              <dd><span v-for="name in currentOperation.tagNames || []" :key="name">{{ name }}</span></dd>
            </div>
            <div>
              <dt>完成后</dt>
              <dd><span>自动打开横向对比</span></dd>
            </div>
          </dl>
          <p v-if="currentOperation.tagNames?.length && !currentOperation.tagSelectionConfirmed" class="ai-operation-adjust">
            可以直接说：“删除月均消费金额”“新增人生阶段”“把用户年龄移到第1个”；不调整就说“默认就行”。
          </p>
          <p v-if="currentOperation.missingInputs?.length">
            还需确认：{{ currentOperation.missingInputs.join('、') }}
          </p>
          <p v-if="executionStateMessage" class="ai-operation-execution-message">
            {{ executionStateMessage }}
          </p>
        </section>

        <section v-if="showGuidanceCard" class="ai-guidance" aria-label="AI需求确认">
          <header class="ai-guidance-head">
            <span class="ai-guidance-pulse" aria-hidden="true"><i></i></span>
            <div>
              <p>CURRENT UNDERSTANDING</p>
              <h3>{{ guidanceHeadline }}</h3>
              <small>{{ understoodItems.length ? `已确认 ${understoodItems.length} 项信息` : '先确认业务口径，再继续生成方案' }}</small>
            </div>
            <b>{{ plan ? '补充参数' : '明确口径' }}</b>
          </header>

          <dl v-if="understoodItems.length" class="ai-understood-list">
            <div v-for="item in understoodItems" :key="`${item.label}-${item.value}`">
              <dt>{{ item.label }}</dt>
              <dd :title="item.fullValue || item.value">{{ item.value }}</dd>
            </div>
          </dl>

          <div class="ai-guidance-next">
            <span>下一步</span>
            <strong>{{ activeGuidancePrompt }}</strong>
            <small v-if="activeQuestion?.reason">{{ activeQuestion.reason }}</small>
          </div>

          <div v-if="activeQuestion && isAiCategoryQuestion(activeQuestion)" class="ai-category-picker is-compact">
            <div class="ai-category-recommendation">
              <span>{{ isMultiCategoryQuestion(activeQuestion) ? '核心范围' : categorySelectionSourceLabel(activeQuestion) }}</span>
              <div>
                <strong>
                  {{ isMultiCategoryQuestion(activeQuestion)
                    ? selectedCategoryOptions(activeQuestion).length
                      ? `已自动选择 ${selectedCategoryOptions(activeQuestion).length} 个核心类目`
                      : '等待自动匹配核心类目'
                    : selectedCategoryLeaf(activeQuestion) }}
                </strong>
                <small v-if="isMultiCategoryQuestion(activeQuestion)">
                  覆盖品牌店铺主要销售；超过10项将在最终确认后自动拆分
                </small>
                <small v-else :title="selectedCategoryPath(activeQuestion)">{{ formatCategoryPath(selectedCategoryPath(activeQuestion)) }}</small>
              </div>
              <i aria-hidden="true">{{ selectedCategoryOptions(activeQuestion).length ? '✓' : '…' }}</i>
            </div>

            <div v-if="categoryOptionGroups(activeQuestion).length" class="ai-category-groups" role="group" aria-label="按业务类目筛选">
              <button
                v-for="group in categoryOptionGroups(activeQuestion)"
                :key="group.id"
                type="button"
                :class="{ 'is-active': selectedCategoryGroup(activeQuestion) === group.id }"
                :disabled="sending"
                @click="chooseCategoryGroup(activeQuestion, group)"
              >
                <span>{{ group.short }}</span>{{ group.label }}<b>{{ group.options.length }}</b>
              </button>
            </div>

            <label class="ai-category-select">
              <span>{{ isMultiCategoryQuestion(activeQuestion) ? '调整核心类目 · 支持搜索多选' : '选择分析类目 · 支持搜索' }}</span>
              <el-select
                :model-value="categorySelections[activeQuestion.id]"
                :multiple="isMultiCategoryQuestion(activeQuestion)"
                filterable
                remote
                reserve-keyword
                clearable
                collapse-tags
                :max-collapse-tags="3"
                :remote-method="query => searchCategoryOptions(activeQuestion, query)"
                :loading="categorySearchLoading[activeQuestion.id]"
                :placeholder="isMultiCategoryQuestion(activeQuestion) ? '搜索并调整完整核心类目' : '搜索并选择一个正式类目'"
                no-data-text="输入类目关键词，搜索实时正式路径"
                :disabled="sending"
                @visible-change="visible => visible && primeCategoryQuestion(activeQuestion)"
                @update:model-value="value => changeCategorySelection(activeQuestion, value)"
              >
                <el-option-group v-for="group in categoryOptionGroups(activeQuestion)" :key="group.id" :label="`${group.label}（${group.options.length}）`">
                  <el-option
                    v-for="option in group.options"
                    :key="aiCategoryOptionValue(option)"
                    :value="aiCategoryOptionValue(option)"
                    :label="formatCategoryPath(optionLabel(option))"
                  />
                </el-option-group>
              </el-select>
            </label>

            <div class="ai-category-confirm">
              <small>
                {{ categoryPreferenceSyncMessage || (categoryPreferenceSyncing
                    ? '正在读取你的账号偏好…'
                    : categorySelectionSources[activeQuestion.id] === 'remembered'
                      ? '已使用账号中的上次选择。'
                      : isMultiCategoryQuestion(activeQuestion)
                        ? '确认后会一次保存全部核心类目。'
                        : `确认后会记住“${aiCategoryQueryLabel(activeQuestion)}”的选择。`) }}
              </small>
              <button type="button" :disabled="sending || categoryPreferenceSaving || !selectedCategoryOptions(activeQuestion).length" @click="confirmCategorySelection(activeQuestion)">
                {{ categoryPreferenceSaving ? '保存中' : isMultiCategoryQuestion(activeQuestion) ? '确认核心范围' : '确认类目' }}<span>→</span>
              </button>
            </div>
          </div>

          <div v-else-if="guidanceQuickAnswers.length" class="ai-guidance-actions" role="group" aria-label="快捷回答">
            <button
              v-for="answer in guidanceQuickAnswers"
              :key="answer.answer"
              type="button"
              :class="{ 'is-primary': answer.primary, 'is-formal': answer.formal }"
              :disabled="sending"
              @click="sendQuickAnswer(answer.answer)"
            >
              <span v-if="answer.formal">正式</span>{{ answer.label }}
            </button>
          </div>

          <button
            v-for="action in feedbackActions"
            :key="action.prefillMessage || action.label"
            type="button"
            class="ai-feedback-action"
            @click="$emit('request-feedback', action)"
          >
            {{ action.label || '点击反馈' }}<span>→</span>
          </button>
        </section>

        <section v-if="plan?.status === 'ready'" class="ai-plan is-ready">
          <header class="ai-plan-head">
            <div>
              <p>EXECUTION BLUEPRINT · V1</p>
              <h3>{{ plan.audienceName || '未命名人群' }}</h3>
            </div>
            <span class="ai-plan-state"><i></i>{{ plan.status === 'ready' ? 'READY TO APPLY' : 'NEED INPUT' }}</span>
          </header>

          <div v-if="plan.status === 'ready'" class="ai-plan-stats">
            <div><strong>{{ plan.nodes?.length || 0 }}</strong><span>工作台节点</span></div>
            <div><strong>{{ decisionComponentCount }}</strong><span>行为组件</span></div>
            <div><strong>{{ plan.warnings?.length || 0 }}</strong><span>规则提醒</span></div>
          </div>

          <article v-if="plan.workflow" class="ai-workflow-card">
            <div class="ai-workflow-kicker">
              <span>本次系统路径</span>
              <b>{{ workflowStageLabel(plan.workflow) }}</b>
            </div>
            <strong>{{ plan.workflow.title }}</strong>
            <p>{{ plan.workflow.reason }}</p>
            <small>{{ plan.workflow.capability }}</small>
            <div v-if="plan.workflow.prerequisites?.length" class="ai-workflow-prerequisites">
              <span>执行前</span>
              <i v-for="item in plan.workflow.prerequisites" :key="item">{{ item }}</i>
            </div>
          </article>

          <div v-if="plan.decisions?.length" class="ai-decisions">
            <div v-for="(decision, index) in plan.decisions" :key="decision.conditionId || index" class="ai-decision">
              <span>{{ String(index + 1).padStart(2, '0') }}</span>
              <div>
                <strong>{{ decisionLabel(decision) }}</strong>
                <small>{{ decision.reason }}</small>
              </div>
            </div>
          </div>

          <div v-if="plan.nodes?.length" class="ai-node-list">
            <article v-for="(node, index) in plan.nodes" :key="node.id || index" class="ai-node-card">
              <header>
                <span class="ai-node-index">{{ index + 1 }}</span>
                <div>
                  <strong>{{ node.displayName || node.packageType }}</strong>
                  <small>{{ node.packageType }} · {{ relationLabel(node, index) }}</small>
                </div>
              </header>
              <dl>
                <template v-for="item in summarizeNode(node)" :key="item.label">
                  <dt>{{ item.label }}</dt><dd>{{ item.value }}</dd>
                </template>
              </dl>
            </article>
          </div>

          <div v-if="plan.questions?.length" class="ai-questions">
            <p>还需要你确认</p>
            <article v-for="question in plan.questions" :key="question.id">
              <strong>{{ question.prompt }}</strong>
              <small>{{ question.reason }}</small>
              <div v-if="question.answerType === 'boolean'" class="ai-quick-answers">
                <button type="button" :disabled="sending" @click="sendQuickAnswer('可以，我能用这个账号登录数据引擎圈包')">可以使用</button>
                <button type="button" :disabled="sending" @click="sendQuickAnswer('不可以，我不能用这个账号登录数据引擎圈包')">不能使用</button>
              </div>
              <div v-else-if="isAiCategoryQuestion(question)" class="ai-category-picker">
                <div class="ai-category-recommendation">
                  <span>{{ isMultiCategoryQuestion(question) ? '多选参数' : categorySelectionSourceLabel(question) }}</span>
                  <div>
                    <strong>
                      {{ isMultiCategoryQuestion(question)
                        ? `已选择 ${selectedCategoryOptions(question).length} 个核心类目`
                        : selectedCategoryLeaf(question) }}
                    </strong>
                    <small v-if="isMultiCategoryQuestion(question)">
                      核心类目总数不限；超过10项会在最后确认时自动拆成多个组件
                    </small>
                    <small v-else :title="selectedCategoryPath(question)">{{ formatCategoryPath(selectedCategoryPath(question)) }}</small>
                  </div>
                  <i aria-hidden="true">{{ selectedCategoryOptions(question).length ? '✓' : '…' }}</i>
                </div>

                <div v-if="categoryOptionGroups(question).length" class="ai-category-groups" role="group" aria-label="按业务类目筛选">
                  <button
                    v-for="group in categoryOptionGroups(question)"
                    :key="group.id"
                    type="button"
                    :class="{ 'is-active': selectedCategoryGroup(question) === group.id }"
                    :disabled="sending"
                    @click="chooseCategoryGroup(question, group)"
                  >
                    <span>{{ group.short }}</span>{{ group.label }}<b>{{ group.options.length }}</b>
                  </button>
                </div>

                <label class="ai-category-select">
                  <span>{{ isMultiCategoryQuestion(question) ? '品牌核心类目 · 可搜索多选' : '分析类目 · 可搜索单选' }}</span>
                  <el-select
                    :model-value="categorySelections[question.id]"
                    :multiple="isMultiCategoryQuestion(question)"
                    filterable
                    remote
                    reserve-keyword
                    clearable
                    collapse-tags
                    :max-collapse-tags="3"
                    :remote-method="query => searchCategoryOptions(question, query)"
                    :loading="categorySearchLoading[question.id]"
                    :placeholder="isMultiCategoryQuestion(question) ? '默认选全店销售额前10项；自定义可多选' : '搜索并选择一个正式类目'"
                    no-data-text="输入类目关键词，搜索实时正式路径"
                    :disabled="sending"
                    @visible-change="visible => visible && primeCategoryQuestion(question)"
                    @update:model-value="value => changeCategorySelection(question, value)"
                  >
                    <el-option-group v-for="group in categoryOptionGroups(question)" :key="group.id" :label="`${group.label}（${group.options.length}）`">
                      <el-option
                        v-for="option in group.options"
                        :key="aiCategoryOptionValue(option)"
                        :value="aiCategoryOptionValue(option)"
                        :label="formatCategoryPath(optionLabel(option))"
                      />
                    </el-option-group>
                  </el-select>
                </label>

                <div v-if="isMultiCategoryQuestion(question) && selectedCategoryOptions(question).length" class="ai-category-chips">
                  <span v-for="option in selectedCategoryOptions(question)" :key="aiCategoryOptionValue(option)">
                    {{ optionLabel(option).split('>').at(-1) }}
                  </span>
                </div>

                <div class="ai-category-confirm">
                  <small>
                    {{ categoryPreferenceSyncMessage || (categoryPreferenceSyncing
                        ? '正在读取你的账号偏好…'
                        : categorySelectionSources[question.id] === 'remembered'
                          ? '已按账号里的上次选择预选，换电脑登录也会保留。'
                          : isMultiCategoryQuestion(question)
                            ? '确认后会一次保存全部核心类目，并应用到同一个方案参数。'
                            : `确认后会把“${aiCategoryQueryLabel(question)}”的选择保存到你的账号。`) }}
                  </small>
                  <button type="button" :disabled="sending || categoryPreferenceSaving || !selectedCategoryOptions(question).length" @click="confirmCategorySelection(question)">
                    {{ categoryPreferenceSaving ? '保存中' : isMultiCategoryQuestion(question) ? '确认全部类目' : categorySelectionSources[question.id] === 'remembered' ? '继续使用' : '确认类目' }}<span>→</span>
                  </button>
                </div>
              </div>
              <div v-else-if="question.options?.length" class="ai-quick-answers">
                <p class="ai-option-count">实时维表匹配到 {{ question.options.length }} 个正式选项</p>
                <button
                  v-for="option in sortedQuestionOptions(question)"
                  :key="option.value || option.label"
                  type="button"
                  :class="{ 'is-formal-brand': isFormalBrandOption(question, option) }"
                  :disabled="sending"
                  @click="sendQuickAnswer(optionLabel(option))"
                >
                  <span v-if="isFormalBrandOption(question, option)">标准品牌</span>
                  {{ optionLabel(option) }}
                </button>
              </div>
            </article>
          </div>

          <div v-if="plan.warnings?.length" class="ai-warnings">
            <p>规则提醒</p>
            <div v-for="warning in plan.warnings" :key="warning"><span>!</span>{{ warning }}</div>
          </div>

          <button
            v-for="action in feedbackActions"
            :key="action.prefillMessage || action.label"
            type="button"
            class="ai-feedback-action"
            @click="$emit('request-feedback', action)"
          >
            {{ action.label || '点击反馈' }}<span>→</span>
          </button>
        </section>

        <p v-if="errorMessage" class="ai-error" role="alert">{{ errorMessage }}</p>
      </main>

      <footer class="ai-composer">
        <div class="ai-input-wrap" :class="{ 'is-disabled': !modelStatus?.configured }">
          <textarea
            v-model="draft"
            rows="3"
            maxlength="200000"
            :disabled="!modelStatus?.configured || sending"
            placeholder="描述圈人需求，或直接粘贴数据引擎JSON…"
            aria-label="描述需要圈选的人群"
            @keydown.enter.exact.prevent="sendMessage()"
          ></textarea>
          <button type="button" :disabled="!canSend" :aria-label="sending ? 'AI正在推演' : '发送圈人需求'" @click="sendMessage()">
            <span v-if="sending" class="ai-send-loader" aria-hidden="true"></span>
            <span v-else aria-hidden="true">↑</span>
          </button>
        </div>
        <div class="ai-footer-actions">
          <div v-if="hasExportableConversation" class="ai-footer-tools">
            <button type="button" class="ai-reset" :disabled="sending" @click="resetConversation">重新描述</button>
            <span class="ai-footer-divider" aria-hidden="true"></span>
            <button
              type="button"
              class="ai-export"
              title="导出对话、识别结果和执行状态（不含密钥）"
              aria-label="导出AI对话调试文件"
              @click="exportConversation"
            >
              <span aria-hidden="true">↓</span>
              导出对话
            </button>
          </div>
          <span v-else><i></i>确认后，AI 会调用系统的真实功能执行</span>
          <button
            v-if="currentOperation?.status === 'needs_confirmation'"
            type="button"
            class="ai-apply is-operation"
            :disabled="sending || !canConfirmOperation"
            @click="confirmOperation"
          >
            {{ operationConfirmLabel }}
          </button>
          <button
            v-else-if="plan?.status === 'ready'"
            type="button"
            class="ai-apply"
            :disabled="sending || !plan.nodes?.length"
            @click="applyPlan"
          >
            {{ workflowApplyLabel }}
          </button>
        </div>
      </footer>
    </div>
  </el-drawer>
</template>

<script setup>
import { computed, nextTick, onBeforeUnmount, reactive, ref, watch } from 'vue'
import { ElMessage } from 'element-plus'
import { request } from '../utils/apiClient.js'
import {
  aiCategoryOptionLabel,
  aiCategoryOptionValue,
  aiCategoryQueryLabel,
  cacheAiCategoryPreferences,
  categoryOptionGroup,
  chooseAiCategoryOption,
  groupAiCategoryOptions,
  isAiCategoryQuestion,
  loadAiCategoryPreferences,
  rememberAiCategoryOption,
} from '../utils/aiCategoryPreferences.js'

const props = defineProps({
  modelValue: { type: Boolean, default: false },
  existingNodeCount: { type: Number, default: 0 },
  executionState: { type: Object, default: null },
})

const emit = defineEmits(['update:modelValue', 'apply', 'execute', 'reset-execution', 'request-feedback'])

const examples = [
  '圈最近30天浏览过或购买过面霜的人',
  '圈我们IPSA店里购买过商品123456的人',
  '圈Dior香水购买人群，我有商品ID但没有账号权限',
  '对两个人群包批量取达摩盘画像，并做横向对比',
]

const thinkingStages = [
  { label: '解析人群语义', detail: '识别对象、行为、时间范围与排除条件' },
  { label: '选择行为组件', detail: '判断公域、自店、商品 ID 与品牌账号权限' },
  { label: '校验业务规则', detail: '检查人数颗粒度、行为关系与必要追问' },
  { label: '编排工作台方案', detail: '生成组件参数、节点顺序与交并差关系' },
]

const drawerOpen = computed({
  get: () => props.modelValue,
  set: value => emit('update:modelValue', value),
})
const modelStatus = ref(null)
const statusLoading = ref(false)
const sending = ref(false)
const draft = ref('')
const messages = ref([])
const currentIntent = ref(null)
const currentWorkflow = ref(null)
const currentOperation = ref(null)
const plan = ref(null)
const errorMessage = ref('')
const scrollRef = ref(null)
const categoryPreferences = ref(loadAiCategoryPreferences())
const categoryPreferenceSyncing = ref(false)
const categoryPreferenceSaving = ref(false)
const categoryPreferenceSyncMessage = ref('')
const categorySelections = reactive({})
const categorySelectionSources = reactive({})
const categoryRemoteOptions = reactive({})
const categorySearchLoading = reactive({})
const categorySearchTimers = new Map()
let activeController = null
let processStageTimer = null
let processElapsedTimer = null
let typingFrame = null
let messageSequence = 0
let typingSequence = 0
let executionSequence = 0
let lastExecutionNoticeKey = ''

const canSend = computed(() => Boolean(modelStatus.value?.configured && draft.value.trim() && !sending.value))
const hasExportableConversation = computed(() => Boolean(
  messages.value.length || currentIntent.value || currentWorkflow.value || currentOperation.value || plan.value,
))
const modelLabel = computed(() => String(modelStatus.value?.model || 'AI').toUpperCase())
const modelThinkingLabel = computed(() => {
  if (modelStatus.value?.thinkingMode === 'disabled') return 'thinking off'
  return `reasoning ${modelStatus.value?.reasoningEffort || 'on'}`
})
const statusClass = computed(() => ({
  'is-loading': statusLoading.value,
  'is-ready': modelStatus.value?.configured,
  'is-offline': !statusLoading.value && !modelStatus.value?.configured,
}))
const decisionComponentCount = computed(() => new Set(
  (plan.value?.decisions || []).flatMap(decisionComponents).filter(Boolean),
).size)
const feedbackActions = computed(() => (plan.value?.nextActions || []).filter(action => action.type === 'open_feedback'))
const latestProcessId = computed(() => (
  [...messages.value].reverse().find(item => item.role === 'process')?.id || ''
))
const latestAssistantMessage = computed(() => (
  [...messages.value].reverse().find(item => item.role === 'assistant') || null
))
const activeQuestion = computed(() => (
  plan.value?.status !== 'ready' ? (plan.value?.questions || [])[0] || null : null
))
const activeGuidancePrompt = computed(() => String(
  activeQuestion.value?.prompt
  || latestAssistantMessage.value?.content
  || '继续告诉我你想圈选的人群。'
).trim())
const understoodItems = computed(() => buildUnderstoodItems(currentIntent.value, plan.value))
const guidanceHeadline = computed(() => {
  const solutionName = plan.value?.matchedSolution?.name
  if (solutionName) return `正在准备「${solutionName}」`
  const parameterName = String(activeQuestion.value?.parameterName || '').trim()
  if (parameterName) return `还需要确认${parameterName}`
  return understoodItems.value.length ? '需求轮廓已经识别' : '先把需求说清楚'
})
const guidanceQuickAnswers = computed(() => quickAnswersFor(
  activeQuestion.value,
  activeGuidancePrompt.value,
))
const showGuidanceCard = computed(() => (
  !sending.value
  && !currentOperation.value
  && plan.value?.status !== 'ready'
  && Boolean(plan.value || guidanceQuickAnswers.value.length)
))
const canConfirmOperation = computed(() => (
  (currentOperation.value?.crowdNames?.length || 0) >= 2
  && (currentOperation.value?.tagNames?.length || 0) > 0
))
const operationConfirmLabel = computed(() => (
  currentOperation.value?.tagSelectionConfirmed
    ? '确认并开始取数'
    : '使用默认标签并开始取数'
))
const operationDisplayStatus = computed(() => {
  if (currentOperation.value?.status === 'needs_confirmation') return 'needs_confirmation'
  return String(props.executionState?.status || currentOperation.value?.status || 'draft')
})
const operationStatusLabel = computed(() => ({
  needs_confirmation: '待确认',
  ready: '准备中',
  queued: '排队中',
  preparing: '准备中',
  waiting: '等待连接',
  running: '执行中',
  completed: '已完成',
  partial: '部分完成',
  failed: '执行失败',
  cancelled: '已终止',
}[operationDisplayStatus.value] || '准备中'))
const executionStateMessage = computed(() => (
  currentOperation.value?.status === 'ready'
    ? String(props.executionState?.message || '')
    : ''
))
const workflowApplyLabel = computed(() => {
  if (plan.value?.workflow?.applicationMode === 'staged') return '确认并准备基础方案'
  return props.existingNodeCount ? '确认并替换工作台' : '确认并应用到工作台'
})

async function loadStatus() {
  statusLoading.value = true
  errorMessage.value = ''
  try {
    modelStatus.value = await request('/api/ai/status')
  } catch (error) {
    modelStatus.value = { configured: false }
    errorMessage.value = error.message || '无法读取AI配置状态'
  } finally {
    statusLoading.value = false
  }
}

async function loadAccountCategoryPreferences() {
  const browserFallback = loadAiCategoryPreferences()
  categoryPreferenceSyncing.value = true
  categoryPreferenceSyncMessage.value = ''
  try {
    const accountResult = await request('/api/ai/category-preferences', { cache: 'no-store' })
    categoryPreferences.value = cacheAiCategoryPreferences(accountResult?.preferences || [])
    const migratablePreferences = browserFallback.filter(item => item?.queryKey && item?.value)
    if (migratablePreferences.length) {
      const mergedResult = await request('/api/ai/category-preferences', {
        method: 'PUT',
        body: JSON.stringify({ mode: 'merge', preferences: migratablePreferences }),
        timeoutMs: 5_000,
      })
      categoryPreferences.value = cacheAiCategoryPreferences(mergedResult?.preferences || categoryPreferences.value)
    }
  } catch {
    if (!categoryPreferences.value.length) categoryPreferences.value = browserFallback
    categoryPreferenceSyncMessage.value = '账号偏好暂未同步，本次仍可正常选择。'
  } finally {
    categoryPreferenceSyncing.value = false
    initializeCategoryQuestions(plan.value)
  }
}

async function loadDrawerData() {
  await Promise.all([loadStatus(), loadAccountCategoryPreferences()])
}

function useExample(example) {
  draft.value = example
  void sendMessage()
}

function sendQuickAnswer(answer) {
  draft.value = answer
  void sendMessage()
}

function isLatestProcess(item) {
  return item?.id === latestProcessId.value
}

function isGuidanceEcho(item) {
  return Boolean(
    showGuidanceCard.value
    && item?.role === 'assistant'
    && item?.id === latestAssistantMessage.value?.id
    && String(item?.content || '').trim() === activeGuidancePrompt.value,
  )
}

function compactValues(values, limit = 2) {
  const unique = [...new Set(values.map(value => String(value || '').trim()).filter(Boolean))]
  if (unique.length <= limit) return unique.join('、')
  return `${unique.slice(0, limit).join('、')} 等${unique.length}项`
}

function categoryLeaf(value) {
  return String(value || '').split('>').at(-1)?.trim() || ''
}

function buildUnderstoodItems(intent, currentPlan) {
  const conditions = Array.isArray(intent?.conditions) ? intent.conditions.filter(Boolean) : []
  const items = []
  const add = (label, value, fullValue = '') => {
    if (!value || items.some(item => item.label === label && item.value === value)) return
    items.push({ label, value, fullValue: fullValue || value })
  }
  if (currentPlan?.matchedSolution?.name) add('方案', currentPlan.matchedSolution.name)

  const brands = conditions.flatMap(condition => [
    ...(Array.isArray(condition.brands) ? condition.brands : []),
    condition.brand,
  ])
  if (brands.some(Boolean)) add('品牌', compactValues(brands), brands.filter(Boolean).join('、'))

  const categoryGroups = conditions.reduce((groups, condition) => {
    const categories = Array.isArray(condition.categories) ? condition.categories : []
    if (!categories.length) return groups
    const displayName = String(condition.displayName || '').replace('品类', '类目')
    const target = /核心类目|我这个品牌|我品牌|本品牌/.test(displayName)
      ? groups.core
      : groups.analysis
    target.push(...categories)
    return groups
  }, { analysis: [], core: [] })
  if (categoryGroups.analysis.length) {
    const leaves = categoryGroups.analysis.map(categoryLeaf).filter(Boolean)
    add('类目', compactValues(leaves), categoryGroups.analysis.join('、'))
  }
  if (categoryGroups.core.length) {
    const leaves = categoryGroups.core.map(categoryLeaf).filter(Boolean)
    add('核心范围', compactValues(leaves), categoryGroups.core.join('、'))
  }

  const behaviors = conditions.flatMap(condition => (
    Array.isArray(condition.behaviors) ? condition.behaviors : []
  ))
  if (behaviors.length) add('行为', compactValues(behaviors), behaviors.join('、'))

  const channels = conditions.flatMap(condition => (
    Array.isArray(condition.channels) ? condition.channels : []
  ))
  if (channels.length) add('渠道', compactValues(channels), channels.join('、'))

  const productIds = conditions.flatMap(condition => (
    Array.isArray(condition.productIds) ? condition.productIds : []
  ))
  if (productIds.length) add('商品', productIds.length === 1 ? `ID ${productIds[0]}` : `${productIds.length}个商品ID`, productIds.join('、'))

  const searchKeywords = conditions.flatMap(condition => (
    Array.isArray(condition.searchKeywords) ? condition.searchKeywords : []
  ))
  if (searchKeywords.length) add('搜索词', compactValues(searchKeywords), searchKeywords.join('、'))

  const timeValues = conditions.flatMap(condition => {
    if (Array.isArray(condition.dateRange) && condition.dateRange.length === 2) {
      return [`${condition.dateRange[0]} 至 ${condition.dateRange[1]}`]
    }
    if (Number.isFinite(Number(condition.recentDays)) && Number(condition.recentDays) > 0) {
      return [`近${Number(condition.recentDays)}天`]
    }
    return []
  })
  if (timeValues.length) add('时间', compactValues(timeValues), timeValues.join('、'))

  const scopes = conditions.map(condition => ({
    own_store: '官旗店铺',
    own_brand: '品牌全域',
    public: '品牌公域',
  }[condition.scope])).filter(Boolean)
  if (scopes.length) add('范围', compactValues(scopes), scopes.join('、'))
  return items.slice(0, 8)
}

function quickAnswer(label, answer = label, extra = {}) {
  return { label, answer, ...extra }
}

function quickAnswersFor(question, fallbackPrompt = '') {
  if (question?.answerType === 'boolean') {
    return [
      quickAnswer('可以使用', '可以，我能用这个账号登录数据引擎圈包', { primary: true }),
      quickAnswer('不能使用', '不可以，我不能用这个账号登录数据引擎圈包'),
    ]
  }
  if (question && !isAiCategoryQuestion(question) && question.options?.length) {
    return sortedQuestionOptions(question).slice(0, 20).map(option => quickAnswer(
      optionLabel(option),
      optionLabel(option),
      { formal: isFormalBrandOption(question, option) },
    ))
  }

  const prompt = String(question?.prompt || fallbackPrompt || '')
  const parameter = String(question?.parameterName || question?.field || '')
  if (/品类新客|转牌新客|哪种新客|新人或新客/.test(prompt)) {
    return [
      quickAnswer('品类新客', '品类新客', { primary: true }),
      quickAnswer('转牌新客'),
      quickAnswer('不确定，帮我判断', '我不确定是哪种新客，请结合我的需求继续引导'),
    ]
  }
  if (/品类老客|品牌老客|老客.*口径/.test(prompt)) {
    return [
      quickAnswer('品类老客', '品类老客', { primary: true }),
      quickAnswer('品牌老客'),
      quickAnswer('不确定，帮我判断', '我不确定是哪种老客，请结合我的需求继续引导'),
    ]
  }
  if (/用户行为|什么行为|行为（|行为，例如/.test(prompt) || /行为/.test(parameter)) {
    return ['浏览', '购买', '收藏', '加购', '预售', '退款', '评论'].map((label, index) => (
      quickAnswer(label, label, { primary: index === 1 })
    ))
  }
  if (/时间|日期|周期|多久/.test(parameter + prompt)) {
    if (/对比/.test(parameter + prompt)) {
      return [
        quickAnswer('近30天 对比 前30天', '近30天对比前30天', { primary: true }),
        quickAnswer('近90天 对比 前90天', '近90天对比前90天'),
        quickAnswer('近半年 对比 前半年', '近半年对比前半年'),
      ]
    }
    return [
      quickAnswer('近7天'),
      quickAnswer('近30天', '近30天', { primary: true }),
      quickAnswer('近90天'),
      quickAnswer('本月 MTD', '本月MTD'),
      quickAnswer('今年 YTD', '今年YTD'),
    ]
  }
  return []
}

function recentConversationText() {
  return messages.value
    .filter(item => item.role === 'user')
    .slice(-6)
    .map(item => item.content)
    .join(' ')
}

function isMultiCategoryQuestion(question) {
  return question?.answerType === 'multi_select'
}

function categoryMaxSelections(question) {
  const configured = Number(question?.maxSelections)
  return Number.isInteger(configured) && configured > 0 ? configured : (isMultiCategoryQuestion(question) ? null : 1)
}

function limitCategorySelections(question, values = []) {
  const uniqueValues = [...new Set(values)]
  const maximum = categoryMaxSelections(question)
  return maximum ? uniqueValues.slice(0, maximum) : uniqueValues
}

function uniqueCategoryOptions(options = []) {
  const seen = new Set()
  return options.filter(option => {
    const value = aiCategoryOptionValue(option)
    if (!value || seen.has(value)) return false
    seen.add(value)
    return true
  })
}

function categoryQuestionOptions(question) {
  return uniqueCategoryOptions([
    ...(question?.options || []),
    ...(question?.selectedValues || []),
    ...(categoryRemoteOptions[question?.id] || []),
  ])
}

function categoryQuestionView(question, options = categoryQuestionOptions(question)) {
  return { ...question, options }
}

function initializeCategoryQuestions(currentPlan) {
  for (const question of currentPlan?.questions || []) {
    if (!isAiCategoryQuestion(question)) continue
    const availableOptions = categoryQuestionOptions(question)
    if (isMultiCategoryQuestion(question)) {
      const selected = (question.selectedValues || []).map(String).filter(Boolean)
      let remembered = false
      for (const group of question.optionGroups || []) {
        if (!group?.options?.length) continue
        const groupQuestion = {
          ...categoryQuestionView(question, group.options),
          action: { ...question.action, query: group.query || '' },
        }
        const choice = chooseAiCategoryOption(
          groupQuestion,
          categoryPreferences.value,
          recentConversationText(),
        )
        const value = aiCategoryOptionValue(choice.option)
        if (value) selected.push(value)
        if (choice.source === 'remembered') remembered = true
      }
      categorySelections[question.id] = limitCategorySelections(question, selected)
      categorySelectionSources[question.id] = remembered ? 'remembered' : (selected.length ? 'recommended' : 'none')
      continue
    }
    if (!availableOptions.length) {
      categorySelections[question.id] = ''
      categorySelectionSources[question.id] = 'none'
      continue
    }
    const choice = chooseAiCategoryOption(categoryQuestionView(question, availableOptions), categoryPreferences.value, recentConversationText())
    categorySelections[question.id] = aiCategoryOptionValue(choice.option)
    categorySelectionSources[question.id] = choice.source
  }
}

function categoryOptionGroups(question) {
  return groupAiCategoryOptions(categoryQuestionView(question), recentConversationText())
}

function selectedCategoryOptions(question) {
  const values = isMultiCategoryQuestion(question)
    ? (Array.isArray(categorySelections[question.id]) ? categorySelections[question.id] : [])
    : [categorySelections[question.id]].filter(Boolean)
  const available = categoryQuestionOptions(question)
  return values.map(value => (
    available.find(option => aiCategoryOptionValue(option) === value) || { value, label: value }
  ))
}

function selectedCategoryOption(question) {
  return selectedCategoryOptions(question)[0] || null
}

function selectedCategoryGroup(question) {
  return categoryOptionGroup(selectedCategoryOption(question))
}

function selectedCategoryPath(question) {
  return aiCategoryOptionLabel(selectedCategoryOption(question))
}

function selectedCategoryLeaf(question) {
  return selectedCategoryPath(question).split('>').at(-1)?.trim() || '待选择类目'
}

function formatCategoryPath(value) {
  return String(value || '').split('>').map(item => item.trim()).filter(Boolean).join('  ›  ')
}

function categorySelectionSourceLabel(question) {
  return categorySelectionSources[question.id] === 'remembered' ? '上次使用' : '智能推荐'
}

function chooseCategoryGroup(question, group) {
  const option = group?.options?.[0]
  if (!option) return
  const value = aiCategoryOptionValue(option)
  if (isMultiCategoryQuestion(question)) {
    const current = Array.isArray(categorySelections[question.id]) ? categorySelections[question.id] : []
    categorySelections[question.id] = limitCategorySelections(question, [...current, value])
  } else {
    categorySelections[question.id] = value
  }
  categorySelectionSources[question.id] = 'manual'
}

function changeCategorySelection(question, value) {
  categorySelections[question.id] = isMultiCategoryQuestion(question)
    ? limitCategorySelections(question, Array.isArray(value) ? value : [])
    : value
  categorySelectionSources[question.id] = 'manual'
}

function searchCategoryOptions(question, query) {
  const questionId = question?.id
  if (!questionId) return
  if (categorySearchTimers.has(questionId)) window.clearTimeout(categorySearchTimers.get(questionId))
  const text = String(query || '').trim()
  if (!text) return
  categorySearchTimers.set(questionId, window.setTimeout(async () => {
    categorySearchLoading[questionId] = true
    try {
      const result = await request('/api/ai/options/search', {
        method: 'POST',
        body: JSON.stringify({
          component: question?.action?.component || '类目公域行为',
          field: question?.action?.field || question?.field || 'leafCates',
          query: text,
          limit: 50,
        }),
        timeoutMs: 8_000,
      })
      categoryRemoteOptions[questionId] = uniqueCategoryOptions(result?.matches || [])
    } catch (error) {
      categoryPreferenceSyncMessage.value = error.message || '类目搜索暂时不可用，请稍后重试。'
    } finally {
      categorySearchLoading[questionId] = false
    }
  }, 180))
}

function primeCategoryQuestion(question) {
  if (categoryQuestionOptions(question).length) return
  const query = String(question?.action?.query || '').trim()
  if (query) searchCategoryOptions(question, query)
}

async function confirmCategorySelection(question) {
  const options = selectedCategoryOptions(question)
  if (!options.length) return
  const savedRecords = []
  for (const option of options) {
    const value = aiCategoryOptionValue(option)
    const sourceGroup = (question.optionGroups || []).find(group => (
      (group?.options || []).some(item => aiCategoryOptionValue(item) === value)
    ))
    const preferenceQuestion = {
      ...question,
      action: { ...question.action, query: sourceGroup?.query || optionLabel(option).split('>').at(-1) || '' },
    }
    categoryPreferences.value = rememberAiCategoryOption(preferenceQuestion, option, categoryPreferences.value)
    savedRecords.push(categoryPreferences.value[0])
  }
  categoryPreferenceSaving.value = true
  categoryPreferenceSyncMessage.value = ''
  try {
    const result = await request('/api/ai/category-preferences', {
      method: 'PUT',
      body: JSON.stringify({ mode: 'upsert', preferences: savedRecords }),
      timeoutMs: 5_000,
    })
    categoryPreferences.value = cacheAiCategoryPreferences(result?.preferences || categoryPreferences.value)
  } catch {
    categoryPreferenceSyncMessage.value = '本次选择已生效，账号记忆稍后再同步。'
  } finally {
    categoryPreferenceSaving.value = false
  }
  const values = options.map(aiCategoryOptionValue)
  const parameterName = question.parameterName || (isMultiCategoryQuestion(question) ? '品牌核心类目' : '分析类目')
  void sendMessage({
    questionId: question.id,
    values,
    displayText: `已选择${parameterName}：${options.map(option => optionLabel(option).split('>').at(-1)).join('、')}`,
  })
}

function createMessageId(prefix) {
  messageSequence += 1
  return `${prefix}-${Date.now()}-${messageSequence}`
}

function clearProcessTimers() {
  if (processStageTimer) window.clearInterval(processStageTimer)
  if (processElapsedTimer) window.clearInterval(processElapsedTimer)
  processStageTimer = null
  processElapsedTimer = null
}

function beginThinkingProcess() {
  clearProcessTimers()
  messages.value.forEach(item => {
    if (item.role === 'process') item.expanded = false
  })
  const process = reactive({
    id: createMessageId('process'),
    role: 'process',
    status: 'running',
    stageIndex: 0,
    elapsed: 0,
    expanded: true,
    startedAt: Date.now(),
  })
  messages.value.push(process)
  processStageTimer = window.setInterval(() => {
    if (process.status === 'running' && process.stageIndex < thinkingStages.length - 2) {
      process.stageIndex += 1
    }
  }, 1600)
  processElapsedTimer = window.setInterval(() => {
    if (process.status === 'running') process.elapsed = Math.max(1, Math.round((Date.now() - process.startedAt) / 1000))
  }, 1000)
  return process
}

function finishThinkingProcess(process, status = 'complete') {
  clearProcessTimers()
  if (!process) return
  process.status = status
  process.elapsed = Math.max(1, Math.round((Date.now() - process.startedAt) / 1000))
  if (status === 'complete') {
    process.stageIndex = thinkingStages.length - 1
    process.expanded = false
  }
}

function processStageClass(process, stageIndex) {
  if (process.status === 'complete' || stageIndex < process.stageIndex) return 'is-done'
  if (process.status === 'error' && stageIndex === process.stageIndex) return 'is-error'
  if (process.status === 'running' && stageIndex === process.stageIndex) return 'is-active'
  return 'is-pending'
}

function stopTyping() {
  typingSequence += 1
  if (typingFrame) window.cancelAnimationFrame(typingFrame)
  typingFrame = null
}

async function typeAssistantReply(content) {
  const message = {
    id: createMessageId('assistant'),
    role: 'assistant',
    content,
    displayContent: '',
    typing: true,
  }
  messages.value.push(message)
  await scrollToBottom()

  if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) {
    message.displayContent = content
    message.typing = false
    return
  }

  stopTyping()
  const runId = typingSequence
  const duration = Math.min(2600, Math.max(1200, 1000 + content.length * 8))
  await new Promise(resolve => {
    let startedAt = null
    const typeNext = timestamp => {
      if (runId !== typingSequence) {
        resolve()
        return
      }
      if (startedAt == null) startedAt = timestamp
      const progress = Math.min(1, (timestamp - startedAt) / duration)
      const visibleLength = Math.max(1, Math.floor(content.length * progress))
      message.displayContent = content.slice(0, visibleLength)
      if (scrollRef.value) scrollRef.value.scrollTop = scrollRef.value.scrollHeight
      if (progress >= 1) {
        message.displayContent = content
        message.typing = false
        typingFrame = null
        resolve()
        return
      }
      typingFrame = window.requestAnimationFrame(typeNext)
    }
    typingFrame = window.requestAnimationFrame(typeNext)
  })
}

async function sendMessage(questionAnswer = null) {
  const message = String(questionAnswer?.displayText || draft.value).trim()
  if (!message || sending.value || !modelStatus.value?.configured) return
  const history = messages.value
    .filter(item => item.role === 'user' || item.role === 'assistant')
    .slice(-512)
    .map(item => ({ role: item.role, content: item.content }))
  messages.value.push({ id: createMessageId('user'), role: 'user', content: message })
  const process = beginThinkingProcess()
  draft.value = ''
  sending.value = true
  errorMessage.value = ''
  activeController?.abort()
  activeController = new AbortController()
  await scrollToBottom()
  try {
    const result = await request('/api/ai/chat', {
      method: 'POST',
      body: JSON.stringify({
        message,
        history,
        currentIntent: currentIntent.value,
        currentWorkflow: currentWorkflow.value,
        currentOperation: currentOperation.value,
        pendingQuestions: plan.value?.questions || [],
        questionAnswer: questionAnswer
          ? { questionId: questionAnswer.questionId, values: questionAnswer.values }
          : undefined,
      }),
      signal: activeController.signal,
      timeoutMs: 210_000,
    })
    currentIntent.value = result.intent || currentIntent.value
    currentWorkflow.value = result.workflow || currentWorkflow.value
    currentOperation.value = result.operation || currentOperation.value
    finishThinkingProcess(process)
    await typeAssistantReply(result.reply || '请继续补充圈包条件。')
    plan.value = result.plan || null
    if (currentOperation.value?.status === 'ready' && !props.executionState?.token) {
      const dispatchId = ++executionSequence
      emit('execute', { ...currentOperation.value, dispatchId })
    }
  } catch (error) {
    finishThinkingProcess(process, 'error')
    if (error.name !== 'AbortError') {
      errorMessage.value = error.message || 'AI解析失败，请稍后重试'
    }
  } finally {
    sending.value = false
    activeController = null
    await scrollToBottom()
  }
}

function resetConversation() {
  activeController?.abort()
  activeController = null
  clearProcessTimers()
  stopTyping()
  messages.value = []
  currentIntent.value = null
  currentWorkflow.value = null
  currentOperation.value = null
  plan.value = null
  draft.value = ''
  errorMessage.value = ''
  emit('reset-execution')
}

const DEBUG_EXPORT_SENSITIVE_KEY = /api[-_]?key|authorization|password|secret|access[-_]?token|refresh[-_]?token/i

function debugSnapshot(value) {
  if (value === undefined) return null
  return JSON.parse(JSON.stringify(value, (key, nestedValue) => {
    if (key && DEBUG_EXPORT_SENSITIVE_KEY.test(key)) return '[已隐藏]'
    if (typeof nestedValue === 'bigint') return String(nestedValue)
    return nestedValue
  }))
}

function exportableConversationMessage(item, index) {
  const base = {
    sequence: index + 1,
    role: String(item?.role || 'unknown'),
  }
  if (item?.role === 'process') {
    return {
      ...base,
      status: String(item.status || ''),
      elapsedSeconds: Number(item.elapsed || 0),
      currentStage: Number(item.stageIndex || 0) + 1,
      stages: thinkingStages.map(stage => ({ ...stage })),
    }
  }
  return {
    ...base,
    content: String(item?.content || ''),
    displayedContent: String(item?.displayContent ?? item?.content ?? ''),
  }
}

function buildConversationDebugExport(exportedAt = new Date()) {
  const safeModelStatus = {
    configured: modelStatus.value?.configured === true,
    model: String(modelStatus.value?.model || ''),
    maxInputTokens: Number(modelStatus.value?.maxInputTokens || 0) || null,
    thinkingMode: String(modelStatus.value?.thinkingMode || ''),
    reasoningEffort: String(modelStatus.value?.reasoningEffort || ''),
    solutionKnowledgeCount: Number(modelStatus.value?.solutionKnowledgeCount || 0),
    systemFeatureCount: Number(modelStatus.value?.systemFeatureCount || 0),
  }
  return {
    schemaVersion: 1,
    exportedAt: exportedAt.toISOString(),
    source: 'X-Data AI 人群策略师',
    model: safeModelStatus,
    conversation: messages.value.map(exportableConversationMessage),
    context: debugSnapshot({
      currentIntent: currentIntent.value,
      currentWorkflow: currentWorkflow.value,
      currentOperation: currentOperation.value,
      plan: plan.value,
      executionState: props.executionState,
      categoryPreferences: categoryPreferences.value,
      categorySelections,
      categorySelectionSources,
      errorMessage: errorMessage.value || null,
    }),
  }
}

function exportConversation() {
  try {
    const exportedAt = new Date()
    const payload = buildConversationDebugExport(exportedAt)
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    const timestamp = exportedAt.toISOString().replace(/[-:]/g, '').replace('T', '-').replace(/\.\d{3}Z$/, '')
    link.href = url
    link.download = `X-Data_AI对话_${timestamp}.json`
    document.body.appendChild(link)
    link.click()
    link.remove()
    window.setTimeout(() => URL.revokeObjectURL(url), 1000)
    ElMessage.success('AI 对话调试文件已导出')
  } catch (error) {
    ElMessage.error(error?.message || '对话导出失败，请稍后重试')
  }
}

function confirmOperation() {
  if (!canConfirmOperation.value || sending.value) return
  draft.value = '默认标签无需调整；已登录达摩盘且任务执行器已连接，确认开始执行'
  void sendMessage()
}

function messageParagraphs(content) {
  const value = String(content || '').trim()
  if (!value) return ['']
  return value
    .replace(/\s+(?=\d+[）).、])/g, '\n')
    .split(/\n+/)
    .map(item => item.trim())
    .filter(Boolean)
}

function applyPlan() {
  if (plan.value?.status !== 'ready' || !plan.value.nodes?.length) return
  emit('apply', {
    nodes: plan.value.nodes,
    audienceName: plan.value.audienceName,
    workflow: plan.value.workflow || currentWorkflow.value,
    skipReplaceConfirmation: plan.value.skipReplaceConfirmation === true,
  })
}

function workflowStageLabel(workflow) {
  if (workflow?.applicationMode === 'workbench') return '可直接应用'
  if (workflow?.applicationMode === 'specialized') return '进入专用功能'
  return '分阶段执行'
}

function decisionLabel(decision) {
  const components = decisionComponents(decision)
  if (components.length) return components.join(' ∩ ')
  return '等待选择组件'
}

function componentLabel(value) {
  if (typeof value === 'string' || typeof value === 'number') return String(value).trim()
  if (!value || typeof value !== 'object') return ''
  return String(value.component || value.label || value.name || '').trim()
}

function decisionComponents(decision) {
  const raw = Array.isArray(decision?.componentPlan)
    ? decision.componentPlan
    : [decision?.component]
  return raw.map(componentLabel).filter(Boolean)
}

function optionLabel(option) {
  if (typeof option === 'string' || typeof option === 'number') return String(option)
  if (!option || typeof option !== 'object') return '待确认选项'
  return String(option.label || option.value || '待确认选项')
}

function isFormalBrandOption(question, option) {
  return question?.field === 'stdBrand' && /[/／]/.test(optionLabel(option))
}

function sortedQuestionOptions(question) {
  const options = Array.isArray(question?.options) ? [...question.options] : []
  if (question?.field === 'bhv' || question?.field === 'behaviors' || /行为/.test(String(question?.parameterName || ''))) {
    const order = ['浏览', '购买', '收藏', '加购', '预售', '退款', '评论']
    return options.sort((left, right) => {
      const leftOrder = order.indexOf(optionLabel(left))
      const rightOrder = order.indexOf(optionLabel(right))
      return (leftOrder < 0 ? order.length : leftOrder) - (rightOrder < 0 ? order.length : rightOrder)
    })
  }
  if (question?.field !== 'stdBrand') return options
  return options.sort((left, right) => Number(isFormalBrandOption(question, right)) - Number(isFormalBrandOption(question, left)))
}

function relationLabel(node, index) {
  if (index === 0) return '起始条件'
  return node.operator === 'u' ? '与前序取并集' : node.operator === 'd' ? '从前序中排除' : '与前序取交集'
}

function formatContextWindow(tokens) {
  const value = Number(tokens)
  if (!Number.isFinite(value) || value <= 0) return '未知'
  if (value >= 1_000_000) return `${Number((value / 1_000_000).toFixed(2))}M`
  if (value >= 1000) return `${Math.round(value / 1000)}K`
  return String(value)
}

function displayValue(value, mode) {
  if (Array.isArray(value)) return value.join('、')
  if (value && typeof value === 'object') {
    if (Array.isArray(value.dateRange) && value.dateRange.length === 2 && mode === 'range') {
      return `${value.dateRange[0]} 至 ${value.dateRange[1]}`
    }
    if (Number.isFinite(value.days)) return `最近 ${value.days} 天（截至昨天）`
    const min = value.min
    const max = value.max
    if (min == null && max == null) return '不限'
    if (max == null) return `大于等于 ${min}`
    return `${min ?? 0} 至 ${max}`
  }
  if (value == null) return ''
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') return String(value)
  return componentLabel(value) || '待确认'
}

function summarizeNode(node) {
  const labels = {
    bhv: '行为', leafCates: '类目', stdBrand: '标准品牌', channel: '渠道',
    shop: '账号', item: '商品ID', types: 'AIPL阶段', attributes: '档位',
    searchs: '搜索词', time: '时间', count: '次数', amount: '金额', price: '商品价格',
  }
  const preferred = ['shop', 'bhv', 'types', 'leafCates', 'stdBrand', 'channel', 'item', 'attributes', 'searchs', 'time', 'count', 'amount', 'price']
  return preferred.flatMap(key => {
    const value = node.formData?.[key]
    if (value == null || value === '' || (Array.isArray(value) && !value.length)) return []
    const formatted = displayValue(value, node.modeData?.[key])
    if (!formatted || formatted === '不限') return []
    return [{ label: labels[key] || key, value: formatted }]
  })
}

async function scrollToBottom() {
  await nextTick()
  if (scrollRef.value) scrollRef.value.scrollTop = scrollRef.value.scrollHeight
}

watch(() => props.executionState, async state => {
  const status = String(state?.status || '')
  if (
    !currentOperation.value
    || currentOperation.value.status !== 'ready'
    || !['completed', 'partial', 'failed', 'cancelled'].includes(status)
  ) return
  const message = String(state?.message || '').trim()
  const noticeKey = `${state?.token || ''}:${status}:${message}`
  if (!message || noticeKey === lastExecutionNoticeKey) return
  lastExecutionNoticeKey = noticeKey
  messages.value.push({
    id: createMessageId('assistant'),
    role: 'assistant',
    content: message,
  })
  await scrollToBottom()
}, { deep: true })

watch(() => props.modelValue, value => {
  if (value) void loadDrawerData()
}, { immediate: true })

watch(plan, value => initializeCategoryQuestions(value))

onBeforeUnmount(() => {
  activeController?.abort()
  categorySearchTimers.forEach(timer => window.clearTimeout(timer))
  categorySearchTimers.clear()
  clearProcessTimers()
  stopTyping()
})
</script>

<style scoped>
:global(.ai-audience-drawer) { background: #07100f; box-shadow: -30px 0 100px rgba(2, 10, 9, .42); }
:global(.ai-audience-drawer .el-drawer__body) { padding: 0; background: #07100f; }

.ai-shell {
  --ink: #07100f;
  --panel: #0b1715;
  --panel-2: #10211e;
  --line: rgba(161, 211, 192, .14);
  --line-strong: rgba(161, 211, 192, .28);
  --text: #edf8f3;
  --muted: #8da59c;
  --mint: #72e7ba;
  --mint-soft: rgba(114, 231, 186, .12);
  --orange: #ff7d3b;
  position: relative;
  isolation: isolate;
  display: grid;
  grid-template-rows: auto auto minmax(0, 1fr) auto;
  height: 100%;
  overflow: hidden;
  color: var(--text);
  background:
    radial-gradient(circle at 75% -10%, rgba(38, 119, 91, .28), transparent 34%),
    linear-gradient(150deg, #091613 0%, #07100f 55%, #0b1513 100%);
  font-family: "HarmonyOS Sans SC", "MiSans", "PingFang SC", sans-serif;
}

.ai-ambient { position: absolute; inset: 0; z-index: -1; overflow: hidden; pointer-events: none; }
.ai-ambient::before { position: absolute; inset: 0; content: ''; opacity: .22; background-image: linear-gradient(rgba(145, 205, 183, .08) 1px, transparent 1px), linear-gradient(90deg, rgba(145, 205, 183, .08) 1px, transparent 1px); background-size: 38px 38px; mask-image: linear-gradient(to bottom, #000, transparent 76%); }
.ai-ambient span { position: absolute; width: 280px; height: 280px; border: 1px solid rgba(114, 231, 186, .08); border-radius: 50%; }
.ai-ambient span:nth-child(1) { top: -195px; right: -40px; box-shadow: 0 0 80px rgba(114, 231, 186, .06); }
.ai-ambient span:nth-child(2) { top: -150px; right: 5px; width: 190px; height: 190px; }
.ai-ambient span:nth-child(3) { right: -150px; bottom: 12%; width: 360px; height: 360px; border-color: rgba(255, 125, 59, .05); }

.ai-head { position: relative; display: grid; grid-template-columns: 56px 1fr 34px; align-items: center; gap: 14px; padding: 22px 26px 18px; border-bottom: 1px solid var(--line); backdrop-filter: blur(18px); }
.ai-head::after { position: absolute; right: 26px; bottom: -1px; width: 96px; height: 1px; content: ''; background: linear-gradient(90deg, transparent, var(--orange)); }
.ai-head-mark { position: relative; display: grid; width: 52px; height: 52px; place-items: center; overflow: hidden; color: var(--mint); background: #0b1e1a; border: 1px solid rgba(114, 231, 186, .35); border-radius: 16px 16px 5px 16px; box-shadow: inset 0 0 22px rgba(114, 231, 186, .08), 0 12px 28px rgba(0, 0, 0, .22); }
.ai-head-mark::before { position: absolute; width: 30px; height: 30px; content: ''; border: 1px solid rgba(114, 231, 186, .22); border-radius: 50%; animation: ai-breathe 2.6s ease-in-out infinite; }
.ai-head-mark b { position: absolute; right: 5px; bottom: 4px; color: var(--orange); font: 800 8px/1 "DIN Alternate", monospace; letter-spacing: .08em; }
.ai-core { width: 8px; height: 8px; background: var(--mint); border-radius: 50%; box-shadow: 0 0 0 6px rgba(114, 231, 186, .08), 0 0 18px var(--mint); }
.ai-head-copy p, .ai-plan-head p { margin: 0 0 6px; color: var(--orange); font: 750 10px/1.2 "DIN Alternate", "Roboto Mono", monospace; letter-spacing: .18em; }
.ai-head-copy { min-width: 0; }
.ai-head-copy h2 { margin: 0; color: var(--text); font-size: 24px; font-weight: 720; letter-spacing: -.045em; }
.ai-head-copy > span { display: block; margin-top: 6px; color: var(--muted); font-size: 12px; }
.ai-close { display: grid; width: 34px; height: 34px; place-items: center; padding: 0 0 2px; color: #a7bbb4; font-size: 22px; background: rgba(255, 255, 255, .025); border: 1px solid var(--line); border-radius: 50%; cursor: pointer; transition: color .18s ease, border-color .18s ease, transform .18s ease; }
.ai-close:hover { color: #fff; border-color: rgba(255, 125, 59, .5); transform: rotate(6deg); }

.ai-status { display: flex; min-height: 40px; align-items: center; gap: 9px; padding: 0 26px; color: var(--muted); font-size: 11px; background: rgba(3, 10, 9, .45); border-bottom: 1px solid var(--line); }
.ai-status > i { position: relative; display: grid; width: 16px; height: 16px; flex: 0 0 auto; place-items: center; border: 1px solid rgba(141, 165, 156, .35); border-radius: 50%; }
.ai-status > i > span { width: 5px; height: 5px; background: #778b84; border-radius: 50%; }
.ai-status strong { color: #cfe4dc; font-weight: 650; }
.ai-status.is-ready > i { border-color: rgba(114, 231, 186, .4); box-shadow: 0 0 14px rgba(114, 231, 186, .12); }
.ai-status.is-ready > i > span { background: var(--mint); box-shadow: 0 0 8px var(--mint); animation: ai-status 1.8s ease-in-out infinite; }
.ai-status-meta { margin-left: auto; color: #789087; font: 600 10px/1 "DIN Alternate", monospace; letter-spacing: .04em; text-transform: uppercase; }
.ai-status.is-offline { color: #efaa80; background: rgba(81, 32, 12, .3); }
.ai-status.is-offline > i > span { background: var(--orange); }

.ai-body { position: relative; min-height: 0; overflow-y: auto; padding: 28px 28px 36px; scrollbar-color: rgba(114, 231, 186, .26) transparent; scrollbar-gutter: stable; }
.ai-welcome { max-width: 520px; margin: 32px auto 16px; text-align: center; animation: ai-rise .55s cubic-bezier(.2,.8,.2,1) both; }
.ai-orbit { position: relative; display: grid; width: 112px; height: 112px; margin: 0 auto 26px; place-items: center; }
.ai-orbit::before { position: absolute; width: 62px; height: 62px; content: ''; background: radial-gradient(circle, rgba(114, 231, 186, .24), rgba(114, 231, 186, .04) 55%, transparent 70%); border: 1px solid rgba(114, 231, 186, .36); border-radius: 50%; box-shadow: inset 0 0 24px rgba(114, 231, 186, .1), 0 0 42px rgba(114, 231, 186, .12); }
.ai-orbit strong { z-index: 1; color: var(--text); font: 800 18px/1 "DIN Alternate", monospace; letter-spacing: .08em; }
.ai-orbit-ring { position: absolute; border: 1px solid rgba(114, 231, 186, .22); border-radius: 50%; }
.ai-orbit-ring.is-outer { inset: 0; border-style: dashed; animation: ai-spin 18s linear infinite; }
.ai-orbit-ring.is-inner { inset: 13px; border-color: rgba(255, 125, 59, .22); animation: ai-spin 11s linear infinite reverse; }
.ai-orbit-dot { position: absolute; width: 8px; height: 8px; background: var(--mint); border: 2px solid var(--ink); border-radius: 50%; box-shadow: 0 0 12px var(--mint); }
.ai-orbit-dot.is-one { top: 8px; left: 27px; }
.ai-orbit-dot.is-two { right: 8px; bottom: 28px; width: 6px; height: 6px; background: var(--orange); box-shadow: 0 0 12px var(--orange); }
.ai-welcome-kicker { margin: 0 0 10px !important; color: var(--mint) !important; font: 700 10px/1.4 "DIN Alternate", monospace !important; letter-spacing: .16em; }
.ai-welcome h3 { margin: 0; font-size: 25px; font-weight: 730; letter-spacing: -.045em; }
.ai-welcome > p:not(.ai-welcome-kicker) { max-width: 455px; margin: 12px auto 28px; color: var(--muted); font-size: 13px; line-height: 1.75; }
.ai-examples { display: grid; gap: 9px; text-align: left; }
.ai-examples button { position: relative; display: grid; grid-template-columns: 34px 1fr 22px; min-height: 54px; align-items: center; gap: 10px; padding: 8px 13px; overflow: hidden; color: #d6e7e0; font: inherit; text-align: left; background: linear-gradient(90deg, rgba(19, 39, 34, .94), rgba(12, 26, 23, .78)); border: 1px solid var(--line); border-radius: 12px; cursor: pointer; transition: transform .2s ease, border-color .2s ease, background .2s ease; }
.ai-examples button::before { position: absolute; inset: 0 auto 0 0; width: 2px; content: ''; background: var(--orange); opacity: 0; transition: opacity .2s ease; }
.ai-examples button:hover:not(:disabled) { z-index: 1; transform: translateX(5px); background: linear-gradient(90deg, rgba(24, 49, 42, .98), rgba(12, 26, 23, .9)); border-color: rgba(114, 231, 186, .35); }
.ai-examples button:hover:not(:disabled)::before { opacity: 1; }
.ai-examples button:disabled { opacity: .4; cursor: not-allowed; }
.ai-examples button > span { color: var(--orange); font: 750 10px/1 "DIN Alternate", monospace; letter-spacing: .08em; }
.ai-examples button > b { font-size: 12px; font-weight: 520; line-height: 1.5; }
.ai-examples button > i { color: #60776e; font-size: 15px; font-style: normal; transition: color .2s ease, transform .2s ease; }
.ai-examples button:hover > i { color: var(--mint); transform: translate(2px, -2px); }

.ai-conversation { display: grid; gap: 15px; }
.ai-message { display: grid; grid-template-columns: 35px minmax(0, 1fr); align-items: start; gap: 10px; animation: ai-rise .28s ease both; }
.ai-message-role { display: grid; width: 33px; height: 33px; place-items: center; color: var(--mint); font: 750 9px/1 "DIN Alternate", monospace; letter-spacing: .04em; background: #0d211d; border: 1px solid rgba(114, 231, 186, .26); border-radius: 11px 11px 4px 11px; }
.ai-message p { width: fit-content; max-width: 90%; margin: 0; padding: 12px 14px; color: #d9e9e2; font-size: 13px; line-height: 1.72; white-space: pre-wrap; background: rgba(16, 33, 30, .92); border: 1px solid var(--line); border-radius: 5px 15px 15px 15px; box-shadow: 0 10px 28px rgba(0, 0, 0, .12); }
.ai-message.is-user { grid-template-columns: minmax(0, 1fr) 35px; }
.ai-message.is-user .ai-message-role { grid-column: 2; grid-row: 1; color: #fff; background: rgba(255, 125, 59, .14); border-color: rgba(255, 125, 59, .36); border-radius: 11px 11px 11px 4px; }
.ai-message.is-user p { grid-column: 1; grid-row: 1; justify-self: end; color: #fff5ef; background: linear-gradient(135deg, #763719, #9b4820); border-color: rgba(255, 150, 97, .25); border-radius: 15px 5px 15px 15px; }
.ai-type-cursor { display: inline-block; width: 2px; height: 1.05em; margin-left: 3px; vertical-align: -.15em; background: var(--mint); box-shadow: 0 0 7px var(--mint); animation: ai-cursor .72s steps(1) infinite; }

.ai-process { overflow: hidden; margin: 2px 0 2px 44px; background: rgba(7, 17, 15, .82); border: 1px solid rgba(114, 231, 186, .18); border-radius: 14px; animation: ai-rise .28s ease both; }
.ai-process.is-running { border-color: rgba(114, 231, 186, .34); box-shadow: 0 0 0 1px rgba(114, 231, 186, .04), 0 16px 38px rgba(0, 0, 0, .16); }
.ai-process.is-complete { border-color: rgba(114, 231, 186, .16); }
.ai-process.is-error { border-color: rgba(255, 125, 59, .32); }
.ai-process-head { position: relative; display: grid; width: 100%; grid-template-columns: 32px 1fr auto; align-items: center; gap: 10px; padding: 12px 13px; overflow: hidden; color: inherit; text-align: left; background: rgba(16, 34, 30, .72); border: 0; cursor: pointer; }
.ai-process.is-running .ai-process-head::after { position: absolute; inset: auto 0 0; height: 1px; content: ''; background: linear-gradient(90deg, transparent, var(--mint), transparent); animation: ai-scan 2s ease-in-out infinite; }
.ai-process-symbol { position: relative; display: grid; width: 30px; height: 30px; place-items: center; border: 1px solid rgba(114, 231, 186, .25); border-radius: 50%; }
.ai-process-symbol i { position: absolute; width: 4px; height: 4px; background: var(--mint); border-radius: 50%; }
.ai-process-symbol i:nth-child(1) { transform: translate(-6px, 4px); }
.ai-process-symbol i:nth-child(2) { transform: translate(0, -5px); }
.ai-process-symbol i:nth-child(3) { transform: translate(6px, 4px); }
.ai-process.is-running .ai-process-symbol { animation: ai-breathe 1.6s ease-in-out infinite; }
.ai-process-head > span:nth-child(2) strong, .ai-process-head > span:nth-child(2) small { display: block; }
.ai-process-head > span:nth-child(2) strong { color: #dcece5; font-size: 12px; font-weight: 640; }
.ai-process-head > span:nth-child(2) small { margin-top: 3px; color: #769087; font: 500 10px/1.4 "DIN Alternate", monospace; }
.ai-process-head > b { color: #668078; font-size: 10px; font-weight: 550; }
.ai-process-steps { display: grid; gap: 0; margin: 0; padding: 9px 13px 12px 28px; list-style: none; }
.ai-process-steps li { position: relative; display: grid; grid-template-columns: 25px 1fr; gap: 10px; min-height: 48px; align-items: start; }
.ai-process-steps li:not(:last-child)::after { position: absolute; top: 23px; bottom: 0; left: 11px; width: 1px; content: ''; background: var(--line); }
.ai-process-steps li > span { z-index: 1; display: grid; width: 23px; height: 23px; place-items: center; color: #587068; font: 700 8px/1 "DIN Alternate", monospace; background: #0a1715; border: 1px solid var(--line); border-radius: 50%; }
.ai-process-steps li strong, .ai-process-steps li small { display: block; }
.ai-process-steps li strong { padding-top: 2px; color: #71877f; font-size: 11px; font-weight: 590; }
.ai-process-steps li small { margin-top: 3px; color: #52665f; font-size: 10px; line-height: 1.4; }
.ai-process-steps li.is-done > span { color: #07130f; background: var(--mint); border-color: var(--mint); }
.ai-process-steps li.is-done strong { color: #a9c0b7; }
.ai-process-steps li.is-active > span { color: var(--mint); border-color: var(--mint); box-shadow: 0 0 0 4px rgba(114, 231, 186, .08), 0 0 14px rgba(114, 231, 186, .12); animation: ai-stage 1.2s ease-in-out infinite; }
.ai-process-steps li.is-active strong { color: var(--text); }
.ai-process-steps li.is-active small { color: #86a59a; }
.ai-process-steps li.is-error > span { color: var(--orange); border-color: var(--orange); }

.ai-plan { margin-top: 24px; overflow: hidden; background: rgba(10, 23, 20, .96); border: 1px solid var(--line-strong); border-radius: 17px; box-shadow: 0 22px 50px rgba(0, 0, 0, .22); animation: ai-rise .45s cubic-bezier(.2,.8,.2,1) both; }
.ai-plan.is-ready { border-color: rgba(114, 231, 186, .34); }
.ai-plan-head { position: relative; display: flex; align-items: center; justify-content: space-between; gap: 14px; padding: 17px 18px; background: linear-gradient(90deg, rgba(20, 47, 39, .85), rgba(10, 23, 20, .55)); border-bottom: 1px solid var(--line); }
.ai-plan-head::before { position: absolute; top: 0; right: 0; left: 0; height: 2px; content: ''; background: linear-gradient(90deg, var(--mint), transparent 62%); }
.ai-plan-head h3 { margin: 0; color: var(--text); font-size: 17px; font-weight: 670; }
.ai-plan-state { display: inline-flex; align-items: center; gap: 6px; padding: 6px 9px; color: var(--mint); font: 750 9px/1 "DIN Alternate", monospace; letter-spacing: .06em; background: rgba(114, 231, 186, .08); border: 1px solid rgba(114, 231, 186, .18); border-radius: 999px; }
.ai-plan-state i { width: 5px; height: 5px; background: currentColor; border-radius: 50%; box-shadow: 0 0 7px currentColor; }
.ai-plan:not(.is-ready) .ai-plan-state { color: var(--orange); background: rgba(255, 125, 59, .08); border-color: rgba(255, 125, 59, .2); }
.ai-plan-stats { display: grid; grid-template-columns: repeat(3, 1fr); background: rgba(3, 11, 9, .32); border-bottom: 1px solid var(--line); }
.ai-plan-stats div { display: grid; gap: 5px; padding: 14px 17px; border-right: 1px solid var(--line); }
.ai-plan-stats div:last-child { border-right: 0; }
.ai-plan-stats strong { color: #f2faf6; font: 700 21px/1 "DIN Alternate", monospace; }
.ai-plan-stats span { color: #71877f; font-size: 10px; }
.ai-workflow-card { display: grid; gap: 7px; margin: 14px 17px 0; padding: 14px; background: rgba(114, 231, 186, .06); border: 1px solid rgba(114, 231, 186, .2); border-radius: 12px; }
.ai-workflow-kicker { display: flex; align-items: center; justify-content: space-between; gap: 10px; color: var(--mint); font-size: 9px; font-weight: 760; letter-spacing: .08em; }
.ai-workflow-kicker b { padding: 4px 7px; font-size: 8px; background: rgba(114, 231, 186, .09); border: 1px solid rgba(114, 231, 186, .18); border-radius: 999px; }
.ai-workflow-card > strong { color: #e7f3ee; font-size: 13px; }
.ai-workflow-card > p { margin: 0; color: #94aaa1; font-size: 10px; line-height: 1.6; }
.ai-workflow-card > small { color: #71877f; font-size: 9px; }
.ai-workflow-prerequisites { display: flex; flex-wrap: wrap; gap: 6px; align-items: center; padding-top: 3px; }
.ai-workflow-prerequisites span { color: var(--orange); font-size: 9px; font-weight: 700; }
.ai-workflow-prerequisites i { padding: 4px 7px; color: #9fb3ab; font-size: 9px; font-style: normal; background: rgba(255, 255, 255, .04); border-radius: 6px; }
.ai-decisions, .ai-node-list, .ai-questions, .ai-warnings { display: grid; gap: 10px; padding: 15px 17px; border-bottom: 1px solid var(--line); }
.ai-decision { display: grid; grid-template-columns: 29px 1fr; gap: 10px; align-items: start; }
.ai-decision > span { color: var(--orange); font: 750 9px/1.5 "DIN Alternate", monospace; }
.ai-decision strong, .ai-decision small { display: block; }
.ai-decision strong { color: #d7e7e0; font-size: 12px; }
.ai-decision small { margin-top: 4px; color: #71877f; font-size: 10px; line-height: 1.5; }
.ai-node-list { background: rgba(5, 14, 12, .4); }
.ai-node-card { padding: 13px; background: rgba(17, 36, 31, .72); border: 1px solid var(--line); border-radius: 12px; }
.ai-node-card header { display: flex; align-items: center; gap: 10px; }
.ai-node-index { display: grid; width: 27px; height: 27px; place-items: center; color: #07120f; font: 750 9px/1 "DIN Alternate", monospace; background: var(--mint); border-radius: 8px; }
.ai-node-card header strong, .ai-node-card header small { display: block; }
.ai-node-card header strong { color: #e0eee8; font-size: 12px; }
.ai-node-card header small { margin-top: 2px; color: #6f8980; font-size: 9px; }
.ai-node-card dl { display: grid; grid-template-columns: 78px 1fr; gap: 6px 10px; margin: 11px 0 0; padding-top: 10px; border-top: 1px solid var(--line); }
.ai-node-card dt, .ai-node-card dd { margin: 0; font-size: 10px; line-height: 1.5; }
.ai-node-card dt { color: #61786f; }
.ai-node-card dd { color: #b8ccc4; overflow-wrap: anywhere; }
.ai-questions > p, .ai-warnings > p { margin: 0; color: var(--orange); font-size: 10px; font-weight: 700; letter-spacing: .08em; }
.ai-questions article { padding: 12px; background: rgba(83, 37, 16, .18); border: 1px solid rgba(255, 125, 59, .2); border-radius: 10px; }
.ai-questions strong, .ai-questions small { display: block; font-size: 11px; }
.ai-questions strong { color: #f1d9cc; }
.ai-questions small { margin-top: 4px; color: #9d7d6c; font-size: 10px; line-height: 1.5; }
.ai-quick-answers { display: flex; flex-wrap: wrap; gap: 7px; margin-top: 10px; }
.ai-quick-answers button { min-height: 30px; padding: 5px 10px; color: var(--mint); font: inherit; font-size: 10px; background: rgba(114, 231, 186, .07); border: 1px solid rgba(114, 231, 186, .25); border-radius: 8px; cursor: pointer; }
.ai-quick-answers button:hover { background: rgba(114, 231, 186, .13); }
.ai-warnings div { display: flex; align-items: flex-start; gap: 8px; color: #bca092; font-size: 10px; line-height: 1.5; }
.ai-warnings div span { display: grid; width: 17px; height: 17px; flex: 0 0 auto; place-items: center; color: #160b05; font: 750 9px/1 monospace; background: var(--orange); border-radius: 50%; }
.ai-feedback-action { display: flex; width: calc(100% - 34px); min-height: 38px; align-items: center; justify-content: space-between; margin: 13px 17px; padding: 0 12px; color: #ffb087; font: inherit; font-size: 11px; background: rgba(255, 125, 59, .08); border: 1px solid rgba(255, 125, 59, .22); border-radius: 9px; cursor: pointer; }
.ai-error { margin: 14px 0 0 44px; padding: 11px 13px; color: #ffc0a0; font-size: 11px; line-height: 1.5; background: rgba(107, 35, 17, .22); border: 1px solid rgba(255, 125, 59, .3); border-radius: 9px; }

.ai-composer { position: relative; padding: 15px 20px 16px; background: rgba(7, 16, 15, .93); border-top: 1px solid var(--line); box-shadow: 0 -18px 48px rgba(0, 0, 0, .22); backdrop-filter: blur(20px); }
.ai-composer::before { position: absolute; top: -1px; left: 20px; width: 110px; height: 1px; content: ''; background: linear-gradient(90deg, var(--orange), transparent); }
.ai-input-wrap { display: grid; grid-template-columns: 1fr 42px; align-items: end; gap: 10px; padding: 12px; background: rgba(13, 29, 25, .94); border: 1px solid rgba(114, 231, 186, .28); border-radius: 15px; box-shadow: inset 0 1px 0 rgba(255, 255, 255, .025), 0 0 0 3px rgba(114, 231, 186, .035), 0 18px 36px rgba(0, 0, 0, .18); transition: border-color .2s ease, box-shadow .2s ease; }
.ai-input-wrap:focus-within { border-color: rgba(114, 231, 186, .55); box-shadow: 0 0 0 3px rgba(114, 231, 186, .065), 0 18px 36px rgba(0, 0, 0, .2); }
.ai-input-wrap.is-disabled { border-color: var(--line); box-shadow: none; opacity: .72; }
.ai-input-wrap textarea { width: 100%; min-height: 58px; max-height: 140px; padding: 0; resize: none; color: #edf8f3; caret-color: var(--mint); font: inherit; font-size: 13px; line-height: 1.65; background: transparent; border: 0; outline: 0; box-sizing: border-box; }
.ai-input-wrap textarea::placeholder { color: #5f756d; }
.ai-input-wrap button { display: grid; width: 40px; height: 40px; place-items: center; padding: 0; color: #07110f; font: 800 18px/1 inherit; background: var(--mint); border: 0; border-radius: 12px; box-shadow: 0 0 18px rgba(114, 231, 186, .2); cursor: pointer; transition: transform .18s ease, box-shadow .18s ease; }
.ai-input-wrap button:hover:not(:disabled) { transform: translateY(-2px); box-shadow: 0 0 25px rgba(114, 231, 186, .34); }
.ai-input-wrap button:disabled { color: #577067; background: #193029; box-shadow: none; cursor: not-allowed; }
.ai-send-loader { width: 15px; height: 15px; border: 2px solid rgba(114, 231, 186, .22); border-top-color: var(--mint); border-radius: 50%; animation: ai-spin .8s linear infinite; }
.ai-footer-actions { display: flex; min-height: 34px; align-items: center; justify-content: space-between; gap: 10px; padding-top: 9px; }
.ai-footer-actions > span { display: inline-flex; align-items: center; gap: 7px; color: #5f766d; font-size: 10px; }
.ai-footer-actions > span > i { width: 5px; height: 5px; background: var(--orange); border-radius: 50%; }
.ai-footer-tools { display: inline-flex; align-items: center; gap: 9px; }
.ai-footer-divider { width: 1px; height: 13px; background: rgba(128, 151, 142, .24); }
.ai-reset { padding: 5px 0; color: #80978e; font: inherit; font-size: 10px; background: none; border: 0; cursor: pointer; }
.ai-reset:hover { color: #c8d9d2; }
.ai-export { display: inline-flex; align-items: center; gap: 5px; padding: 5px 7px; color: #8fa49c; font: inherit; font-size: 10px; background: transparent; border: 0; border-radius: 7px; cursor: pointer; transition: color .18s ease, background .18s ease; }
.ai-export > span { display: grid; width: 14px; height: 14px; place-items: center; color: var(--mint); font: 800 11px/1 "DIN Alternate", monospace; border: 1px solid rgba(114, 231, 186, .28); border-radius: 4px; }
.ai-export:hover { color: #d7e5df; background: rgba(114, 231, 186, .07); }
.ai-apply { min-height: 38px; margin-left: auto; padding: 0 16px; color: #160b05; font: inherit; font-size: 11px; font-weight: 720; background: var(--orange); border: 0; border-radius: 10px; box-shadow: 0 8px 20px rgba(255, 125, 59, .18); cursor: pointer; transition: transform .18s ease, box-shadow .18s ease; }
.ai-apply:hover:not(:disabled) { transform: translateY(-1px); box-shadow: 0 12px 28px rgba(255, 125, 59, .25); }
.ai-apply:disabled { opacity: .4; cursor: not-allowed; }

/* Titanium-white intelligence console: bright, technical and separate from the
   legacy teal workbench without falling into the usual purple AI palette. */
:global(.ai-audience-drawer) { background: #f4f6fb; box-shadow: -28px 0 90px rgba(25, 37, 65, .22); }
:global(.ai-audience-drawer .el-drawer__body) { background: #f4f6fb; }
.ai-shell {
  --ink: #f4f6fb;
  --panel: #fff;
  --panel-2: #eef3ff;
  --line: rgba(49, 67, 108, .13);
  --line-strong: rgba(57, 91, 181, .25);
  --text: #151a28;
  --muted: #6e7688;
  --mint: #3f70ff;
  --mint-soft: rgba(63, 112, 255, .1);
  --orange: #ff6a2a;
  color: var(--text);
  background:
    radial-gradient(circle at 82% -8%, rgba(74, 122, 255, .18), transparent 31%),
    radial-gradient(circle at 12% 84%, rgba(255, 106, 42, .06), transparent 26%),
    linear-gradient(145deg, #fafbfe 0%, #f2f5fb 56%, #edf1f8 100%);
  font-family: "Alibaba PuHuiTi 3", "HarmonyOS Sans SC", "MiSans", "PingFang SC", sans-serif;
}
.ai-ambient::before { opacity: .55; background-image: linear-gradient(rgba(66, 91, 150, .06) 1px, transparent 1px), linear-gradient(90deg, rgba(66, 91, 150, .06) 1px, transparent 1px); }
.ai-ambient span { border-color: rgba(63, 112, 255, .12); }
.ai-ambient span:nth-child(1) { box-shadow: 0 0 80px rgba(63, 112, 255, .08); }
.ai-ambient span:nth-child(2) { border-color: rgba(63, 112, 255, .1); }
.ai-ambient span:nth-child(3) { border-color: rgba(255, 106, 42, .08); }
.ai-head { background: rgba(255, 255, 255, .8); border-bottom-color: var(--line); box-shadow: 0 10px 34px rgba(40, 55, 89, .05); }
.ai-head-mark { color: var(--mint); background: linear-gradient(145deg, #fff, #edf2ff); border-color: rgba(63, 112, 255, .3); box-shadow: inset 0 0 22px rgba(63, 112, 255, .08), 0 12px 28px rgba(42, 60, 103, .12); }
.ai-head-mark::before { border-color: rgba(63, 112, 255, .22); }
.ai-core { background: var(--mint); box-shadow: 0 0 0 6px rgba(63, 112, 255, .08), 0 0 18px rgba(63, 112, 255, .65); }
.ai-head-copy h2 { color: var(--text); }
.ai-head-copy > span { color: var(--muted); }
.ai-close { color: #737b8e; background: rgba(255, 255, 255, .7); border-color: rgba(60, 74, 107, .16); }
.ai-close:hover { color: #151a28; border-color: rgba(255, 106, 42, .48); }
.ai-status { color: #747d90; background: rgba(235, 239, 247, .78); border-bottom-color: var(--line); }
.ai-status > i { background: #fff; border-color: rgba(63, 112, 255, .32); }
.ai-status > i > span { background: #9da7b8; }
.ai-status strong { color: #30384b; }
.ai-status.is-ready > i { border-color: rgba(63, 112, 255, .4); box-shadow: 0 0 14px rgba(63, 112, 255, .12); }
.ai-status.is-ready > i > span { background: var(--mint); box-shadow: 0 0 8px rgba(63, 112, 255, .7); }
.ai-status-meta { color: #758097; }
.ai-status.is-offline { color: #a64b21; background: #fff2eb; }
.ai-body { scrollbar-color: rgba(63, 112, 255, .28) transparent; }
.ai-welcome { color: var(--text); }
.ai-orbit::before { background: radial-gradient(circle, rgba(63, 112, 255, .17), rgba(63, 112, 255, .04) 55%, transparent 70%); border-color: rgba(63, 112, 255, .32); box-shadow: inset 0 0 24px rgba(63, 112, 255, .08), 0 0 42px rgba(63, 112, 255, .13); }
.ai-orbit strong { color: #1e2d5a; }
.ai-orbit-ring { border-color: rgba(63, 112, 255, .25); }
.ai-orbit-ring.is-inner { border-color: rgba(255, 106, 42, .27); }
.ai-orbit-dot { background: var(--mint); border-color: #f4f6fb; box-shadow: 0 0 12px rgba(63, 112, 255, .65); }
.ai-welcome > p:not(.ai-welcome-kicker) { color: var(--muted); }
.ai-examples button { color: #2d3548; background: rgba(255, 255, 255, .88); border-color: rgba(54, 71, 112, .13); box-shadow: 0 10px 28px rgba(41, 58, 98, .05); }
.ai-examples button:hover:not(:disabled) { background: #fff; border-color: rgba(63, 112, 255, .35); box-shadow: 0 14px 34px rgba(63, 112, 255, .1); }
.ai-examples button > i { color: #9aa3b5; }
.ai-examples button:hover > i { color: var(--mint); }
.ai-message-role { color: #fff; background: #345fd9; border-color: rgba(63, 112, 255, .3); box-shadow: 0 7px 16px rgba(63, 112, 255, .18); }
.ai-message p { color: #30384a; background: rgba(255, 255, 255, .94); border-color: rgba(50, 68, 108, .13); box-shadow: 0 10px 28px rgba(40, 55, 89, .07); }
.ai-message.is-user .ai-message-role { color: #fff; background: #252c3c; border-color: #252c3c; }
.ai-message.is-user p { color: #fff; background: linear-gradient(135deg, #222a3c, #303a53); border-color: #303a53; }
.ai-process { background: rgba(255, 255, 255, .9); border-color: rgba(63, 112, 255, .18); box-shadow: 0 14px 38px rgba(40, 55, 89, .07); }
.ai-process.is-running { border-color: rgba(63, 112, 255, .36); box-shadow: 0 0 0 1px rgba(63, 112, 255, .04), 0 16px 38px rgba(47, 67, 110, .1); }
.ai-process.is-complete { border-color: rgba(58, 74, 111, .14); }
.ai-process-head { background: linear-gradient(90deg, rgba(235, 241, 255, .9), rgba(255, 255, 255, .82)); }
.ai-process-symbol { background: #fff; border-color: rgba(63, 112, 255, .25); }
.ai-process-symbol i { background: var(--mint); }
.ai-process-head > span:nth-child(2) strong { color: #252c3c; }
.ai-process-head > span:nth-child(2) small { color: #758096; }
.ai-process-head > b { color: #7f899c; }
.ai-process-steps li:not(:last-child)::after { background: rgba(56, 76, 122, .13); }
.ai-process-steps li > span { color: #8993a6; background: #f8f9fc; border-color: rgba(55, 72, 110, .14); }
.ai-process-steps li strong { color: #747e92; }
.ai-process-steps li small { color: #929bad; }
.ai-process-steps li.is-done > span { color: #fff; background: var(--mint); border-color: var(--mint); }
.ai-process-steps li.is-done strong { color: #4d576d; }
.ai-process-steps li.is-active > span { color: var(--mint); background: #fff; border-color: var(--mint); box-shadow: 0 0 0 4px rgba(63, 112, 255, .08), 0 0 14px rgba(63, 112, 255, .14); }
.ai-process-steps li.is-active strong { color: #20283a; }
.ai-process-steps li.is-active small { color: #6f7990; }
.ai-plan { background: rgba(255, 255, 255, .96); border-color: rgba(52, 70, 111, .17); box-shadow: 0 22px 50px rgba(39, 54, 91, .11); }
.ai-plan.is-ready { border-color: rgba(63, 112, 255, .28); }
.ai-plan-head { background: linear-gradient(100deg, rgba(231, 238, 255, .92), rgba(255, 255, 255, .75)); border-bottom-color: var(--line); }
.ai-plan-head h3 { color: #171d2c; }
.ai-plan-state { color: var(--mint); background: rgba(63, 112, 255, .08); border-color: rgba(63, 112, 255, .18); }
.ai-plan-stats { background: #f8f9fc; border-bottom-color: var(--line); }
.ai-plan-stats div { border-right-color: var(--line); }
.ai-plan-stats strong { color: #1d2434; }
.ai-plan-stats span { color: #7d879a; }
.ai-workflow-card { background: #f5f8ff; border-color: rgba(63, 112, 255, .2); }
.ai-workflow-kicker { color: #315fdc; }
.ai-workflow-kicker b { background: #e9efff; border-color: rgba(63, 112, 255, .18); }
.ai-workflow-card > strong { color: #263149; }
.ai-workflow-card > p { color: #6d7890; }
.ai-workflow-card > small { color: #8791a5; }
.ai-workflow-prerequisites i { color: #68758e; background: #fff; border: 1px solid rgba(56, 73, 112, .1); }
.ai-decisions, .ai-node-list, .ai-questions, .ai-warnings { border-bottom-color: var(--line); }
.ai-decision strong { color: #293145; }
.ai-decision small { color: #7b8598; }
.ai-node-list { background: #f7f8fb; }
.ai-node-card { background: #fff; border-color: rgba(48, 66, 107, .13); box-shadow: 0 8px 24px rgba(42, 58, 95, .04); }
.ai-node-index { color: #fff; background: var(--mint); }
.ai-node-card header strong { color: #283044; }
.ai-node-card header small, .ai-node-card dt { color: #8993a5; }
.ai-node-card dl { border-top-color: rgba(53, 70, 108, .1); }
.ai-node-card dd { color: #4a5368; }
.ai-questions article { background: #fff8f3; border-color: rgba(255, 106, 42, .2); }
.ai-questions strong { color: #60321f; }
.ai-questions small { color: #937466; }
.ai-quick-answers { max-height: 250px; overflow-y: auto; padding: 2px; scrollbar-color: rgba(63, 112, 255, .28) transparent; }
.ai-option-count { width: 100%; flex: 1 0 100%; margin: 0 0 3px; color: #7d879b; font-size: 10px; }
.ai-quick-answers button { color: #34405a; text-align: left; white-space: normal; background: #fff; border-color: rgba(55, 75, 119, .18); }
.ai-quick-answers button:hover { color: #234fc5; background: #f3f6ff; border-color: rgba(63, 112, 255, .4); }
.ai-quick-answers button.is-formal-brand { order: -1; color: #214fcf; background: #eef3ff; border-color: rgba(63, 112, 255, .35); box-shadow: 0 6px 14px rgba(63, 112, 255, .08); }
.ai-quick-answers button.is-formal-brand > span { display: inline-block; margin-right: 5px; padding: 2px 5px; color: #fff; font-size: 8px; font-weight: 700; background: var(--mint); border-radius: 4px; }
.ai-category-picker { display: grid; gap: 11px; margin-top: 12px; }
.ai-category-recommendation { position: relative; display: grid; grid-template-columns: auto minmax(0, 1fr) 25px; align-items: center; gap: 11px; min-height: 64px; padding: 11px 12px; overflow: hidden; background: linear-gradient(118deg, #eef3ff 0%, #f7f9ff 72%, #fff 100%); border: 1px solid rgba(63, 112, 255, .22); border-radius: 12px; }
.ai-category-recommendation::before { position: absolute; inset: 0 auto 0 0; width: 3px; content: ''; background: linear-gradient(180deg, var(--mint), #84a3ff); }
.ai-category-recommendation > span { align-self: start; margin-top: 2px; padding: 4px 6px; color: #fff; font-size: 8px; font-weight: 750; letter-spacing: .05em; background: var(--mint); border-radius: 5px; }
.ai-category-recommendation > div { min-width: 0; }
.ai-category-recommendation > div strong { color: #1f2b48; font-size: 13px; }
.ai-category-recommendation > div small { margin-top: 5px; overflow: hidden; color: #6e7b98; font-size: 10px; text-overflow: ellipsis; white-space: nowrap; }
.ai-category-recommendation > i { display: grid; width: 24px; height: 24px; place-items: center; color: #fff; font-size: 11px; font-style: normal; background: var(--mint); border-radius: 50%; box-shadow: 0 5px 12px rgba(63, 112, 255, .2); }
.ai-category-groups { display: grid; grid-template-columns: repeat(auto-fit, minmax(112px, 1fr)); gap: 7px; }
.ai-category-groups button { display: flex; min-height: 38px; align-items: center; gap: 7px; padding: 6px 9px; color: #59647b; font: inherit; font-size: 10px; font-weight: 620; text-align: left; background: #fff; border: 1px solid rgba(53, 72, 115, .16); border-radius: 9px; cursor: pointer; transition: transform .16s ease, color .16s ease, border-color .16s ease, box-shadow .16s ease; }
.ai-category-groups button:hover:not(:disabled) { color: #244fc7; border-color: rgba(63, 112, 255, .35); transform: translateY(-1px); }
.ai-category-groups button.is-active { color: #214fcf; background: #f0f4ff; border-color: rgba(63, 112, 255, .42); box-shadow: 0 6px 16px rgba(63, 112, 255, .08); }
.ai-category-groups button > span { display: grid; width: 21px; height: 21px; flex: 0 0 auto; place-items: center; color: #67738c; font-size: 9px; background: #f0f2f6; border-radius: 7px; }
.ai-category-groups button.is-active > span { color: #fff; background: var(--mint); }
.ai-category-groups button > b { margin-left: auto; color: #9aa3b5; font: 700 9px/1 "DIN Alternate", monospace; }
.ai-category-select { position: relative; display: grid; gap: 6px; }
.ai-category-select > span { color: #7d879b; font-size: 9px; font-weight: 650; letter-spacing: .06em; }
.ai-category-select :deep(.el-select) { width: 100%; }
.ai-category-select :deep(.el-select__wrapper) { min-height: 42px; padding: 6px 11px; background: #fff; border: 1px solid rgba(53, 72, 115, .2); border-radius: 10px; box-shadow: none; transition: border-color .16s ease, box-shadow .16s ease; }
.ai-category-select :deep(.el-select__wrapper.is-focused) { border-color: rgba(63, 112, 255, .55); box-shadow: 0 0 0 3px rgba(63, 112, 255, .07); }
.ai-category-select :deep(.el-select__selected-item) { color: #34405a; font-size: 10px; }
.ai-category-select :deep(.el-tag) { --el-tag-bg-color: #edf2ff; --el-tag-border-color: rgba(63, 112, 255, .16); --el-tag-text-color: #3158c8; }
.ai-category-chips { display: flex; flex-wrap: wrap; gap: 6px; }
.ai-category-chips span { max-width: 150px; padding: 5px 8px; overflow: hidden; color: #3158c8; font-size: 9px; font-weight: 650; text-overflow: ellipsis; white-space: nowrap; background: #edf2ff; border: 1px solid rgba(63, 112, 255, .14); border-radius: 999px; }
.ai-category-confirm { display: flex; align-items: center; justify-content: space-between; gap: 12px; }
.ai-category-confirm > small { margin: 0; color: #808a9d; font-size: 9px; }
.ai-category-confirm > button { display: inline-flex; min-height: 34px; flex: 0 0 auto; align-items: center; gap: 14px; padding: 0 12px; color: #fff; font: inherit; font-size: 10px; font-weight: 680; background: var(--mint); border: 0; border-radius: 9px; box-shadow: 0 7px 16px rgba(63, 112, 255, .18); cursor: pointer; transition: transform .16s ease, box-shadow .16s ease; }
.ai-category-confirm > button:hover:not(:disabled) { transform: translateY(-1px); box-shadow: 0 10px 22px rgba(63, 112, 255, .25); }
.ai-category-confirm > button:disabled, .ai-category-groups button:disabled { opacity: .5; cursor: not-allowed; }
.ai-warnings div { color: #745b4f; }
.ai-feedback-action { color: #b74b1a; background: #fff4ed; border-color: rgba(255, 106, 42, .22); }
.ai-error { color: #a53e19; background: #fff1eb; border-color: rgba(255, 106, 42, .27); }
.ai-composer { background: rgba(248, 249, 252, .94); border-top-color: rgba(55, 72, 110, .14); box-shadow: 0 -18px 48px rgba(42, 56, 89, .1); }
.ai-input-wrap { background: rgba(255, 255, 255, .96); border-color: rgba(63, 112, 255, .3); box-shadow: inset 0 1px 0 #fff, 0 0 0 3px rgba(63, 112, 255, .04), 0 18px 36px rgba(41, 55, 90, .08); }
.ai-input-wrap:focus-within { border-color: rgba(63, 112, 255, .58); box-shadow: 0 0 0 3px rgba(63, 112, 255, .07), 0 18px 36px rgba(41, 55, 90, .1); }
.ai-input-wrap textarea { color: #232a3a; caret-color: var(--mint); }
.ai-input-wrap textarea::placeholder { color: #9aa3b4; }
.ai-input-wrap button { color: #fff; background: var(--mint); box-shadow: 0 8px 18px rgba(63, 112, 255, .22); }
.ai-input-wrap button:hover:not(:disabled) { box-shadow: 0 10px 24px rgba(63, 112, 255, .32); }
.ai-input-wrap button:disabled { color: #a8b0c0; background: #e8ebf1; }
.ai-send-loader { border-color: rgba(63, 112, 255, .22); border-top-color: var(--mint); }
.ai-footer-actions > span { color: #8992a3; }
.ai-footer-divider { background: rgba(80, 94, 124, .18); }
.ai-reset { color: #778195; }
.ai-reset:hover { color: #30394d; }
.ai-export { color: #707b91; }
.ai-export > span { color: #3f70ff; background: #f5f8ff; border-color: rgba(63, 112, 255, .25); }
.ai-export:hover { color: #26324a; background: rgba(63, 112, 255, .07); }

/* Conversation is intentionally quiet: one compact thought row, then short readable replies. */
.ai-body { padding: 22px 26px 30px; }
.ai-conversation { gap: 14px; }
.ai-process.is-complete { margin-top: 0; margin-bottom: 0; box-shadow: none; }
.ai-process.is-complete .ai-process-head { min-height: 52px; padding-top: 9px; padding-bottom: 9px; background: rgba(255, 255, 255, .72); }
.ai-message { gap: 12px; }
.ai-message p { max-width: 78%; padding: 13px 16px; font-size: 13px; line-height: 1.75; }
.ai-message-paragraph { display: block; }
.ai-message-paragraph + .ai-message-paragraph { margin-top: 8px; padding-top: 8px; border-top: 1px solid rgba(50, 68, 108, .08); }

.ai-operation { margin: 20px 0 0 45px; overflow: hidden; background: rgba(255, 255, 255, .98); border: 1px solid rgba(63, 112, 255, .22); border-radius: 16px; box-shadow: 0 18px 44px rgba(45, 62, 104, .09); animation: ai-rise .36s ease both; }
.ai-operation::before { display: block; height: 3px; content: ''; background: linear-gradient(90deg, #3f70ff, #81a2ff 68%, #ff6a2a); }
.ai-operation > header { display: grid; grid-template-columns: 38px minmax(0, 1fr) auto; align-items: center; gap: 11px; padding: 15px 16px 13px; border-bottom: 1px solid rgba(50, 68, 108, .09); }
.ai-operation-icon { display: grid; width: 36px; height: 36px; place-items: center; color: #fff; font-size: 17px; background: #3f70ff; border-radius: 12px; box-shadow: 0 8px 18px rgba(63, 112, 255, .22); }
.ai-operation header small, .ai-operation header strong { display: block; }
.ai-operation header small { margin-bottom: 4px; color: #8a94a8; font-size: 9px; letter-spacing: .06em; }
.ai-operation header strong { color: #222b40; font-size: 14px; font-weight: 680; }
.ai-operation header b { padding: 6px 9px; color: #315fdc; font-size: 9px; font-weight: 700; background: #eef3ff; border-radius: 999px; }
.ai-operation:is(.is-ready, .is-queued, .is-preparing, .is-running) header b { color: #fff; background: #3f70ff; }
.ai-operation.is-waiting header b, .ai-operation.is-partial header b { color: #9a4a18; background: #fff0e5; }
.ai-operation.is-completed header b { color: #087443; background: #e7f8ef; }
.ai-operation.is-failed header b { color: #b42318; background: #ffebe9; }
.ai-operation.is-cancelled header b { color: #5f6879; background: #edf0f5; }
.ai-operation dl { display: grid; gap: 12px; margin: 0; padding: 14px 16px 15px; }
.ai-operation dl > div { display: grid; grid-template-columns: 62px minmax(0, 1fr); align-items: start; gap: 10px; }
.ai-operation dt { padding-top: 5px; color: #8b95a8; font-size: 10px; }
.ai-operation dd { display: flex; flex-wrap: wrap; gap: 6px; min-width: 0; margin: 0; }
.ai-operation dd span { max-width: 100%; padding: 5px 8px; overflow: hidden; color: #3f4a62; font-size: 10px; text-overflow: ellipsis; white-space: nowrap; background: #f3f6fc; border: 1px solid rgba(56, 75, 118, .1); border-radius: 7px; }
.ai-operation > p { margin: 0; padding: 10px 16px; color: #92502f; font-size: 10px; line-height: 1.5; background: #fff8f3; border-top: 1px solid rgba(255, 106, 42, .13); }
.ai-operation > .ai-operation-execution-message { color: #3f4a62; background: #f6f8fc; border-top-color: rgba(63, 112, 255, .12); }
.ai-operation.is-completed > .ai-operation-execution-message { color: #087443; background: #f1fbf6; border-top-color: rgba(8, 116, 67, .12); }
.ai-operation.is-failed > .ai-operation-execution-message { color: #b42318; background: #fff4f2; border-top-color: rgba(180, 35, 24, .12); }
.ai-apply.is-operation { background: linear-gradient(135deg, #3567ee, #4f7dff); box-shadow: 0 9px 20px rgba(63, 112, 255, .23); }

/* Incomplete requests stay compact: facts first, one missing parameter, one action row. */
.ai-guidance { margin: 18px 0 0 45px; overflow: hidden; background: rgba(255, 255, 255, .97); border: 1px solid rgba(48, 68, 112, .16); border-radius: 15px; box-shadow: 0 16px 42px rgba(43, 58, 95, .08); animation: ai-rise .34s cubic-bezier(.2,.8,.2,1) both; }
.ai-guidance-head { display: grid; grid-template-columns: 38px minmax(0, 1fr) auto; align-items: center; gap: 11px; padding: 14px 15px 12px; background: #f7f9fd; border-bottom: 1px solid rgba(53, 71, 111, .1); }
.ai-guidance-pulse { position: relative; display: grid; width: 36px; height: 36px; place-items: center; background: #fff; border: 1px solid rgba(63, 112, 255, .2); border-radius: 12px; box-shadow: 0 7px 18px rgba(63, 112, 255, .08); }
.ai-guidance-pulse::before, .ai-guidance-pulse::after { position: absolute; content: ''; border: 1px solid rgba(63, 112, 255, .14); border-radius: 50%; }
.ai-guidance-pulse::before { width: 22px; height: 22px; }
.ai-guidance-pulse::after { width: 12px; height: 12px; }
.ai-guidance-pulse i { z-index: 1; width: 5px; height: 5px; background: #3f70ff; border-radius: 50%; box-shadow: 0 0 0 4px rgba(63, 112, 255, .1), 0 0 10px rgba(63, 112, 255, .42); }
.ai-guidance-head p { margin: 0 0 4px; color: #ff6a2a; font: 750 8px/1.2 "DIN Alternate", monospace; letter-spacing: .14em; }
.ai-guidance-head h3 { margin: 0; color: #20283a; font-size: 14px; font-weight: 700; letter-spacing: -.02em; }
.ai-guidance-head small { display: block; margin-top: 3px; color: #8a94a7; font-size: 9px; }
.ai-guidance-head > b { padding: 5px 8px; color: #315fdc; font-size: 9px; font-weight: 700; background: #eaf0ff; border-radius: 999px; }
.ai-understood-list { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 1px; margin: 0; background: rgba(54, 73, 117, .09); border-bottom: 1px solid rgba(53, 71, 111, .1); }
.ai-understood-list > div { min-width: 0; padding: 10px 13px; background: #fff; }
.ai-understood-list > div:last-child:nth-child(odd) { grid-column: 1 / -1; }
.ai-understood-list dt, .ai-understood-list dd { margin: 0; }
.ai-understood-list dt { margin-bottom: 4px; color: #929bad; font-size: 8px; font-weight: 650; letter-spacing: .08em; }
.ai-understood-list dd { overflow: hidden; color: #33405a; font-size: 10px; font-weight: 650; text-overflow: ellipsis; white-space: nowrap; }
.ai-guidance-next { position: relative; display: grid; grid-template-columns: 46px minmax(0, 1fr); gap: 5px 10px; align-items: start; padding: 13px 15px; background: #fffaf6; border-bottom: 1px solid rgba(255, 106, 42, .1); }
.ai-guidance-next::before { position: absolute; inset: 0 auto 0 0; width: 3px; content: ''; background: #ff6a2a; }
.ai-guidance-next > span { grid-row: 1 / span 2; padding: 4px 7px; color: #b94a1d; font-size: 8px; font-weight: 750; text-align: center; background: #ffecdf; border-radius: 6px; }
.ai-guidance-next strong { color: #4c3024; font-size: 11px; line-height: 1.55; }
.ai-guidance-next small { color: #9a7565; font-size: 9px; line-height: 1.45; }
.ai-guidance-actions { display: flex; flex-wrap: wrap; gap: 7px; padding: 12px 15px 15px; }
.ai-guidance-actions button { min-height: 32px; padding: 6px 11px; color: #39445c; font: inherit; font-size: 10px; font-weight: 620; background: #fff; border: 1px solid rgba(53, 72, 115, .18); border-radius: 9px; cursor: pointer; transition: color .16s ease, background .16s ease, border-color .16s ease, transform .16s ease, box-shadow .16s ease; }
.ai-guidance-actions button:hover:not(:disabled) { color: #244fc7; background: #f5f7ff; border-color: rgba(63, 112, 255, .38); transform: translateY(-1px); box-shadow: 0 7px 16px rgba(63, 112, 255, .09); }
.ai-guidance-actions button.is-primary { color: #fff; background: #315fdc; border-color: #315fdc; box-shadow: 0 7px 16px rgba(49, 95, 220, .2); }
.ai-guidance-actions button.is-formal { color: #244fc7; background: #eef3ff; border-color: rgba(63, 112, 255, .3); }
.ai-guidance-actions button > span { margin-right: 5px; padding: 2px 4px; color: #fff; font-size: 7px; background: #3f70ff; border-radius: 4px; }
.ai-guidance-actions button:disabled { opacity: .5; cursor: not-allowed; }
.ai-guidance .ai-category-picker { gap: 9px; margin: 0; padding: 12px 15px 15px; }
.ai-guidance .ai-category-recommendation { min-height: 54px; padding-top: 9px; padding-bottom: 9px; }
.ai-guidance .ai-category-groups { display: flex; gap: 6px; overflow-x: auto; padding-bottom: 2px; scrollbar-width: thin; }
.ai-guidance .ai-category-groups button { min-width: 112px; }
.ai-guidance .ai-feedback-action { width: calc(100% - 30px); margin: 0 15px 15px; }

@keyframes ai-rise { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: translateY(0); } }
@keyframes ai-breathe { 0%, 100% { opacity: .7; transform: scale(.94); } 50% { opacity: 1; transform: scale(1.06); } }
@keyframes ai-status { 0%, 100% { opacity: .55; } 50% { opacity: 1; } }
@keyframes ai-spin { to { transform: rotate(360deg); } }
@keyframes ai-cursor { 0%, 48% { opacity: 1; } 49%, 100% { opacity: 0; } }
@keyframes ai-scan { 0% { transform: translateX(-70%); opacity: 0; } 45% { opacity: 1; } 100% { transform: translateX(70%); opacity: 0; } }
@keyframes ai-stage { 0%, 100% { transform: scale(.96); } 50% { transform: scale(1.06); } }

@media (max-width: 620px) {
  .ai-head { grid-template-columns: 48px minmax(0, 1fr) 32px; gap: 11px; padding: 18px 18px 15px; }
  .ai-head-mark { width: 46px; height: 46px; }
  .ai-head-copy h2 { font-size: 21px; }
  .ai-head-copy > span { display: none; }
  .ai-status { padding: 0 18px; }
  .ai-status-meta { max-width: 55%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .ai-body { padding: 22px 18px 28px; }
  .ai-welcome { margin-top: 22px; }
  .ai-welcome h3 { font-size: 22px; }
  .ai-process { margin-left: 0; }
  .ai-operation { margin-left: 0; }
  .ai-guidance { margin-left: 0; }
  .ai-message p { max-width: 96%; }
  .ai-composer { padding: 13px 14px 14px; }
}

@media (max-width: 420px) {
  .ai-head { grid-template-columns: 44px minmax(0, 1fr) 32px; gap: 9px; padding: 15px 14px 13px; }
  .ai-head-mark { width: 42px; height: 42px; border-radius: 14px 14px 5px 14px; }
  .ai-head-copy p { font-size: 8px; letter-spacing: .1em; overflow-wrap: anywhere; }
  .ai-head-copy h2 { font-size: 19px; }
  .ai-status { padding: 0 14px; }
  .ai-status-meta { display: none; }
  .ai-body { padding-right: 14px; padding-left: 14px; }
  .ai-category-confirm { align-items: flex-end; }
}

@media (prefers-reduced-motion: reduce) {
  .ai-shell *, .ai-shell *::before, .ai-shell *::after { scroll-behavior: auto !important; animation-duration: .01ms !important; animation-iteration-count: 1 !important; transition-duration: .01ms !important; }
}
</style>
