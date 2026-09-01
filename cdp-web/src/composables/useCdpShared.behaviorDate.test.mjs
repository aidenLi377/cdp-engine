import test from 'node:test'
import assert from 'node:assert/strict'

import { useCdpShared } from './useCdpShared.js'

test('behavior checkbox changes use the emitted value before applying the date default', () => {
  const { handleCheckboxChange } = useCdpShared()
  const node = {
    packageType: '类目公域行为',
    schema: [{ key: 'time', Widget_Type: '日期_切换' }],
    formData: { bhv: [], time: { days: 30, dateRange: [] } },
    modeData: { time: 'recent' },
  }

  handleCheckboxChange({ key: 'bhv' }, ['购买'], node)

  assert.deepEqual(node.formData.bhv, ['购买'])
  assert.equal(node.formData.time.days, 366)
})
