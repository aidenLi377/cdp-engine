<template>
  <section class="parameter-tutorial">
    <header class="parameter-tutorial__intro">
      <span class="parameter-tutorial__eyebrow">正式教程 · 单参数批量建包</span>
      <h1>只改一个参数，<br />批量创建多个人群包。</h1>
      <p>适合需要创建多个包、但每个包只变化一个参数的场景。最常见的是多个竞品品牌的销售数据分析：Excel 每行放一个品牌，每个品牌独立圈一个包；购买、类目、渠道和时间统一复用。</p>
      <div class="parameter-tutorial__start">
        <button type="button" data-tutorial-start @click="emit('start')">开始 2 分钟核心操作 <span aria-hidden="true">→</span></button>
        <small>方案准备约 4–6 分钟 · 批量操作约 2 分钟 · 平台执行时间另计</small>
      </div>
    </header>

    <div class="parameter-tutorial__example" aria-label="一列品牌生成四个人群包">
      <div class="parameter-tutorial__conditions">
        <strong>共用一份圈人条件</strong>
        <span>购买</span><span>化妆水/爽肤水</span><span>天猫</span><span>过去 30 天</span>
      </div>
      <div class="parameter-tutorial__columns">
        <div>
          <h2>Excel 一列竞争品牌</h2>
          <table>
            <tbody><tr v-for="brand in values.brands" :key="brand"><td>{{ brand }}</td></tr></tbody>
          </table>
        </div>
        <span class="parameter-tutorial__arrow" aria-hidden="true">→</span>
        <div class="parameter-tutorial__packages">
          <h2>四个独立人群包</h2>
          <div v-for="(brand, index) in values.brands" :key="brand">
            <i>{{ index + 1 }}</i><span>{{ brand.split('/').at(-1) }} · 近30天购买人群</span>
          </div>
        </div>
      </div>
      <p>实现规则很清楚：一行一个品牌，一个品牌一个包。购买条件只搭一次，下次分析直接更换品牌名单。</p>
    </div>

    <ol class="parameter-tutorial__path" aria-label="实操流程">
      <li><span>01</span><strong>制作方案</strong><p>用 CPB 配好购买节点，将标准品牌绑定为“竞争品牌”自定义字段并发布。</p></li>
      <li><span>02</span><strong>批量展开</strong><p>应用方案，打开字段右上角的 Excel 批量，复制四行品牌并生成四个任务。</p></li>
      <li><span>03</span><strong>圈完全部</strong><p>确认登录数据引擎，选择全部人群包，四个任务成功后完成打卡。</p></li>
    </ol>

    <footer class="parameter-tutorial__outcome">
      <div><strong>完成后带走</strong><span>1 个正式方案 · 1 个可批量参数 · 4 个已圈选人群包</span></div>
      <p>这次先完成人群圈选；如需画像横向对比，可接着使用“达摩盘批量取画像”教程。</p>
    </footer>
  </section>
</template>

<script setup>
import { PARAMETER_BATCH_TUTORIAL_VALUES as values } from '../utils/guidedTutorialConfig.js'
const emit = defineEmits(['start'])
</script>

<style scoped>
.parameter-tutorial { max-width: 1100px; margin: 0 auto; padding: 38px clamp(24px, 4vw, 56px) 48px; color: #182f36; }
.parameter-tutorial__intro { max-width: 780px; }
.parameter-tutorial__eyebrow { color: #2376d9; font-size: 11px; font-weight: 650; letter-spacing: .06em; }
.parameter-tutorial h1 { margin: 15px 0 14px; font-size: clamp(29px, 3vw, 42px); font-weight: 660; line-height: 1.2; letter-spacing: -.045em; }
.parameter-tutorial__intro > p { max-width: 700px; margin: 0; color: #607079; font-size: 13px; line-height: 1.85; }
.parameter-tutorial__start { display: flex; align-items: center; gap: 16px; margin-top: 23px; }
.parameter-tutorial__start button { display: inline-flex; align-items: center; gap: 25px; padding: 12px 19px; color: #fff; background: #172033; border: 0; border-radius: 9px; font: inherit; font-size: 12px; font-weight: 650; cursor: pointer; }
.parameter-tutorial__start button:hover { background: #24486f; }
.parameter-tutorial__start button:focus-visible { outline: 3px solid #8fc9ff; outline-offset: 3px; }
.parameter-tutorial__start small { color: #7d898d; font-size: 10px; }
.parameter-tutorial__example { margin-top: 32px; padding: 22px 26px; background: #f4f8fd; border: 1px solid #d8e5f2; border-radius: 14px; }
.parameter-tutorial__conditions { display: flex; align-items: center; flex-wrap: wrap; gap: 9px; padding-bottom: 17px; border-bottom: 1px solid #dfeae4; font-size: 11px; }
.parameter-tutorial__conditions strong { margin-right: 10px; }
.parameter-tutorial__conditions span { padding: 5px 9px; background: #fff; border: 1px solid #dfe9e5; border-radius: 5px; color: #5c746b; }
.parameter-tutorial__columns { display: grid; grid-template-columns: minmax(0, 1fr) 48px minmax(0, 1fr); align-items: center; gap: 20px; }
.parameter-tutorial h2 { margin: 20px 0 10px; font-size: 12px; font-weight: 620; color: #315b87; }
.parameter-tutorial table { width: 100%; border-collapse: collapse; background: #fff; font-size: 12px; }
.parameter-tutorial td { height: 34px; padding: 0 13px; border: 1px solid #dce6e0; }
.parameter-tutorial__arrow { color: #2376d9; font-size: 29px; text-align: center; }
.parameter-tutorial__packages > div { display: flex; align-items: center; gap: 10px; height: 35px; font-size: 12px; }
.parameter-tutorial__packages i { display: grid; width: 21px; height: 21px; place-items: center; color: #fff; background: #3b82c4; border-radius: 50%; font-size: 10px; font-style: normal; }
.parameter-tutorial__example > p { margin: 17px 0 0; color: #6c837a; font-size: 11px; line-height: 1.7; }
.parameter-tutorial__path { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 25px; margin: 28px 0; padding: 0; list-style: none; }
.parameter-tutorial__path li > span { margin-right: 10px; color: #6a9f8c; font: 600 11px/1 ui-monospace, monospace; }
.parameter-tutorial__path strong { font-size: 13px; }
.parameter-tutorial__path p { margin: 9px 0 0; color: #72817f; font-size: 11px; line-height: 1.8; }
.parameter-tutorial__outcome { padding-top: 20px; border-top: 1px solid #e3e9e6; font-size: 12px; }
.parameter-tutorial__outcome > div { display: flex; flex-wrap: wrap; gap: 15px; }
.parameter-tutorial__outcome span { color: #3b715e; }
.parameter-tutorial__outcome p { margin: 10px 0 0; color: #83908c; font-size: 11px; line-height: 1.7; }
@media (max-width: 700px) {
  .parameter-tutorial__columns { grid-template-columns: 1fr; gap: 0; }
  .parameter-tutorial__arrow { display: none; }
  .parameter-tutorial__path { grid-template-columns: 1fr; gap: 18px; }
  .parameter-tutorial__start { align-items: flex-start; flex-direction: column; }
}
</style>
