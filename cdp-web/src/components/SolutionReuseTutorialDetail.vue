<template>
  <article class="solution-reuse-detail">
    <header class="solution-reuse-detail__hero">
      <div>
        <span class="solution-reuse-detail__eyebrow">GUIDED TASK · 约 8–12 分钟</span>
        <h1>竞品换了，怎样不用重搭条件就完成共同浏览圈人？</h1>
        <p>从一张空白圈包画布开始，亲手做出“共同浏览本品与竞品”方案；再只改两个业务参数，完成第二次真实圈人。</p>
      </div>
      <button type="button" @click="emit('start')">
        开始制作方案
        <span aria-hidden="true">→</span>
      </button>
    </header>

    <section class="solution-reuse-detail__problem">
      <span class="solution-reuse-detail__index">01</span>
      <div>
        <h2>你要解决的业务问题</h2>
        <p>拉力分析经常需要同时观察本品与不同竞品。若每换一个竞品，就重新搭建行为、类目、渠道和时间，不仅慢，也容易让多次分析的口径不一致。</p>
      </div>
      <aside>
        <small>真实业务任务</small>
        <strong>先圈 SK-II × 资生堂</strong>
        <span>再复用同一方案，快速切换为 SK-II × CPB</span>
      </aside>
    </section>

    <section>
      <span class="solution-reuse-detail__index">02</span>
      <div>
        <h2>本次不是“看教程”，而是留下可继续使用的成果</h2>
        <div class="solution-reuse-detail__outcomes">
          <article>
            <b>1</b>
            <div><strong>1 个正式方案</strong><span>共同浏览本品与竞品，包含两个交集节点。</span></div>
          </article>
          <article>
            <b>3</b>
            <div><strong>3 个业务参数</strong><span>分析类目、本品牌、竞争品牌；其中分析类目一对多控制两个节点。</span></div>
          </article>
          <article>
            <b>2</b>
            <div><strong>2 次真实圈人</strong><span>默认参数执行一次，修改类目和竞品后再执行一次。</span></div>
          </article>
        </div>
      </div>
    </section>

    <section>
      <span class="solution-reuse-detail__index">03</span>
      <div>
        <h2>你会亲手走完四个章节</h2>
        <div class="solution-reuse-detail__chapters">
          <article>
            <span>CHAPTER 01</span>
            <strong>搭建共同浏览</strong>
            <p>配置 SK-II 浏览节点，复制后改成资生堂，用交集表达“同时浏览”。</p>
          </article>
          <article>
            <span>CHAPTER 02</span>
            <strong>制作一对多字段</strong>
            <p>让“分析类目”同时连接两个节点，再分别开放本品牌和竞争品牌。</p>
          </article>
          <article>
            <span>CHAPTER 03</span>
            <strong>保存并提交方案</strong>
            <p>补全方案名称和默认人群包名称，保存草稿并发布为正式方案。</p>
          </article>
          <article>
            <span>CHAPTER 04</span>
            <strong>两次应用验证提效</strong>
            <p>先按默认参数执行，再把类目改为面部护理套装、竞品改为 CPB 后执行。</p>
          </article>
        </div>
      </div>
    </section>

    <section class="solution-reuse-detail__case">
      <span class="solution-reuse-detail__index">04</span>
      <div>
        <h2>固定案例口径</h2>
        <div class="solution-reuse-detail__case-grid">
          <span>行为<strong>浏览</strong></span>
          <span>渠道<strong>天猫</strong></span>
          <span>时间<strong>过去 30 天</strong></span>
          <span>初始类目<strong>化妆水/爽肤水</strong></span>
          <span>本品牌<strong>SK-II</strong></span>
          <span>初始竞品<strong>Shiseido/资生堂</strong></span>
        </div>
        <p class="solution-reuse-detail__note">第二次应用不会新建节点：只把“分析类目”改为面部护理套装，把“竞争品牌”改为 CPB/肌肤之钥。教程会根据真实方案结构和真实执行结果判断是否完成。</p>
      </div>
    </section>

    <footer class="solution-reuse-detail__footer">
      <div>
        <span>完成后，下一篇可以直接复用</span>
        <h2>把这份共同浏览方案扩展成完整拉力分析方案组</h2>
        <p>后续只需替换竞品参数，就能同时驱动“共同浏览”“浏览后购买本品”“浏览后购买竞品”三份关联方案。</p>
      </div>
      <button type="button" @click="emit('start')">从干净圈包画布开始</button>
    </footer>
  </article>
</template>

<script setup>
const emit = defineEmits(['start'])
</script>

<style scoped>
.solution-reuse-detail { max-width: 1000px; margin: 0 auto; padding: 88px 0 72px; color: #18344c; }
.solution-reuse-detail__hero { display: grid; grid-template-columns: minmax(0, 1fr) auto; align-items: end; gap: 44px; padding-bottom: 38px; border-bottom: 1px solid var(--ui-divider); }
.solution-reuse-detail__eyebrow { color: #1679c5; font: 750 9px/1.2 ui-monospace, monospace; letter-spacing: .14em; }
.solution-reuse-detail h1 { max-width: 790px; margin: 13px 0 15px; color: #142f47; font-size: clamp(30px, 4vw, 50px); font-weight: 680; line-height: 1.12; letter-spacing: -.055em; }
.solution-reuse-detail__hero p { max-width: 720px; margin: 0; color: #6a7d8e; font-size: 14px; line-height: 1.75; }
.solution-reuse-detail button { display: inline-flex; height: 42px; align-items: center; justify-content: center; gap: 18px; padding: 0 17px; color: #fff; font: inherit; font-size: 11px; font-weight: 680; white-space: nowrap; background: #1679c5; border: 1px solid #1679c5; border-radius: 9px; cursor: pointer; box-shadow: 0 9px 22px rgba(22, 121, 197, .18); }
.solution-reuse-detail button:hover { background: #0f69ad; }
.solution-reuse-detail section { display: grid; grid-template-columns: 46px minmax(0, 1fr); gap: 24px; padding: 38px 0; border-bottom: 1px solid var(--ui-divider); }
.solution-reuse-detail__index { padding-top: 5px; color: #8a9dad; font: 700 9px/1 ui-monospace, monospace; }
.solution-reuse-detail h2 { margin: 0 0 12px; color: #18344c; font-size: 18px; font-weight: 680; letter-spacing: -.025em; }
.solution-reuse-detail section p { max-width: 760px; margin: 0; color: #718391; font-size: 12px; line-height: 1.75; }
.solution-reuse-detail__problem { grid-template-columns: 46px minmax(0, 1fr) 260px !important; }
.solution-reuse-detail__problem aside { display: grid; gap: 6px; padding: 17px 18px; color: #326a95; background: linear-gradient(135deg, #edf8ff, #f8fcff); border-left: 3px solid #2690df; border-radius: 0 10px 10px 0; }
.solution-reuse-detail__problem aside small { font-size: 9px; font-weight: 750; letter-spacing: .08em; }
.solution-reuse-detail__problem aside strong { color: #184e76; font-size: 12px; }
.solution-reuse-detail__problem aside span { color: #648096; font-size: 10px; line-height: 1.55; }
.solution-reuse-detail__outcomes { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 10px; margin-top: 19px; }
.solution-reuse-detail__outcomes article { display: grid; grid-template-columns: 36px minmax(0, 1fr); gap: 10px; padding: 16px; background: #f7fbfe; border: 1px solid #dcebf5; border-radius: 11px; }
.solution-reuse-detail__outcomes b { color: #1783d3; font: 720 25px/1 ui-monospace, monospace; }
.solution-reuse-detail__outcomes div { display: grid; gap: 6px; }
.solution-reuse-detail__outcomes strong { color: #194d75; font-size: 11px; }
.solution-reuse-detail__outcomes span { color: #718391; font-size: 10px; line-height: 1.55; }
.solution-reuse-detail__chapters { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 10px; margin-top: 19px; }
.solution-reuse-detail__chapters article { min-height: 104px; padding: 16px; background: linear-gradient(145deg, #f6faff, #fff); border: 1px solid #dde9f2; border-radius: 11px; }
.solution-reuse-detail__chapters span { display: block; margin-bottom: 9px; color: #2786c9; font: 750 8px/1 ui-monospace, monospace; letter-spacing: .1em; }
.solution-reuse-detail__chapters strong { color: #1a486c; font-size: 12px; }
.solution-reuse-detail__chapters p { margin-top: 8px !important; font-size: 10px !important; }
.solution-reuse-detail__case-grid { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 8px; margin-top: 18px; }
.solution-reuse-detail__case-grid span { display: grid; gap: 6px; padding: 12px 13px; color: #8295a3; font-size: 9px; background: #f8fbfd; border: 1px solid #e1ebf2; border-radius: 8px; }
.solution-reuse-detail__case-grid strong { color: #235f8c; font-size: 10px; }
.solution-reuse-detail__note { margin-top: 16px !important; padding: 12px 14px; color: #4f708a !important; background: #edf7fe; border-left: 3px solid #57a8df; border-radius: 0 8px 8px 0; }
.solution-reuse-detail__footer { display: grid; grid-template-columns: minmax(0, 1fr) auto; align-items: center; gap: 28px; margin-top: 32px; padding: 28px 30px; background: linear-gradient(135deg, #e9f6ff, #f8fcff); border: 1px solid #c5e3f8; border-left: 4px solid #1688dc; border-radius: 14px; box-shadow: 0 15px 38px rgba(34, 117, 181, .1); }
.solution-reuse-detail__footer span { color: #1679c5; font-size: 9px; font-weight: 800; letter-spacing: .08em; }
.solution-reuse-detail__footer h2 { margin: 8px 0; }
.solution-reuse-detail__footer p { max-width: 720px; margin: 0; color: #678095; font-size: 11px; line-height: 1.65; }
.solution-reuse-detail__footer button { color: #315b7d; background: #fff; border-color: #cbdde9; box-shadow: none; }
.solution-reuse-detail__footer button:hover { color: #fff; background: #1679c5; }
button:focus-visible { outline: 3px solid rgba(22, 121, 197, .28); outline-offset: 3px; }

@media (max-width: 860px) {
  .solution-reuse-detail__hero { grid-template-columns: 1fr; align-items: start; gap: 24px; }
  .solution-reuse-detail__problem, .solution-reuse-detail__footer { grid-template-columns: 38px minmax(0, 1fr) !important; }
  .solution-reuse-detail__problem aside { grid-column: 2; }
  .solution-reuse-detail__outcomes, .solution-reuse-detail__case-grid { grid-template-columns: 1fr; }
  .solution-reuse-detail__footer { grid-template-columns: 1fr !important; }
  .solution-reuse-detail__footer button { justify-self: start; }
}
</style>
