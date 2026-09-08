<template>
  <article class="pull-detail">
    <header class="pull-detail__hero">
      <div class="pull-detail__copy">
        <span class="pull-detail__eyebrow">拉力方案组 · 第 2–3 课 · 约 9–12 分钟</span>
        <h1>一套方案组，两轮圈人看见真实提效</h1>
        <p>继续使用上一教程的共同浏览方案，亲手补齐购买本品、购买竞品两份方案，再把三份方案组合应用：先跑默认场景，再通过少量改参完成第二轮。</p>
        <button type="button" data-tutorial-start @click="emit('start')">开始进阶必学 <span aria-hidden="true">→</span></button>
      </div>
      <div class="pull-detail__signal" aria-label="3个参数控制3个方案8个节点16处绑定">
        <div><strong>3</strong><span>公共参数</span></div>
        <i>→</i>
        <div><strong>3</strong><span>正式方案</span></div>
        <i>→</i>
        <div><strong>8</strong><span>行为节点</span></div>
        <b>16处绑定同步</b>
      </div>
    </header>

    <section class="pull-detail__problem">
      <span class="pull-detail__index">01</span>
      <div>
        <h2>你要解决的业务问题</h2>
        <p>每次更换分析类目或竞争品牌，如果分别打开三个方案修改，很容易出现口径不一致。本教程会把共同浏览、购买本品、购买竞品三个任务聚合，让每轮只需一次配置、一次批量发起。</p>
      </div>
      <aside>
        <small>本次真实任务</small>
        <strong>SK-II × 资生堂</strong>
        <span>制作三份方案并组成拉力分析方案组</span>
      </aside>
    </section>

    <section>
      <span class="pull-detail__index">02</span>
      <div>
        <h2>你会留下四项可以继续使用的成果</h2>
        <div class="pull-detail__outcomes">
          <article><b>2</b><strong>新正式方案</strong><span>共同浏览且购买本品、共同浏览且购买竞品。</span></article>
          <article><b>1</b><strong>拉力分析方案组</strong><span>收纳三份正式方案，直接进入组合应用。</span></article>
          <article><b>3</b><strong>聚合公共参数</strong><span>分析类目、本品牌、竞争品牌按名称聚合。</span></article>
          <article><b>6</b><strong>真实圈人任务</strong><span>默认场景3个包，改参后再生成3个新包。</span></article>
        </div>
      </div>
    </section>

    <section>
      <span class="pull-detail__index">03</span>
      <div>
        <h2>五个章节形成完整业务闭环</h2>
        <div class="pull-detail__chapters">
          <article><span>CHAPTER 01</span><strong>购买本品</strong><p>复制末尾节点，改为购买本品，并扩展分析类目和本品牌绑定。</p></article>
          <article><span>CHAPTER 02</span><strong>购买竞品</strong><p>先解除本品牌联动，再切换购买对象并绑定竞争品牌。</p></article>
          <article><span>CHAPTER 03</span><strong>组成方案组</strong><p>拖入三份正式方案，看懂同名字段如何聚合为公共参数。</p></article>
          <article><span>CHAPTER 04</span><strong>运行默认场景</strong><p>切换检查三个方案，理解组合参数来源，再完成第一轮三个包。</p></article>
          <article><span>CHAPTER 05</span><strong>改参验证提效</strong><p>只改分析类目和竞争品牌，再次生成三类新业务人群。</p></article>
        </div>
      </div>
    </section>

    <section class="pull-detail__rule">
      <span class="pull-detail__index">04</span>
      <div>
        <h2>组合方案最重要的规则</h2>
        <div class="pull-detail__rule-card">
          <strong>名称相同 + 类型一致 = 一个公共参数</strong>
          <p>例如三份方案都使用“竞争品牌”，组合应用时只展示一次；如果其中一份写成“竞品品牌”，系统会将它识别为另一个参数。</p>
          <div><span>分析类目 · 8处绑定</span><span>本品牌 · 4处绑定</span><span>竞争品牌 · 4处绑定</span></div>
        </div>
      </div>
    </section>

    <footer class="pull-detail__footer">
      <div>
        <span>前置成果</span>
        <h2>需要已发布的「共同浏览本品与竞品」方案</h2>
        <p>方案名称与所有人群包名称都会在对应步骤单独提供一键复制，不需要手动照抄。</p>
      </div>
      <button type="button" data-tutorial-start @click="emit('start')">开始进阶必学</button>
    </footer>
  </article>
</template>

<script setup>
const emit = defineEmits(['start'])
</script>

<style scoped>
.pull-detail { max-width: 1040px; margin: 0 auto; padding: 82px 0 70px; color: #18344c; }
.pull-detail__hero { display: grid; grid-template-columns: minmax(0, 1fr) 300px; align-items: end; gap: 54px; padding-bottom: 42px; border-bottom: 1px solid var(--ui-divider); }
.pull-detail__eyebrow { color: #1679c5; font: 760 9px/1.2 ui-monospace, monospace; letter-spacing: .14em; }
.pull-detail h1 { max-width: 720px; margin: 14px 0 15px; color: #142f47; font-size: clamp(31px, 4vw, 52px); font-weight: 690; line-height: 1.1; letter-spacing: -.055em; }
.pull-detail__copy > p { max-width: 720px; margin: 0 0 24px; color: #6a7d8e; font-size: 14px; line-height: 1.75; }
.pull-detail button { display: inline-flex; height: 42px; align-items: center; justify-content: center; gap: 16px; padding: 0 18px; color: #fff; font: inherit; font-size: 11px; font-weight: 680; background: #1679c5; border: 1px solid #1679c5; border-radius: 9px; cursor: pointer; box-shadow: 0 10px 24px rgba(22, 121, 197, .18); }
.pull-detail button:hover { background: #0f69ad; }
.pull-detail__signal { position: relative; display: grid; grid-template-columns: 1fr auto 1fr auto 1fr; align-items: center; gap: 9px; padding: 24px 20px 48px; overflow: hidden; background: linear-gradient(145deg, #eef8ff, #fbfdff); border: 1px solid #cce4f5; border-radius: 16px; box-shadow: 0 22px 55px rgba(44, 116, 170, .12); }
.pull-detail__signal > div { display: grid; justify-items: center; gap: 4px; }
.pull-detail__signal strong { color: #137dc9; font: 770 30px/1 ui-monospace, monospace; }
.pull-detail__signal span { color: #6a8295; font-size: 9px; }
.pull-detail__signal i { color: #82bce3; font-style: normal; }
.pull-detail__signal b { position: absolute; right: 0; bottom: 0; left: 0; padding: 11px; color: #fff; font-size: 10px; text-align: center; background: #183f5d; letter-spacing: .05em; }
.pull-detail section { display: grid; grid-template-columns: 46px minmax(0, 1fr); gap: 24px; padding: 38px 0; border-bottom: 1px solid var(--ui-divider); }
.pull-detail__index { padding-top: 5px; color: #8a9dad; font: 700 9px/1 ui-monospace, monospace; }
.pull-detail h2 { margin: 0 0 12px; color: #18344c; font-size: 18px; font-weight: 680; letter-spacing: -.025em; }
.pull-detail section p { margin: 0; color: #718391; font-size: 11px; line-height: 1.7; }
.pull-detail__problem { grid-template-columns: 46px minmax(0, 1fr) 270px !important; }
.pull-detail__problem aside { display: grid; gap: 6px; padding: 17px 18px; color: #326a95; background: linear-gradient(135deg, #edf8ff, #f8fcff); border-left: 3px solid #2690df; border-radius: 0 10px 10px 0; }
.pull-detail__problem aside small { font-size: 9px; font-weight: 750; letter-spacing: .08em; }
.pull-detail__problem aside strong { color: #184e76; font-size: 13px; }
.pull-detail__problem aside span { color: #648096; font-size: 10px; line-height: 1.55; }
.pull-detail__outcomes, .pull-detail__chapters { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 10px; margin-top: 19px; }
.pull-detail__outcomes article { display: grid; grid-template-columns: 42px minmax(0, 1fr); gap: 6px 10px; padding: 16px; background: #f7fbfe; border: 1px solid #dcebf5; border-radius: 11px; }
.pull-detail__outcomes b { grid-row: 1 / 3; color: #1783d3; font: 730 27px/1 ui-monospace, monospace; }
.pull-detail__outcomes strong { color: #194d75; font-size: 11px; }
.pull-detail__outcomes span { color: #718391; font-size: 10px; line-height: 1.55; }
.pull-detail__chapters article { min-height: 104px; padding: 16px; background: linear-gradient(145deg, #f6faff, #fff); border: 1px solid #dde9f2; border-radius: 11px; }
.pull-detail__chapters article > span { display: block; margin-bottom: 9px; color: #2786c9; font: 750 8px/1 ui-monospace, monospace; letter-spacing: .1em; }
.pull-detail__chapters strong { color: #1a486c; font-size: 12px; }
.pull-detail__chapters p { margin-top: 8px !important; font-size: 10px !important; }
.pull-detail__rule-card { padding: 20px; background: #163c59; border-radius: 13px; box-shadow: 0 16px 36px rgba(24, 60, 89, .14); }
.pull-detail__rule-card > strong { color: #fff; font-size: 14px; }
.pull-detail__rule-card > p { margin-top: 9px !important; color: #b9d3e7 !important; }
.pull-detail__rule-card > div { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 16px; }
.pull-detail__rule-card span { padding: 7px 10px; color: #d9edfb; font-size: 9px; background: rgba(255, 255, 255, .09); border: 1px solid rgba(255, 255, 255, .12); border-radius: 999px; }
.pull-detail__footer { display: grid; grid-template-columns: minmax(0, 1fr) auto; align-items: center; gap: 28px; margin-top: 32px; padding: 28px 30px; background: linear-gradient(135deg, #e9f6ff, #f8fcff); border: 1px solid #c5e3f8; border-left: 4px solid #1688dc; border-radius: 14px; }
.pull-detail__footer > div > span { color: #1679c5; font-size: 9px; font-weight: 800; letter-spacing: .08em; }
.pull-detail__footer h2 { margin: 8px 0; }
.pull-detail__footer p { margin: 0; color: #678095; font-size: 11px; }
.pull-detail__footer button { color: #315b7d; background: #fff; border-color: #cbdde9; box-shadow: none; }
button:focus-visible { outline: 3px solid rgba(22, 121, 197, .28); outline-offset: 3px; }

@media (max-width: 860px) {
  .pull-detail__hero { grid-template-columns: 1fr; align-items: start; gap: 28px; }
  .pull-detail__signal { max-width: 440px; }
  .pull-detail__problem { grid-template-columns: 38px minmax(0, 1fr) !important; }
  .pull-detail__problem aside { grid-column: 2; }
  .pull-detail__footer { grid-template-columns: 1fr; }
  .pull-detail__footer button { justify-self: start; }
}

@media (max-width: 620px) {
  .pull-detail__outcomes, .pull-detail__chapters { grid-template-columns: 1fr; }
}
</style>
