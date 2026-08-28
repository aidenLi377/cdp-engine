<template>
  <article v-if="announcement" class="announcement-article">
    <header class="announcement-article__header">
      <p class="announcement-article__eyebrow">
        {{ announcement.kind === 'tutorial' ? 'GETTING STARTED / GUIDE' : `RELEASE / V${announcement.version}` }}
      </p>
      <h1>{{ announcement.title }}</h1>
      <div class="announcement-article__meta">
        <span>{{ formatDate(announcement.publishedAt || announcement.updatedAt) }}</span>
        <span v-if="announcement.highlights?.length">{{ announcement.highlights.length }} 项更新亮点</span>
      </div>
    </header>

    <p v-if="announcement.summary" class="announcement-article__summary">{{ announcement.summary }}</p>

    <div class="announcement-article__content">
      <template v-for="(block, index) in announcement.content || []" :key="`${block.type}-${index}`">
        <section v-if="block.type === 'heading'" class="announcement-article__section-title">
          <span>{{ String(sectionNumber(index)).padStart(2, '0') }}</span>
          <h2>{{ block.text }}</h2>
        </section>
        <p v-else-if="block.type === 'paragraph'" class="announcement-article__paragraph">{{ block.text }}</p>
        <ul v-else-if="block.type === 'list'" class="announcement-article__list">
          <li v-for="item in block.items" :key="item">{{ item }}</li>
        </ul>
        <figure v-else-if="block.type === 'image'" class="announcement-article__figure">
          <img :src="assetUrl(block.assetId)" :alt="block.alt || block.caption || '内容配图'" loading="lazy" />
          <figcaption v-if="block.caption">{{ block.caption }}</figcaption>
        </figure>
        <figure v-else-if="block.type === 'video'" class="announcement-article__figure announcement-article__figure--video">
          <video :src="assetUrl(block.assetId)" controls preload="metadata" :aria-label="block.alt || block.caption || '教程视频'"></video>
          <figcaption v-if="block.caption">{{ block.caption }}</figcaption>
        </figure>
      </template>
    </div>

    <footer class="announcement-article__footer">
      <span>圈选工作台</span>
      <span>持续为使用体验更新</span>
    </footer>
  </article>
</template>

<script setup>
const props = defineProps({
  announcement: {
    type: Object,
    default: null,
  },
})

function assetUrl(assetId) {
  return `/api/announcement-assets/${encodeURIComponent(assetId)}`
}

function formatDate(value) {
  if (!value) return '尚未发布'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return new Intl.DateTimeFormat('zh-CN', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  }).format(date)
}

function sectionNumber(index) {
  return (props.announcement?.content || [])
    .slice(0, index + 1)
    .filter((block) => block.type === 'heading')
    .length
}
</script>

<style scoped>
.announcement-article {
  width: min(1000px, 100%);
  margin: 0;
  color: var(--ui-ink);
}

.announcement-article__header {
  padding: 55px 0 28px;
  border-bottom: 1px solid var(--ui-divider);
}

.announcement-article__eyebrow,
.announcement-article__highlights > p {
  margin: 0 0 16px;
  color: var(--ui-accent);
  font: 700 9px/1.2 ui-monospace, SFMono-Regular, Menlo, monospace;
  letter-spacing: .18em;
}

.announcement-article h1 {
  max-width: 680px;
  margin: 0;
  font-size: clamp(31px, 3vw, 42px);
  font-weight: 620;
  letter-spacing: -.055em;
  line-height: 1.1;
}

.announcement-article__summary {
  max-width: 650px;
  margin: 22px 0 0;
  color: var(--ui-text-secondary);
  font-size: 14px;
  line-height: 1.9;
  white-space: pre-wrap;
}

.announcement-article__meta {
  display: flex;
  gap: 22px;
  margin-top: 28px;
  color: var(--ui-text-tertiary);
  font: 9px/1.2 ui-monospace, SFMono-Regular, Menlo, monospace;
  letter-spacing: .04em;
}

.announcement-article__content {
  padding: 0 0 50px;
}

.announcement-article__section-title {
  display: grid;
  grid-template-columns: 34px 1fr;
  gap: 12px;
  align-items: baseline;
  margin: 34px 0 15px;
}

.announcement-article__section-title span {
  color: var(--ui-accent);
  font: 700 9px/1 ui-monospace, SFMono-Regular, Menlo, monospace;
}

.announcement-article__section-title h2 {
  margin: 0;
  font-size: 20px;
  font-weight: 630;
  letter-spacing: -.035em;
  line-height: 1.3;
}

.announcement-article__paragraph {
  margin: 0 0 16px 46px;
  color: #43464b;
  font-size: 13px;
  line-height: 2;
  white-space: pre-wrap;
}

.announcement-article__list {
  display: grid;
  gap: 10px;
  margin: 0 0 22px 46px;
  padding: 0;
  list-style: none;
}

.announcement-article__list li {
  position: relative;
  padding-left: 17px;
  color: #43464b;
  font-size: 13px;
  line-height: 1.8;
}

.announcement-article__list li::before {
  position: absolute;
  top: .75em;
  left: 0;
  width: 4px;
  height: 4px;
  content: '';
  background: var(--ui-accent);
  border-radius: 50%;
}

.announcement-article__figure {
  margin: 28px 0 36px 46px;
}

.announcement-article__figure img {
  display: block;
  width: 100%;
  max-height: 520px;
  object-fit: contain;
  background: #fff;
  border: 1px solid var(--ui-divider);
  border-radius: 14px;
}

.announcement-article__figure video {
  display: block;
  width: 100%;
  max-height: 560px;
  background: #111;
  border: 1px solid var(--ui-divider);
  border-radius: 14px;
}

.announcement-article__figure figcaption {
  margin-top: 10px;
  color: var(--ui-text-tertiary);
  font-size: 10px;
  line-height: 1.6;
  text-align: center;
}

.announcement-article__footer {
  display: flex;
  justify-content: space-between;
  padding: 22px 8px 58px;
  color: var(--ui-text-tertiary);
  font: 9px/1.2 ui-monospace, SFMono-Regular, Menlo, monospace;
  border-top: 1px solid var(--ui-divider);
}

@media (max-width: 680px) {
  .announcement-article__header { padding-top: 38px; }
  .announcement-article__paragraph,
  .announcement-article__list,
  .announcement-article__figure { margin-left: 0; }
}
</style>
