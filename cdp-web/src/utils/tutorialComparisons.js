import { CATEGORY_ITEM_TUTORIAL_ID, COMBINATION_BATCH_TUTORIAL_ID, DMP_BATCH_TUTORIAL_ID, PARAMETER_BATCH_TUTORIAL_ID, SOLUTION_REUSE_TUTORIAL_ID, PULL_ANALYSIS_GROUP_TUTORIAL_ID } from './guidedTutorialConfig.js'

export const TUTORIAL_OPERATION_COMPARISONS = Object.freeze({
  [COMBINATION_BATCH_TUTORIAL_ID]: {
    task: '从一个竞品扩展到三个竞品，为每个竞品准备三类人群',
    manual: ['为每个竞品分别配置共同浏览、且购买本品、且购买竞品', '逐个核对并提交，总共准备九个人群包'],
    product: ['复用拉力方案组，粘贴三行竞品名单', '每行展开整组三个包，预览九个任务并统一发起'],
    value: '逐个组合应用需要换品牌并发起三轮；Excel 批量只需一次粘贴、一次统一发起。',
  },
  [CATEGORY_ITEM_TUTORIAL_ID]: {
    task: '拿到 7 个商品 ID，为同一个人群配置商品条件',
    manual: ['逐个添加商品条件并填写 ID', '逐项设置条件关系，核对是否遗漏'],
    product: ['复制一列 7 个 ID，一次粘贴', '自动拆成对应条件，核对后发起圈人'],
    value: '减少逐条配置与漏填。这里拆的是条件，最终创建一个人群包。',
  },
  [DMP_BATCH_TUTORIAL_ID]: {
    task: '比较多个人群包的画像，准备复盘数据',
    manual: ['逐个搜索人群包，选择画像标签并取数', '逐份复制结果，再整理到同一张对比表'],
    product: ['粘贴人群包名单，统一选择画像标签', '批量采集，选择指标并复制横向对比表'],
    value: '减少页面切换和结果整理，让多个人群使用一致的画像口径。',
  },
  [SOLUTION_REUSE_TUTORIAL_ID]: {
    task: '分析共同浏览本品与竞品的人，并复用到新类目或新竞品',
    manual: ['分别设置本品和竞品浏览条件，取交集', '需求变化时逐个找到相关条件并修改、核对'],
    product: ['制作一次方案，绑定分析类目、本品牌、竞争品牌', '以后只改业务字段，同步更新它绑定的全部条件'],
    value: '一次制作、反复应用；同一个类目字段能统一控制两个节点。',
  },
  [PULL_ANALYSIS_GROUP_TUTORIAL_ID]: {
    task: '为一个竞品准备共同浏览、且购买本品、且购买竞品三类人群',
    manual: ['分别配置三个人群包，核对品牌、类目和时间', '换竞品后重复修改三个包，并分别提交'],
    product: ['将三个方案放入文件夹，进入组合工作台', '修改同名聚合参数，一次准备三个包并统一执行'],
    value: '同名自定义字段聚合后，按各方案原有绑定关系生效，减少重复修改。',
  },
  [PARAMETER_BATCH_TUTORIAL_ID]: {
    task: '为四个竞争品牌分别准备购买人群，用于后续销售分析',
    manual: ['修改品牌、填写人群名称、提交圈人，重复四次', '每次检查购买、类目、渠道和时间是否一致'],
    product: ['复用购买方案，粘贴四行竞争品牌', '预览四个独立任务，统一发起自动化圈人'],
    value: '只变化品牌参数，一行一个品牌、一个品牌一个包；其他条件统一复用。',
  },
})
