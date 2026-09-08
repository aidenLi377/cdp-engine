import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const currentDir = dirname(fileURLToPath(import.meta.url))
const appVue = readFileSync(join(currentDir, '..', 'App.vue'), 'utf8')
const welcomeVue = readFileSync(join(currentDir, 'TutorialWelcomeDialog.vue'), 'utf8')
const centerVue = readFileSync(join(currentDir, 'TutorialCenter.vue'), 'utf8')

test('authenticated users receive a login-session account-specific tutorial invitation', () => {
  assert.match(appVue, /TUTORIAL_WELCOME_VERSION = 'login-v2'/)
  assert.match(appVue, /xdata:tutorial-welcome:\$\{TUTORIAL_WELCOME_VERSION\}:\$\{String\(userId \|\| ''\)\}/)
  assert.match(appVue, /refreshTutorialProgress\(\{ offerWelcome: true \}\)/)
  const loginHandler = appVue.match(/function handleAuthenticated\(user\) \{([\s\S]*?)\n\}/)?.[1] || ''
  const profileHandler = appVue.match(/function handleProfileUpdated\(user\) \{([\s\S]*?)\n\}/)?.[1] || ''
  assert.match(loginHandler, /sessionStorage\.removeItem\(tutorialWelcomeStorageKey\(user.id\)\)/)
  assert.doesNotMatch(profileHandler, /tutorialWelcomeStorageKey/)
  assert.match(appVue, /rememberTutorialWelcomeRead\(currentUser\.value\?\.id\)/)
})

test('welcome dialog leads with work pain and shows completed versus remaining capability', () => {
  assert.match(welcomeVue, /手把手做一次，以后少做很多次/)
  assert.match(welcomeVue, /解决 4 类高频重复工作/)
  assert.match(welcomeVue, /7 个商品，一次粘贴就配好圈人条件/)
  assert.match(welcomeVue, /一列品牌准备 4 个包/)
  assert.match(welcomeVue, /多个包的画像，一次取齐、直接对比/)
  assert.match(welcomeVue, /换一个竞品，整套拉力 3 个包一起圈/)
  assert.match(welcomeVue, /进阶必学/)
  assert.match(welcomeVue, /去教程中心/)
  assert.match(welcomeVue, /completedTutorialIds\(props\.progressItems\)/)
  assert.ok(welcomeVue.indexOf("label: '达摩盘复盘'") < welcomeVue.indexOf("label: '商品圈包'"))
})

test('welcome opens the tutorial overview without selecting or starting a course', () => {
  assert.match(appVue, /@experience="handleTutorialWelcomeExperience"/)
  assert.match(appVue, /function handleTutorialWelcomeExperience\(\) \{[^}]*tutorialCenterInitialId\.value = ''[^}]*openTutorialCenter\(\)/s)
  assert.doesNotMatch(welcomeVue, /@click="emit\('experience', item.id\)"/)
  assert.match(centerVue, /focusStartToken/)
  assert.match(centerVue, /querySelector\('\[data-tutorial-start\]'\)/)
  assert.match(centerVue, /点击发光按钮，开始跟着高亮完成实操/)
  assert.match(centerVue, /\.tutorial-center__detail :deep\(\[data-tutorial-start\]\)/)
})

test('tutorial center presents the pull-analysis course as advanced but essential', () => {
  assert.match(centerVue, /CORE COURSE · 进阶必学/)
  assert.match(centerVue, /进阶必学：大促拉力分析提效/)
  assert.match(centerVue, /完成前三课即可掌握 X-Data 最核心的模板制作、字段聚合与组合复用/)
  assert.match(centerVue, /\.tutorial-task-card footer button \{[^}]*height: 38px;[^}]*background: #172033;/s)
  assert.match(centerVue, /\.tutorial-primary-action \{[^}]*height: 42px;/s)
})

test('finishing the final milestone opens celebration and collapses the completed header entry to an icon', () => {
  assert.match(appVue, /becameAllTutorialsComplete\(tutorialProgressItems\.value, nextItems\)/)
  assert.match(appVue, /tutorialCenterCelebrationToken\.value \+= 1/)
  assert.match(appVue, /appMode\.value = 'tutorials'/)
  assert.match(appVue, /<template v-if="!tutorialsComplete">/)
  assert.match(appVue, /class="app-tutorial-link"[\s\S]*?'is-complete': tutorialsComplete/)
  assert.match(appVue, /\.app-tutorial-link\.is-complete \{[^}]*width: 28px;[^}]*padding: 0;/s)
})
