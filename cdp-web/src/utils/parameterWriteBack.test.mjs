import assert from 'node:assert/strict'
import test from 'node:test'
import { buildParameterWriteBackChanges } from './parameterWriteBack.js'

function entry(value = '浏览') {
  const sourceRecord = {
    id: 'source-1', name: '我的方案', visibility: 'private', _version: 3,
    customFields: [{ id: 'field-1', defaultValue: ['浏览'] }],
  }
  return {
    sourceRecord,
    sourceNodes: [{ id: 'node-1', formData: { bhv: ['浏览'] }, modeData: {} }],
    record: { customFields: [{ id: 'field-1', defaultValue: [value] }] },
    nodes: [{ id: 'node-1', formData: { bhv: [value] }, modeData: {} }],
  }
}

test('writes only changed private parameter values and source version', () => {
  const unchanged = entry()
  const changed = entry('购买')
  assert.deepEqual(buildParameterWriteBackChanges([unchanged]), [])
  assert.deepEqual(buildParameterWriteBackChanges([changed]), [{
    id: 'source-1', expectedVersion: 3,
    nodes: [{ id: 'node-1', formData: { bhv: ['购买'] }, modeData: {} }],
    customFields: [{ id: 'field-1', defaultValue: ['购买'] }],
  }])
  changed.sourceRecord.visibility = 'public'
  assert.deepEqual(buildParameterWriteBackChanges([changed]), [])
})

test('rejects structural changes before writing', () => {
  const changed = entry('购买')
  changed.nodes.push({ id: 'node-2', formData: {}, modeData: {} })
  assert.throws(() => buildParameterWriteBackChanges([changed]), /结构已变化/)
})
