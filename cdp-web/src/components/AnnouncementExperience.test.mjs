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

test('signed-in users have a compact unread-aware announcement entry without a login popup', () => {
  assert.match(appVue, /class="app-announcement-link"/)
  assert.match(appVue, /v-if="announcementUnreadCount > 0"/)
  assert.match(appVue, /announcementUnreadCount\.value = Math\.max\(0, state\.unreadCount\)/)
  assert.doesNotMatch(appVue, /AnnouncementModal|latest-popup|dismissAnnouncementPopup/)
})

test('browser tab uses the X-Data name and supplied brand icon', () => {
  assert.match(indexHtml, /<title>X-Data<\/title>/)
  assert.match(indexHtml, /href="\/x-data-icon-03\.png"/)
})

test('announcement center marks only the opened item as read and separates updates from tutorials', () => {
  assert.match(centerVue, /request\('\/api\/announcements'/)
  assert.match(centerVue, /\/api\/announcements\/\$\{encodeURIComponent\(id\)\}/)
  assert.match(centerVue, /\/api\/announcements\/\$\{encodeURIComponent\(id\)\}\/read/)
  assert.match(centerVue, /unreadCount: items\.value\.filter\(\(item\) => !item\.readAt\)\.length/)
  assert.doesNotMatch(centerVue, /\/api\/announcements\/read-all/)
  assert.match(centerVue, /更新公告/)
  assert.match(centerVue, /新手教程/)
  assert.match(centerVue, /aria-label="公告与新手教程"/)
  assert.match(centerVue, /<AnnouncementArticle/)
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
