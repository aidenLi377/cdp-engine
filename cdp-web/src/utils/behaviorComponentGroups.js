export const BEHAVIOR_COMPONENT_GROUPS = [
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
]

export function groupBehaviorComponents(packages = []) {
  const available = new Set(packages)
  const grouped = BEHAVIOR_COMPONENT_GROUPS.map(group => ({
    name: group.name,
    packages: group.packages.filter(packageName => available.has(packageName)),
  })).filter(group => group.packages.length > 0)

  const configuredPackages = new Set(
    BEHAVIOR_COMPONENT_GROUPS.flatMap(group => group.packages),
  )
  const otherPackages = packages.filter(packageName => !configuredPackages.has(packageName))

  if (otherPackages.length > 0) {
    grouped.push({ name: '其他', packages: otherPackages })
  }

  return grouped
}
