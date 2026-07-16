import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const currentDir = dirname(fileURLToPath(import.meta.url))
const loginView = readFileSync(join(currentDir, 'LoginView.vue'), 'utf8')

test('password visibility toggle is an icon-only accessible control', () => {
  const toggle = loginView.match(
    /<button[\s\S]*?class="login-password-toggle"[\s\S]*?<\/button>/,
  )?.[0]

  assert.ok(toggle, 'password toggle should exist')
  assert.match(toggle, /:aria-label="showPassword \? '隐藏密码' : '显示密码'"/)
  assert.match(toggle, /:aria-pressed="showPassword"/)
  assert.match(toggle, /<svg[\s\S]*?aria-hidden="true"/)
  assert.match(toggle, /v-if="showPassword"/)
  assert.match(toggle, /v-else/)
  assert.doesNotMatch(toggle, /\{\{\s*showPassword/)
})

test('password icon keeps a compact glyph and visible keyboard focus', () => {
  assert.match(loginView, /\.login-password-toggle\s*\{[\s\S]*?width:\s*48px/)
  assert.match(loginView, /\.login-password-toggle svg\s*\{[\s\S]*?width:\s*18px/)
  assert.match(loginView, /\.login-password-toggle:focus-visible\s*\{[\s\S]*?var\(--ui-accent-ring\)/)
})
