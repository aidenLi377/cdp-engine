<template>
  <div class="tutorial-center">
    <header class="tutorial-center__topbar">
      <button
        v-if="selectedId"
        type="button"
        class="tutorial-center__back"
        @click="selectedId = ''"
      >
        <el-icon><ArrowLeft /></el-icon>
        返回学习总览
      </button>
      <div v-else class="tutorial-center__location">
        <span>LEARNING CENTER</span>
        <strong>新手教程</strong>
      </div>
      <button type="button" class="tutorial-center__close" @click="closeCenter">
        返回工作区
      </button>
    </header>

    <TutorialCelebration
      v-if="celebrationVisible"
      @review="reviewTutorials"
      @close="closeCenter"
    />

    <main
      v-else-if="selectedId && detailComponent"
      ref="detailMainRef"
      class="tutorial-center__detail"
      :class="{ 'is-entry-guided': startGuideVisible }"
    >
      <div class="tutorial-center__detail-context">
        <span>{{ detailMeta?.duration }}</span>
        <strong>{{ detailMeta?.businessProblem }}</strong>
        <i v-if="isCompleted(selectedId)">已完成打卡</i>
      </div>
      <section v-if="selectedCheckpoint" class="tutorial-resume">
        <div class="tutorial-resume__copy">
          <span>{{ isCompleted(selectedId) ? '本次重新练习已保存' : '已保存上次实操' }}</span>
          <strong>上次做到 {{ checkpointStepIndex + 1 }}/{{ selectedTutorialSteps.length }}：{{ selectedCheckpoint.stepTitle }}</strong>
          <p>选择一个已走过的步骤继续。系统会先恢复此前的页面与参数，再把高亮定位到该步骤。</p>
        </div>
        <div class="tutorial-resume__timeline" aria-label="选择教程恢复步骤">
          <button
            v-for="(step, index) in selectedTutorialSteps"
            :key="step.id"
            type="button"
            :class="{ current: index === checkpointStepIndex, reached: index <= checkpointStepIndex }"
            :disabled="index > checkpointStepIndex"
            :title="index <= checkpointStepIndex ? `从第 ${index + 1} 步继续：${step.title}` : `完成第 ${checkpointStepIndex + 1} 步后解锁`"
            @click="resumeFromStep(step.id, index)"
          >
            <i>{{ index < checkpointStepIndex ? '✓' : index + 1 }}</i>
            <span>{{ step.title }}</span>
          </button>
        </div>
        <div class="tutorial-resume__actions">
          <button type="button" class="is-secondary" @click="startTutorial(selectedId, { fresh: true })">重新开始</button>
          <button type="button" class="is-primary" @click="resumeFromStep(selectedCheckpoint.stepId, checkpointStepIndex)">
            {{ isCompleted(selectedId) ? '继续本次练习 →' : '继续上次进度 →' }}
          </button>
        </div>
      </section>
      <Transition name="tutorial-start-guide">
        <div v-if="startGuideVisible" class="tutorial-center__start-guide" role="status">
          <span>已为你选好任务</span>
          <strong>点击发光按钮，开始跟着高亮完成实操</strong>
          <button type="button" aria-label="关闭开始提示" @click="startGuideVisible = false">×</button>
        </div>
      </Transition>
      <TutorialOperationComparison :tutorial-id="selectedId" />
      <component :is="detailComponent" @start="startTutorial(selectedId)" />
    </main>

    <main v-else class="tutorial-center__overview">
      <section class="tutorial-hero">
        <div class="tutorial-hero__copy">
          <span class="tutorial-kicker">从真实业务任务开始</span>
          <h1>做完一次，带走能继续使用的成果</h1>
          <p>
            每个教程都要求你亲手完成真实操作。系统会记录账号进度，并告诉你已经掌握了什么、能解决哪类业务问题。
          </p>
          <div class="tutorial-hero__recovery-note" role="note">
            <i aria-hidden="true">↻</i>
            <span><strong>中断不用重来</strong>进度会按步骤自动保存，返回对应教程即可选择上次步骤继续。</span>
          </div>
          <div class="tutorial-hero__actions">
            <button
              v-if="nextId"
              type="button"
              class="tutorial-primary-action"
              @click="openDetail(nextId)"
            >
              {{ `开始：${nextMeta?.shortTitle || '下一个任务'}` }}
              <span>→</span>
            </button>
            <span v-else class="tutorial-all-done">当前实操课程已全部完成</span>
            <small>{{ nextMeta ? `建议下一步：${nextMeta.shortTitle}` : '已形成完整的基础操作能力' }}</small>
          </div>
        </div>

        <div class="tutorial-hero__progress" aria-label="教程完成进度">
          <svg viewBox="0 0 120 120" role="img" aria-hidden="true">
            <circle class="tutorial-progress-track" cx="60" cy="60" r="51" />
            <circle
              class="tutorial-progress-value"
              cx="60"
              cy="60"
              r="51"
              :style="{ strokeDashoffset: progressDashOffset }"
            />
          </svg>
          <div>
            <strong>{{ completedMilestones }}</strong>
            <span>/ {{ TUTORIAL_MILESTONE_TOTAL }}</span>
            <small>完成打卡</small>
          </div>
        </div>
      </section>

      <section class="tutorial-summary-grid" aria-label="学习结果总览">
        <article>
          <span>已完成</span>
          <strong>{{ completedTutorialCount }} 个实操任务</strong>
          <small>完成最后一步后自动记入当前账号</small>
        </article>
        <article>
          <span>已掌握</span>
          <strong>{{ masteredCapabilities.length }} 组核心方法</strong>
          <small>从批量输入，到方案复用与组合提效</small>
        </article>
        <article>
          <span>可解决</span>
          <strong>{{ solvedProblems.length }} 类业务问题</strong>
          <small>学习结果和业务价值保持一一对应</small>
        </article>
      </section>

      <div v-if="loading" class="tutorial-center__state">正在读取你的学习进度…</div>
      <div v-else-if="errorMessage" class="tutorial-center__state tutorial-center__state--error">
        <span>{{ errorMessage }}</span>
        <button type="button" @click="loadProgress">重新读取</button>
      </div>

      <section class="tutorial-section">
        <header class="tutorial-section__head">
          <div>
            <span>CORE SKILLS</span>
            <h2>先掌握三种高频业务提效方法</h2>
          </div>
          <p>三个正式实操任务：批量拆条件、批量取画像，以及只改一个参数批量创建多个人群包。</p>
        </header>

        <div class="tutorial-quick-grid">
          <article
            v-for="item in quickTutorials"
            :key="item.id"
            class="tutorial-task-card"
            :class="{ completed: isCompleted(item.id) }"
          >
            <div class="tutorial-task-card__topline">
              <span>{{ item.sequence }}</span>
              <i>{{ isCompleted(item.id) ? '已完成打卡' : '待完成' }}</i>
            </div>
            <h3>{{ item.title }}</h3>
            <p>{{ item.businessProblem }}</p>
            <dl>
              <div><dt>你会掌握</dt><dd>{{ item.capability }}</dd></div>
              <div><dt>完成产出</dt><dd>{{ item.result }}</dd></div>
            </dl>
            <footer>
              <small>{{ item.duration }}</small>
              <button type="button" @click="openDetail(item.id)">
                {{ isCompleted(item.id) ? '再次练习' : '查看任务' }}
              </button>
            </footer>
          </article>
        </div>
      </section>

      <section class="tutorial-section tutorial-section--pull">
        <header class="tutorial-section__head">
          <div>
            <span>CORE COURSE · 进阶必学</span>
            <h2>进阶必学：大促拉力分析提效</h2>
          </div>
          <div class="tutorial-course-progress">
            <strong>{{ pullCourseDone }}/4</strong>
            <span>完成前三课即可掌握 X-Data 最核心的模板制作、字段聚合与组合复用</span>
          </div>
        </header>

        <div class="tutorial-course">
          <aside class="tutorial-course__story">
            <span>进阶，但必学 · 真实业务任务</span>
            <h3>统一准备本品与竞品的共同浏览及购买人群</h3>
            <p>
              先做共同浏览，再派生购买本品、购买竞品两个方案，最终放入同一文件夹。以后换类目或竞品，只改少量组合参数，就能一次圈完三个人群包。
            </p>
            <div>
              <b>最终成果</b>
              <span>3 个正式方案</span>
              <span>1 个组合方案文件夹</span>
              <span>两轮共 6 个包，再扩展三个竞品的 9 个包</span>
            </div>
          </aside>

          <ol class="tutorial-course__lessons">
            <li :class="{ completed: isCompleted(SOLUTION_REUSE_TUTORIAL_ID) }">
              <span class="tutorial-lesson-index">1</span>
              <div>
                <small>第 1 课 · 制作底稿</small>
                <strong>创建共同浏览方案</strong>
                <p>制作一对多字段，并用两次圈人验证只改少量参数就能复用。</p>
              </div>
              <button type="button" @click="openDetail(SOLUTION_REUSE_TUTORIAL_ID)">
                {{ isCompleted(SOLUTION_REUSE_TUTORIAL_ID) ? '重练' : '开始' }}
              </button>
            </li>
            <li
              :class="{
                completed: isCompleted(PULL_ANALYSIS_GROUP_TUTORIAL_ID),
                locked: !isUnlocked(PULL_ANALYSIS_GROUP_TUTORIAL_ID),
              }"
            >
              <span class="tutorial-lesson-index">2</span>
              <div>
                <small>第 2 课 · 扩展链路</small>
                <strong>创建购买本品与购买竞品</strong>
                <p>从基础方案派生两个新方案，保持同名自定义字段可被组合。</p>
              </div>
              <button
                type="button"
                :disabled="!isUnlocked(PULL_ANALYSIS_GROUP_TUTORIAL_ID)"
                @click="openDetail(PULL_ANALYSIS_GROUP_TUTORIAL_ID)"
              >
                {{ isCompleted(PULL_ANALYSIS_GROUP_TUTORIAL_ID) ? '重练' : isUnlocked(PULL_ANALYSIS_GROUP_TUTORIAL_ID) ? '继续课程' : '待解锁' }}
              </button>
              <span v-if="!isUnlocked(PULL_ANALYSIS_GROUP_TUTORIAL_ID)" class="tutorial-lesson-lock">完成第 1 课后解锁</span>
            </li>
            <li
              :class="{
                completed: isCompleted(PULL_ANALYSIS_GROUP_TUTORIAL_ID),
                locked: !isCompleted(PULL_ANALYSIS_GROUP_TUTORIAL_ID),
              }"
            >
              <span class="tutorial-lesson-index">3</span>
              <div>
                <small>第 3 课 · 组合提效</small>
                <strong>三方案组合批量圈人</strong>
                <p>理解同名字段如何聚合，先圈默认场景，再改参数圈第二轮。</p>
              </div>
              <button
                v-if="!isCompleted(PULL_ANALYSIS_GROUP_TUTORIAL_ID)"
                type="button"
                disabled
              >
                待解锁
              </button>
              <span
                v-if="!isCompleted(PULL_ANALYSIS_GROUP_TUTORIAL_ID)"
                class="tutorial-lesson-lock"
              >
                完成第 2 课后解锁
              </span>
              <span v-else class="tutorial-lesson-linked">已随第 2 课完成</span>
            </li>
            <li
              :class="{
                completed: isCompleted(COMBINATION_BATCH_TUTORIAL_ID),
                locked: !isUnlocked(COMBINATION_BATCH_TUTORIAL_ID),
              }"
            >
              <span class="tutorial-lesson-index">4</span>
              <div><small>第 4 课 · 多竞品批量</small><strong>三个竞品，一次准备九个包</strong><p>复用方案组，粘贴竞争品牌名单，每行展开整组三个方案。</p></div>
              <button
                type="button"
                :disabled="!isUnlocked(COMBINATION_BATCH_TUTORIAL_ID)"
                @click="openDetail(COMBINATION_BATCH_TUTORIAL_ID)"
              >
                {{ isCompleted(COMBINATION_BATCH_TUTORIAL_ID) ? '重练' : isUnlocked(COMBINATION_BATCH_TUTORIAL_ID) ? '查看任务' : '待解锁' }}
              </button>
              <span v-if="!isUnlocked(COMBINATION_BATCH_TUTORIAL_ID)" class="tutorial-lesson-lock">完成第 3 课后解锁</span>
            </li>
          </ol>
        </div>
      </section>

      <section class="tutorial-section tutorial-section--results">
        <header class="tutorial-section__head">
          <div>
            <span>YOUR TOOLKIT</span>
            <h2>你已经掌握的能力</h2>
          </div>
          <p>这里不是观看记录，而是你已经亲手完成过的业务方法。</p>
        </header>

        <div v-if="masteredCapabilities.length" class="tutorial-results-grid">
          <article v-for="item in masteredCapabilities" :key="item.id">
            <span>✓ 已掌握</span>
            <strong>{{ item.capability }}</strong>
            <p>{{ item.businessProblem }}</p>
          </article>
        </div>
        <div v-else class="tutorial-results-empty">
          完成第一个实操任务后，这里会出现你的能力清单和对应的业务价值。
        </div>
      </section>

    </main>
  </div>
</template>

<script setup>
import { computed, nextTick, onActivated, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { ArrowLeft } from '@element-plus/icons-vue'
import DmpBatchTutorialDetail from './DmpBatchTutorialDetail.vue'
import ParameterBatchTutorialDetail from './ParameterBatchTutorialDetail.vue'
import PullAnalysisGroupTutorialDetail from './PullAnalysisGroupTutorialDetail.vue'
import SolutionReuseTutorialDetail from './SolutionReuseTutorialDetail.vue'
import TutorialTaskDetail from './TutorialTaskDetail.vue'
import TutorialOperationComparison from './TutorialOperationComparison.vue'
import CombinationBatchTutorialDetail from './CombinationBatchTutorialDetail.vue'
import TutorialCelebration from './TutorialCelebration.vue'
import {
  CATEGORY_ITEM_TUTORIAL_ID,
  COMBINATION_BATCH_TUTORIAL_ID,
  DMP_BATCH_TUTORIAL_ID,
  PARAMETER_BATCH_TUTORIAL_ID,
  PULL_ANALYSIS_GROUP_TUTORIAL_ID,
  SOLUTION_REUSE_TUTORIAL_ID,
  GUIDED_TUTORIAL_STEPS,
} from '../utils/guidedTutorialConfig.js'
import {
  TUTORIAL_CATALOG,
  TUTORIAL_MILESTONE_TOTAL,
  completedTutorialIds,
  countCompletedMilestones,
  isTutorialUnlocked,
  nextTutorialId,
} from '../utils/tutorialCatalog.js'
import {
  TUTORIAL_CHECKPOINT_EVENT,
  TUTORIAL_PROGRESS_EVENT,
  clearTutorialCheckpoint,
  fetchTutorialCheckpoints,
  fetchTutorialProgress,
} from '../utils/tutorialProgress.js'

const emit = defineEmits(['close', 'start-tutorial'])
const props = defineProps({
  initialTutorialId: { type: String, default: '' },
  focusStartToken: { type: Number, default: 0 },
  celebrationToken: { type: Number, default: 0 },
})

const progressItems = ref([])
const checkpointItems = ref([])
const selectedId = ref('')
const detailMainRef = ref(null)
const startGuideVisible = ref(false)
const celebrationVisible = ref(false)
const loading = ref(false)
const errorMessage = ref('')
let loadPromise = null
let activationCount = 0
let startGuideTimer = null

const detailComponents = {
  [COMBINATION_BATCH_TUTORIAL_ID]: CombinationBatchTutorialDetail,
  [CATEGORY_ITEM_TUTORIAL_ID]: TutorialTaskDetail,
  [DMP_BATCH_TUTORIAL_ID]: DmpBatchTutorialDetail,
  [SOLUTION_REUSE_TUTORIAL_ID]: SolutionReuseTutorialDetail,
  [PULL_ANALYSIS_GROUP_TUTORIAL_ID]: PullAnalysisGroupTutorialDetail,
  [PARAMETER_BATCH_TUTORIAL_ID]: ParameterBatchTutorialDetail,
}

const completedIds = computed(() => completedTutorialIds(progressItems.value))
const completedMilestones = computed(() => countCompletedMilestones(progressItems.value))
const completedTutorialCount = computed(() => TUTORIAL_CATALOG.filter(item => completedIds.value.has(item.id)).length)
const nextId = computed(() => nextTutorialId(progressItems.value))
const nextMeta = computed(() => TUTORIAL_CATALOG.find((item) => item.id === nextId.value) || null)
const quickTutorials = computed(() => TUTORIAL_CATALOG.filter((item) => item.track === 'quick'))
const pullCourseDone = computed(() =>
  (completedIds.value.has(SOLUTION_REUSE_TUTORIAL_ID) ? 1 : 0)
  + (completedIds.value.has(PULL_ANALYSIS_GROUP_TUTORIAL_ID) ? 2 : 0)
  + (completedIds.value.has(COMBINATION_BATCH_TUTORIAL_ID) ? 1 : 0),
)
const masteredCapabilities = computed(() =>
  TUTORIAL_CATALOG.filter((item) => completedIds.value.has(item.id)),
)
const solvedProblems = computed(() => masteredCapabilities.value.map((item) => item.businessProblem))
const progressDashOffset = computed(() => {
  const circumference = 2 * Math.PI * 51
  const ratio = completedMilestones.value / TUTORIAL_MILESTONE_TOTAL
  return String(circumference * (1 - ratio))
})
const detailComponent = computed(() => detailComponents[selectedId.value] || null)
const detailMeta = computed(() => TUTORIAL_CATALOG.find((item) => item.id === selectedId.value) || null)
const selectedCheckpoint = computed(() => (
  checkpointItems.value.find(item => item.tutorialId === selectedId.value) || null
))
const selectedTutorialSteps = computed(() => GUIDED_TUTORIAL_STEPS[selectedId.value] || [])
const checkpointStepIndex = computed(() => {
  const checkpoint = selectedCheckpoint.value
  if (!checkpoint) return 0
  const byId = selectedTutorialSteps.value.findIndex(step => step.id === checkpoint.stepId)
  const index = byId >= 0 ? byId : Number(checkpoint.stepIndex) || 0
  return Math.min(Math.max(index, 0), Math.max(selectedTutorialSteps.value.length - 1, 0))
})

function isCompleted(id) {
  return completedIds.value.has(id)
}

function isUnlocked(id) {
  return isTutorialUnlocked(id, progressItems.value)
}

function reviewTutorials() {
  celebrationVisible.value = false
  selectedId.value = ''
}

function closeCenter() {
  celebrationVisible.value = false
  selectedId.value = ''
  emit('close')
}

function openDetail(id) {
  if (!detailComponents[id] || !isUnlocked(id)) return
  celebrationVisible.value = false
  startGuideVisible.value = false
  selectedId.value = id
}

async function startTutorial(id, options = {}) {
  if (!isUnlocked(id)) return
  startGuideVisible.value = false
  if (options.fresh && selectedCheckpoint.value) {
    try {
      await clearTutorialCheckpoint(id)
      checkpointItems.value = checkpointItems.value.filter(item => item.tutorialId !== id)
    } catch {
      // A network retry must not prevent the user from restarting locally.
    }
  }
  const latestCheckpoint = options.fresh ? null : selectedCheckpoint.value
  const history = latestCheckpoint?.stepCheckpoints
  const historicalCheckpoint = options.stepId && history && typeof history === 'object'
    ? history[options.stepId]
    : null
  const checkpoint = historicalCheckpoint && typeof historicalCheckpoint === 'object'
    ? historicalCheckpoint
    : latestCheckpoint
  emit('start-tutorial', checkpoint
    ? {
        tutorialId: id,
        checkpoint,
        stepId: options.stepId || checkpoint.stepId,
        stepIndex: Number.isInteger(options.stepIndex) ? options.stepIndex : checkpointStepIndex.value,
      }
    : id)
}

function resumeFromStep(stepId, stepIndex) {
  if (stepIndex > checkpointStepIndex.value) return
  startTutorial(selectedId.value, { stepId, stepIndex })
}

async function guideToStartButton(id) {
  if (!detailComponents[id]) return
  await loadProgress()
  if (!isUnlocked(id)) return
  selectedId.value = id
  startGuideVisible.value = true
  clearTimeout(startGuideTimer)
  await nextTick()
  window.setTimeout(() => {
    const button = detailMainRef.value?.querySelector('[data-tutorial-start]')
    button?.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'nearest' })
    button?.focus({ preventScroll: true })
  }, 180)
  startGuideTimer = window.setTimeout(() => {
    startGuideVisible.value = false
  }, 9000)
}

watch(
  () => props.focusStartToken,
  (token) => {
    if (!token || !props.initialTutorialId) return
    void guideToStartButton(props.initialTutorialId)
  },
  { immediate: true },
)

watch(
  () => props.celebrationToken,
  (token) => {
    if (!token) return
    startGuideVisible.value = false
    selectedId.value = ''
    celebrationVisible.value = true
  },
  { immediate: true },
)

async function loadProgress() {
  if (loadPromise) return loadPromise
  loading.value = true
  errorMessage.value = ''
  loadPromise = Promise.all([fetchTutorialProgress(), fetchTutorialCheckpoints()])
    .then(([progress, checkpoints]) => {
      progressItems.value = progress
      checkpointItems.value = checkpoints
    })
    .catch((error) => {
      errorMessage.value = error.message || '学习进度暂时无法读取'
    })
    .finally(() => {
      loading.value = false
      loadPromise = null
    })
  return loadPromise
}

function handleProgressChanged(event) {
  const item = event.detail
  if (!item?.tutorialId) {
    void loadProgress()
    return
  }
  progressItems.value = [
    item,
    ...progressItems.value.filter((entry) => entry.tutorialId !== item.tutorialId),
  ]
}

function handleCheckpointChanged(event) {
  const item = event.detail
  if (!item?.tutorialId) return
  if (item.deleted) {
    checkpointItems.value = checkpointItems.value.filter(entry => entry.tutorialId !== item.tutorialId)
    return
  }
  checkpointItems.value = [
    item,
    ...checkpointItems.value.filter(entry => entry.tutorialId !== item.tutorialId),
  ]
}

onMounted(() => {
  window.addEventListener(TUTORIAL_PROGRESS_EVENT, handleProgressChanged)
  window.addEventListener(TUTORIAL_CHECKPOINT_EVENT, handleCheckpointChanged)
  void loadProgress()
})

onActivated(() => {
  activationCount += 1
  if (activationCount > 1) void loadProgress()
})

onBeforeUnmount(() => {
  clearTimeout(startGuideTimer)
  window.removeEventListener(TUTORIAL_PROGRESS_EVENT, handleProgressChanged)
  window.removeEventListener(TUTORIAL_CHECKPOINT_EVENT, handleCheckpointChanged)
})
</script>

<style scoped>
.tutorial-center { width: 100%; height: 100%; min-height: 0; color: #172033; background: #f7f9fc; }
.tutorial-center__topbar { display: flex; height: 62px; align-items: center; justify-content: space-between; padding: 0 34px; background: #fff; border-bottom: 1px solid #e7ebf1; }
.tutorial-center__location { display: flex; align-items: baseline; gap: 12px; }
.tutorial-center__location span { color: #2376d9; font: 700 8px/1 ui-monospace, SFMono-Regular, Menlo, monospace; letter-spacing: .16em; }
.tutorial-center__location strong { font-size: 18px; font-weight: 650; letter-spacing: -.04em; }
.tutorial-center__back,
.tutorial-center__close { display: inline-flex; height: 32px; appearance: none; align-items: center; gap: 7px; padding: 0 11px; color: #596579; font: inherit; font-size: 10px; background: #fff; border: 1px solid #dfe5ed; border-radius: 8px; cursor: pointer; }
.tutorial-center__back:hover,
.tutorial-center__close:hover { color: #172033; border-color: #aeb9c8; }
.tutorial-center__overview { height: calc(100% - 62px); overflow-y: auto; padding: 22px clamp(24px, 5vw, 76px) max(96px, calc(48px + env(safe-area-inset-bottom))); scroll-padding-bottom: 96px; }
.tutorial-center__detail { height: calc(100% - 62px); overflow-y: auto; background: #fff; }
.tutorial-center__detail-context { position: sticky; z-index: 3; top: 0; display: flex; min-height: 44px; align-items: center; gap: 14px; padding: 0 clamp(24px, 5vw, 70px); color: #6a7485; font-size: 9px; background: rgba(255, 255, 255, .96); border-bottom: 1px solid #e9edf2; backdrop-filter: blur(12px); }
.tutorial-center__detail-context strong { overflow: hidden; color: #344158; font-size: 10px; font-weight: 560; text-overflow: ellipsis; white-space: nowrap; }
.tutorial-center__detail-context i { margin-left: auto; padding: 5px 8px; color: #18794e; font-style: normal; background: #edf9f2; border-radius: 999px; }
.tutorial-center__start-guide { position: sticky; z-index: 6; top: 54px; display: flex; width: fit-content; min-height: 42px; box-sizing: border-box; align-items: center; gap: 10px; margin: 12px 24px -54px auto; padding: 8px 10px 8px 13px; color: #fff; background: #172033; border-radius: 11px; box-shadow: 0 14px 34px rgba(18, 28, 44, .2); }
.tutorial-center__start-guide span { color: #ff9a75; font-size: 9px; font-weight: 700; }
.tutorial-center__start-guide strong { font-size: 10px; font-weight: 590; }
.tutorial-center__start-guide button { display: grid; width: 24px; height: 24px; appearance: none; place-items: center; color: #aeb9c7; font: inherit; background: rgba(255, 255, 255, .08); border: 0; border-radius: 50%; cursor: pointer; }
.tutorial-center__detail :deep([data-tutorial-start]) { position: relative; min-height: 46px !important; padding: 0 22px !important; color: #fff !important; font-weight: 700 !important; background: #172033 !important; border: 1px solid #172033 !important; border-radius: 11px !important; box-shadow: 0 12px 26px rgba(23, 32, 51, .18) !important; transition: transform .2s ease, box-shadow .2s ease !important; }
.tutorial-center__detail :deep([data-tutorial-start]:hover) { transform: translateY(-2px); box-shadow: 0 16px 34px rgba(23, 32, 51, .24) !important; }
.tutorial-resume { display: grid; max-width: 1120px; box-sizing: border-box; margin: 20px auto 0; padding: 18px 20px; grid-template-columns: minmax(230px, .7fr) minmax(360px, 1.4fr) auto; align-items: center; gap: 20px; background: #f1f7ff; border: 1px solid #cfe2f6; border-radius: 14px; }
.tutorial-resume__copy span { color: #2376d9; font-size: 9px; font-weight: 750; letter-spacing: .08em; }
.tutorial-resume__copy strong { display: block; margin-top: 5px; color: #152a45; font-size: 14px; line-height: 1.35; }
.tutorial-resume__copy p { margin: 5px 0 0; color: #65758a; font-size: 10px; line-height: 1.55; }
.tutorial-resume__timeline { display: flex; min-width: 0; gap: 5px; overflow-x: auto; padding: 5px 2px; }
.tutorial-resume__timeline button { display: grid; min-width: 34px; max-width: 96px; appearance: none; place-items: center; gap: 4px; padding: 0; color: #95a0af; background: transparent; border: 0; cursor: not-allowed; }
.tutorial-resume__timeline button i { display: grid; width: 26px; height: 26px; place-items: center; color: #7c899a; font-size: 9px; font-style: normal; background: #fff; border: 1px solid #dce5ee; border-radius: 50%; }
.tutorial-resume__timeline button span { width: 100%; overflow: hidden; font-size: 8px; text-overflow: ellipsis; white-space: nowrap; }
.tutorial-resume__timeline button.reached { color: #536a83; cursor: pointer; }
.tutorial-resume__timeline button.reached i { color: #2376d9; border-color: #9bc7ef; }
.tutorial-resume__timeline button.current i { color: #fff; background: #2376d9; border-color: #2376d9; box-shadow: 0 0 0 4px rgba(35, 118, 217, .12); }
.tutorial-resume__actions { display: flex; flex-direction: column; gap: 7px; }
.tutorial-resume__actions button { min-width: 112px; height: 34px; appearance: none; padding: 0 12px; font: inherit; font-size: 9px; font-weight: 680; border-radius: 8px; cursor: pointer; }
.tutorial-resume__actions .is-primary { color: #fff; background: #172033; border: 1px solid #172033; }
.tutorial-resume__actions .is-secondary { color: #5f6d80; background: #fff; border: 1px solid #d7e0e9; }
.tutorial-center__detail.is-entry-guided :deep([data-tutorial-start]:first-of-type) { animation: tutorial-start-pulse 1.35s ease-in-out 3; box-shadow: 0 0 0 5px rgba(239, 101, 61, .2), 0 16px 34px rgba(23, 32, 51, .25) !important; }
.tutorial-hero { display: grid; box-sizing: border-box; max-width: 1240px; min-height: 0; margin: 0 auto; padding: 24px 32px; grid-template-columns: minmax(0, 1fr) 132px; align-items: center; gap: 32px; overflow: hidden; background: #eaf4ff; border: 1px solid #d4e8fb; border-radius: 18px; }
.tutorial-hero__copy { max-width: 760px; }
.tutorial-kicker { display: inline-flex; padding: 5px 8px; color: #176fc2; font-size: 8px; font-weight: 650; background: #fff; border: 1px solid #c9e2f8; border-radius: 999px; }
.tutorial-hero h1 { max-width: 720px; margin: 12px 0 7px; color: #10243d; font-size: clamp(26px, 2.2vw, 34px); font-weight: 680; line-height: 1.08; letter-spacing: -.05em; }
.tutorial-hero p { max-width: 720px; margin: 0; color: #52667f; font-size: 11px; line-height: 1.65; }
.tutorial-hero__recovery-note { display: inline-flex; align-items: center; gap: 8px; margin-top: 10px; color: #526b86; font-size: 9px; line-height: 1.4; }
.tutorial-hero__recovery-note i { display: grid; width: 20px; height: 20px; flex: 0 0 20px; place-items: center; color: #2376d9; font-size: 12px; font-style: normal; background: rgba(255, 255, 255, .82); border: 1px solid #c9e2f8; border-radius: 50%; }
.tutorial-hero__recovery-note strong { margin-right: 6px; color: #176fc2; font-weight: 700; }
.tutorial-hero__actions { display: flex; align-items: center; gap: 12px; margin-top: 14px; }
.tutorial-primary-action { display: inline-flex; height: 42px; appearance: none; align-items: center; gap: 14px; padding: 0 18px; color: #fff; font: inherit; font-size: 11px; font-weight: 700; background: #172033; border: 0; border-radius: 10px; cursor: pointer; box-shadow: 0 10px 24px rgba(23, 32, 51, .18); transition: transform .2s ease, box-shadow .2s ease; }
.tutorial-primary-action:hover { transform: translateY(-1px); }
.tutorial-primary-action span { font-size: 15px; }
.tutorial-hero__actions small { color: #61748c; font-size: 9px; }
.tutorial-all-done { display: inline-flex; height: 34px; align-items: center; padding: 0 12px; color: #18794e; font-size: 9px; font-weight: 650; background: #fff; border: 1px solid #b9e6cc; border-radius: 9px; }
.tutorial-hero__progress { position: relative; display: grid; width: 116px; height: 116px; place-items: center; justify-self: center; background: rgba(255, 255, 255, .72); border: 1px solid #d6e8f8; border-radius: 50%; }
.tutorial-hero__progress svg { position: absolute; inset: 8px; width: calc(100% - 16px); height: calc(100% - 16px); transform: rotate(-90deg); }
.tutorial-hero__progress circle { fill: none; stroke-width: 8; }
.tutorial-progress-track { stroke: #dbe9f6; }
.tutorial-progress-value { stroke: #2376d9; stroke-linecap: round; stroke-dasharray: 320.442; transition: stroke-dashoffset .6s cubic-bezier(.22, 1, .36, 1); }
.tutorial-hero__progress > div { position: relative; display: grid; grid-template-columns: auto auto; align-items: baseline; text-align: center; }
.tutorial-hero__progress strong { font-size: 31px; font-weight: 700; letter-spacing: -.08em; }
.tutorial-hero__progress span { margin-left: 3px; color: #70829a; font-size: 11px; }
.tutorial-hero__progress small { grid-column: 1 / -1; margin-top: 4px; color: #60758e; font-size: 9px; letter-spacing: .08em; }
.tutorial-summary-grid { display: grid; max-width: 1240px; margin: 10px auto 0; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 10px; }
.tutorial-summary-grid article { min-height: 58px; padding: 11px 15px; background: #fff; border: 1px solid #e3e7ed; border-radius: 11px; }
.tutorial-summary-grid span,
.tutorial-summary-grid strong,
.tutorial-summary-grid small { display: block; }
.tutorial-summary-grid span { color: #2376d9; font-size: 8px; font-weight: 700; letter-spacing: .08em; }
.tutorial-summary-grid strong { margin-top: 5px; font-size: 13px; font-weight: 640; letter-spacing: -.02em; }
.tutorial-summary-grid small { margin-top: 3px; color: #8993a2; font-size: 8px; }
.tutorial-center__state { display: flex; max-width: 1240px; min-height: 42px; align-items: center; justify-content: center; gap: 12px; margin: 16px auto 0; color: #718096; font-size: 10px; background: #fff; border: 1px solid #e3e7ed; border-radius: 10px; }
.tutorial-center__state--error { color: #a43b32; }
.tutorial-center__state button { appearance: none; padding: 4px 7px; color: inherit; font: inherit; background: transparent; border: 1px solid currentColor; border-radius: 6px; cursor: pointer; }
.tutorial-section { max-width: 1240px; margin: 30px auto 0; }
.tutorial-section__head { display: flex; align-items: flex-end; justify-content: space-between; gap: 28px; margin-bottom: 18px; }
.tutorial-section__head > div > span { color: #2376d9; font: 700 8px/1 ui-monospace, SFMono-Regular, Menlo, monospace; letter-spacing: .15em; }
.tutorial-section__head h2 { margin: 8px 0 0; color: #172033; font-size: 23px; font-weight: 650; letter-spacing: -.045em; }
.tutorial-section__head > p { max-width: 420px; margin: 0; color: #7c8797; font-size: 10px; line-height: 1.7; text-align: right; }
.tutorial-quick-grid { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 14px; }
.tutorial-task-card { position: relative; min-height: 260px; padding: 22px; background: #fff; border: 1px solid #e0e5ec; border-radius: 17px; box-shadow: 0 8px 28px rgba(27, 43, 68, .04); }
.tutorial-task-card.completed { border-color: #bfe4cf; }
.tutorial-task-card__topline { display: flex; align-items: center; justify-content: space-between; }
.tutorial-task-card__topline span { color: #9aa4b2; font: 700 11px/1 ui-monospace, SFMono-Regular, Menlo, monospace; }
.tutorial-task-card__topline i { padding: 5px 8px; color: #7b8796; font-size: 8px; font-style: normal; background: #f2f4f7; border-radius: 999px; }
.tutorial-task-card.completed .tutorial-task-card__topline i { color: #18794e; background: #edf9f2; }
.tutorial-task-card h3 { margin: 18px 0 8px; font-size: 18px; font-weight: 650; letter-spacing: -.035em; }
.tutorial-task-card > p { min-height: 54px; margin: 0; color: #667386; font-size: 10px; line-height: 1.7; }
.tutorial-task-card dl { display: grid; gap: 8px; margin: 15px 0 0; }
.tutorial-task-card dl div { padding-top: 10px; border-top: 1px solid #edf0f4; }
.tutorial-task-card dt { color: #9aa3b0; font-size: 8px; }
.tutorial-task-card dd { margin: 5px 0 0; color: #38455a; font-size: 10px; line-height: 1.6; }
.tutorial-task-card footer { position: absolute; right: 22px; bottom: 18px; left: 22px; display: flex; align-items: center; justify-content: space-between; }
.tutorial-task-card footer small { color: #949eac; font-size: 9px; }
.tutorial-task-card footer button { height: 38px; appearance: none; padding: 0 14px; color: #fff; font: inherit; font-size: 10px; font-weight: 680; background: #172033; border: 1px solid #172033; border-radius: 9px; cursor: pointer; box-shadow: 0 7px 16px rgba(23, 32, 51, .12); }
.tutorial-task-card footer button:hover { color: #fff; border-color: #172033; transform: translateY(-1px); }
.tutorial-section--pull { margin-top: 42px; }
.tutorial-course-progress { display: flex; align-items: baseline; gap: 9px; }
.tutorial-course-progress strong { color: #2376d9; font-size: 18px; }
.tutorial-course-progress span { color: #8390a0; font-size: 9px; }
.tutorial-course { display: grid; grid-template-columns: minmax(280px, .78fr) minmax(480px, 1.5fr); overflow: hidden; background: #fff; border: 1px solid #dfe5ec; border-radius: 20px; box-shadow: 0 12px 34px rgba(27, 43, 68, .05); }
.tutorial-course__story { padding: 34px; color: #fff; background: #172033; }
.tutorial-course__story > span { color: #8fc9ff; font-size: 8px; font-weight: 700; letter-spacing: .12em; }
.tutorial-course__story h3 { margin: 19px 0 13px; font-size: 25px; font-weight: 650; line-height: 1.25; letter-spacing: -.045em; }
.tutorial-course__story > p { margin: 0; color: #b7c2d2; font-size: 11px; line-height: 1.9; }
.tutorial-course__story > div { display: grid; gap: 8px; margin-top: 30px; padding-top: 20px; border-top: 1px solid rgba(255, 255, 255, .13); }
.tutorial-course__story b { margin-bottom: 3px; color: #8fc9ff; font-size: 8px; letter-spacing: .12em; }
.tutorial-course__story div span { color: #edf4fc; font-size: 10px; }
.tutorial-course__lessons { display: grid; margin: 0; padding: 11px 26px; list-style: none; }
.tutorial-course__lessons li { display: grid; min-height: 126px; grid-template-columns: 35px minmax(0, 1fr) auto; align-items: center; gap: 15px; border-bottom: 1px solid #e9edf2; }
.tutorial-course__lessons li:last-child { border-bottom: 0; }
.tutorial-lesson-index { display: grid; width: 29px; height: 29px; place-items: center; color: #657387; font-size: 10px; font-weight: 700; background: #f1f4f7; border-radius: 50%; }
.tutorial-course__lessons li.completed .tutorial-lesson-index { color: #fff; background: #2a9d65; }
.tutorial-course__lessons small,
.tutorial-course__lessons strong,
.tutorial-course__lessons p { display: block; }
.tutorial-course__lessons small { color: #2376d9; font-size: 8px; }
.tutorial-course__lessons strong { margin-top: 6px; font-size: 14px; font-weight: 640; }
.tutorial-course__lessons p { margin: 6px 0 0; color: #7a8797; font-size: 9px; line-height: 1.6; }
.tutorial-course__lessons button { min-width: 88px; height: 38px; appearance: none; padding: 0 12px; color: #fff; font: inherit; font-size: 9px; font-weight: 680; background: #172033; border: 1px solid #172033; border-radius: 9px; cursor: pointer; box-shadow: 0 7px 16px rgba(23, 32, 51, .1); }
.tutorial-course__lessons button:hover:not(:disabled) { color: #fff; border-color: #172033; transform: translateY(-1px); }
.tutorial-course__lessons button:disabled { color: #8a96a7; background: #eef2f6; border-color: #e1e6ed; cursor: not-allowed; box-shadow: none; }
.tutorial-course__lessons li.locked { position: relative; }
.tutorial-course__lessons li.locked > div { opacity: .58; }
.tutorial-course__lessons li.locked .tutorial-lesson-index { color: #929eae; background: #f3f5f8; }
.tutorial-lesson-lock { position: absolute; right: 0; bottom: 17px; color: #8a96a7; font-size: 8px; }
.tutorial-lesson-lock::before { content: '锁定 · '; color: #667487; font-weight: 700; }
.tutorial-lesson-linked { max-width: 94px; color: #8994a4; font-size: 8px; line-height: 1.5; text-align: right; }
.tutorial-results-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12px; }
.tutorial-results-grid article { min-height: 120px; padding: 21px; background: #fff; border: 1px solid #dfe5ec; border-radius: 14px; }
.tutorial-results-grid span { color: #18794e; font-size: 8px; font-weight: 700; }
.tutorial-results-grid strong { display: block; margin-top: 11px; font-size: 13px; line-height: 1.55; }
.tutorial-results-grid p { margin: 8px 0 0; color: #758194; font-size: 9px; line-height: 1.65; }
.tutorial-results-empty { padding: 32px; color: #8994a4; font-size: 10px; text-align: center; background: #fff; border: 1px dashed #cad2dc; border-radius: 14px; }

@keyframes tutorial-start-pulse {
  0%, 100% { transform: translateY(0) scale(1); }
  50% { transform: translateY(-2px) scale(1.025); }
}

.tutorial-start-guide-enter-active,
.tutorial-start-guide-leave-active { transition: opacity .2s ease, transform .25s cubic-bezier(.22, 1, .36, 1); }
.tutorial-start-guide-enter-from,
.tutorial-start-guide-leave-to { opacity: 0; transform: translateY(-7px); }

@media (max-width: 1180px) {
  .tutorial-quick-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
}

@media (max-width: 900px) {
  .tutorial-center__overview { padding-inline: 18px; }
  .tutorial-hero { grid-template-columns: minmax(0, 1fr) 104px; gap: 20px; padding: 22px 24px; }
  .tutorial-hero__progress { width: 96px; height: 96px; }
  .tutorial-hero__progress strong { font-size: 27px; }
  .tutorial-quick-grid,
  .tutorial-results-grid { grid-template-columns: 1fr; }
  .tutorial-course { grid-template-columns: 1fr; }
  .tutorial-section__head { align-items: flex-start; flex-direction: column; }
  .tutorial-section__head > p { text-align: left; }
}

@media (max-width: 560px) {
  .tutorial-center__topbar { padding-inline: 16px; }
  .tutorial-hero { grid-template-columns: 1fr; }
  .tutorial-hero__progress { justify-self: start; }
  .tutorial-summary-grid { grid-template-columns: 1fr; }
  .tutorial-hero__actions { align-items: flex-start; flex-direction: column; }
  .tutorial-course__lessons { padding-inline: 16px; }
  .tutorial-course__lessons li { grid-template-columns: 32px minmax(0, 1fr); }
  .tutorial-course__lessons button,
  .tutorial-lesson-linked { grid-column: 2; justify-self: start; text-align: left; }
  .tutorial-lesson-lock { position: static; grid-column: 2; justify-self: start; }
}

@media (prefers-reduced-motion: reduce) {
  .tutorial-progress-value,
  .tutorial-primary-action,
  .tutorial-center__detail.is-entry-guided :deep([data-tutorial-start]:first-of-type) { animation: none; transition: none; }
}
</style>
