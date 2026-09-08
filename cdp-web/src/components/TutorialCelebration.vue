<template>
  <main class="tutorial-celebration" aria-labelledby="tutorial-celebration-title">
    <div class="tutorial-celebration__confetti" aria-hidden="true">
      <i v-for="piece in 18" :key="piece" :style="{ '--piece': piece }" />
    </div>

    <section class="tutorial-celebration__stage">
      <div class="tutorial-celebration__hero">
        <div class="tutorial-celebration__copy">
          <span class="tutorial-celebration__kicker">X-DATA · LEARNING COMPLETE</span>
          <p class="tutorial-celebration__eyebrow"><b>✓</b> 7 个提效点全部完成</p>
          <h1 id="tutorial-celebration-title">你已经跑通 X-Data 的核心提效方法</h1>
          <p class="tutorial-celebration__lead">
            这不是“看完了教程”，而是你已经亲手完成了取数、圈包、模板复用和组合批量执行。
            下一次遇到同类需求，可以直接把这些成果用到真实业务里。
          </p>
        </div>

        <div class="tutorial-celebration__seal" aria-label="教程进度 7/7，全部完成">
          <span>7</span>
          <i>/ 7</i>
          <small>全部完成</small>
        </div>
      </div>

      <div class="tutorial-celebration__timeline" aria-label="七个提效点均已完成">
        <span v-for="step in 7" :key="step" :style="{ '--step': step }"><b>✓</b><small>{{ String(step).padStart(2, '0') }}</small></span>
      </div>

      <div class="tutorial-celebration__body">
        <div class="tutorial-celebration__intro">
          <span>YOUR BUSINESS TOOLKIT</span>
          <h2>以后这些重复工作，都有更快的做法</h2>
          <p>你已经拥有一套从单任务到组合方案的完整操作能力。</p>
        </div>

        <div class="tutorial-celebration__outcomes">
          <article>
            <span>01</span>
            <strong>多个包，一次取齐画像</strong>
            <p>统一指标、批量取数，直接形成横向对比。</p>
          </article>
          <article>
            <span>02</span>
            <strong>一列条件，批量准备圈包</strong>
            <p>商品 ID 或竞品品牌无需再逐条重复配置。</p>
          </article>
          <article>
            <span>03</span>
            <strong>一次制模，后续持续复用</strong>
            <p>通过自定义字段，只改业务参数，不再重搭底层节点。</p>
          </article>
          <article>
            <span>04</span>
            <strong>一个竞品变化，整组一起执行</strong>
            <p>同名字段自动聚合，多竞品场景可批量展开九个人群包。</p>
          </article>
        </div>

        <footer class="tutorial-celebration__actions">
          <div>
            <strong>教程已毕业</strong>
            <span>进度会保留在当前账号，随时可以回来复习。</span>
          </div>
          <button type="button" class="is-secondary" @click="$emit('review')">回看教程</button>
          <button type="button" class="is-primary" @click="$emit('close')">带着成果返回工作区 <b>→</b></button>
        </footer>
      </div>
    </section>
  </main>
</template>

<script setup>
defineEmits(['review', 'close'])
</script>

<style scoped>
.tutorial-celebration {
  --celebration-ink: #10243d;
  --celebration-blue: #2376d9;
  position: relative;
  height: calc(100% - 62px);
  box-sizing: border-box;
  overflow: auto;
  padding: clamp(24px, 4vw, 54px);
  color: var(--celebration-ink);
  background:
    radial-gradient(circle at 84% 15%, rgba(255, 157, 112, .13), transparent 24%),
    linear-gradient(145deg, #edf6ff 0%, #f7f9fc 52%, #fff 100%);
}

.tutorial-celebration__stage {
  position: relative;
  z-index: 1;
  max-width: 1160px;
  margin: 0 auto;
  overflow: hidden;
  background: #fff;
  border: 1px solid #d8e4ef;
  border-radius: 24px;
  box-shadow: 0 24px 64px rgba(16, 36, 61, .11);
  animation: celebration-stage-in .7s cubic-bezier(.2, .8, .2, 1) both;
}

.tutorial-celebration__hero {
  display: grid;
  min-height: 270px;
  box-sizing: border-box;
  align-items: center;
  padding: clamp(34px, 5vw, 68px);
  grid-template-columns: minmax(0, 1fr) 190px;
  gap: 48px;
  background:
    linear-gradient(110deg, rgba(255, 255, 255, .04), transparent 58%),
    #172033;
}

.tutorial-celebration__kicker {
  color: #80c7ff;
  font: 700 9px/1.2 ui-monospace, SFMono-Regular, Menlo, monospace;
  letter-spacing: .18em;
}

.tutorial-celebration__eyebrow {
  display: flex;
  align-items: center;
  gap: 8px;
  margin: 20px 0 0;
  color: #bcd4ed;
  font-size: 11px;
}

.tutorial-celebration__eyebrow b {
  display: grid;
  width: 22px;
  height: 22px;
  place-items: center;
  color: #fff;
  background: #2da66f;
  border-radius: 50%;
}

.tutorial-celebration h1 {
  max-width: 730px;
  margin: 14px 0 12px;
  color: #fff;
  font-size: clamp(30px, 4vw, 52px);
  font-weight: 680;
  line-height: 1.08;
  letter-spacing: -.055em;
}

.tutorial-celebration__lead {
  max-width: 720px;
  margin: 0;
  color: #b9c6d7;
  font-size: 12px;
  line-height: 1.8;
}

.tutorial-celebration__seal {
  position: relative;
  display: grid;
  width: 168px;
  height: 168px;
  box-sizing: border-box;
  place-content: center;
  justify-items: center;
  color: #fff;
  background: rgba(255, 255, 255, .05);
  border: 1px solid rgba(255, 255, 255, .2);
  border-radius: 50%;
  box-shadow: inset 0 0 0 10px rgba(128, 199, 255, .07), 0 0 0 1px rgba(128, 199, 255, .08);
  animation: celebration-seal-in .8s .18s cubic-bezier(.2, .85, .2, 1.2) both;
}

.tutorial-celebration__seal::before {
  position: absolute;
  content: '';
  inset: 12px;
  border: 4px solid #55adf2;
  border-top-color: #ff966e;
  border-radius: inherit;
  transform: rotate(20deg);
}

.tutorial-celebration__seal span { font-size: 54px; font-weight: 720; line-height: .9; letter-spacing: -.08em; }
.tutorial-celebration__seal i { position: absolute; top: 62px; right: 40px; color: #9fb0c4; font-size: 12px; font-style: normal; }
.tutorial-celebration__seal small { margin-top: 9px; color: #bcd4ed; font-size: 9px; letter-spacing: .08em; }

.tutorial-celebration__timeline {
  display: grid;
  padding: 0 clamp(34px, 5vw, 68px);
  grid-template-columns: repeat(7, minmax(0, 1fr));
  background: #eaf4ff;
  border-bottom: 1px solid #d7e8f7;
}

.tutorial-celebration__timeline span {
  position: relative;
  display: flex;
  min-height: 58px;
  align-items: center;
  justify-content: center;
  gap: 7px;
  color: #3978b6;
  border-right: 1px solid #d2e4f4;
  animation: celebration-step-in .45s both;
  animation-delay: calc(var(--step, 0) * 60ms);
}

.tutorial-celebration__timeline span:last-child { border-right: 0; }
.tutorial-celebration__timeline b { display: grid; width: 20px; height: 20px; place-items: center; color: #fff; font-size: 9px; background: #2da66f; border-radius: 50%; }
.tutorial-celebration__timeline small { font: 700 8px/1 ui-monospace, SFMono-Regular, Menlo, monospace; letter-spacing: .08em; }

.tutorial-celebration__body { padding: clamp(28px, 4vw, 48px) clamp(34px, 5vw, 68px) 0; }
.tutorial-celebration__intro span { color: var(--celebration-blue); font: 700 8px/1 ui-monospace, SFMono-Regular, Menlo, monospace; letter-spacing: .16em; }
.tutorial-celebration__intro h2 { margin: 10px 0 5px; font-size: clamp(22px, 2.4vw, 30px); font-weight: 670; letter-spacing: -.045em; }
.tutorial-celebration__intro p { margin: 0; color: #748196; font-size: 10px; }

.tutorial-celebration__outcomes {
  display: grid;
  margin-top: 24px;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  border: 1px solid #e0e7ef;
  border-radius: 16px;
  overflow: hidden;
}

.tutorial-celebration__outcomes article { min-height: 110px; box-sizing: border-box; padding: 21px 23px; background: #fff; }
.tutorial-celebration__outcomes article:nth-child(odd) { border-right: 1px solid #e7ebf1; }
.tutorial-celebration__outcomes article:nth-child(-n + 2) { border-bottom: 1px solid #e7ebf1; }
.tutorial-celebration__outcomes article:hover { background: #f8fbff; }
.tutorial-celebration__outcomes span { color: #ef653d; font: 700 8px/1 ui-monospace, SFMono-Regular, Menlo, monospace; }
.tutorial-celebration__outcomes strong { display: block; margin-top: 10px; font-size: 13px; font-weight: 650; }
.tutorial-celebration__outcomes p { margin: 6px 0 0; color: #748196; font-size: 9px; line-height: 1.6; }

.tutorial-celebration__actions {
  display: flex;
  min-height: 92px;
  align-items: center;
  gap: 10px;
  margin-top: 30px;
  border-top: 1px solid #e7ebf1;
}

.tutorial-celebration__actions div { display: grid; margin-right: auto; gap: 4px; }
.tutorial-celebration__actions div strong { font-size: 11px; }
.tutorial-celebration__actions div span { color: #8490a0; font-size: 9px; }
.tutorial-celebration__actions button { height: 40px; appearance: none; padding: 0 16px; font: inherit; font-size: 10px; font-weight: 650; border-radius: 9px; cursor: pointer; }
.tutorial-celebration__actions .is-secondary { color: #536177; background: #fff; border: 1px solid #dce3eb; }
.tutorial-celebration__actions .is-primary { min-width: 192px; color: #fff; background: var(--celebration-blue); border: 1px solid var(--celebration-blue); box-shadow: 0 10px 22px rgba(35, 118, 217, .2); }
.tutorial-celebration__actions .is-primary b { margin-left: 12px; }

.tutorial-celebration__confetti { position: fixed; z-index: 0; inset: 62px 0 0; overflow: hidden; pointer-events: none; }
.tutorial-celebration__confetti i {
  position: absolute;
  top: -24px;
  left: calc(var(--piece) * 5.2%);
  width: 7px;
  height: 13px;
  opacity: .48;
  background: #2376d9;
  border-radius: 2px;
  transform: rotate(calc(var(--piece) * 19deg));
  animation: celebration-confetti calc(5s + var(--piece) * 90ms) calc(var(--piece) * -210ms) linear infinite;
}
.tutorial-celebration__confetti i:nth-child(3n) { background: #ef653d; }
.tutorial-celebration__confetti i:nth-child(3n + 1) { background: #2da66f; }

@keyframes celebration-stage-in { from { opacity: 0; transform: translateY(16px) scale(.985); } to { opacity: 1; transform: none; } }
@keyframes celebration-seal-in { from { opacity: 0; transform: rotate(-18deg) scale(.74); } to { opacity: 1; transform: none; } }
@keyframes celebration-step-in { from { opacity: 0; transform: translateY(6px); } to { opacity: 1; transform: none; } }
@keyframes celebration-confetti { 0% { transform: translateY(-5vh) rotate(0deg); } 100% { transform: translateY(110vh) rotate(520deg); } }

@media (max-width: 760px) {
  .tutorial-celebration { padding: 16px; }
  .tutorial-celebration__hero { min-height: 0; padding: 30px 24px; grid-template-columns: 1fr 112px; gap: 18px; }
  .tutorial-celebration__seal { width: 104px; height: 104px; }
  .tutorial-celebration__seal::before { inset: 8px; border-width: 3px; }
  .tutorial-celebration__seal span { font-size: 34px; }
  .tutorial-celebration__seal i { top: 38px; right: 23px; font-size: 9px; }
  .tutorial-celebration__seal small { margin-top: 5px; font-size: 7px; }
  .tutorial-celebration__timeline { padding: 0 20px; }
  .tutorial-celebration__timeline span { min-height: 48px; }
  .tutorial-celebration__body { padding: 26px 24px 0; }
  .tutorial-celebration__actions { align-items: stretch; flex-wrap: wrap; padding: 18px 0 24px; }
  .tutorial-celebration__actions div { width: 100%; }
}

@media (max-width: 520px) {
  .tutorial-celebration__hero { grid-template-columns: 1fr; }
  .tutorial-celebration__seal { display: none; }
  .tutorial-celebration__timeline span { gap: 0; }
  .tutorial-celebration__timeline small { display: none; }
  .tutorial-celebration__outcomes { grid-template-columns: 1fr; }
  .tutorial-celebration__outcomes article:nth-child(n) { border-right: 0; border-bottom: 1px solid #e7ebf1; }
  .tutorial-celebration__outcomes article:last-child { border-bottom: 0; }
  .tutorial-celebration__actions button { flex: 1; }
  .tutorial-celebration__actions .is-primary { min-width: 0; }
}

@media (prefers-reduced-motion: reduce) {
  .tutorial-celebration__stage,
  .tutorial-celebration__seal,
  .tutorial-celebration__timeline span,
  .tutorial-celebration__confetti i { animation: none !important; }
  .tutorial-celebration__confetti { display: none; }
}
</style>
