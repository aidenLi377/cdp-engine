import test from 'node:test'
import assert from 'node:assert/strict'
import { applyImportedEngineJsonFields } from './engineJsonImport.js'

test('imported pool ids win over package defaults and compute pool indexes', () => {
  const item = { fromPoolId: 1, selectionLv3: {} }
  const node = { packageType: '品牌推广', engineJsonImport: { fromPoolId: 0 } }
  applyImportedEngineJsonFields(item, node, 2, true)
  assert.equal(item.fromPoolId, 0)

  const single = { fromPoolId: 0, selectionLv3: { dateType: 'RELATIVE_RANGE' } }
  applyImportedEngineJsonFields(single, {
    packageType: '单媒体智投',
    formData: { time: { days: 180 } },
    engineJsonImport: {
      fromPoolId: 1,
      relativeDateValue: { present: true, initialDays: 180 },
    },
  }, 2, true)
  assert.equal(single.fromPoolId, 1)
  assert.equal(single.selectionLv3.dateValue, '180')
})

test('changing imported relative days updates dateValue without affecting new-node defaults', () => {
  const importedNode = {
    packageType: '单媒体智投',
    formData: { time: { days: 180 } },
    engineJsonImport: { relativeDateValue: { present: false, initialDays: 180 } },
  }
  const item = { selectionLv3: { dateType: 'RELATIVE_RANGE' } }
  applyImportedEngineJsonFields(item, importedNode, 0, true)
  assert.equal(Object.hasOwn(item.selectionLv3, 'dateValue'), false)
  importedNode.formData.time.days = 90
  applyImportedEngineJsonFields(item, importedNode, 0, true)
  assert.equal(item.selectionLv3.dateValue, '90')

  const fresh = { selectionLv3: { dateType: 'RELATIVE_RANGE' } }
  applyImportedEngineJsonFields(fresh, {
    packageType: '单媒体智投', formData: { time: { days: 180 } },
  }, 0, true)
  assert.equal(Object.hasOwn(fresh.selectionLv3, 'dateValue'), false)
})

test('fixed dates are left to the normal generator', () => {
  const item = {
    selectionLv3: { dateType: 'ABSOLUTE_DATE_RANGE', dateValue: { from: '20250929', to: '20251005' } },
  }
  applyImportedEngineJsonFields(item, {
    packageType: '单媒体智投',
    formData: { time: { days: 90 } },
    engineJsonImport: { relativeDateValue: { present: true, initialDays: 180 } },
  }, 0, true)
  assert.deepEqual(item.selectionLv3.dateValue, { from: '20250929', to: '20251005' })
})
