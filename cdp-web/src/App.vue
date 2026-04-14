<template>
  <el-config-provider :locale="zhCn">
    <div class="cdp-engine-container">

      <div style="position: absolute; top: 15px; left: 20px; z-index: 999; background: white; padding: 5px; border-radius: 6px; box-shadow: 0 2px 12px rgba(0,0,0,0.1);">
        <el-radio-group v-model="appMode" size="small">
          <el-radio-button label="normal">🖱️ 可视化点选</el-radio-button>
          <el-radio-button label="batch">🚀 矩阵装配车间</el-radio-button>
        </el-radio-group>
      </div>

      <template v-if="appMode === 'normal'">
        <div class="left-panel" style="padding-top: 60px;">
          <div class="panel-header">✨ 行为组件库</div>
          <div class="btn-group">
            <el-button v-for="pkg in availablePackages" :key="pkg" type="primary" plain @click="addNode(pkg)">
              ➕ 添加 {{ pkg }}
            </el-button>
          </div>
        </div>

        <div class="center-panel">
          <div class="panel-header">配置画布与逻辑组装</div>
          <div v-if="nodeList.length === 0" class="empty-hint">请从左侧点击添加行为组件 👉</div>

          <div class="canvas-scroll-area">
            <div v-for="(node, index) in nodeList" :key="node.id" class="node-wrapper">
              <div v-if="index > 0" class="logic-connector">
                <div class="connector-line"></div>
                <el-radio-group v-model="node.operator" size="small" class="logic-radio">
                  <el-radio-button label="n">交集 (n)</el-radio-button>
                  <el-radio-button label="u">并集 (u)</el-radio-button>
                  <el-radio-button label="d">差集 (d)</el-radio-button>
                </el-radio-group>
                <div class="connector-line"></div>
              </div>

              <el-card shadow="hover" class="behavior-card">
                <template #header>
                  <div class="card-header">
                    <span class="card-title">
                      {{ node.packageType }}
                      <el-tag size="small" type="info">节点 {{ index }}</el-tag>
                    </span>
                    <el-button type="danger" size="small" plain @click="removeNode(index)">移除此行为</el-button>
                  </div>
                </template>

                <el-form label-position="right" label-width="140px" class="dynamic-form">
                  <template v-for="field in node.schema" :key="field.key">
                    <el-form-item v-show="isVisible(field, node)">

                      <template #label>
                        <span>{{ field.Label }}</span>
                        <template v-if="getDynamicDescription(field)">
                          <el-tooltip v-if="getDynamicStyle(field) !== '文字'" :content="getDynamicDescription(field)" placement="top" effect="dark">
                            <span style="margin-left: 6px; color: #a8abb2; cursor: pointer; font-size: 14px;">ⓘ</span>
                          </el-tooltip>
                        </template>
                      </template>

                      <template v-if="field.Widget_Type === '普通输入框'">
                        <div style="display: flex; align-items: center; gap: 10px; width: 100%;">
                          <el-input v-model="node.formData[field.key]" :placeholder="`请输入${field.Label}`" style="flex: 1;"></el-input>
                          <span v-if="getDynamicDescription(field) && getDynamicStyle(field) === '文字'" style="font-size: 12px; color: #a8abb2; line-height: 1.2; flex-shrink: 0;">{{ getDynamicDescription(field) }}</span>
                        </div>
                      </template>

                      <template v-else-if="field.Widget_Type === '列表输入'">
                        <div style="display: flex; align-items: center; gap: 10px; width: 100%;">
                          <el-select v-model="node.formData[field.key]" multiple filterable allow-create default-first-option :multiple-limit="getListLimit(field, node)" :placeholder="`输入并回车创建${field.Label}`" @change="handleListInput(field.key, node)" no-data-text="💡 敲击回车或输入逗号自动炸开标签" style="flex: 1;"></el-select>
                          <span v-if="getSelectionCountHint(field, node)" style="font-size: 12px; color: #409eff; background: #ecf5ff; padding: 4px 8px; border-radius: 4px; border: 1px solid #d9ecff; white-space: nowrap;">{{ getSelectionCountHint(field, node) }}</span>
                          <span v-if="getDynamicDescription(field) && getDynamicStyle(field) === '文字'" style="font-size: 12px; color: #a8abb2; line-height: 1.2; flex-shrink: 0;">{{ getDynamicDescription(field) }}</span>
                        </div>
                      </template>

                      <template v-else-if="field.Widget_Type === '单选组'">
                        <el-radio-group v-model="node.formData[field.key]" @change="field.key === 'title_type' && $event === '任意商品标题关键字' ? node.formData.title = [] : null">
                          <el-radio label="任意商品标题关键字">任意商品标题关键字</el-radio>
                          <el-radio label="指定商品标题关键字">指定商品标题关键字</el-radio>
                        </el-radio-group>
                      </template>

                      <template v-else-if="field.Widget_Type === '搜索多选'">
                        <div style="display: flex; align-items: center; gap: 10px; width: 100%;">
                          <el-select-v2 v-model="node.formData[field.key]" :options="formatOptions(field.options)" multiple filterable clearable :reserve-keyword="false" :placeholder="`请搜索并选择${field.Label}`" style="flex: 1;" @change="handleMultiSelectChange(field.key, node)"></el-select-v2>
                          <span v-if="getSelectionCountHint(field, node)" style="font-size: 12px; color: #409eff; background: #ecf5ff; padding: 4px 8px; border-radius: 4px; border: 1px solid #d9ecff; white-space: nowrap;">{{ getSelectionCountHint(field, node) }}</span>
                          <span v-if="getDynamicDescription(field) && getDynamicStyle(field) === '文字'" style="font-size: 12px; color: #a8abb2; line-height: 1.2; flex-shrink: 0;">{{ getDynamicDescription(field) }}</span>
                        </div>
                      </template>

                      <template v-else-if="field.Widget_Type === '搜索单选'">
                        <div style="display: flex; align-items: center; gap: 10px; width: 100%;">
                          <el-select-v2 :key="['selectedGoodsType', 'shop'].includes(field.key) ? `${field.key}-${getArray(node.formData.channel).join(',')}-${node.formData.shop}` : field.key" v-model="node.formData[field.key]" :options="formatOptions(getDynamicOptions(field, node))" filterable clearable :placeholder="`请搜索并选择${field.Label}`" style="flex: 1;"></el-select-v2>
                          <span v-if="getDynamicDescription(field) && getDynamicStyle(field) === '文字'" style="font-size: 12px; color: #a8abb2; line-height: 1.2; flex-shrink: 0;">{{ getDynamicDescription(field) }}</span>
                        </div>
                      </template>

                      <template v-else-if="field.Widget_Type === '复选组'">
                        <el-checkbox-group v-model="node.formData[field.key]" class="custom-checkbox-group" @change="handleCheckboxChange(field, $event, node)">
                          <el-checkbox v-for="opt in field.options" :key="opt" :label="opt" :disabled="isCheckboxDisabled(field, opt, node)">{{ opt }}</el-checkbox>
                        </el-checkbox-group>
                      </template>

                      <template v-else-if="field.Widget_Type === '数值_切换'">
                        <div class="range-switch-container" style="display: flex; align-items: center; gap: 15px;">
                          <el-radio-group v-model="node.modeData[field.key]" size="small" class="mode-switch">
                            <el-radio-button label="unlimited">不限</el-radio-button>
                            <el-radio-button label="min">大于等于</el-radio-button>
                            <el-radio-button label="range">自定义区间</el-radio-button>
                          </el-radio-group>
                          <div class="range-inputs" v-if="node.modeData[field.key] !== 'unlimited'" style="display: flex; align-items: center; gap: 10px;">
                            <el-input-number v-model="node.formData[field.key].min" :min="0" :controls="false" placeholder="最小值" size="small" style="width: 100px;"></el-input-number>
                            <span v-if="node.modeData[field.key] === 'range'" class="separator">-</span>
                            <el-input-number v-if="node.modeData[field.key] === 'range'" v-model="node.formData[field.key].max" :min="0" :controls="false" placeholder="最大值" size="small" style="width: 100px;"></el-input-number>
                          </div>
                        </div>
                      </template>

                      <template v-else-if="field.Widget_Type === '日期_切换'">
                        <div style="display: flex; gap: 15px; align-items: center; width: 100%;">
                          <el-radio-group v-model="node.modeData[field.key]" size="small" style="flex-shrink: 0;">
                            <el-radio-button label="recent">过去 N 天</el-radio-button>
                            <el-radio-button label="range">固定日期</el-radio-button>
                          </el-radio-group>
                          <div v-if="node.modeData[field.key] === 'recent'" style="display: flex; align-items: center; gap: 10px;">
                            <el-input-number v-model="node.formData[field.key].days" :min="1" :max="366" size="small" controls-position="right" style="width: 120px;"></el-input-number>
                            <span style="color: #606266; font-size: 14px; white-space: nowrap;">天</span>
                            <span style="color: #a8abb2; font-size: 12px; margin-left: 8px; white-space: nowrap;">(最多向前追溯 366 天)</span>
                          </div>
                          <div v-if="node.modeData[field.key] === 'range'" style="display: flex; align-items: center; gap: 15px;">
                            <el-date-picker v-model="node.formData[field.key].dateRange" type="daterange" range-separator="至" start-placeholder="开始日期" end-placeholder="结束日期" format="YYYY-MM-DD" value-format="YYYYMMDD" size="small" style="width: 260px;" :disabled-date="(time) => disabledDate(time, node)" @calendar-change="(val) => handleCalendarChange(val, node)"></el-date-picker>
                            <span style="color: #a8abb2; font-size: 12px; white-space: nowrap;">{{ getExactDateRangeHint(node) }}</span>
                          </div>
                        </div>
                      </template>

                    </el-form-item>
                  </template>
                </el-form>
              </el-card>
            </div>
          </div>
        </div>

        <div class="right-panel">
          <div style="padding: 15px; background: #343a46; border-radius: 8px; margin-bottom: 15px; border: 1px solid #454c59;">
            <div style="color: #61afef; margin-bottom: 10px; font-weight: bold; font-size: 14px;">🏷️ 人群包名称</div>
            <el-input v-model="crowdNameInput" placeholder="请输入人群包名称" size="small" clearable></el-input>
          </div>
          <div class="json-header">
            <span>实时计算 JSON (调用原生后端)</span>
            <div style="display: flex; gap: 10px;">
              <el-button type="success" size="small" plain @click="copyJson">一键复制</el-button>
              <el-button type="warning" size="small" plain @click="goToDataBank">去圈人 👉</el-button>
            </div>
          </div>
          <pre class="json-code">{{ JSON.stringify(generatedJson, null, 4) }}</pre>
        </div>
      </template>

      <template v-else-if="appMode === 'batch'">
        <div class="batch-workspace">

          <div class="batch-header">
            <div class="title-area">
              <h2>🚀 矩阵式批量装配车间</h2>
              <p>点击下方模块可修改并自动复制底层的 JSON 结构，下游结果会自动响应全链路拼装。</p>
            </div>
            <div class="action-area">
              <el-button type="success" plain class="glass-header-btn" @click="fetchTemplates">
                <el-icon><Download /></el-icon> 获取标准模板
              </el-button>
            </div>
          </div>

          <div class="pipeline-scroll-area" :class="{'is-centered': pipeline.length === 1}">

            <template v-for="(item, index) in pipeline" :key="item.id">
              <div class="glass-card template-card">
                <div class="card-header">
                  <span class="card-title">条件模版 {{ index + 1 }}</span>
                  <el-button v-if="pipeline.length > 1" type="danger" link @click="removePipelineItem(index)">
                    <el-icon><Delete/></el-icon>
                  </el-button>
                </div>

                <div class="card-upload-area">
                  <el-button type="primary" plain size="large" class="upload-btn" @click="triggerPipelineUpload(index)" :loading="item.loading">
                    {{ item.fileName || '📁 点击投喂 CSV 数据' }}
                  </el-button>
                  <transition name="el-fade-in">
                    <div v-if="item.results.length > 0" class="upload-success-text">
                      <el-icon><CircleCheckFilled /></el-icon> 成功挂载 {{ item.results.length }} 行
                    </div>
                  </transition>
                </div>

                <div class="card-list-area">
                  <div v-for="(res, rIdx) in item.results" :key="rIdx" class="list-item" @click="handleItemClick(res, index, rIdx, false)" title="点击自动复制 JSON 并打开编辑面板">
                    <span class="item-index">[{{ rIdx + 1 }}]</span>
                    <span class="item-name">{{ res.crowdName }}</span>
                  </div>

                  <div v-if="item.results.length === 0" class="empty-state">
                    <div class="empty-icon">📦</div>
                    等待投喂该节点数据...
                  </div>
                </div>
              </div>

              <div v-if="index < pipeline.length - 1" class="connector operator-connector">
                <div class="dashed-line"></div>
                <el-select v-model="item.operator" class="operator-select">
                  <el-option label="交集" value="n"></el-option>
                  <el-option label="并集" value="u"></el-option>
                  <el-option label="差集" value="d"></el-option>
                </el-select>
                <div class="dashed-line"></div>
              </div>
            </template>

            <div class="connector plus-connector">
              <div class="dashed-line"></div>
              <el-button circle class="plus-btn" @click="addPipelineItem">
                <el-icon><Plus /></el-icon>
              </el-button>
              <div v-if="pipeline.length > 1" class="dashed-line"></div>
            </div>

            <transition name="fade-slide">
              <div v-if="pipeline.length > 1" class="glass-card final-card">
                <div class="card-header final-header">
                  <span class="card-title final-title">
                    📊 最终拼装产物 ({{ batchResults.length }} 个)
                  </span>
                </div>

                <div class="final-name-area">
                  <div class="name-label">
                    <el-icon><EditPen /></el-icon> Excel 批量命名区：
                  </div>
                  <el-input type="textarea" v-model="customNamesStr" :rows="2" placeholder="粘贴 Excel 人群包名称，每行一个" class="glass-input"></el-input>
                </div>

                <div class="card-list-area final-list-area">
                  <div v-if="batchResults.length === 0" class="empty-state">
                    <el-icon class="large-icon"><Cpu /></el-icon>
                    全栈矩阵拼装中...<br/>请确保左侧模版已完成投喂
                  </div>

                  <div v-for="(res, idx) in batchResults" :key="idx" class="list-item final-list-item" @click="handleItemClick(res, -1, idx, true)" title="点击自动复制完整 JSON">
                    <span class="final-badge">{{ idx + 1 }}</span>
                    <span class="item-name">{{ res.crowdName }}</span>
                  </div>
                </div>
              </div>
            </transition>

          </div>

          <input type="file" accept=".csv,.xlsx" ref="batchFileRef" style="display: none" @change="handlePipelineFileUpload">

          <el-dialog v-model="showTemplateDialog" title="📥 下载 CDP 标准模板" width="680px" center>
            <div style="padding: 0 20px;">
              <div style="border-bottom: 1px solid #ebeef5; padding-bottom: 15px; margin-bottom: 15px; display: flex; justify-content: space-between; align-items: center;">
                <el-checkbox v-model="checkAll" :indeterminate="isIndeterminate" @change="handleCheckAllChange">
                  <span style="font-weight: bold; color: #303133;">全选所有模板</span>
                </el-checkbox>
                <span style="font-size: 12px; color: #909399;">已选择 {{ selectedTemplates.length }} 个模板</span>
              </div>
              <div style="max-height: 400px; overflow-y: auto;">
                <el-checkbox-group v-model="selectedTemplates" @change="handleCheckedTemplatesChange">
                  <div style="display: grid; grid-template-columns: repeat(2, 1fr); gap: 12px;">
                    <div v-for="name in templateList" :key="name" style="padding: 10px; border: 1px solid #f0f2f5; border-radius: 6px; transition: all 0.3s;" :style="{ background: selectedTemplates.includes(name) ? '#f0f9eb' : '#fff', borderColor: selectedTemplates.includes(name) ? '#b3e19d' : '#f0f2f5' }">
                      <el-checkbox :label="name"><span style="font-size: 13px; color: #606266;">📄 {{ name }}</span></el-checkbox>
                    </div>
                  </div>
                </el-checkbox-group>
              </div>
            </div>
            <template #footer>
              <div style="display: flex; justify-content: center; gap: 15px;">
                <el-button @click="showTemplateDialog = false">取 消</el-button>
                <el-button type="success" :disabled="selectedTemplates.length === 0" @click="handleBatchDownload">确认选择并下载 ({{ selectedTemplates.length }})</el-button>
              </div>
            </template>
          </el-dialog>

          <el-drawer v-model="drawerVisible" :title="drawerIsFinal ? '🔍 查看融合产物底层源码' : '⚙️ 配置参数 (预设参数 + 完美回显)'" size="480px" :destroy-on-close="true">
            <div style="padding: 0 20px; display: flex; flex-direction: column; height: 100%;">
              <div style="margin-bottom: 20px; padding: 12px; background: #f4f4f5; border-radius: 6px; font-size: 12px; color: #606266; border-left: 4px solid #409eff;">
                <span v-if="drawerIsFinal">🔒 <b>只读模式</b>：这是多个节点融合的最终计算结果。如需修改，请点击左侧对应卡片调整源头参数。</span>
                <span v-else>💡 <b>1:1 完美回显</b>：已为您加载与「点选模式」完全相同的配置画布，并绑定了您的预设参数。修改后将自动重新生成底层参数。</span>
              </div>

              <div style="flex: 1; overflow-y: auto; padding-right: 10px;" v-if="visualEditForm && visualEditForm.schema && !drawerIsFinal">
                <div style="margin-bottom: 15px;">
                  <div style="font-size: 13px; font-weight: bold; color: #303133; margin-bottom: 8px;">人群包自定义名称：</div>
                  <el-input v-model="visualEditForm.crowdName"></el-input>
                </div>

                <div class="dynamic-form" style="background: #fff; border: 1px solid #ebeef5; border-radius: 8px; padding: 20px; box-shadow: 0 2px 12px rgba(0,0,0,0.02);">
                  <div style="font-size: 14px; font-weight: bold; color: #409eff; margin-bottom: 20px; border-bottom: 1px dashed #ebeef5; padding-bottom: 10px; display: flex; align-items: center; gap: 8px;">
                    ✨ 业务组件：{{ visualEditForm.packageType }}
                  </div>

                  <el-form label-position="top" size="small">
                    <template v-for="field in visualEditForm.schema" :key="field.key">
                      <el-form-item v-show="isVisible(field, visualEditForm)">

                        <template #label>
                          <span>{{ field.Label }}</span>
                          <template v-if="getDynamicDescription(field)">
                            <el-tooltip v-if="getDynamicStyle(field) !== '文字'" :content="getDynamicDescription(field)" placement="top" effect="dark">
                              <span style="margin-left: 6px; color: #a8abb2; cursor: pointer; font-size: 14px;">ⓘ</span>
                            </el-tooltip>
                          </template>
                        </template>

                        <template v-if="field.Widget_Type === '普通输入框'">
                          <div style="display: flex; align-items: center; gap: 10px; width: 100%;">
                            <el-input v-model="visualEditForm.formData[field.key]" :placeholder="`请输入${field.Label}`" style="flex: 1;"></el-input>
                            <span v-if="getDynamicDescription(field) && getDynamicStyle(field) === '文字'" style="font-size: 12px; color: #a8abb2; line-height: 1.2; flex-shrink: 0;">{{ getDynamicDescription(field) }}</span>
                          </div>
                        </template>

                        <template v-else-if="field.Widget_Type === '列表输入'">
                          <div style="display: flex; align-items: center; gap: 10px; width: 100%;">
                            <el-select v-model="visualEditForm.formData[field.key]" multiple filterable allow-create default-first-option :multiple-limit="getListLimit(field, visualEditForm)" :placeholder="`输入并回车创建${field.Label}`" @change="handleListInput(field.key, visualEditForm)" no-data-text="💡 敲击回车或输入逗号自动炸开标签" style="flex: 1;"></el-select>
                            <span v-if="getSelectionCountHint(field, visualEditForm)" style="font-size: 12px; color: #409eff; background: #ecf5ff; padding: 4px 8px; border-radius: 4px; border: 1px solid #d9ecff; white-space: nowrap;">{{ getSelectionCountHint(field, visualEditForm) }}</span>
                            <span v-if="getDynamicDescription(field) && getDynamicStyle(field) === '文字'" style="font-size: 12px; color: #a8abb2; line-height: 1.2; flex-shrink: 0;">{{ getDynamicDescription(field) }}</span>
                          </div>
                        </template>

                        <template v-else-if="field.Widget_Type === '单选组'">
                          <el-radio-group v-model="visualEditForm.formData[field.key]" @change="field.key === 'title_type' && $event === '任意商品标题关键字' ? visualEditForm.formData.title = [] : null">
                            <el-radio label="任意商品标题关键字">任意商品标题关键字</el-radio>
                            <el-radio label="指定商品标题关键字">指定商品标题关键字</el-radio>
                          </el-radio-group>
                        </template>

                        <template v-else-if="field.Widget_Type === '搜索多选'">
                          <div style="display: flex; align-items: center; gap: 10px; width: 100%;">
                            <el-select-v2 v-model="visualEditForm.formData[field.key]" :options="formatOptions(field.options)" multiple filterable clearable :reserve-keyword="false" :placeholder="`请搜索并选择${field.Label}`" style="flex: 1;" @change="handleMultiSelectChange(field.key, visualEditForm)"></el-select-v2>
                            <span v-if="getSelectionCountHint(field, visualEditForm)" style="font-size: 12px; color: #409eff; background: #ecf5ff; padding: 4px 8px; border-radius: 4px; border: 1px solid #d9ecff; white-space: nowrap;">{{ getSelectionCountHint(field, visualEditForm) }}</span>
                            <span v-if="getDynamicDescription(field) && getDynamicStyle(field) === '文字'" style="font-size: 12px; color: #a8abb2; line-height: 1.2; flex-shrink: 0;">{{ getDynamicDescription(field) }}</span>
                          </div>
                        </template>

                        <template v-else-if="field.Widget_Type === '搜索单选'">
                          <div style="display: flex; align-items: center; gap: 10px; width: 100%;">
                            <el-select-v2 :key="['selectedGoodsType', 'shop'].includes(field.key) ? `${field.key}-${getArray(visualEditForm.formData.channel).join(',')}-${visualEditForm.formData.shop}` : field.key" v-model="visualEditForm.formData[field.key]" :options="formatOptions(getDynamicOptions(field, visualEditForm))" filterable clearable :placeholder="`请搜索并选择${field.Label}`" style="flex: 1;"></el-select-v2>
                            <span v-if="getDynamicDescription(field) && getDynamicStyle(field) === '文字'" style="font-size: 12px; color: #a8abb2; line-height: 1.2; flex-shrink: 0;">{{ getDynamicDescription(field) }}</span>
                          </div>
                        </template>

                        <template v-else-if="field.Widget_Type === '复选组'">
                          <el-checkbox-group v-model="visualEditForm.formData[field.key]" class="custom-checkbox-group" @change="handleCheckboxChange(field, $event, visualEditForm)">
                            <el-checkbox v-for="opt in field.options" :key="opt" :label="opt" :disabled="isCheckboxDisabled(field, opt, visualEditForm)">{{ opt }}</el-checkbox>
                          </el-checkbox-group>
                        </template>

                        <template v-else-if="field.Widget_Type === '数值_切换'">
                          <div class="range-switch-container" style="display: flex; align-items: center; gap: 15px;">
                            <el-radio-group v-model="visualEditForm.modeData[field.key]" size="small" class="mode-switch">
                              <el-radio-button label="unlimited">不限</el-radio-button>
                              <el-radio-button label="min">大于等于</el-radio-button>
                              <el-radio-button label="range">自定义区间</el-radio-button>
                            </el-radio-group>
                            <div class="range-inputs" v-if="visualEditForm.modeData[field.key] !== 'unlimited'" style="display: flex; align-items: center; gap: 10px;">
                              <el-input-number v-model="visualEditForm.formData[field.key].min" :min="0" :controls="false" placeholder="最小值" size="small" style="width: 100px;"></el-input-number>
                              <span v-if="visualEditForm.modeData[field.key] === 'range'" class="separator">-</span>
                              <el-input-number v-if="visualEditForm.modeData[field.key] === 'range'" v-model="visualEditForm.formData[field.key].max" :min="0" :controls="false" placeholder="最大值" size="small" style="width: 100px;"></el-input-number>
                            </div>
                          </div>
                        </template>

                        <template v-else-if="field.Widget_Type === '日期_切换'">
                          <div style="display: flex; gap: 15px; align-items: center; width: 100%;">
                            <el-radio-group v-model="visualEditForm.modeData[field.key]" size="small" style="flex-shrink: 0;">
                              <el-radio-button label="recent">过去 N 天</el-radio-button>
                              <el-radio-button label="range">固定日期</el-radio-button>
                            </el-radio-group>
                            <div v-if="visualEditForm.modeData[field.key] === 'recent'" style="display: flex; align-items: center; gap: 10px;">
                              <el-input-number v-model="visualEditForm.formData[field.key].days" :min="1" :max="366" size="small" controls-position="right" style="width: 120px;"></el-input-number>
                              <span style="color: #606266; font-size: 14px; white-space: nowrap;">天</span>
                              <span style="color: #a8abb2; font-size: 12px; margin-left: 8px; white-space: nowrap;">(最多向前追溯 366 天)</span>
                            </div>
                            <div v-if="visualEditForm.modeData[field.key] === 'range'" style="display: flex; align-items: center; gap: 15px;">
                              <el-date-picker v-model="visualEditForm.formData[field.key].dateRange" type="daterange" range-separator="至" start-placeholder="开始日期" end-placeholder="结束日期" format="YYYY-MM-DD" value-format="YYYYMMDD" size="small" style="width: 260px;" :disabled-date="(time) => disabledDate(time, visualEditForm)" @calendar-change="(val) => handleCalendarChange(val, visualEditForm)"></el-date-picker>
                              <span style="color: #a8abb2; font-size: 12px; white-space: nowrap;">{{ getExactDateRangeHint(visualEditForm) }}</span>
                            </div>
                          </div>
                        </template>

                      </el-form-item>
                    </template>
                  </el-form>
                </div>
              </div>

              <div style="flex: 1; overflow-y: auto; padding-right: 10px;" v-else-if="visualEditForm && visualEditForm.isMerged">
                <el-input type="textarea" :rows="22" :value="JSON.stringify(visualEditForm.rawList, null, 2)" readonly style="font-family: Consolas, monospace; font-size: 13px;"></el-input>
              </div>

              <div v-else style="flex:1; display: flex; flex-direction: column; justify-content: center; align-items: center; color: #909399;">
                 <div style="font-size: 28px; margin-bottom: 15px;">⏳</div>
                 <div>正在装载组件引擎，反向还原画布结构...</div>
              </div>

              <div style="margin-top: 15px; display: flex; justify-content: flex-end; gap: 12px; padding-top: 20px; border-top: 1px solid #ebeef5; padding-bottom: 20px;">
                <el-button @click="drawerVisible = false">关 闭</el-button>
                <el-button type="primary" v-if="!drawerIsFinal" @click="saveVisualEditor">💾 保存并重组节点</el-button>
              </div>
            </div>
          </el-drawer>

        </div>
      </template>

    </div>
  </el-config-provider>
</template>

<script setup>
import { ref, watch, onMounted } from 'vue'
import zhCn from 'element-plus/es/locale/lang/zh-cn'
import { Plus, CircleCheckFilled, EditPen, Cpu, Download, Delete } from '@element-plus/icons-vue'
import { ElMessage, ElLoading } from 'element-plus'

const appMode = ref('normal')
const templateList = ref([])
const availablePackages = ref([])
const schemaCache = ref({})
const logicMatrixCache = ref({})
const nodeList = ref([])
const crowdNameInput = ref('未命名')

const loadPackages = async () => {
  try {
    const res = await fetch('http://127.0.0.1:5000/api/packages')
    availablePackages.value = await res.json()
  } catch (e) {
    console.error("加载包名失败", e)
  }
}

const addNode = async (pkgType) => {
  let schema = schemaCache.value[pkgType]
  let logicMatrix = logicMatrixCache.value[pkgType]

  if (!schema) {
    try {
      const res = await fetch(`http://127.0.0.1:5000/api/meta/${pkgType}`)
      const resData = await res.json()
      schema = resData.schema || []
      logicMatrix = resData.matrix || {}
      schemaCache.value[pkgType] = schema
      logicMatrixCache.value[pkgType] = logicMatrix
    } catch (e) {
      console.error("加载配置失败:", e)
      return
    }
  }

  const initData = {}
  const initModeData = {}

  schema.forEach(field => {
    if (field.Widget_Type === '搜索单选') {
      initData[field.key] = ''
    } else if (['搜索多选', '复选组', '下拉多选'].includes(field.Widget_Type) || ['bhv', 'channel', 'leafCates', 'stdBrand'].includes(field.key)) {
      initData[field.key] = []
    } else if (field.Widget_Type === '单选组') {
      initData[field.key] = '任意商品标题关键字'
    } else if (field.Widget_Type === '数值_切换') {
      initModeData[field.key] = 'unlimited'
      initData[field.key] = { min: null, max: null }
    } else if (field.Widget_Type === '日期_切换') {
      initModeData[field.key] = 'recent'
      initData[field.key] = { days: 30, dateRange: [] }
    } else {
      initData[field.key] = ''
    }
  })

  if (pkgType === 'AIPL状态') {
    if (initData.cate !== undefined) {
      initData.cate = Array.isArray(initData.cate) ? ['全部'] : '全部'
    }
  }
  if (pkgType === '商品行为') {
    if (initData.cate !== undefined) {
      initData.cate = Array.isArray(initData.cate) ? ['全部'] : '全部'
    }
    if (initData.leafCates !== undefined) {
      initData.leafCates = Array.isArray(initData.leafCates) ? ['全部'] : '全部'
    }
  }

  nodeList.value.push({
    id: Date.now() + Math.random(),
    packageType: pkgType,
    schema: schema,
    logicMatrix: logicMatrix,
    formData: initData,
    modeData: initModeData,
    operator: nodeList.value.length === 0 ? null : 'n',
    selectedFirstDate: null
  })
}

const removeNode = (index) => {
  nodeList.value.splice(index, 1)
  if (nodeList.value.length > 0) nodeList.value[0].operator = null
}

const getArray = (val) => Array.isArray(val) ? val : (val ? [val] : [])

const isVisible = (field, node) => {
  if (field.key === 'item' && node.packageType === '商品行为') {
    return node.formData.selectedGoodsType === '指定商品ID';
  }

  if ((field.key === 'title_type' || field.key === 'keywords_type') && ['类目公域行为', '商品行为'].includes(node.packageType)) {
    const hasCate = getArray(node.formData.leafCates).length > 0 || getArray(node.formData.cate).length > 0;
    if (!hasCate) return false;
  }

  if ((field.key === 'title' || field.key === 'keywords') && ['类目公域行为', '商品行为'].includes(node.packageType)) {
    const switchVal = node.formData.title_type || node.formData.keywords_type;
    if (switchVal !== '指定商品标题关键字') return false;
  }

  if (field.isDefault) return true

  const matrixKeys = Object.keys(node.logicMatrix || {})
  if (matrixKeys.length === 0) return false

  const is2D = matrixKeys.some(k => k.includes('|'))
  let triggerCombinations = []

  if (is2D) {
    const channels = getArray(node.formData['channel'])
    const behaviors = getArray(node.formData['bhv'])

    if (channels.length === 0 || behaviors.length === 0) return false

    for (const ch of channels) {
      for (const bhv of behaviors) {
        triggerCombinations.push(`${ch}|${bhv}`)
      }
    }
  } else {
    if (matrixKeys.includes('DEFAULT')) {
      triggerCombinations = ['DEFAULT'];
    } else {
      triggerCombinations = getArray(node.formData['bhv']).length > 0
        ? getArray(node.formData['bhv'])
        : getArray(node.formData['types'])
    }
    if (triggerCombinations.length === 0) return false
  }

  for (const comboKey of triggerCombinations) {
    const visibleFields = (node.logicMatrix || {})[comboKey] || []
    if (!visibleFields.includes(field.key)) {
      return false
    }
  }
  return true
}

const isCheckboxDisabled = (field, opt, node) => {
  if (field.key === 'channel') {
    const selectedVals = node.formData[field.key] || [];
    if (selectedVals.includes('所有销售渠道')) {
      return opt !== '所有销售渠道';
    }
  }
  return false;
}

const handleCheckboxChange = (field, currentVals, node) => {
  if (field.key === 'channel') {
    if (currentVals.includes('所有销售渠道')) {
      if (currentVals.length > 1) {
        node.formData[field.key] = ['所有销售渠道'];
      }
    }
  }
}

const getDynamicStyle = (field) => field.Description_Style;
const getDynamicDescription = (field) => field.Widget_Type === '日期_切换' ? "" : field.Description;

const getSelectionCountHint = (field, node) => {
  if (['搜索多选', '列表输入', '复选组'].includes(field.Widget_Type)) {
    if (['channel', 'bhv'].includes(field.key)) return null;
    const vals = node.formData[field.key];
    if (Array.isArray(vals) && vals.length > 0) {
      if (field.Widget_Type === '列表输入') {
        if (['title', 'keywords'].includes(field.key) || field.Label.includes('商品标题关键词')) {
          if (node.packageType === '类目公域行为') return `已输入 ${vals.length}/10`;
          if (node.packageType === '商品行为') return `已输入 ${vals.length}/5`;
        }
        if (['itemId', 'itemIds'].includes(field.key) || field.Label.includes('商品ID')) {
          if (node.packageType === '商品行为') return `已输入 ${vals.length}/50`;
        }
        return `已输入 ${vals.length} 个`;
      }
      const isLimited = ['leafCates', 'stdBrand', 'cate'].includes(field.key) || field.Label.includes('类目') || field.Label.includes('品牌');
      return isLimited ? `已选 ${vals.length}/10` : `已选 ${vals.length}`;
    }
  }
  return null;
}

const getListLimit = (field, node) => {
  if (field.Widget_Type === '列表输入') {
    if (['title', 'keywords'].includes(field.key) || field.Label.includes('商品标题关键词')) {
      if (node.packageType === '类目公域行为') return 10;
      if (node.packageType === '商品行为') return 5;
    }
    if (['itemId', 'itemIds'].includes(field.key) || field.Label.includes('商品ID')) {
      if (node.packageType === '商品行为') return 50;
    }
  }
  return 0;
}

const handleListInput = (key, node) => {
  const currentVal = node.formData[key];
  if (Array.isArray(currentVal)) {
    const finalArr = [];
    currentVal.forEach(item => {
      if (item.includes(',')) finalArr.push(...item.split(',').filter(i => i.trim() !== ''));
      else finalArr.push(item);
    });
    node.formData[key] = [...new Set(finalArr)];
  }
}

const handleMultiSelectChange = (key, node) => {
  const vals = node.formData[key];
  if (Array.isArray(vals) && vals.length > 1 && vals.includes('全部')) {
    if (vals[vals.length - 1] === '全部') node.formData[key] = ['全部'];
    else node.formData[key] = vals.filter(v => v !== '全部');
  }
};

const formatOptions = (options) => {
  if (!options) return []
  if (options.length > 0 && typeof options[0] === 'object') return options
  return options.map(opt => ({ value: opt, label: String(opt) }))
}

const getDynamicOptions = (field, node) => {
  if (node.packageType !== '商品行为') return field.options || [];

  const channels = getArray(node.formData.channel);

  if (field.key === 'shop') {
    const isTmall = channels.includes('天猫');
    if (!isTmall) return ['全淘宝天猫'];
    return field.options || [];
  }

  if (field.key === 'selectedGoodsType') {
    const isTmallGlobal = channels.includes('天猫国际直营');
    if ((node.formData.shop === '全淘宝天猫' || !node.formData.shop) && !isTmallGlobal) {
      return ['任意品牌商品'];
    } else {
      return field.options || [];
    }
  }

  return field.options || [];
}

const formatDate = (date) => {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
};

const getExactDateRangeHint = (node) => {
  const behaviors = getArray(node.formData.bhv)
  const isCategoryPackage = node.packageType === '类目公域行为';
  const isOnlyPurchase = behaviors.includes('购买') && behaviors.length === 1;
  const isTwoYears = isCategoryPackage && isOnlyPurchase;

  const today = new Date();
  const minDate = new Date();
  if (isTwoYears) minDate.setFullYear(minDate.getFullYear() - 2);
  else minDate.setDate(minDate.getDate() - 366);

  return `可选范围：${formatDate(minDate)} 至 ${formatDate(today)} (最大跨度366天)`;
};

const handleCalendarChange = (val, node) => {
  if (val && val.length === 2 && val[0] && !val[1]) {
    let dateObj = val[0];
    if (typeof dateObj === 'string' && dateObj.length === 8 && !dateObj.includes('-')) {
      const y = dateObj.substring(0, 4), m = dateObj.substring(4, 6), d = dateObj.substring(6, 8);
      dateObj = new Date(`${y}-${m}-${d}`);
    } else if (typeof dateObj === 'string') {
      dateObj = new Date(dateObj);
    }
    node.selectedFirstDate = dateObj;
  } else {
    node.selectedFirstDate = null;
  }
}

const disabledDate = (time, node) => {
  const behaviors = getArray(node.formData.bhv)
  const isCategoryPackage = node.packageType === '类目公域行为';
  const isOnlyPurchase = behaviors.includes('购买') && behaviors.length === 1;
  const isTwoYears = isCategoryPackage && isOnlyPurchase;

  const today = new Date()
  today.setHours(23, 59, 59, 999)
  const minDate = new Date()

  if (isTwoYears) minDate.setFullYear(minDate.getFullYear() - 2)
  else minDate.setDate(minDate.getDate() - 366)
  minDate.setHours(0, 0, 0, 0)

  if (time.getTime() > today.getTime() || time.getTime() < minDate.getTime()) return true
  if (node.selectedFirstDate) {
    const oneDay = 24 * 3600 * 1000
    const diffDays = Math.abs((time.getTime() - node.selectedFirstDate.getTime()) / oneDay)
    if (diffDays > 366) return true
  }
  return false
}

const generatedJson = ref({ crowdName: "未命名", list: [], compute: "" })
let jsonTimer = null

watch([nodeList, crowdNameInput], ([newNodes]) => {
  newNodes.forEach(node => {
    if (node.packageType !== '商品行为') return;
    const channels = getArray(node.formData.channel);
    const isTmallGlobal = channels.includes('天猫国际直营');
    const isTmall = channels.includes('天猫');
    const currentShop = node.formData.shop;

    if (!isTmall && currentShop !== '全淘宝天猫') {
      node.formData.shop = '全淘宝天猫';
    }
    const latestShop = node.formData.shop;
    if ((latestShop === '全淘宝天猫' || !latestShop) && !isTmallGlobal) {
      if (node.formData.selectedGoodsType !== '任意品牌商品') {
        node.formData.selectedGoodsType = '任意品牌商品';
      }
      if (node.formData.item && node.formData.item.length > 0) {
        node.formData.item = [];
      }
    }
  });

  clearTimeout(jsonTimer)
  jsonTimer = setTimeout(async () => {
    await buildFinalJson()
  }, 300)
}, { deep: true })

const buildFinalJson = async () => {
  if (nodeList.value.length === 0) {
    generatedJson.value = { crowdName: "未命名", list: [], compute: "" }
    return
  }

  const newList = []
  let computeStr = "(0)"

  for (let i = 0; i < nodeList.value.length; i++) {
    const node = nodeList.value[i]
    const payload = { _package: node.packageType }

    node.schema.forEach(f => {
      if (!isVisible(f, node)) return

      let k = f.key
      if (['搜索多选', '复选组', '多选下拉', '下拉多选', '列表输入'].includes(f.Widget_Type) || ['bhv', 'channel', 'leafCates', 'stdBrand', 'cate', 'title', 'keywords'].includes(k)) {
        if (node.formData[k] && node.formData[k].length > 0) payload[k] = node.formData[k]
      } else if (f.Widget_Type === '数值_切换') {
        const mode = node.modeData[k]
        if (mode === 'unlimited') payload[k] = { min: "", max: "" }
        else if (mode === 'min') payload[k] = { min: node.formData[k].min, max: "" }
        else if (mode === 'range') payload[k] = { min: node.formData[k].min, max: node.formData[k].max }
      } else if (f.Widget_Type === '日期_切换') {
        const mode = node.modeData[k]
        if (mode === 'recent') {
          payload[k] = { val: { days: node.formData[k].days }, min: "recent" }
        } else {
          const range = node.formData[k].dateRange
          if (range && range.length === 2) {
            payload[k] = { val: { start: range[0], end: range[1] }, min: "range" }
          }
        }
      } else {
        if (node.formData[k] !== undefined && node.formData[k] !== '') {
          payload[k] = node.formData[k]
        }
      }
    })

    try {
      const res = await fetch(`http://127.0.0.1:5000/api/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      })
      const nodeJson = await res.json()

      if (nodeJson && nodeJson.list && nodeJson.list.length > 0) {
        const baseTmpl = nodeJson.list[0]
        baseTmpl.fromPoolId = i
        if (i > 0) {
          baseTmpl.op = "INIT"
          computeStr += `${node.operator}(${i})`
        }
        newList.push(baseTmpl)
      }
    } catch (e) {
      console.error('JSON 引擎翻译失败，请检查后端是否开启', e)
    }
  }

  generatedJson.value = {
    crowdName: crowdNameInput.value,
    list: newList,
    compute: computeStr
  }
}

onMounted(() => {
  loadPackages()
})

const copyJson = async () => {
  try {
    const jsonString = JSON.stringify(generatedJson.value, null, 4)
    await navigator.clipboard.writeText(jsonString)
    ElMessage.success('JSON 已成功复制到剪贴板！')
  } catch (err) {
    ElMessage.error('复制失败，请手动选择复制')
    console.error('复制失败:', err)
  }
}

const goToDataBank = () => {
  window.open('https://databank.tmall.com/#/userDefinedAnalyses', '_blank')
}

const batchFileRef = ref(null)
const batchResults = ref([])
const showTemplateDialog = ref(false)

const selectedTemplates = ref([])
const checkAll = ref(false)
const isIndeterminate = ref(false)

const pipeline = ref([
  { id: Date.now(), results: [], fileName: '', operator: 'n', loading: false }
])

const activePipelineIndex = ref(null)
const customNamesStr = ref('')
let autoCalcTimer = null

const drawerVisible = ref(false)
const drawerIsFinal = ref(false)
const currentEditContext = ref(null)
const visualEditForm = ref(null)

// 🔴 [新增功能] 一键无感复制，提升极客效率
const handleItemClick = async (res, pIdx, rIdx, isFinal) => {
  try {
    const copyTarget = isFinal ? res : res.list; // 根据需求决定复制外层还是底层
    await navigator.clipboard.writeText(JSON.stringify(copyTarget, null, 2));
    ElMessage({
      message: '✨ 底层 JSON 已自动提取并复制至剪贴板',
      type: 'success',
      duration: 2500,
      offset: 60
    });
  } catch (err) {
    console.warn('浏览器不支持自动复制', err);
  }
  // 继续执行打开抽屉回显的逻辑
  openEditDrawer(res, pIdx, rIdx, isFinal);
}

const openEditDrawer = async (nodeData, pIdx, rIdx, isFinal = false) => {
  drawerIsFinal.value = isFinal
  currentEditContext.value = { pIdx, rIdx }

  if (isFinal || !nodeData.pkgName) {
    visualEditForm.value = { isMerged: true, rawList: nodeData.list, crowdName: nodeData.crowdName }
    drawerVisible.value = true
    return
  }

  visualEditForm.value = null
  drawerVisible.value = true

  try {
    let schemaObj = {}
    let matrixObj = {}

    if (schemaCache.value[nodeData.pkgName]) {
      schemaObj = schemaCache.value[nodeData.pkgName]
      matrixObj = logicMatrixCache.value[nodeData.pkgName]
    } else {
      const res = await fetch(`http://127.0.0.1:5000/api/package_meta?name=${nodeData.pkgName}`)
      if (!res.ok) throw new Error("404");
      const data = await res.json()
      schemaObj = data.schema
      matrixObj = data.matrix
      schemaCache.value[nodeData.pkgName] = schemaObj
      logicMatrixCache.value[nodeData.pkgName] = matrixObj
    }

    const mappedParams = JSON.parse(JSON.stringify(nodeData.localParams || {}))
    const formData = {}
    const modeData = {}

    schemaObj.forEach(field => {
      const k = field.key;
      const rawVal = mappedParams[k];

      if (field.Widget_Type === '数值_切换') {
        if (!rawVal || (rawVal.min === "" && rawVal.max === "")) {
          modeData[k] = 'unlimited';
          formData[k] = { min: null, max: null };
        } else if (rawVal.max === "" || rawVal.max === null) {
           modeData[k] = 'min';
           formData[k] = { min: rawVal.min, max: null };
        } else {
           modeData[k] = 'range';
           formData[k] = { min: rawVal.min, max: rawVal.max };
        }
      } else if (field.Widget_Type === '日期_切换') {
        if (rawVal && rawVal.min === 'recent') {
           modeData[k] = 'recent';
           formData[k] = { days: rawVal.val.days, dateRange: [] };
        } else if (rawVal && rawVal.min === 'range') {
           modeData[k] = 'range';
           formData[k] = { days: 30, dateRange: [rawVal.val.start, rawVal.val.end] };
        } else {
           modeData[k] = 'recent';
           formData[k] = { days: 30, dateRange: [] };
        }
      } else {
        if (rawVal !== undefined) {
           formData[k] = rawVal;
        } else {
           if (field.Widget_Type === '搜索单选') formData[k] = '';
           else if (['搜索多选', '复选组', '下拉多选'].includes(field.Widget_Type) || ['bhv', 'channel', 'leafCates', 'stdBrand'].includes(k)) formData[k] = [];
           else if (field.Widget_Type === '单选组') formData[k] = '任意商品标题关键字';
           else formData[k] = '';
        }
      }
    });

    visualEditForm.value = {
      packageType: nodeData.pkgName,
      schema: schemaObj,
      logicMatrix: matrixObj,
      formData: formData,
      modeData: modeData,
      crowdName: nodeData.crowdName,
      rawList: nodeData.list,
      isMerged: false,
      selectedFirstDate: null
    }
  } catch (err) {
    ElMessage.error("组件加载失败，请检查网络或后端引擎配置！")
  }
}

const saveVisualEditor = async () => {
  try {
    const payload = {}
    visualEditForm.value.schema.forEach(f => {
      if (!isVisible(f, visualEditForm.value)) return
      let k = f.key
      if (['搜索多选', '复选组', '多选下拉', '下拉多选', '列表输入'].includes(f.Widget_Type) || ['bhv', 'channel', 'leafCates', 'stdBrand', 'cate', 'title', 'keywords'].includes(k)) {
        if (visualEditForm.value.formData[k] && visualEditForm.value.formData[k].length > 0) payload[k] = visualEditForm.value.formData[k]
      } else if (f.Widget_Type === '数值_切换') {
        const mode = visualEditForm.value.modeData[k]
        if (mode === 'unlimited') payload[k] = { min: "", max: "" }
        else if (mode === 'min') payload[k] = { min: visualEditForm.value.formData[k].min, max: "" }
        else if (mode === 'range') payload[k] = { min: visualEditForm.value.formData[k].min, max: visualEditForm.value.formData[k].max }
      } else if (f.Widget_Type === '日期_切换') {
        const mode = visualEditForm.value.modeData[k]
        if (mode === 'recent') {
          payload[k] = { val: { days: visualEditForm.value.formData[k].days }, min: "recent" }
        } else {
          const range = visualEditForm.value.formData[k].dateRange
          if (range && range.length === 2) {
            payload[k] = { val: { start: range[0], end: range[1] }, min: "range" }
          }
        }
      } else {
        if (visualEditForm.value.formData[k] !== undefined && visualEditForm.value.formData[k] !== '') {
          payload[k] = visualEditForm.value.formData[k]
        }
      }
    })

    const res = await fetch(`http://127.0.0.1:5000/api/generate_json`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        pkgName: visualEditForm.value.packageType,
        params: payload
      })
    })

    const data = await res.json()
    if (data.error) throw new Error(data.error)

    const { pIdx, rIdx } = currentEditContext.value
    pipeline.value[pIdx].results[rIdx].list = data.list
    pipeline.value[pIdx].results[rIdx].crowdName = visualEditForm.value.crowdName
    pipeline.value[pIdx].results[rIdx].localParams = payload

    ElMessage.success('💾 参数修改成功！流水线产物已重组完毕。')
    drawerVisible.value = false
  } catch (e) {
    ElMessage.error(`重构节点失败: ${e.message}`)
  }
}

watch([pipeline, customNamesStr], () => {
  clearTimeout(autoCalcTimer)
  autoCalcTimer = setTimeout(() => {
    generateBatchMatrix()
  }, 300)
}, { deep: true })

const addPipelineItem = () => {
  pipeline.value.push({ id: Date.now(), results: [], fileName: '', operator: 'n', loading: false })
}
const removePipelineItem = (index) => {
  pipeline.value.splice(index, 1)
}
const triggerPipelineUpload = (index) => {
  activePipelineIndex.value = index
  if (batchFileRef.value) batchFileRef.value.click()
}

const handlePipelineFileUpload = async (event) => {
  const file = event.target.files[0]
  if (!file || activePipelineIndex.value === null) return

  const item = pipeline.value[activePipelineIndex.value]
  item.loading = true
  item.fileName = file.name

  const formData = new FormData()
  formData.append('file', file)

  try {
    const res = await fetch(`http://127.0.0.1:5000/api/batch_generate`, { method: 'POST', body: formData })
    if (!res.ok) {
      const err = await res.json()
      throw new Error(err.error || '解析失败')
    }
    const data = await res.json()
    item.results = data.results || []
    ElMessage.success(`✅ 模版 ${activePipelineIndex.value + 1} 投喂成功！`)
  } catch (error) {
    ElMessage.error(`投喂失败: ${error.message}`)
    item.fileName = ''
  } finally {
    item.loading = false
    if (batchFileRef.value) batchFileRef.value.value = ''
  }
}

const generateBatchMatrix = () => {
  const maxRows = Math.max(...pipeline.value.map(p => p.results.length))
  if (maxRows === 0) {
    batchResults.value = []
    return
  }

  const customNamesArr = customNamesStr.value.split('\n').map(s => s.trim())
  const assemblingResults = []

  for (let r = 0; r < maxRows; r++) {
    const validNodesWithOps = []

    pipeline.value.forEach((pipeNode) => {
      const rowData = pipeNode.results[r]
      if (!rowData || !rowData.list || !rowData.list[0]) return
      const baseNode = JSON.parse(JSON.stringify(rowData.list[0]))
      if (baseNode.selectionLv3 && Object.keys(baseNode.selectionLv3).length === 0) return
      validNodesWithOps.push({
        node: baseNode,
        operatorAfter: pipeNode.operator,
        sourceName: rowData.crowdName
      })
    })

    if (validNodesWithOps.length > 0) {
      const currentLineNodes = []
      let computeStr = "(0)"
      let finalName = customNamesArr[r] || (validNodesWithOps[0].sourceName + (validNodesWithOps.length > 1 ? '_矩阵融合' : ''))

      validNodesWithOps.forEach((item, index) => {
        const node = item.node
        node.fromPoolId = index
        if (index > 0) node.op = "INIT"
        currentLineNodes.push(node)
        if (index < validNodesWithOps.length - 1) {
          computeStr += `${item.operatorAfter}(${index + 1})`
        }
      })

      assemblingResults.push({
        crowdName: finalName,
        list: currentLineNodes,
        compute: computeStr
      })
    }
  }

  batchResults.value = assemblingResults
}

const fetchTemplates = async () => {
  try {
    const res = await fetch('http://127.0.0.1:5000/api/list_templates')
    templateList.value = await res.json()
    if (templateList.value.length === 0) {
      ElMessage.warning('未在模板目录下找到任何文件')
    } else {
      showTemplateDialog.value = true
    }
  } catch (e) {
    ElMessage.error("获取模板列表失败，请检查 Python 后端")
  }
}

const handleCheckAllChange = (val) => {
  selectedTemplates.value = val ? [...templateList.value] : []
  isIndeterminate.value = false
}

const handleCheckedTemplatesChange = (value) => {
  const checkedCount = value.length
  checkAll.value = checkedCount === templateList.value.length
  isIndeterminate.value = checkedCount > 0 && checkedCount < templateList.value.length
}

const handleBatchDownload = async () => {
  if (selectedTemplates.value.length === 0) return
  ElMessage.success(`正在为您顺序触发 ${selectedTemplates.value.length} 个模板的下载...`)

  selectedTemplates.value.forEach((filename, index) => {
    setTimeout(() => {
      const downloadUrl = `http://127.0.0.1:5000/api/download_template/${filename}`
      const link = document.createElement('a')
      link.style.display = 'none'
      link.href = downloadUrl
      link.setAttribute('download', filename)
      document.body.appendChild(link)
      link.click()
      document.body.removeChild(link)
    }, index * 500)
  })

  setTimeout(() => {
    showTemplateDialog.value = false
    selectedTemplates.value = []
    checkAll.value = false
    isIndeterminate.value = false
  }, selectedTemplates.value.length * 500 + 500)
}
</script>

<style scoped>
/* ========================================================= */
/* 原生可视化点选模式的样式保留区 */
/* ========================================================= */
.cdp-engine-container { display: flex; height: 100vh; width: 100vw; background-color: #f5f7fa; overflow: hidden; font-family: 'Helvetica Neue', Helvetica, 'PingFang SC', 'Hiragino Sans GB', 'Microsoft YaHei', Arial, sans-serif; }
.panel-header { font-size: 16px; font-weight: 600; color: #303133; margin-bottom: 20px; border-bottom: 2px solid #ebeef5; padding-bottom: 10px; }
.left-panel { width: 250px; background: #ffffff; padding: 20px; box-shadow: 2px 0 8px rgba(0, 0, 0, 0.05); z-index: 10; display: flex; flex-direction: column; }
.btn-group { display: flex; flex-direction: column; gap: 15px; overflow-y: auto; }
.btn-group .el-button { margin-left: 0; }
.center-panel { flex: 1; display: flex; flex-direction: column; padding: 20px 30px; overflow: hidden; }
.canvas-scroll-area { flex: 1; overflow-y: auto; padding-right: 10px; }
.empty-hint { text-align: center; color: #909399; font-size: 16px; margin-top: 100px; }
.node-wrapper { margin-bottom: 20px; animation: fadeIn 0.3s ease-in-out; }
.behavior-card { border-radius: 8px; border: 1px solid #ebeef5; background: white; }
.card-header { display: flex; justify-content: space-between; align-items: center; }
.dynamic-form { padding-top: 15px; }
.logic-connector { display: flex; flex-direction: column; align-items: center; margin: -5px 0 15px 0; }
.connector-line { width: 2px; height: 20px; background-color: #dcdfe6; }
.logic-radio { box-shadow: 0 2px 12px 0 rgba(0, 0, 0, 0.1); border-radius: 4px; }
.right-panel { width: 450px; background: #282c34; padding: 20px; box-shadow: -2px 0 8px rgba(0, 0, 0, 0.1); display: flex; flex-direction: column; }
.json-header { padding-bottom: 10px; border-bottom: 1px solid #181a1f; margin-bottom: 15px; color: #61afef; font-weight: bold; display: flex; justify-content: space-between; align-items: center; }
.json-code { flex: 1; color: #abb2bf; font-family: 'Fira Code', Consolas, Monaco, monospace; font-size: 13px; line-height: 1.5; overflow-y: auto; white-space: pre-wrap; word-wrap: break-word; background: #21252b; padding: 15px; border-radius: 6px; border: 1px solid #181a1f; }
@keyframes fadeIn { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: translateY(0); } }

/* ========================================================= */
/* 🚀 矩阵装配车间专属样式 (大厂科技毛玻璃流体风) */
/* ========================================================= */
.batch-workspace {
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
  background: linear-gradient(135deg, #f3f5f8 0%, #e6e9f0 100%);
  padding-top: 15px;
}

.batch-header {
  padding: 20px 40px 20px 240px;
  display: flex;
  justify-content: space-between;
  align-items: center;
  z-index: 10;
}
.batch-header h2 {
  margin: 0 0 6px;
  color: #2c3e50;
  font-size: 22px;
  font-weight: 600;
  letter-spacing: 0.5px;
}
.batch-header p {
  color: #7f8c8d;
  font-size: 13px;
  margin: 0;
}
.glass-header-btn {
  background: rgba(255, 255, 255, 0.8) !important;
  backdrop-filter: blur(8px);
  border: 1px solid rgba(0, 0, 0, 0.05) !important;
  box-shadow: 0 4px 15px rgba(0, 0, 0, 0.05);
  border-radius: 8px;
}

/* --- 流体水平轨道体系 --- */
.pipeline-scroll-area {
  flex: 1;
  padding: 20px 40px 40px;
  overflow-x: auto;
  display: flex;
  align-items: center;
  gap: 0;
  position: relative;
  transition: justify-content 0.4s ease;
}
/* 单节点一键居中沉浸式布局 */
.pipeline-scroll-area.is-centered {
  justify-content: center;
}

/* --- 统一毛玻璃卡片体系 --- */
.glass-card {
  background: rgba(255, 255, 255, 0.65);
  backdrop-filter: blur(16px);
  -webkit-backdrop-filter: blur(16px);
  border: 1px solid rgba(255, 255, 255, 0.8);
  box-shadow: 0 10px 30px rgba(0, 0, 0, 0.04), inset 0 1px 0 rgba(255, 255, 255, 0.6);
  border-radius: 16px;
  display: flex;
  flex-direction: column;
  flex-shrink: 0;
  transition: all 0.3s cubic-bezier(0.25, 0.8, 0.25, 1);
}
.template-card {
  width: 300px;
  height: 620px;
}
.final-card {
  width: 400px;
  height: 620px;
  background: rgba(246, 253, 250, 0.65);
  border: 1px solid rgba(163, 222, 195, 0.6);
  box-shadow: 0 12px 35px rgba(50, 150, 100, 0.06), inset 0 1px 0 rgba(255, 255, 255, 0.8);
}

/* --- 卡片组件切分 --- */
.card-header {
  height: 58px;
  padding: 0 20px;
  display: flex;
  justify-content: space-between;
  align-items: center;
  background: linear-gradient(to bottom, rgba(255,255,255,0.9), rgba(255,255,255,0.4));
  border-bottom: 1px solid rgba(0,0,0,0.03);
  border-radius: 16px 16px 0 0;
  flex-shrink: 0;
}
.final-header {
  background: linear-gradient(to bottom, rgba(235,250,242,0.9), rgba(242,252,246,0.4));
  border-bottom: 1px solid rgba(163, 222, 195, 0.3);
}
.card-title {
  font-weight: 600;
  font-size: 15px;
  color: #34495e;
  letter-spacing: 0.5px;
}
.final-title {
  color: #27ae60;
  display: flex;
  align-items: center;
  gap: 8px;
}

.card-upload-area {
  padding: 18px 20px;
  text-align: center;
  border-bottom: 1px dashed rgba(0,0,0,0.06);
  flex-shrink: 0;
}
.upload-btn {
  width: 100%;
  border-radius: 10px;
  border-style: dashed !important;
  background: rgba(255,255,255,0.5) !important;
  transition: all 0.3s;
}
.upload-btn:hover {
  background: rgba(255,255,255,0.9) !important;
  border-color: #409eff !important;
  box-shadow: 0 4px 12px rgba(64,158,255,0.1);
}
.upload-success-text {
  font-size: 12px;
  color: #67c23a;
  font-weight: 500;
  display: inline-flex;
  align-items: center;
  gap: 4px;
  margin-top: 8px;
}

.card-list-area {
  flex: 1;
  overflow-y: auto;
  padding: 16px;
  border-radius: 0 0 16px 16px;
}

/* --- 列表项交互 (悬浮抬起微动效) --- */
.list-item {
  padding: 12px 14px;
  background: rgba(255,255,255,0.6);
  border: 1px solid rgba(0,0,0,0.03);
  border-radius: 10px;
  margin-bottom: 10px;
  font-size: 13px;
  color: #475669;
  cursor: pointer;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  box-shadow: 0 2px 8px rgba(0,0,0,0.01);
  transition: all 0.25s cubic-bezier(0.25, 0.8, 0.25, 1);
  display: flex;
  align-items: center;
}
.list-item:hover {
  background: #ffffff;
  transform: translateY(-2px);
  box-shadow: 0 6px 16px rgba(0,0,0,0.06);
  border-color: rgba(64, 158, 255, 0.3);
  color: #409eff;
}
.item-index {
  color: #a8abb2;
  margin-right: 8px;
  font-family: Consolas, monospace;
  font-size: 12px;
}
.item-name {
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
}

/* 产物列表独立风格 */
.final-list-item {
  background: #ffffff;
  border-color: rgba(163, 222, 195, 0.4);
  color: #27ae60;
}
.final-list-item:hover {
  border-color: #67c23a;
  color: #67c23a;
  box-shadow: 0 6px 16px rgba(103, 194, 58, 0.12);
}
.final-badge {
  background: rgba(235, 250, 242, 1);
  color: #27ae60;
  padding: 3px 8px;
  border-radius: 12px;
  font-weight: 600;
  margin-right: 12px;
  font-size: 12px;
}

.final-name-area {
  padding: 14px 20px;
  border-bottom: 1px dashed rgba(163, 222, 195, 0.4);
  background: rgba(255,255,255,0.4);
  flex-shrink: 0;
}
.name-label {
  font-size: 13px;
  color: #5c626a;
  margin-bottom: 8px;
  font-weight: 500;
  display: flex;
  align-items: center;
  gap: 6px;
}
.glass-input :deep(.el-textarea__inner) {
  background: rgba(255,255,255,0.7);
  backdrop-filter: blur(4px);
  border: 1px solid rgba(0,0,0,0.06);
  border-radius: 8px;
  box-shadow: inset 0 2px 4px rgba(0,0,0,0.02);
}

/* --- 连接器 (操作符与节点线) --- */
.connector {
  display: flex;
  align-items: center;
  flex-shrink: 0;
}
.operator-connector { width: 110px; }
.plus-connector { width: 130px; }

.dashed-line {
  flex: 1;
  height: 1px;
  border-top: 2px dashed rgba(144, 154, 164, 0.35);
}

.operator-select {
  width: 80px;
  margin: 0 6px;
}
.operator-select :deep(.el-input__wrapper) {
  background: rgba(255,255,255,0.85);
  backdrop-filter: blur(8px);
  border: 1px solid rgba(0,0,0,0.06);
  border-radius: 20px;
  box-shadow: 0 4px 12px rgba(0,0,0,0.04);
}
.operator-select :deep(.el-input__inner) {
  text-align: center;
  font-weight: 500;
  color: #34495e;
}

.plus-btn {
  background: rgba(255,255,255,0.9);
  backdrop-filter: blur(8px);
  border: 1px solid rgba(0,0,0,0.08);
  box-shadow: 0 6px 16px rgba(0,0,0,0.05);
  transition: all 0.3s;
  width: 44px;
  height: 44px;
  font-size: 20px;
  color: #7f8c8d;
  margin: 0 8px;
}
.plus-btn:hover {
  transform: scale(1.15) rotate(90deg);
  background: #ffffff;
  border-color: rgba(64,158,255,0.4);
  color: #409eff;
  box-shadow: 0 8px 24px rgba(64,158,255,0.15);
}

/* 空状态 */
.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  height: 100%;
  color: #909399;
  font-size: 13px;
  gap: 12px;
  text-align: center;
}
.empty-icon { font-size: 28px; opacity: 0.5; }
.large-icon { font-size: 36px; color: #dcdfe6; }

/* --- 动态滑入动画 --- */
.fade-slide-enter-active, .fade-slide-leave-active {
  transition: all 0.5s cubic-bezier(0.25, 0.8, 0.25, 1);
}
.fade-slide-enter-from, .fade-slide-leave-to {
  opacity: 0;
  transform: translateX(30px);
}
</style>