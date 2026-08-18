import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const currentDir = dirname(fileURLToPath(import.meta.url))
const profileDialogVue = readFileSync(join(currentDir, 'ProfileDialog.vue'), 'utf8')

test('profile dialog supports identity, avatar, and guarded password changes', () => {
  assert.match(profileDialogVue, /accept="image\/png,image\/jpeg,image\/webp"/)
  assert.match(profileDialogVue, /canvas\.toDataURL\('image\/webp', 0\.84\)/)
  assert.match(profileDialogVue, /v-model\.trim="form\.username"/)
  assert.match(profileDialogVue, /v-model="form\.currentPassword"/)
  assert.match(profileDialogVue, /form\.newPassword !== form\.confirmPassword/)
  assert.match(profileDialogVue, /request\('\/api\/auth\/profile'/)
})
