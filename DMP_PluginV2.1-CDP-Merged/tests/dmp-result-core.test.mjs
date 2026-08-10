import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import vm from 'node:vm'
import { fileURLToPath } from 'node:url'

const currentDir = path.dirname(fileURLToPath(import.meta.url))
const source = fs.readFileSync(path.resolve(currentDir, '..', 'dmp-result-core.js'), 'utf8')
const context = {}
vm.runInNewContext(source, context, { filename: 'dmp-result-core.js' })
const core = context.DmpResultCore

function createNode(text, options = {}) {
  return {
    textContent: text,
    nextElementSibling: options.nextElementSibling || null,
    previousElementSibling: options.previousElementSibling || null,
    parentElement: options.parentElement || null,
    closest() { return options.insideExtension ? {} : null },
    getAttribute(name) { return name === 'title' ? (options.title || '') : '' },
    querySelectorAll() { return options.children || [] },
  }
}

function createRow(...cellTexts) {
  const cells = cellTexts.map((text) => createNode(text))
  return createNode(cellTexts.join(' '), { children: cells })
}

test('coverage parser supports Chinese units, separators, and rejects percentages', () => {
  assert.equal(core.parseCoverageCount('1.2万'), 12000)
  assert.equal(core.parseCoverageCount('覆盖人数 12,345 人'), 12345)
  assert.equal(core.parseCoverageCount('2.5M'), 2500000)
  assert.equal(core.parseCoverageCount('12.5%'), null)
  assert.equal(core.parseCoverageCount('--'), null)
})

test('coverage locator falls back from the old XPath to a nearby semantic label', () => {
  const countNode = createNode('1.2万')
  const labelNode = createNode('覆盖人数', { nextElementSibling: countNode })
  const document = {
    evaluate() { return { singleNodeValue: null } },
    querySelectorAll(selector) {
      return selector.startsWith('span, div') ? [labelNode] : []
    },
  }

  assert.equal(core.findCoverageCount(document), 12000)
})

test('coverage locator ignores the extension panel own coverage value', () => {
  const pluginLabel = createNode('覆盖人数 88,888', { insideExtension: true })
  const document = {
    evaluate() { return { singleNodeValue: null } },
    querySelectorAll(selector) {
      return selector.startsWith('span, div') ? [pluginLabel] : []
    },
  }

  assert.equal(core.findCoverageCount(document), null)
})

test('crowd matcher accepts wrapped status text and invisible formatting characters', () => {
  const target = 'ZD间_魔方购买Y26_补数8_1_电商部'
  const otherRow = createRow('其他人群', 'ID: 12345')
  const wrappedRow = createRow(`${target}\u200B\n分析中`, 'ID: 67890')

  assert.equal(core.findCrowdRowByName([otherRow, wrappedRow], target), wrappedRow)
})

test('crowd matcher refuses an ambiguous partial match', () => {
  const first = createRow('品牌人群包 A 已完成')
  const second = createRow('品牌人群包 B 已完成')
  assert.equal(core.findCrowdRowByName([first, second], '品牌人群包'), null)
})
