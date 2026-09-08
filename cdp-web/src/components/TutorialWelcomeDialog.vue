<template>
  <Teleport to="body">
    <Transition name="tutorial-welcome">
      <div v-if="open" class="tutorial-welcome" role="presentation">
        <section class="tutorial-welcome__panel" role="dialog" aria-modal="true" aria-labelledby="tutorial-welcome-title">
          <header class="tutorial-welcome__hero">
            <div class="tutorial-welcome__hero-copy">
              <span class="tutorial-welcome__eyebrow">新手教程 · 业务提效</span>
              <h1 id="tutorial-welcome-title">手把手做一次，以后少做很多次</h1>
              <p>系统会高亮每一步该点哪里、该填什么。完成真实任务后，方案、模板和人群包都能继续用于自己的业务。</p>
              <div class="tutorial-welcome__promise">
                <span>分步高亮指引</span><span>可分次完成</span><span>实操成功才打卡</span>
              </div>
            </div>
            <div class="tutorial-welcome__progress-panel" aria-label="教程完成进度">
              <div class="tutorial-welcome__progress" :style="progressStyle">
                <div><strong>{{ completedMilestones }}</strong><span>/ {{ TUTORIAL_MILESTONE_TOTAL }}</span></div>
              </div>
              <strong>已完成 {{ completedMilestones }} 项</strong>
              <small>还剩 {{ remainingMilestones }} 项实操</small>
            </div>
          </header>

          <div class="tutorial-welcome__body">
            <div class="tutorial-welcome__intro">
              <div><span>教程中心能帮你做什么</span><h2>解决 4 类高频重复工作</h2></div>
              <p>还有 <strong>{{ remainingCapabilities.length }} 个提效点</strong> 等你掌握</p>
            </div>

            <div class="tutorial-welcome__choices">
              <article v-for="(item, index) in painItems" :key="item.id" class="tutorial-welcome__choice"
                :class="{ completed: item.completed, advanced: item.advanced }" :style="{ '--delay': `${100 + index * 45}ms` }">
                <div class="tutorial-welcome__choice-meta">
                  <span>{{ item.label }}</span>
                  <i v-if="item.advanced">进阶必学 · {{ pullCourseDone }}/4</i>
                  <i v-else-if="item.completed">✓ 已完成</i>
                  <i v-else>{{ item.duration }}</i>
                </div>
                <h3>{{ item.problem }}</h3><p>{{ item.payoff }}</p>
              </article>
            </div>

            <div class="tutorial-welcome__remaining" aria-live="polite">
              <strong>待掌握的提效点</strong><p>{{ remainingCapabilities.join(' · ') }}</p>
            </div>

            <footer class="tutorial-welcome__footer">
              <p>进入教程中心选择业务场景，跟着高亮一步步完成。</p>
              <div>
                <button type="button" class="tutorial-welcome__dismiss" @click="emit('dismiss')">已阅读</button>
                <button type="button" class="tutorial-welcome__enter" @click="emit('experience')">去教程中心 <span aria-hidden="true">→</span></button>
              </div>
            </footer>
          </div>
        </section>
      </div>
    </Transition>
  </Teleport>
</template>

<script setup>
import { computed } from 'vue'
import { CATEGORY_ITEM_TUTORIAL_ID, COMBINATION_BATCH_TUTORIAL_ID, DMP_BATCH_TUTORIAL_ID, PARAMETER_BATCH_TUTORIAL_ID, PULL_ANALYSIS_GROUP_TUTORIAL_ID, SOLUTION_REUSE_TUTORIAL_ID } from '../utils/guidedTutorialConfig.js'
import { TUTORIAL_MILESTONE_TOTAL, completedTutorialIds, countCompletedMilestones } from '../utils/tutorialCatalog.js'

const props = defineProps({ open: { type: Boolean, default: false }, progressItems: { type: Array, default: () => [] } })
const emit = defineEmits(['dismiss', 'experience'])
const completedIds = computed(() => completedTutorialIds(props.progressItems))
const completedMilestones = computed(() => countCompletedMilestones(props.progressItems))
const remainingMilestones = computed(() => TUTORIAL_MILESTONE_TOTAL - completedMilestones.value)
const remainingCapabilities = computed(() => [
  [DMP_BATCH_TUTORIAL_ID, '批量取数与对比'], [CATEGORY_ITEM_TUTORIAL_ID, '商品条件自动拆分'],
  [PARAMETER_BATCH_TUTORIAL_ID, '单参数批量建包'], [SOLUTION_REUSE_TUTORIAL_ID, '模板制作与一对多字段'],
  [PULL_ANALYSIS_GROUP_TUTORIAL_ID, '购买方案派生'], [PULL_ANALYSIS_GROUP_TUTORIAL_ID, '同名参数组合复用'],
  [COMBINATION_BATCH_TUTORIAL_ID, '多竞品组合批量圈人'],
].filter(([id]) => !completedIds.value.has(id)).map(([, name]) => name))
const pullCourseDone = computed(() => (completedIds.value.has(SOLUTION_REUSE_TUTORIAL_ID) ? 1 : 0)
  + (completedIds.value.has(PULL_ANALYSIS_GROUP_TUTORIAL_ID) ? 2 : 0)
  + (completedIds.value.has(COMBINATION_BATCH_TUTORIAL_ID) ? 1 : 0))
const painItems = computed(() => [
  { id: DMP_BATCH_TUTORIAL_ID, label: '达摩盘复盘', problem: '多个包的画像，一次取齐、直接对比', payoff: '统一选择指标，省去逐包取数和手工拼表。', duration: '约 1–2 分钟', completed: completedIds.value.has(DMP_BATCH_TUTORIAL_ID) },
  { id: CATEGORY_ITEM_TUTORIAL_ID, label: '商品圈包', problem: '7 个商品，一次粘贴就配好圈人条件', payoff: '省去逐条添加商品条件，再统一发起圈人。', duration: '约 5 分钟', completed: completedIds.value.has(CATEGORY_ITEM_TUTORIAL_ID) },
  { id: PARAMETER_BATCH_TUTORIAL_ID, label: '竞品批量建包', problem: '要看 4 个竞品？一列品牌准备 4 个包', payoff: '类目、渠道和时间沿用同一套设置，每个品牌独立圈包。', duration: '核心操作约 2 分钟', completed: completedIds.value.has(PARAMETER_BATCH_TUTORIAL_ID) },
  { id: 'pull-analysis-course', label: '拉力方案组', problem: '换一个竞品，整套拉力 3 个包一起圈', payoff: '做一次自己的模板，以后只改少量参数，还可扩展为 3 个竞品、9 个包。', completed: pullCourseDone.value >= 4, advanced: true },
])
const progressStyle = computed(() => ({ '--tutorial-progress': `${Math.round((completedMilestones.value / TUTORIAL_MILESTONE_TOTAL) * 360)}deg` }))
</script>

<style scoped>
.tutorial-welcome { position: fixed; z-index: 3200; inset: 0; display: grid; box-sizing: border-box; place-items: center; padding: 24px; background: rgba(23,32,51,.32); backdrop-filter: blur(4px); }
.tutorial-welcome__panel { width: min(1040px,calc(100vw - 48px)); max-height: calc(100vh - 48px); overflow-y: auto; color: #172033; background: #fff; border: 1px solid #d4e8fb; border-radius: 18px; box-shadow: 0 28px 80px rgba(24,45,72,.22); }
.tutorial-welcome__hero { display: grid; min-height: 168px; box-sizing: border-box; grid-template-columns: minmax(0,1fr) 150px; align-items: center; gap: 32px; padding: 26px 36px; background: #eaf4ff; border-bottom: 1px solid #d4e8fb; }
.tutorial-welcome__eyebrow,.tutorial-welcome__intro span { color: #2376d9; font-size: 12px; font-weight: 700; }
.tutorial-welcome__hero h1 { margin: 8px 0 7px; color: #10243d; font-size: 28px; font-weight: 680; line-height: 1.25; letter-spacing: -.03em; }
.tutorial-welcome__hero-copy>p { max-width: 700px; margin: 0; color: #52667f; font-size: 13px; line-height: 1.7; }
.tutorial-welcome__promise { display: flex; flex-wrap: wrap; gap: 8px 20px; margin-top: 13px; }
.tutorial-welcome__promise span { display: inline-flex; align-items: center; gap: 7px; color: #60758e; font-size: 11px; }
.tutorial-welcome__promise span::before { width: 5px; height: 5px; content: ''; background: #2376d9; border-radius: 50%; }
.tutorial-welcome__progress-panel { display: grid; justify-items: center; color: #344158; font-size: 11px; }
.tutorial-welcome__progress-panel>strong { margin-top: 7px; }.tutorial-welcome__progress-panel>small { margin-top: 2px; color: #70829a; }
.tutorial-welcome__progress { position: relative; display: grid; width: 92px; height: 92px; place-items: center; background: conic-gradient(#2376d9 0 var(--tutorial-progress),#dbe9f6 var(--tutorial-progress) 360deg); border-radius: 50%; }
.tutorial-welcome__progress::before { position: absolute; inset: 7px; content: ''; background: #f8fbff; border-radius: inherit; }
.tutorial-welcome__progress>div { position: relative; display: flex; align-items: baseline; }.tutorial-welcome__progress strong { color: #10243d; font-size: 28px; }.tutorial-welcome__progress span { margin-left: 3px; color: #70829a; font-size: 11px; }
.tutorial-welcome__body { padding: 22px 36px 24px; }
.tutorial-welcome__intro { display: flex; align-items: end; justify-content: space-between; gap: 24px; }
.tutorial-welcome__intro h2 { margin: 5px 0 0; color: #172033; font-size: 21px; font-weight: 650; }.tutorial-welcome__intro>p { margin: 0; color: #7c8797; font-size: 12px; }.tutorial-welcome__intro>p strong { color: #2376d9; }
.tutorial-welcome__choices { display: grid; grid-template-columns: repeat(2,minmax(0,1fr)); gap: 10px; margin-top: 16px; }
.tutorial-welcome__choice { min-width: 0; min-height: 102px; box-sizing: border-box; padding: 14px 16px; background: #fff; border: 1px solid #e0e5ec; border-radius: 12px; animation: tutorial-choice-enter .4s cubic-bezier(.22,1,.36,1) both; animation-delay: var(--delay); }
.tutorial-welcome__choice.completed { background: #f5fbf7; border-color: #cfe7d8; }.tutorial-welcome__choice.advanced { background: #f1f7ff; border-color: #c9e2f8; }
.tutorial-welcome__choice-meta { display: flex; flex-wrap: wrap; align-items: center; gap: 7px; }.tutorial-welcome__choice-meta span { color: #657389; font-size: 11px; font-weight: 700; }.tutorial-welcome__choice-meta i { padding: 3px 6px; color: #667386; font-size: 10px; font-style: normal; background: #f2f4f7; border-radius: 999px; }
.tutorial-welcome__choice.completed .tutorial-welcome__choice-meta i { color: #18794e; background: #e6f5eb; }.tutorial-welcome__choice.advanced .tutorial-welcome__choice-meta i { color: #176fc2; background: #e2efff; }
.tutorial-welcome__choice h3 { margin: 8px 0 3px; font-size: 15px; font-weight: 650; line-height: 1.45; }.tutorial-welcome__choice p { margin: 0; color: #6d7888; font-size: 11px; line-height: 1.55; }
.tutorial-welcome__remaining { display: grid; grid-template-columns: auto minmax(0,1fr); gap: 14px; margin-top: 14px; padding: 10px 12px; color: #657389; font-size: 11px; background: #f7f9fc; border-radius: 9px; }
.tutorial-welcome__remaining strong { color: #344158; white-space: nowrap; }.tutorial-welcome__remaining p { margin: 0; line-height: 1.6; }
.tutorial-welcome__footer { display: flex; align-items: center; justify-content: space-between; gap: 24px; margin-top: 16px; }.tutorial-welcome__footer>p { margin: 0; color: #7c8797; font-size: 11px; }.tutorial-welcome__footer>div { display: flex; align-items: center; gap: 10px; }
.tutorial-welcome__dismiss,.tutorial-welcome__enter { display: inline-flex; height: 40px; appearance: none; align-items: center; justify-content: center; padding: 0 17px; font: inherit; font-size: 12px; font-weight: 650; border-radius: 8px; cursor: pointer; }
.tutorial-welcome__dismiss { color: #596579; background: #fff; border: 1px solid #dfe5ed; }.tutorial-welcome__enter { gap: 20px; color: #fff; background: #2376d9; border: 1px solid #2376d9; }.tutorial-welcome__dismiss:hover { color: #172033; border-color: #aeb9c8; }.tutorial-welcome__enter:hover { background: #176fc2; }
.tutorial-welcome-enter-active,.tutorial-welcome-leave-active { transition: opacity .22s ease; }.tutorial-welcome-enter-active .tutorial-welcome__panel,.tutorial-welcome-leave-active .tutorial-welcome__panel { transition: transform .35s cubic-bezier(.22,1,.36,1),opacity .22s ease; }.tutorial-welcome-enter-from,.tutorial-welcome-leave-to { opacity: 0; }.tutorial-welcome-enter-from .tutorial-welcome__panel { opacity: 0; transform: translateY(14px) scale(.98); }.tutorial-welcome-leave-to .tutorial-welcome__panel { opacity: 0; transform: translateY(6px) scale(.99); }
@keyframes tutorial-choice-enter { from { opacity: 0; transform: translateY(6px); } to { opacity: 1; transform: translateY(0); } }
@media (max-width:760px) { .tutorial-welcome { padding: 12px; }.tutorial-welcome__panel { width: min(100%,700px); max-height: calc(100vh - 24px); }.tutorial-welcome__hero { min-height: 148px; grid-template-columns: minmax(0,1fr) 92px; gap: 14px; padding: 18px 20px; }.tutorial-welcome__hero h1 { margin-top: 5px; font-size: 22px; }.tutorial-welcome__hero-copy>p { font-size: 11px; line-height: 1.55; }.tutorial-welcome__promise { margin-top: 8px; gap: 6px 12px; }.tutorial-welcome__progress { width: 72px; height: 72px; }.tutorial-welcome__progress-panel>strong,.tutorial-welcome__progress-panel>small { display: none; }.tutorial-welcome__body { padding: 16px 20px 18px; }.tutorial-welcome__intro h2 { font-size: 18px; }.tutorial-welcome__choices { grid-template-columns: repeat(2,minmax(0,1fr)); margin-top: 12px; }.tutorial-welcome__choice { min-height: 112px; padding: 12px; }.tutorial-welcome__choice h3 { font-size: 13px; }.tutorial-welcome__remaining { margin-top: 10px; grid-template-columns: 1fr; gap: 3px; }.tutorial-welcome__footer { margin-top: 10px; }.tutorial-welcome__footer>p { max-width: 260px; } }
@media (max-width:520px) { .tutorial-welcome__hero { grid-template-columns: 1fr; }.tutorial-welcome__progress-panel { display: none; }.tutorial-welcome__choices { grid-template-columns: 1fr; }.tutorial-welcome__intro { align-items: flex-start; flex-direction: column; gap: 5px; }.tutorial-welcome__footer { align-items: stretch; flex-direction: column; }.tutorial-welcome__footer>div { justify-content: flex-end; } }
@media (prefers-reduced-motion:reduce) { .tutorial-welcome *,.tutorial-welcome-enter-active .tutorial-welcome__panel,.tutorial-welcome-leave-active .tutorial-welcome__panel { animation: none!important; transition: none!important; } }
</style>
