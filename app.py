# app.py (全自动扫描引擎版 - 强化抗压版)
from flask import Flask, jsonify, request
from flask_cors import CORS
import pandas as pd
import json
import re
import os
import glob

app = Flask(__name__)
CORS(app)


class ConfigEngine:
    def __init__(self):
        try:
            self.params_df = pd.read_csv("1.参数表.csv", encoding='gb18030')
        except:
            self.params_df = pd.read_csv("1.参数表.csv", encoding='utf-8')

        # 清洗列名
        self.params_df.columns = [c.strip() for c in self.params_df.columns]

        # 🔥 核心升级 1：全局除尘器！清洗掉所有 Excel 里不小心敲进去的空格
        for col in self.params_df.columns:
            if self.params_df[col].dtype == 'object':
                self.params_df[col] = self.params_df[col].apply(lambda x: str(x).strip() if pd.notna(x) else x)

        self.packages = {}
        logic_files = glob.glob("*_逻辑表.csv")
        for f in logic_files:
            base_name = f.split('_逻辑表')[0]
            pkg_name = re.sub(r'^\d+\.', '', base_name)
            self.packages[pkg_name] = f

        print(f"✅ 系统启动！成功发现并注册了 {len(self.packages)} 个行为包：", list(self.packages.keys()))

        self.label_map = {}
        for _, row in self.params_df.iterrows():
            if pd.notna(row['Label']):
                cn_name = str(row['Label']).strip()
                # 使用当前行的 Param_Key
                eng_key = str(row['Param_Key']).strip()
                self.label_map[cn_name] = eng_key
                if "关键词" in cn_name: self.label_map[cn_name.replace("关键词", "关键字")] = eng_key

        self.id_translator = {}
        self.dimensions = {}
        self._load_special_dimensions()

    def _load_special_dimensions(self):
        def safe_read(filename):
            if not os.path.exists(filename): return pd.DataFrame()
            try:
                try:
                    df = pd.read_csv(filename, encoding='utf-8')
                except:
                    df = pd.read_csv(filename, encoding='gb18030')
                return df.where(pd.notnull(df), "")
            except:
                return pd.DataFrame()

        self.bhv_translator = {}  # 🔥 升维：(包名, 行为名) -> ID
        self.bhv_options = {}  # 🔥 隔离：每个包各自的下拉选项

        # 1. 独立解析行为维表，开启包隔离
        df_bhv = safe_read("行为维表.csv")
        for _, row in df_bhv.iterrows():
            pkg = str(row.get('适用的包', '')).strip()
            name = str(row.get('行为名称', '')).strip()
            val = f"{row.get('ID', '')}#|#{row.get('Value', '')}"
            if not name or not pkg: continue

            # 双重秘钥锁定
            if pkg and name:
                # 🔥 获取适用的渠道
                channel_name = str(row.get('适用的渠道', 'ALL')).strip()

                # 💡 世纪 BUG 修复：如果 Excel 里是空单元格，Python 会读成 '' 或 'nan'，需要强制归一化为 'ALL'
                if not channel_name or channel_name.lower() == 'nan':
                    channel_name = 'ALL'

                # 🔥 升级为三维锁定：(包名, 渠道名, 行为名) -> ID
                self.bhv_translator[(pkg, channel_name, name)] = val

            if pkg not in self.bhv_options: self.bhv_options[pkg] = []
            if name not in self.bhv_options[pkg]: self.bhv_options[pkg].append(name)

        self.dim_translator = {}  # 🔥 新增：建立高维隔离字典
        self.attr_options = {}  # 🔥 新增：维度表的专属包隔离选项库

        # 2. 解析其他全局维表

        # 2. 解析其他全局维表
        loaders = [
            ("渠道维表.csv", "渠道名称", lambda r: f"{r.get('parentId', '')}#|#{r.get('BizID', '')}"),
            ("类目维表.csv", 1, lambda r: f"{r.get('cateId', '')}#|#{r.get('cateId', '')}"),
            ("品牌维表.csv", 1, lambda r: str(r.iloc[1]).strip()),
            ("状态维表.csv", "状态名称", lambda r: f"{r.get('ID', '')}#|#{r.get('Value', '')}"),
            ("商品类型维表.csv", "类型名称", lambda r: str(r.get('ID', '')).strip()),
            ("账号维表.csv", "账号名称", lambda r: str(r.get('ID', '')).strip()),
            ("属性值维表.csv", "属性值名称", lambda r: str(r.get('ID', '')).strip()),
        ]

        for fname, name_col, id_func in loaders:
            df = safe_read(fname)
            self.dimensions[fname] = []
            has_pkg = '适用的包' in df.columns  # 💡 动态探测这个表有没有“适用的包”这一列

            for _, row in df.iterrows():
                try:
                    if isinstance(name_col, int):
                        if name_col < len(row):
                            name = str(row.iloc[name_col]).strip()
                        else:
                            continue
                    else:
                        name = str(row.get(name_col, '')).strip()

                    if not name: continue
                    val = id_func(row)

                    pkg_val = str(row.get('适用的包', '')).strip() if has_pkg else ""

                    if fname == "品牌维表.csv":
                        self.id_translator[name] = name
                        self.dimensions[fname].append(name)
                    elif val and val != "#|#":
                        self.id_translator[name] = val  # 兜底全局映射
                        if has_pkg and pkg_val:
                            # 🔥 核心隔离！把 (包名, 名字) 映射为专属 ID
                            self.dim_translator[(pkg_val, name)] = val

                            # 🔥 新增：把选项加入到各自包的专属列表中，防止串台
                            if (pkg_val, fname) not in self.attr_options:
                                self.attr_options[(pkg_val, fname)] = []
                            if name not in self.attr_options[(pkg_val, fname)]:
                                self.attr_options[(pkg_val, fname)].append(name)

                        self.dimensions[fname].append(name)
                except:
                    continue
            self.dimensions[fname] = list(dict.fromkeys(self.dimensions[fname]))

    def get_package_meta(self, package_name):
        logic_filename = self.packages.get(package_name)
        if not logic_filename or not os.path.exists(logic_filename): return {}

        # --- 1. 读取参数配置表生成骨架 ---
        # --- 1. 读取参数配置表生成骨架 ---
        full_schema = []
        current_label_map = {}  # 🔥 新增：当前包专属的名称翻译字典

        for _, config in self.params_df.iterrows():
            pkg_col = config.get('Crowd_Package', '')
            if pd.isna(pkg_col): continue
            if package_name not in [p.strip() for p in str(pkg_col).split(',')]: continue

            # 🔥 新增：只为当前选中的包建立映射，防止“商品行为”覆盖“类目公域行为”
            if pd.notna(config.get('Label')):
                cn_name = str(config.get('Label')).strip()
                eng_key = str(config.get('Param_Key')).strip()
                current_label_map[cn_name] = eng_key
                if "关键词" in cn_name:
                    current_label_map[cn_name.replace("关键词", "关键字")] = eng_key

            item = config.to_dict()
            for k, v in item.items():
                if pd.isna(v): item[k] = ""

            item['key'] = config['Param_Key']
            data_source = item.get('Data_Source')
            # 精准下发专属动作
            if data_source == '行为维表.csv':
                item['options'] = self.bhv_options.get(package_name, [])
            else:
                # 🔥 升级：优先从专属隔离库里拿选项，完美解决“购买力”里混入“男/女”的问题
                item['options'] = self.attr_options.get((package_name, data_source),
                                                        self.dimensions.get(data_source, []))
            # 🎯 防弹版解析：强行干掉 .0 尾巴以及任何隐形空格，确保 1 绝对生效
            is_def_raw = str(item.get('Is_Default', '0')).strip().lower()
            is_def_clean = is_def_raw.replace('.0', '')
            item['isDefault'] = is_def_clean in ['1', 'true', 'yes', '是']
            full_schema.append(item)

        # --- 2. 逻辑表解析 (V1.3 终极多维靶向雷达) ---
        logic_matrix = {}
        try:
            try:
                temp_df = pd.read_csv(logic_filename, encoding='utf-8')
            except:
                temp_df = pd.read_csv(logic_filename, encoding='gb18030')

            trigger_cols = []
            # 强制设定维度的拼接顺序：渠道在前，行为/状态在后
            for expected in ['渠道', '行为', '状态']:
                for col in temp_df.columns:
                    if col.strip() == expected:
                        # 💡 智能嗅探：第一行是 1 或 1.0 的，是被控制的靶子，绝不是触发器！
                        first_val = str(temp_df[col].dropna().iloc[0]).strip() if not temp_df[
                            col].dropna().empty else ""
                        if first_val not in ['1', '1.0', 'True', 'TRUE']:
                            trigger_cols.append(col.strip())

            # 兜底：如果啥也没匹配上，抓第一列
            if not trigger_cols: trigger_cols = [temp_df.columns[0]]

            for _, row in temp_df.iterrows():
                # 拼接多维主键 (如 "天猫国际|浏览" 或一维的 "购买")
                key_parts = [str(row[c]).strip() for c in trigger_cols]
                composite_key = "|".join(key_parts)

                visible_fields = []
                for col_name, val in row.items():
                    if col_name.strip() not in trigger_cols:
                        if str(val).strip() in ['1', '1.0', 'True', 'TRUE', 'true']:
                            cn = col_name.strip()
                            # 🎯 核心修复：如果逻辑表头直接写了英文变量名（如 attributes），也必须无条件识别并放行！
                            real_key = current_label_map.get(cn, cn)
                            if real_key: visible_fields.append(real_key)
                logic_matrix[composite_key] = visible_fields
        except Exception as e:
            print(f"🚨 逻辑表读取异常: {e}")

        return {"schema": full_schema, "matrix": logic_matrix}

    def generate_json(self, user_data):
        current_pkg = user_data.pop('_package', '类目公域行为')

        selection_lv3 = {}

        # 🔥 核心原则落实：绝对信任前端发来的 user_data！
        # 页面显示什么参数前端就发什么，页面隐藏的参数绝对不强行兜底补全！

        for key, raw_val in user_data.items():

            # 精确匹配当前包的配置
            matched_rows = self.params_df[
                (self.params_df['Param_Key'] == key) &
                (self.params_df['Crowd_Package'].apply(
                    lambda x: current_pkg in [p.strip() for p in str(x).split(',') if pd.notna(x)]))
                ]
            if matched_rows.empty: continue

            config = matched_rows.iloc[0]
            template_str = config.get('Backend_Template')
            json_path = config.get('JSON_Path')

            if pd.isna(json_path): continue

            cleaned_val = raw_val
            vars_dict = {}
            state = "hasValue"

            if isinstance(raw_val, dict) and 'val' in raw_val:
                cleaned_val = raw_val['val']
                if isinstance(cleaned_val, dict): vars_dict.update(cleaned_val)
            if isinstance(raw_val, dict) and raw_val.get('min') in ['recent', 'range']:
                state = raw_val.get('min')
                if isinstance(raw_val.get('val'), dict):
                    temp_val = raw_val['val'].copy()
                    if 'days' in temp_val: temp_val['days'] = str(temp_val['days'])
                    vars_dict.update(temp_val)
            elif isinstance(raw_val, dict) and ('min' in raw_val or 'max' in raw_val):
                def safe_num(x):
                    if x is None or str(x).strip() == "": return ""
                    try:
                        return int(x)
                    except:
                        try:
                            return float(x)
                        except:
                            return ""

                min_v = safe_num(raw_val.get('min'))
                max_v = safe_num(raw_val.get('max'))
                if min_v != "": vars_dict['min'] = min_v
                if max_v != "": vars_dict['max'] = max_v

                if min_v == "" and max_v == "":
                    state = "isEmpty"
                elif min_v != "" and max_v == "":
                    state = "min_only"
                elif min_v == "" and max_v != "":
                    state = "max_only"
                else:
                    state = "range"
            elif cleaned_val == "" or cleaned_val is None or cleaned_val == []:
                state = "isEmpty"

            if state != "isEmpty":
                def translate(v):
                    if isinstance(v, list): return [translate(x) for x in v]
                    if isinstance(v, str):
                        if key == 'bhv':
                            # 🔥 新增：提取当前选择的渠道名（比如'天猫'），去查三维字典
                            current_channel = user_data.get('channel', ['ALL'])
                            # 兼容单选字符串或多选数组格式
                            ch_name = current_channel[0] if isinstance(current_channel,
                                                                       list) and current_channel else current_channel
                            if not ch_name:
                                ch_name = 'ALL'

                            # 🔥 优先查带渠道的专属ID（天猫->16709），查不到就退回到 ALL（所有渠道->16712）
                            return self.bhv_translator.get((current_pkg, str(ch_name), v),
                                                           self.bhv_translator.get((current_pkg, 'ALL', v), v))

                        return self.dim_translator.get((current_pkg, v), self.id_translator.get(v, v))
                    return v

                final_val = translate(cleaned_val)

                if isinstance(final_val, dict):
                    temp = final_val.copy()
                    for k, v in temp.items():
                        if isinstance(v, str) and re.match(r'\d{4}-\d{2}-\d{2}', v):
                            temp[k] = v.replace('-', '')
                    final_val = temp

                if isinstance(final_val, (str, int, float, list)): vars_dict['val'] = final_val
                if not vars_dict and final_val: vars_dict['val'] = final_val

            # 🔥 修复：识别 "-", 空白，nan，直接塞值。防崩溃类型强转
            if pd.isna(template_str) or str(template_str).strip() in ["", "-", "nan"]:
                if state == "isEmpty": continue
                val_to_write = vars_dict.get('val', cleaned_val)
                if key in ['channel', 'stdBrand', 'leafCates', 'bhv', 'title', 'types', 'keywords']:
                    if not isinstance(val_to_write, list): val_to_write = [val_to_write]
                self._merge_path(selection_lv3, str(json_path).strip(), val_to_write)
                continue

            try:
                strategies = json.loads(template_str)
                if isinstance(strategies, dict):
                    strategies = [strategies]
                elif not isinstance(strategies, list):
                    continue
            except:
                continue

            matched_template = None
            for strat in strategies:
                cond = strat.get('trigger') or strat.get('if')
                if cond == state: matched_template = strat.get('template'); break
                if cond in ['hasValue', 'HAS_VALUE'] and state != 'isEmpty': matched_template = strat.get(
                    'template'); break

            if not matched_template:
                for strat in strategies:
                    if strat.get('trigger') in ['default', 'DEFAULT']:
                        matched_template = strat.get('template');
                        break

            if matched_template:
                s = json.dumps(matched_template)
                for v_key, v_val in vars_dict.items():
                    # 🎯 核心修复：如果替换的是一个数组(复选框多选)，必须用 json.dumps 转换，防止 Python 单引号破坏 JSON 结构！
                    val_str = json.dumps(v_val, ensure_ascii=False) if isinstance(v_val, (list, dict)) else str(v_val)

                    s = s.replace(f"\"${{{v_key}}}\"", val_str)
                    if v_key in ['start', 'end', 'days']:
                        s = s.replace(f": {val_str}", f": \"{val_str}\"")
                    s = s.replace(f"${{{v_key}}}", val_str)
                try:
                    self._merge_path(selection_lv3, str(json_path).strip(), json.loads(s))
                except Exception as e:
                    print(f"合并路径报错: {e}")

        # 获取外壳
        base_tmpl = {}
        try:
            pkg_rows = self.params_df[self.params_df['Crowd_Package'].apply(
                lambda x: current_pkg in [p.strip() for p in str(x).split(',') if pd.notna(x)])]
            if not pkg_rows.empty:
                tmpl_str = pkg_rows.iloc[0]['Base_Template']
                if pd.notna(tmpl_str) and str(tmpl_str).strip() != "":
                    base_tmpl = json.loads(tmpl_str)
        except Exception as e:
            print(f"解析 Base_Template 失败: {e}")

        # 智能动态融合 (不丢失任何层级)
        for k, v in selection_lv3.items():
            if k in base_tmpl and isinstance(base_tmpl[k], dict) and isinstance(v, dict):
                self._deep_update(base_tmpl[k], v)
            else:
                base_tmpl[k] = v

        if "selectionLv3" not in base_tmpl:
            base_tmpl["selectionLv3"] = {}

        # 🔥 最稳妥的打包写法，兼容所有老版本系统，永不死机
        base_tmpl["fromPoolId"] = 0
        # 🔥 新增：捕获前端发来的渠道中文名，原样回显到外壳上
        if 'channel' in user_data:
            channel_val = user_data['channel']
            base_tmpl["selectionLv2Name"] = channel_val[0] if isinstance(channel_val, list) and channel_val else str(
                channel_val)

        final_payload = {
            "crowdName": "未命名",
            "list": [base_tmpl],
            "compute": "(0)"
        }
        return final_payload

    def _merge_path(self, doc, path, val):
        keys = path.split('.')
        curr = doc
        for k in keys[:-1]: curr = curr.setdefault(k, {})
        target = keys[-1]
        if target in curr and isinstance(curr[target], dict) and isinstance(val, dict):
            self._deep_update(curr[target], val)
        else:
            curr[target] = val

    def _deep_update(self, target, source):
        for k, v in source.items():
            if k in target and isinstance(target[k], dict) and isinstance(v, dict):
                self._deep_update(target[k], v)
            else:
                target[k] = v


engine = ConfigEngine()


@app.route('/api/packages')
def get_packages():
    return jsonify(list(engine.packages.keys()))


@app.route('/api/meta/<package_name>')
def get_package_meta(package_name):
    return jsonify(engine.get_package_meta(package_name))


@app.route('/api/generate', methods=['POST'])
def generate():
    return jsonify(engine.generate_json(request.json))


if __name__ == '__main__':
    app.run(debug=True, port=5000)