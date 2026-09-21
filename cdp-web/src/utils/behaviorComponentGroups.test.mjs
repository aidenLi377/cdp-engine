import test from 'node:test'
import assert from 'node:assert/strict'

import {
  BEHAVIOR_COMPONENT_GROUPS,
  groupBehaviorComponents,
} from './behaviorComponentGroups.js'

test('行为组件按指定分区展示', () => {
  assert.deepEqual(BEHAVIOR_COMPONENT_GROUPS, [
    {
      name: '人群资产',
      packages: ['自定义人群'],
    },
    {
      name: '公域数据',
      packages: ['类目公域行为', '类目商品行为'],
    },
    {
      name: '基础属性',
      packages: [
        'AIPL状态',
        '商品行为',
        '预测购买力',
        '预测年龄',
        '预测城市等级',
        '大快消策略人群',
        '快消策略人群3.0',
        '预测性别',
        '月均消费金额',
      ],
    },
    {
      name: '付费广告互动',
      packages: ['品牌专区', '效果推广', '全媒体智投', '单媒体智投', '品牌推广'],
    },
    {
      name: '流量搜索',
      packages: ['关键词搜索'],
    },
  ])
})

test('搜索结果只保留有匹配组件的分区', () => {
  assert.deepEqual(
    groupBehaviorComponents(['类目商品行为', '关键词搜索']),
    [
      { name: '公域数据', packages: ['类目商品行为'] },
      { name: '流量搜索', packages: ['关键词搜索'] },
    ],
  )
})

test('自定义人群归入人群资产，品牌推广归入付费广告互动，未配置的新组件仍进入其他分区', () => {
  assert.deepEqual(
    groupBehaviorComponents(['自定义人群', '品牌推广', '类目公域行为', '新组件']),
    [
      { name: '人群资产', packages: ['自定义人群'] },
      { name: '公域数据', packages: ['类目公域行为'] },
      { name: '付费广告互动', packages: ['品牌推广'] },
      { name: '其他', packages: ['新组件'] },
    ],
  )
})
