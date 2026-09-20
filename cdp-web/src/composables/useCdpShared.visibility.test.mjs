import test from 'node:test'
import assert from 'node:assert/strict'

import { useCdpShared } from './useCdpShared.js'

test('dependent scene stays hidden until a behavior is selected', () => {
  const { isVisible } = useCdpShared()
  const sceneField = {
    key: 'ppob_scene',
    isDefault: false,
    uiConfig: { optionSourceKey: 'bhv' },
  }
  const node = {
    packageType: '品牌推广',
    formData: { bhv: '' },
    logicMatrix: {
      点击: ['ppob_scene'],
      曝光: ['ppob_scene'],
    },
  }

  assert.equal(isVisible(sceneField, node), false)

  node.formData.bhv = '点击'
  assert.equal(isVisible(sceneField, node), true)
})
