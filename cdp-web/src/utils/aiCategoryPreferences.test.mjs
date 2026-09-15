import test from 'node:test'
import assert from 'node:assert/strict'
import {
  aiCategoryOptionValue,
  cacheAiCategoryPreferences,
  chooseAiCategoryOption,
  groupAiCategoryOptions,
  loadAiCategoryPreferences,
  rememberAiCategoryOption,
} from './aiCategoryPreferences.js'

const options = [
  { value: '孕妇装/孕产妇用品/营养>孕产妇护肤/洗护/祛纹>乳液/面霜' },
  { value: '旅行购物>美容护肤/美体/精油>乳液/面霜' },
  { value: '洗护清洁剂/卫生巾/纸/香薰>面部清洁/护理>乳液/面霜' },
  { value: '美容护肤/美体/精油>乳液/面霜' },
  { value: '婴童洗护>婴童护肤>婴童乳液/面霜' },
]

const question = {
  field: 'leafCates',
  action: { query: '乳液面霜' },
  options,
}

test('beauty is the useful default and official paths remain grouped', () => {
  const groups = groupAiCategoryOptions(question)
  assert.deepEqual(groups.map(item => item.label), ['美妆护肤', '母婴护理', '个护清洁'])
  assert.equal(aiCategoryOptionValue(groups[0].options[0]), '美容护肤/美体/精油>乳液/面霜')
})

test('conversation context changes the recommended business group', () => {
  const choice = chooseAiCategoryOption(question, [], '查看婴儿面霜购买人群')
  assert.match(aiCategoryOptionValue(choice.option), /婴童/)
})

test('the remembered official category is preselected while stale entries are ignored', () => {
  const memory = new Map()
  const storage = {
    getItem: key => memory.get(key) || null,
    setItem: (key, value) => memory.set(key, value),
  }
  const selected = options[2]
  const saved = rememberAiCategoryOption(question, selected, [], storage)
  assert.equal(loadAiCategoryPreferences(storage).length, 1)
  const choice = chooseAiCategoryOption(question, saved)
  assert.equal(choice.source, 'remembered')
  assert.equal(aiCategoryOptionValue(choice.option), aiCategoryOptionValue(selected))

  const changedQuestion = { ...question, options: options.filter(item => item !== selected) }
  assert.equal(chooseAiCategoryOption(changedQuestion, saved).source, 'recommended')
})

test('account preferences can replace the browser fallback cache', () => {
  const memory = new Map()
  const storage = {
    getItem: key => memory.get(key) || null,
    setItem: (key, value) => memory.set(key, value),
  }
  const accountPreferences = [{
    field: 'category',
    query: '乳液面霜',
    queryKey: '乳液面霜',
    leafKey: '婴童乳液面霜',
    value: aiCategoryOptionValue(options[4]),
    label: aiCategoryOptionValue(options[4]),
    updatedAt: '2026-09-10T00:00:00Z',
  }]
  cacheAiCategoryPreferences(accountPreferences, storage)
  assert.deepEqual(loadAiCategoryPreferences(storage), accountPreferences)
})
