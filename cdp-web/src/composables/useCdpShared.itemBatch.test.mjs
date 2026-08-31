import test from 'node:test'
import assert from 'node:assert/strict'

import { useCdpShared } from './useCdpShared.js'

test('类目商品行为的商品ID按单个组件限制并参与超限拆分', () => {
  const { getListLimit, getSelectionCountHint, collectNodeOverflows } = useCdpShared()
  const field = { key: 'item', Label: '商品ID', Widget_Type: '列表输入' }
  const node = {
    packageType: '类目商品行为',
    schema: [field],
    formData: { item: ['1001', '1002', '1003'] },
  }

  assert.equal(getListLimit(field, node), 1)
  assert.equal(getSelectionCountHint(field, node), '已输入 3/1（每个组件1个）')
  assert.deepEqual(collectNodeOverflows(node), [{
    fieldKey: 'item',
    fieldLabel: '商品ID',
    allValues: ['1001', '1002', '1003'],
    limit: 1,
  }])
})

test('商品行为仍保留原有的单组件50个商品ID上限', () => {
  const { getListLimit } = useCdpShared()
  assert.equal(
    getListLimit(
      { key: 'item', Label: '商品ID', Widget_Type: '列表输入' },
      { packageType: '商品行为' },
    ),
    50,
  )
})
