import test from 'node:test'
import assert from 'node:assert/strict'

import {
  FAVORITE_BEHAVIOR_COMPONENTS_STORAGE_KEY_PREFIX,
  loadFavoriteBehaviorComponents,
  saveFavoriteBehaviorComponents,
  toggleFavoriteBehaviorComponent,
} from './favoriteBehaviorComponents.js'

function memoryStorage() {
  const values = new Map()
  return {
    getItem: key => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
    values,
  }
}

test('组件收藏按用户分别持久化', () => {
  const storage = memoryStorage()
  saveFavoriteBehaviorComponents('user-a', ['商品行为', '关键词搜索'], storage)
  saveFavoriteBehaviorComponents('user-b', ['品牌推广'], storage)

  assert.deepEqual(loadFavoriteBehaviorComponents('user-a', storage), ['商品行为', '关键词搜索'])
  assert.deepEqual(loadFavoriteBehaviorComponents('user-b', storage), ['品牌推广'])
  assert.equal(
    storage.values.has(`${FAVORITE_BEHAVIOR_COMPONENTS_STORAGE_KEY_PREFIX}:user-a`),
    true,
  )
})

test('切换收藏会追加或移除组件并保持顺序', () => {
  assert.deepEqual(
    toggleFavoriteBehaviorComponent(['商品行为'], '关键词搜索'),
    ['商品行为', '关键词搜索'],
  )
  assert.deepEqual(
    toggleFavoriteBehaviorComponent(['商品行为', '关键词搜索'], '商品行为'),
    ['关键词搜索'],
  )
})

test('损坏或无效的收藏数据安全回退为空列表', () => {
  const storage = memoryStorage()
  storage.setItem(`${FAVORITE_BEHAVIOR_COMPONENTS_STORAGE_KEY_PREFIX}:user-a`, '{broken')
  assert.deepEqual(loadFavoriteBehaviorComponents('user-a', storage), [])
  assert.deepEqual(loadFavoriteBehaviorComponents('', storage), [])
})
