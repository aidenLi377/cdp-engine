<template>
  <article class="dmp-tutorial-detail">
    <header class="dmp-tutorial-detail__hero">
      <div>
        <span class="dmp-tutorial-detail__eyebrow">GUIDED TASK · 约 1–2 分钟</span>
        <h1>多个人群包，怎样一次取画像并完成横向对比？</h1>
        <p>用一次真实的达摩盘复盘任务，学会批量取数、看懂两种占比、整理顺序，并把结果直接复制到 Excel。</p>
      </div>
      <button type="button" @click="emit('start')">开始实操教程 <span aria-hidden="true">→</span></button>
    </header>

    <section class="dmp-tutorial-detail__problem">
      <div class="dmp-tutorial-detail__index">01</div>
      <div>
        <h2>你要解决的业务问题</h2>
        <p>业务复盘时经常需要同时查看多个达摩盘人群包的年龄、性别、城市等级和策略人群构成。逐个搜索、逐个取数、再手工拼表，很慢也容易把人群包顺序弄乱。</p>
      </div>
      <aside><strong>最终产出</strong><span>一张已整理好标签顺序、人群包顺序和对比指标的画像横向对比表</span></aside>
    </section>

    <section class="dmp-tutorial-detail__case">
      <div class="dmp-tutorial-detail__index">02</div>
      <div>
        <h2>用一个真实复盘任务来练习</h2>
        <p>本次先选 4 个常用画像标签，再批量输入至少 2 个人群包名称。你会看到从“准备名单”到“可比较结果”的完整链路。</p>
        <h3>本次选择的 4 个画像标签</h3>
        <div class="dmp-tutorial-detail__tags">
          <span v-for="tag in tags" :key="tag.tagId">
            {{ tag.name }}
            <small v-if="tag.systemName">页面中显示为“{{ tag.systemName }}”</small>
          </span>
        </div>
      </div>
    </section>

    <section class="dmp-tutorial-detail__output">
      <div class="dmp-tutorial-detail__index">03</div>
      <div>
        <h2>完成后，你会带走什么？</h2>
        <div class="dmp-tutorial-detail__output-grid">
          <article><strong>一张可直接复用的对比表</strong><span>标签、人群包和展示指标都已按你的需要整理好。</span></article>
          <article><strong>一套可解释的画像结果</strong><span>看懂原始覆盖比例与 Rebase 后的结构占比，避免只看一个数字。</span></article>
        </div>
        <h3 class="dmp-tutorial-detail__metrics-title">教程会重点讲清两个指标</h3>
        <div class="dmp-tutorial-detail__metric-grid">
          <article><strong>人群占比</strong><p>某特征明细的原始覆盖比例，即达摩盘返回的 rate × 100%。</p></article>
          <article><strong>Rebase 人群占比</strong><p>同一标签内：当前明细占比 ÷ 该标签全部有效明细占比之和 × 100%。</p></article>
        </div>
      </div>
    </section>

    <section class="dmp-tutorial-detail__process">
      <div class="dmp-tutorial-detail__index">04</div>
      <div>
        <h2>你会亲手走完这条流程</h2>
        <div class="dmp-tutorial-detail__flowline" aria-label="教程流程">
          <span>选择标签</span><i>→</i><span>粘贴人群包</span><i>→</i><span>批量取数</span><i>→</i>
          <span>横向对比</span><i>→</i><span>查看结果表</span><i>→</i><span>双重排序</span><i>→</i><span>复制表格</span>
        </div>
        <div class="dmp-tutorial-detail__input-note">
          <span class="dmp-tutorial-detail__badge">EXCEL 友好</span>
          <h3>批量名单至少准备 2 个</h3>
          <p>可以每输入一个人群包名称就按回车，也可以直接从 Excel 复制一整列。系统会自动识别换行、逗号和 Tab，并自动去重。</p>
          <pre><code>核心会员人群
高潜新品人群
沉睡召回人群</code></pre>
        </div>
        <p class="dmp-tutorial-detail__wait-note">等待取数时教程会缩成右下角进度卡，不会锁住整张页面；如果有失败项，会明确显示失败名称，并提供重试或修改名单的入口。</p>
      </div>
    </section>

    <section class="dmp-tutorial-detail__next">
      <div class="dmp-tutorial-detail__index">05</div>
      <div>
        <h2>完成后，下一次可以直接复用</h2>
        <p>把对比表复制到 Excel 做复盘或汇报；下次只需要替换人群包名单，就能沿用同一套标签、指标和排序方法。</p>
      </div>
    </section>

    <aside class="dmp-tutorial-detail__start">
      <div><span>开始前提醒</span><strong>请先登录达摩盘，并确认任务执行器已连接</strong><p>教程会执行真实取数；已有任务记录不会被清空。</p></div>
      <button type="button" @click="emit('start')">开始批量取画像</button>
    </aside>
  </article>
</template>

<script setup>
import { DMP_BATCH_TUTORIAL_TAGS } from '../utils/guidedTutorialConfig.js'

const emit = defineEmits(['start'])
const tags = DMP_BATCH_TUTORIAL_TAGS
</script>

<style scoped>
.dmp-tutorial-detail { max-width: 1020px; margin: 0 auto; padding: 90px 0 72px; color: #182f43; }
.dmp-tutorial-detail__hero { display: grid; grid-template-columns: minmax(0, 1fr) auto; align-items: end; gap: 46px; padding: 10px 0 38px; border-bottom: 1px solid var(--ui-divider); }
.dmp-tutorial-detail__eyebrow { color: #1679c5; font: 760 9px/1.2 ui-monospace, SFMono-Regular, Menlo, monospace; letter-spacing: .14em; }
.dmp-tutorial-detail h1 { max-width: 790px; margin: 13px 0 15px; color: #142f47; font-size: clamp(30px, 4vw, 50px); font-weight: 680; line-height: 1.12; letter-spacing: -.055em; }
.dmp-tutorial-detail__hero p { max-width: 720px; margin: 0; color: #6a7d8e; font-size: 14px; line-height: 1.75; }
.dmp-tutorial-detail button { display: inline-flex; height: 42px; align-items: center; justify-content: center; gap: 18px; padding: 0 17px; color: #fff; font: inherit; font-size: 11px; font-weight: 650; white-space: nowrap; background: #1679c5; border: 1px solid #1679c5; border-radius: 9px; cursor: pointer; box-shadow: 0 9px 22px rgba(22, 121, 197, .18); }
.dmp-tutorial-detail button:hover { background: #0f69ad; }
.dmp-tutorial-detail > section { display: grid; grid-template-columns: 46px minmax(0, 1fr); gap: 24px; padding: 36px 0; border-bottom: 1px solid var(--ui-divider); }
.dmp-tutorial-detail__index { padding-top: 5px; color: #8a9dad; font: 700 9px/1 ui-monospace, monospace; }
.dmp-tutorial-detail h2 { margin: 0 0 12px; color: #18344c; font-size: 18px; font-weight: 650; letter-spacing: -.025em; }
.dmp-tutorial-detail section p { max-width: 740px; margin: 0; color: #718391; font-size: 12px; line-height: 1.75; }
.dmp-tutorial-detail__problem { grid-template-columns: 46px minmax(0, 1fr) 260px !important; }
.dmp-tutorial-detail__problem aside { display: grid; align-content: center; gap: 7px; padding: 17px; color: #326a95; background: #f0f8ff; border-left: 2px solid #2690df; }
.dmp-tutorial-detail__problem aside strong { font-size: 10px; }
.dmp-tutorial-detail__problem aside span { color: #5c7990; font-size: 11px; line-height: 1.55; }
.dmp-tutorial-detail__case h3,
.dmp-tutorial-detail__metrics-title { margin: 22px 0 0; color: #315b7d; font-size: 12px; font-weight: 700; }
.dmp-tutorial-detail__tags { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 8px; margin-top: 18px; }
.dmp-tutorial-detail__tags > span { display: grid; align-content: center; min-height: 48px; gap: 4px; padding: 10px 12px; color: #235f8c; font-size: 11px; font-weight: 650; background: #f5faff; border: 1px solid #dcebf7; border-radius: 8px; }
.dmp-tutorial-detail__tags small { color: #7b95a9; font-size: 8px; font-weight: 500; line-height: 1.45; }
.dmp-tutorial-detail__flowline { display: flex; align-items: center; gap: 8px; margin: 20px 0 15px; overflow-x: auto; }
.dmp-tutorial-detail__flowline span { flex: 0 0 auto; padding: 9px 10px; color: #315b7d; font-size: 10px; font-weight: 620; background: #f5f9fc; border: 1px solid #dfeaf2; border-radius: 7px; }
.dmp-tutorial-detail__flowline i { color: #58a0d4; font-size: 11px; font-style: normal; }
.dmp-tutorial-detail__output-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 10px; margin-top: 17px; }
.dmp-tutorial-detail__output-grid article { display: grid; gap: 7px; padding: 16px; background: linear-gradient(135deg, #f5faff, #fbfdff); border: 1px solid #dcebf7; border-radius: 10px; }
.dmp-tutorial-detail__output-grid strong { color: #174b74; font-size: 12px; }
.dmp-tutorial-detail__output-grid span { color: #718391; font-size: 11px; line-height: 1.6; }
.dmp-tutorial-detail__metrics-title { margin-top: 22px; }
.dmp-tutorial-detail__input { grid-template-columns: 46px minmax(0, 1fr) 260px !important; align-items: center; }
.dmp-tutorial-detail__badge { display: inline-flex; margin-bottom: 9px; padding: 4px 8px; color: #fff; font-size: 8px; font-weight: 800; letter-spacing: .1em; background: #1683d4; border-radius: 99px; }
.dmp-tutorial-detail__input-note { margin-top: 24px; padding: 15px 17px; background: #f8fbfd; border: 1px solid #e1ebf2; border-radius: 10px; }
.dmp-tutorial-detail__input-note h3 { margin: 0 0 8px; color: #315b7d; font-size: 13px; font-weight: 700; }
.dmp-tutorial-detail__input-note pre { margin: 12px 0 0; padding: 12px 14px; color: #17649d; background: #f4faff; border: 1px solid #cfe6f7; border-radius: 8px; }
.dmp-tutorial-detail__input-note code { font: 600 10px/1.75 ui-monospace, SFMono-Regular, Menlo, monospace; }
.dmp-tutorial-detail__wait-note { margin-top: 15px !important; }
.dmp-tutorial-detail__metric-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 10px; margin-top: 17px; }
.dmp-tutorial-detail__metric-grid article { padding: 16px; background: #fafcfe; border: 1px solid #e2eaf1; border-radius: 10px; }
.dmp-tutorial-detail__metric-grid strong { display: block; margin-bottom: 7px; color: #174b74; font-size: 12px; }
.dmp-tutorial-detail__next { align-items: start; }
.dmp-tutorial-detail__start { display: flex; align-items: center; justify-content: space-between; gap: 30px; margin-top: 30px; padding: 24px 26px; background: linear-gradient(135deg, #fff8df, #fffdf6); border: 1px solid #f0d58a; border-left: 4px solid #e7ae22; border-radius: 14px; box-shadow: 0 15px 38px rgba(151, 108, 12, .08); }
.dmp-tutorial-detail__start div { display: grid; gap: 6px; }
.dmp-tutorial-detail__start span { color: #9a6a00; font-size: 9px; font-weight: 800; letter-spacing: .08em; }
.dmp-tutorial-detail__start strong { color: #5d430a; font-size: 14px; }
.dmp-tutorial-detail__start p { margin: 0; color: #826c39; font-size: 10px; }
.dmp-tutorial-detail__start button { color: #315b7d; background: #fff; border-color: #dec884; box-shadow: none; }
.dmp-tutorial-detail__start button:hover { color: #fff; background: #1679c5; border-color: #1679c5; }
button:focus-visible { outline: 3px solid rgba(22, 121, 197, .28); outline-offset: 3px; }

@media (max-width: 860px) {
  .dmp-tutorial-detail { padding-top: 82px; }
  .dmp-tutorial-detail__hero { grid-template-columns: 1fr; align-items: start; gap: 24px; }
  .dmp-tutorial-detail__problem,
  .dmp-tutorial-detail__input { grid-template-columns: 38px minmax(0, 1fr) !important; }
  .dmp-tutorial-detail__problem aside { grid-column: 2; }
  .dmp-tutorial-detail__tags { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .dmp-tutorial-detail__output-grid,
  .dmp-tutorial-detail__metric-grid { grid-template-columns: 1fr; }
  .dmp-tutorial-detail__start { align-items: flex-start; flex-direction: column; }
}
</style>
