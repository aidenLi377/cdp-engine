import { mkdir, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import {
  CATEGORY_ITEM_TUTORIAL_ID,
  COMBINATION_BATCH_TUTORIAL_ID,
  DMP_BATCH_TUTORIAL_ID,
  PARAMETER_BATCH_TUTORIAL_ID,
  PULL_ANALYSIS_GROUP_TUTORIAL_ID,
  SOLUTION_REUSE_TUTORIAL_ID,
  GUIDED_TUTORIAL_STEPS,
} from '../cdp-web/src/utils/guidedTutorialConfig.js'
import {
  TUTORIAL_CATALOG,
  TUTORIAL_PREREQUISITES,
} from '../cdp-web/src/utils/tutorialCatalog.js'
import { TUTORIAL_OPERATION_COMPARISONS } from '../cdp-web/src/utils/tutorialComparisons.js'

const scriptDir = dirname(fileURLToPath(import.meta.url))
const projectRoot = resolve(scriptDir, '..')
const outputPath = resolve(projectRoot, 'ai_system_capability_catalog.json')

const execution = {
  [DMP_BATCH_TUTORIAL_ID]: {
    entryMode: 'task-center',
    action: 'prepare_dmp_batch_profile',
    applicationMode: 'specialized',
    requiredInputs: ['至少2个人群包名称', '画像标签', '展示指标'],
    prerequisites: ['已登录达摩盘', '任务执行器已安装并连接'],
    invariants: ['保持输入的人群包顺序', '同一批任务使用一致的画像标签口径', '真实执行前必须由用户确认'],
  },
  [CATEGORY_ITEM_TUTORIAL_ID]: {
    entryMode: 'workbench',
    action: 'apply_category_item_split',
    applicationMode: 'workbench',
    requiredInputs: ['商品ID列表', '行为', '时间'],
    prerequisites: [],
    invariants: ['每个类目商品行为节点只能放1个商品ID', '多个商品ID自动拆为并集节点', '通用行为与时间复制到每个节点', '只形成1个人群包'],
  },
  [PARAMETER_BATCH_TUTORIAL_ID]: {
    entryMode: 'workbench',
    action: 'prepare_single_solution_parameter_batch',
    applicationMode: 'staged',
    requiredInputs: ['一个已发布方案', '一个要变化的自定义字段', '按行粘贴的参数值', '每行对应的人群包名称'],
    prerequisites: ['基础方案已经发布', '变化字段已绑定到正确节点'],
    invariants: ['一行一个参数值', '一行生成一个独立人群包', '其他组件条件保持一致', '批量执行前统一预览并由用户确认'],
  },
  [SOLUTION_REUSE_TUTORIAL_ID]: {
    entryMode: 'workbench',
    action: 'apply_or_prepare_reusable_solution',
    applicationMode: 'staged',
    requiredInputs: ['分析类目', '本品牌', '竞争品牌'],
    prerequisites: [],
    invariants: ['共同浏览用两个浏览节点取交集', '同一个分析类目字段可以一对多绑定两个节点', '默认参数不能污染下一次业务参数', '发布前由用户检查方案名称与默认人群包名称'],
  },
  [PULL_ANALYSIS_GROUP_TUTORIAL_ID]: {
    entryMode: 'workbench',
    action: 'prepare_pull_analysis_solution_group',
    applicationMode: 'staged',
    requiredInputs: ['共同浏览方案', '购买本品方案', '购买竞品方案', '分析类目', '本品牌', '竞争品牌'],
    prerequisites: ['三份方案均已发布并放入同一文件夹'],
    invariants: ['同名且类型一致的自定义字段才聚合为一个公共参数', '三份方案保留各自绑定关系', '每轮一次配置生成三个人群包', '真实执行前必须由用户确认'],
  },
  [COMBINATION_BATCH_TUTORIAL_ID]: {
    entryMode: 'workbench',
    action: 'prepare_combination_parameter_batch',
    applicationMode: 'staged',
    requiredInputs: ['已发布的三方案组', '多行竞争品牌名单'],
    prerequisites: ['三份方案均包含名称和类型一致的竞争品牌字段'],
    invariants: ['每行竞品展开整组三个人群包', '三行竞品生成九个人群包', '按竞品分组核对', '全量执行前必须由用户确认'],
  },
}

const directWorkbench = {
  id: 'direct-workbench-audience-build',
  sequence: '00',
  track: 'core',
  title: '自由搭建圈包',
  shortTitle: '自由搭建',
  duration: '取决于条件数量',
  result: '将自然语言条件转换为工作台节点，确认后应用',
  capability: '组件选择 · 参数填充 · 交并差编排',
  businessProblem: '创建单个人群包，且无需复用方案或批量展开',
  prerequisites: [],
  operationComparison: {
    task: '把一个自然语言人群需求变成可执行圈包条件',
    manual: ['逐个选择行为组件', '手动填写参数并设置交并差关系'],
    product: ['AI选择组件并生成节点预览', '用户确认后应用到工作台'],
    value: '减少组件选择和重复填写，同时保留最终确认权。',
  },
  steps: [
    { id: 'describe', title: '描述人群目标', body: '说明对象、行为、时间、范围以及排除条件。' },
    { id: 'clarify', title: '补齐必要信息', body: '只追问影响组件选择或参数有效性的缺失项。' },
    { id: 'preview', title: '核对执行概览', body: '检查组件、参数、节点关系、日期与风险提醒。' },
    { id: 'apply', title: '应用到工作台', body: '用户确认后替换当前画布，仍可继续修改或计算人数。' },
  ],
  execution: {
    entryMode: 'workbench',
    action: 'apply_workbench_nodes',
    applicationMode: 'workbench',
    requiredInputs: ['至少一个有效圈包条件'],
    prerequisites: [],
    invariants: ['模型只解析意图', '组件参数由后端实时校验', '应用前必须由用户确认'],
  },
}

const systemFeatures = [
  { id: 'ai-audience-planner', module: '圈包工作台', title: '自然语言圈人', useWhen: '用户用业务语言描述单个人群或圈包目标', aiRole: '解析意图、选择执行路径、生成预览，确认后应用', guardrails: ['不得绕过用户确认', '不得直接编造组件参数'] },
  { id: 'behavior-component-library', module: '圈包工作台', title: '行为组件库', useWhen: '自由搭建圈包条件', aiRole: '按适用场景选择类目公域、类目商品、商品行为及属性组件', guardrails: ['组件和字段必须来自实时配置'] },
  { id: 'live-dimension-options', module: '圈包工作台', title: '实时正式选项', useWhen: '选择类目、品牌、渠道、账号或属性值', aiRole: '保留用户原话并交给后端搜索正式选项', guardrails: ['不能编造品牌、类目、账号和渠道'] },
  { id: 'node-editor', module: '圈包工作台', title: '节点增删复制与排序', useWhen: '一个人群包含多个条件节点', aiRole: '准备节点顺序与参数，用户仍可修改', guardrails: ['首节点没有前序运算符'] },
  { id: 'set-operators', module: '圈包工作台', title: '交并差关系', useWhen: '表达且、或、排除，以及同一组件多个行为', aiRole: '把且编为交集、或编为并集、排除编为差集', guardrails: ['同节点多行为默认是并集', '明确都发生过时拆节点取交集'] },
  { id: 'limited-field-split', module: '圈包工作台', title: '限量字段批量粘贴与自动拆分', useWhen: '商品ID、关键词、类目或品牌超过单节点字段上限', aiRole: '复用公共参数并按字段上限拆节点', guardrails: ['先预览识别结果', '同一人群的拆分节点通常取并集'] },
  { id: 'custom-field-binding', module: '圈包工作台', title: '自定义字段与一对多绑定', useWhen: '方案需要反复替换业务参数', aiRole: '建议字段名称、类型和节点绑定范围', guardrails: ['同名字段必须保持类型一致', '示例默认值不能污染新任务'] },
  { id: 'crowd-name', module: '圈包工作台', title: '人群包命名', useWhen: '计算或执行圈包前', aiRole: '根据对象、行为和时间生成可识别名称', guardrails: ['批量任务每行必须有独立名称'] },
  { id: 'crowd-count', module: '圈包工作台', title: '计算人数', useWhen: '节点配置完成后验证覆盖规模', aiRole: '准备可计算条件并提示公域小于2000不展示规则', guardrails: ['不把不展示解释为人数为0', '日期不得包含今天'] },
  { id: 'automation-crowd-build', module: '圈包工作台', title: '自动化圈人', useWhen: '用户确认节点和名称后在数据引擎真实建包', aiRole: '准备任务并展示最终确认', guardrails: ['必须确认已登录数据引擎', '必须由用户最终确认'] },
  { id: 'workbench-recovery', module: '圈包工作台', title: '撤销、重做与会话恢复', useWhen: '修改出错、刷新页面或继续未完成任务', aiRole: '优先保留可恢复状态', guardrails: ['不得静默覆盖现有画布'] },
  { id: 'solution-public-private-library', module: '方案中心', title: '公共方案与个人方案库', useWhen: '查找可复用结构或管理自己的方案', aiRole: '公共方案作为全局知识，个人方案只允许当前账号使用', guardrails: ['不得泄露其他用户个人方案', '草稿不能当正式方案执行'] },
  { id: 'solution-search-folder', module: '方案中心', title: '方案搜索与文件夹', useWhen: '按业务主题组织、查找或组合方案', aiRole: '根据名称和业务含义匹配正式方案', guardrails: ['组合应用需选择同一文件夹中的已发布方案'] },
  { id: 'solution-draft-publish', module: '方案中心', title: '方案草稿、校验与发布', useWhen: '把稳定圈包结构沉淀为正式方案', aiRole: '准备节点、自定义字段、方案名和默认人群名', guardrails: ['发布前必须完成校验', '示例参数与固定规则要区分'] },
  { id: 'solution-apply', module: '方案中心', title: '应用正式方案', useWhen: '复用已发布结构并替换少量参数', aiRole: '匹配方案并准备本轮参数', guardrails: ['保留方案固定行为和节点关系', '实时维表重新校验参数'] },
  { id: 'solution-derived-save', module: '方案中心', title: '方案派生与另存', useWhen: '在既有方案上扩展节点或修改结构', aiRole: '区分参数变化与结构变化并建议另存', guardrails: ['不得意外覆盖公共正式方案'] },
  { id: 'solution-folder-share', module: '方案中心', title: '个人文件夹分享与导入', useWhen: '在账号之间交付个人方案集合', aiRole: '说明分享短语、有效期和导入结果', guardrails: ['分享和导入必须由用户发起', '公共方案不走个人分享流程'] },
  { id: 'solution-group', module: '方案中心', title: '方案组组合应用', useWhen: '一次使用同一文件夹中的多个正式方案', aiRole: '检查方案兼容性并聚合同名同类型参数', guardrails: ['名称相同但类型不同不能聚合', '每份方案仍生成独立人群包'] },
  { id: 'single-parameter-batch', module: '批量圈人', title: '单方案参数批量', useWhen: '同一正式方案只变化一个参数且每行生成一个包', aiRole: '识别批量字段、解析Excel行并准备独立任务', guardrails: ['一行一个包', '其他条件必须保持一致'] },
  { id: 'combination-parameter-batch', module: '批量圈人', title: '组合参数批量', useWhen: '多行参数分别展开整套方案组', aiRole: '按参数行和方案数展开任务矩阵', guardrails: ['任务数等于参数行数乘方案数', '不得合并成一个并集人群'] },
  { id: 'batch-preview', module: '批量圈人', title: '批量任务预览', useWhen: '批量展开后、真实执行前', aiRole: '展示分组、包名、参数与任务数量', guardrails: ['数量或参数不一致时不得执行'] },
  { id: 'batch-run-retry', module: '批量圈人', title: '全量执行与失败重试', useWhen: '统一发起多个圈包任务或恢复失败项', aiRole: '区分全部、当前和仅失败任务', guardrails: ['执行前确认登录', '重试不能重复提交已成功任务'] },
  { id: 'databank-task', module: '任务中心', title: '数据引擎人群任务', useWhen: '搜索、应用或检查数据引擎人群包', aiRole: '准备人群名并交给任务执行器', guardrails: ['依赖数据引擎登录和扩展连接'] },
  { id: 'dmp-profile', module: '任务中心', title: '达摩盘画像取数', useWhen: '获取单个人群包的画像标签明细', aiRole: '准备人群包和标签选择', guardrails: ['需先配置带下钻条件的标签', '依赖达摩盘登录'] },
  { id: 'dmp-profile-batch', module: '任务中心', title: '达摩盘批量取画像', useWhen: '同一标签口径下依次采集多个人群包', aiRole: '解析并去重名单、保持顺序、准备批量任务', guardrails: ['至少2个人群包', '失败项可单独重试'] },
  { id: 'dmp-horizontal-comparison', module: '任务中心', title: '画像横向对比', useWhen: '比较多个人群在相同标签下的结构差异', aiRole: '选择对比人群、指标和标签顺序', guardrails: ['第一个人群作为标签结构基准', '区分原始人群占比与Rebase占比'] },
  { id: 'comparison-copy', module: '任务中心', title: '对比结果复制到Excel', useWhen: '把横向对比结果用于复盘表', aiRole: '保持标签和人群顺序输出可粘贴表格', guardrails: ['不得改变指标含义或百分比口径'] },
  { id: 'task-history', module: '任务中心', title: '任务进度、历史与恢复', useWhen: '查看执行状态、取消任务或从历史继续分析', aiRole: '根据成功、失败、运行中状态给出下一步', guardrails: ['不得把失败任务当成功结果'] },
  { id: 'tutorial-center', module: '帮助与学习', title: '教程中心与实操引导', useWhen: '用户需要学习系统能力或恢复教程进度', aiRole: '引用真实教程步骤、前置条件和检查点', guardrails: ['教程示例不能直接当业务参数'] },
  { id: 'announcement-center', module: '帮助与学习', title: '公告与版本说明', useWhen: '了解新功能、变更或使用提醒', aiRole: '只引用已发布内容', guardrails: ['草稿内容不可作为正式规则'] },
  { id: 'feedback', module: '帮助与学习', title: '问题与账号反馈', useWhen: '缺少品牌账号、正式选项或发现系统问题', aiRole: '预填问题类型和说明并引导用户提交', guardrails: ['不能承诺反馈后立即开通账号'] },
  { id: 'extension-connection', module: '系统连接', title: '任务执行器与浏览器扩展', useWhen: '执行数据引擎或达摩盘自动化', aiRole: '检查连接状态并提示安装、登录或重试', guardrails: ['未连接时不得声称已执行'] },
  { id: 'account-profile-memory', module: '账号', title: '账号资料、会话与偏好记忆', useWhen: '跨浏览器继续使用个人设置', aiRole: '读取当前账号允许的偏好', guardrails: ['用户之间严格隔离', '换模型不得丢失账号偏好'] },
  { id: 'admin-users', module: '管理后台', title: '用户、邀请、角色与会话管理', useWhen: '管理员维护账号权限', aiRole: '仅说明或为有权限管理员准备操作', guardrails: ['普通用户不得执行', '总管理员保护规则不可绕过'] },
  { id: 'admin-dimensions', module: '管理后台', title: '组件维表配置、导入与发布', useWhen: '配置管理员维护品牌、类目、账号、渠道等正式选项', aiRole: '依赖已发布配置给业务用户实时校验', guardrails: ['草稿修改发布前不影响正式圈包', '发布与回滚需管理员确认'] },
  { id: 'admin-content-feedback', module: '管理后台', title: '公告、教程与反馈管理', useWhen: '管理员发布教学内容或处理用户反馈', aiRole: '只学习已发布教程与公告', guardrails: ['未发布内容不进入普通用户知识'] },
  { id: 'admin-data-safety', module: '管理后台', title: '数据安全快照与备份', useWhen: '管理员检查本地数据状态或创建备份', aiRole: '只在明确授权和管理员权限下辅助', guardrails: ['不得自动删除或覆盖备份'] },
]

const capabilities = [
  directWorkbench,
  ...TUTORIAL_CATALOG.map(item => ({
    ...item,
    prerequisites: TUTORIAL_PREREQUISITES[item.id] || [],
    operationComparison: TUTORIAL_OPERATION_COMPARISONS[item.id] || null,
    steps: GUIDED_TUTORIAL_STEPS[item.id] || [],
    execution: execution[item.id],
  })),
]

const payload = {
  schemaVersion: 1,
  source: '系统教程与实际操作流程',
  generatedFrom: [
    'cdp-web/src/utils/tutorialCatalog.js',
    'cdp-web/src/utils/guidedTutorialConfig.js',
    'cdp-web/src/utils/tutorialComparisons.js',
  ],
  routingRules: [
    '单个人群且不需要批量展开时使用自由搭建。',
    '多个商品ID组成同一个人群时使用类目商品行为自动拆分，节点之间取并集。',
    '同一个方案只变化一个参数、每个参数值要形成独立人群包时使用单方案参数批量。',
    '需要长期复用相同结构时先制作或复用正式方案，不要每次重新搭建。',
    '共同浏览、购买本品、购买竞品三类关联人群使用拉力方案组。',
    '多个竞品分别展开整套拉力方案时使用组合参数批量。',
    '圈包完成后需要批量取画像或横向对比时进入达摩盘取数。',
  ],
  globalExecutionPolicies: [
    'AI负责选择路径、准备参数和生成可执行预览；后端与现有功能负责最终校验和执行。',
    '任何会替换画布、批量建包或调用外部平台的操作，都必须先展示概览并由用户确认。',
    '不得把多个独立人群包错误合并成一个并集人群。',
    '不得绕过账号权限、登录状态、组件字段上限或日期限制。',
    '教程中的示例品牌、商品ID、人群包名称和日期只用于解释，不得当作用户本轮参数。',
  ],
  systemFeatures,
  capabilities,
}

await mkdir(dirname(outputPath), { recursive: true })
await writeFile(outputPath, `${JSON.stringify(payload, null, 2)}\n`, 'utf8')
console.log(`Exported ${capabilities.length} system capabilities to ${outputPath}`)
