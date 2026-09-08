import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const currentDir = dirname(fileURLToPath(import.meta.url))
const srcDir = dirname(currentDir)
const webDir = dirname(srcDir)
const appVue = readFileSync(join(srcDir, 'App.vue'), 'utf8')
const indexHtml = readFileSync(join(webDir, 'index.html'), 'utf8')
const adminCenterVue = readFileSync(join(currentDir, 'AdminCenter.vue'), 'utf8')
const adminPanelVue = readFileSync(join(currentDir, 'AnnouncementAdminPanel.vue'), 'utf8')
const centerVue = readFileSync(join(currentDir, 'AnnouncementCenter.vue'), 'utf8')
const articleVue = readFileSync(join(currentDir, 'AnnouncementArticle.vue'), 'utf8')
const categoryTutorialVue = readFileSync(join(currentDir, 'TutorialTaskDetail.vue'), 'utf8')
const dmpTutorialVue = readFileSync(join(currentDir, 'DmpBatchTutorialDetail.vue'), 'utf8')
const solutionTutorialVue = readFileSync(join(currentDir, 'SolutionReuseTutorialDetail.vue'), 'utf8')

test('signed-in users have a compact unread-aware announcement entry without a login popup', () => {
  assert.match(appVue, /class="app-announcement-link"/)
  assert.match(appVue, /v-if="announcementUnreadCount > 0"/)
  assert.match(appVue, /class="app-announcement-unread-dot"/)
  assert.match(appVue, /\.app-announcement-unread-dot\s*\{/)
  assert.doesNotMatch(appVue, /\.app-announcement-icon i\s*\{/)
  assert.match(appVue, /announcementUnreadCount\.value = Math\.max\(0, state\.unreadCount\)/)
  assert.doesNotMatch(appVue, /AnnouncementModal|latest-popup|dismissAnnouncementPopup/)
})

test('browser tab uses the X-Data name and supplied brand icon', () => {
  assert.match(indexHtml, /<title>X-Data<\/title>/)
  assert.match(indexHtml, /href="\/x-data-icon-03\.png"/)
})

test('announcement center is reserved for updates while tutorials have their own entry', () => {
  assert.match(centerVue, /request\('\/api\/announcements'/)
  assert.match(centerVue, /\/api\/announcements\/\$\{encodeURIComponent\(id\)\}/)
  assert.match(centerVue, /\/api\/announcements\/\$\{encodeURIComponent\(id\)\}\/read/)
  assert.match(centerVue, /unreadCount: filteredItems\.value\.filter\(\(item\) => !item\.readAt\)\.length/)
  assert.doesNotMatch(centerVue, /\/api\/announcements\/read-all/)
  assert.match(centerVue, /更新公告/)
  assert.doesNotMatch(centerVue, /新手教程/)
  assert.match(centerVue, /aria-label="更新公告"/)
  assert.match(appVue, /class="app-tutorial-link"/)
  assert.match(centerVue, /<AnnouncementArticle/)
})

test('built-in tutorial introductions lead with a business task, a concrete output, the flow and a reusable next step', () => {
  assert.match(categoryTutorialVue, /你要解决的业务问题/)
  assert.match(categoryTutorialVue, /真实业务任务/)
  assert.match(categoryTutorialVue, /完成后，你会得到什么/)
  assert.match(categoryTutorialVue, /你会亲手走完这条流程/)
  assert.match(categoryTutorialVue, /完成后可迁移/)

  assert.match(dmpTutorialVue, /你要解决的业务问题/)
  assert.match(dmpTutorialVue, /用一个真实复盘任务来练习/)
  assert.match(dmpTutorialVue, /完成后，你会带走什么/)
  assert.match(dmpTutorialVue, /你会亲手走完这条流程/)
  assert.match(dmpTutorialVue, /完成后，下一次可以直接复用/)

  assert.match(solutionTutorialVue, /你要解决的业务问题/)
  assert.match(solutionTutorialVue, /真实业务任务/)
  assert.match(solutionTutorialVue, /留下可继续使用的成果/)
  assert.match(solutionTutorialVue, /亲手走完四个章节/)
  assert.match(solutionTutorialVue, /完成后，下一篇可以直接复用/)
})

test('category item tutorial keeps condition splitting distinct from later parameterized batch package creation', () => {
  assert.match(categoryTutorialVue, /每个 ID 会成为一个条件节点/)
  assert.match(categoryTutorialVue, /共同组成一个可执行人群/)
  assert.match(categoryTutorialVue, /按方案参数批量建包.*后续独立教程/)
  assert.match(categoryTutorialVue, /两种不同能力/)
  assert.doesNotMatch(categoryTutorialVue, /自动创建 7 个人群包/)
})

test('system management content editor supports drafts, ordered text, images, videos and tutorials', () => {
  assert.match(adminCenterVue, /id: 'announcements'[\s\S]*label: '公告与教程'/)
  assert.match(adminCenterVue, /<AnnouncementAdminPanel :is-system-owner="isSystemOwner"/)
  assert.match(adminPanelVue, /\/api\/admin\/announcements\/assets/)
  assert.match(adminPanelVue, /body\.append\('file', file\)/)
  assert.match(adminPanelVue, /form\.kind === 'tutorial'/)
  assert.match(adminPanelVue, /uploadAsset\(\$event, 'video'\)/)
  assert.match(articleVue, /block\.type === 'video'/)
  assert.match(articleVue, /<video/)
  assert.match(adminPanelVue, /method: 'PATCH'/)
  assert.match(adminPanelVue, /\/publish`/)
  assert.match(adminPanelVue, /\/unpublish`/)
  assert.match(adminPanelVue, /method: 'DELETE'/)
  assert.match(adminPanelVue, /<AnnouncementArticle :announcement="previewAnnouncement"/)
  assert.match(adminPanelVue, /v-if="selectedItem && isSystemOwner && selectedItem\.status === 'draft'"/)
})
