<template>
  <article class="tutorial-task-detail">
    <header class="tutorial-task-detail__hero">
      <div>
        <span class="tutorial-task-detail__eyebrow">GUIDED TASK · 约 5 分钟</span>
        <h1>7 个商品 ID，怎样快速拆成可执行的人群条件？</h1>
        <p>跟着系统亲手完成一次“类目商品行为”的批量输入、自动拆分与自动化圈人。</p>
      </div>
      <button type="button" @click="emit('start')">
        开始实操教程
        <span aria-hidden="true">→</span>
      </button>
    </header>

    <section class="tutorial-task-detail__problem">
      <div class="tutorial-task-detail__section-index">01</div>
      <div>
        <h2>这个教程解决什么问题？</h2>
        <p>实际业务中经常一次拿到多个竞品或品牌商品 ID。如果每个 ID 都手动添加一个“类目商品行为”，不仅慢，也容易漏配行为和时间。</p>
      </div>
      <aside>
        <strong>本次任务</strong>
        <span>圈出近 30 天购买过下列任意一个商品的人</span>
      </aside>
    </section>

    <section class="tutorial-task-detail__flow">
      <div class="tutorial-task-detail__section-index">02</div>
      <div class="tutorial-task-detail__flow-main">
        <h2>你会亲手完成什么？</h2>
        <div class="tutorial-task-detail__flowline" aria-label="教程流程">
          <span>系统自动清空</span><i>→</i>
          <span>配置公共参数</span><i>→</i>
          <span>粘贴 7 个 ID</span><i>→</i>
          <span>确认自动拆分</span><i>→</i>
          <span>自动化圈人</span>
        </div>
        <p>教程启动后，页面会覆盖浅蓝色引导层；只有当前应该操作的位置保持清晰并可点击，每个高亮位置都有对应引导语。</p>
      </div>
    </section>

    <section class="tutorial-task-detail__ids">
      <div class="tutorial-task-detail__section-index">03</div>
      <div>
        <h2>教程使用的 7 个商品 ID</h2>
        <p>教程中会把它们整理成一列供你复制，也支持从 Excel 复制自己的数据。</p>
        <div class="tutorial-task-detail__id-grid">
          <code v-for="id in productIds" :key="id">{{ id }}</code>
        </div>
      </div>
    </section>

    <section class="tutorial-task-detail__extension">
      <div class="tutorial-task-detail__section-index">04</div>
      <div>
        <span class="tutorial-task-detail__extension-badge">能力拓展 · 请重点关注</span>
        <h2>不只商品 ID，其他限量字段也能这样用</h2>
        <p>同一种拆分思路还能扩展到“类目公域行为”里的关键词、类目、品牌等限量字段：公共参数先配置一次，超限字段再批量输入并拆分。</p>
        <div class="tutorial-task-detail__extension-tags" aria-label="可拓展字段">
          <span>关键词</span><span>类目</span><span>品牌</span><span>其他限量字段</span>
        </div>
      </div>
      <button type="button" @click="emit('start')">从空白工作台开始</button>
    </section>
  </article>
</template>

<script setup>
import { CATEGORY_ITEM_TUTORIAL_PRODUCT_IDS } from '../utils/guidedTutorialConfig.js'

const emit = defineEmits(['start'])
const productIds = CATEGORY_ITEM_TUTORIAL_PRODUCT_IDS
</script>

<style scoped>
.tutorial-task-detail { max-width: 990px; margin: 0 auto; padding: 92px 0 70px; color: #182f43; }
.tutorial-task-detail__hero { display: grid; grid-template-columns: minmax(0, 1fr) auto; align-items: end; gap: 44px; padding: 8px 0 38px; border-bottom: 1px solid var(--ui-divider); }
.tutorial-task-detail__eyebrow { color: #1679c5; font: 750 9px/1.2 ui-monospace, SFMono-Regular, Menlo, monospace; letter-spacing: .14em; }
.tutorial-task-detail h1 { max-width: 760px; margin: 13px 0 15px; color: #142f47; font-size: clamp(30px, 4vw, 50px); font-weight: 680; line-height: 1.12; letter-spacing: -.055em; }
.tutorial-task-detail__hero p { max-width: 700px; margin: 0; color: #6a7d8e; font-size: 14px; line-height: 1.75; }
.tutorial-task-detail__hero button,
.tutorial-task-detail__extension button { display: inline-flex; height: 42px; align-items: center; justify-content: center; gap: 18px; padding: 0 17px; color: #fff; font: inherit; font-size: 11px; font-weight: 650; white-space: nowrap; background: #1679c5; border: 1px solid #1679c5; border-radius: 9px; cursor: pointer; box-shadow: 0 9px 22px rgba(22, 121, 197, .18); }
.tutorial-task-detail__hero button:hover,
.tutorial-task-detail__extension button:hover { background: #0f69ad; }
.tutorial-task-detail section { display: grid; grid-template-columns: 46px minmax(0, 1fr); gap: 24px; padding: 38px 0; border-bottom: 1px solid var(--ui-divider); }
.tutorial-task-detail__section-index { padding-top: 5px; color: #8a9dad; font: 700 9px/1 ui-monospace, monospace; }
.tutorial-task-detail h2 { margin: 0 0 12px; color: #18344c; font-size: 18px; font-weight: 650; letter-spacing: -.025em; }
.tutorial-task-detail section p { max-width: 720px; margin: 0; color: #718391; font-size: 12px; line-height: 1.75; }
.tutorial-task-detail__problem { grid-template-columns: 46px minmax(0, 1fr) 250px !important; }
.tutorial-task-detail__problem aside { display: grid; align-content: center; gap: 7px; padding: 17px; color: #326a95; background: #f0f8ff; border-left: 2px solid #2690df; }
.tutorial-task-detail__problem aside strong { font-size: 10px; }
.tutorial-task-detail__problem aside span { color: #5c7990; font-size: 11px; line-height: 1.55; }
.tutorial-task-detail__flowline { display: flex; align-items: center; gap: 9px; margin: 21px 0 16px; overflow-x: auto; }
.tutorial-task-detail__flowline span { flex: 0 0 auto; padding: 9px 11px; color: #315b7d; font-size: 10px; font-weight: 620; background: #f5f9fc; border: 1px solid #dfeaf2; border-radius: 7px; }
.tutorial-task-detail__flowline i { color: #58a0d4; font-size: 11px; font-style: normal; }
.tutorial-task-detail__id-grid { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 8px; margin-top: 19px; }
.tutorial-task-detail__id-grid code { padding: 10px; color: #235f8c; font: 600 10px/1.2 ui-monospace, SFMono-Regular, Menlo, monospace; text-align: center; background: #f5faff; border: 1px solid #dcebf7; border-radius: 7px; }
.tutorial-task-detail__extension { grid-template-columns: 46px minmax(0, 1fr) auto !important; align-items: center; margin-top: 28px; padding: 28px 26px !important; background: linear-gradient(135deg, #eaf6ff, #f8fcff); border: 1px solid #c5e3f8 !important; border-left: 4px solid #1688dc !important; border-radius: 14px; box-shadow: 0 15px 38px rgba(34, 117, 181, .1); }
.tutorial-task-detail__extension-badge { display: inline-flex; margin-bottom: 10px; padding: 5px 9px; color: #fff; font-size: 9px; font-weight: 800; letter-spacing: .08em; background: #167ecb; border-radius: 99px; }
.tutorial-task-detail__extension-tags { display: flex; flex-wrap: wrap; gap: 7px; margin-top: 15px; }
.tutorial-task-detail__extension-tags span { padding: 6px 10px; color: #17669f; font-size: 10px; font-weight: 650; background: #fff; border: 1px solid #bfdef3; border-radius: 7px; }
.tutorial-task-detail__extension button { color: #315b7d; background: #fff; border-color: #cbdde9; box-shadow: none; }
.tutorial-task-detail__extension button:hover { color: #fff; background: #1679c5; }
button:focus-visible { outline: 3px solid rgba(22, 121, 197, .28); outline-offset: 3px; }

@media (max-width: 860px) {
  .tutorial-task-detail { padding-top: 82px; }
  .tutorial-task-detail__hero { grid-template-columns: 1fr; align-items: start; gap: 24px; }
  .tutorial-task-detail__problem,
  .tutorial-task-detail__extension { grid-template-columns: 38px minmax(0, 1fr) !important; }
  .tutorial-task-detail__problem aside,
  .tutorial-task-detail__extension button { grid-column: 2; justify-self: start; }
  .tutorial-task-detail__id-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
}
</style>
