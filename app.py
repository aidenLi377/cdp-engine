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
            self.bhv_translator[(pkg, name)] = val

            if pkg not in self.bhv_options: self.bhv_options[pkg] = []
            if name not in self.bhv_options[pkg]: self.bhv_options[pkg].append(name)

        # 2. 解析其他全局维表
        loaders = [
            ("渠道维表.csv", "渠道名称", lambda r: f"{r.get('parentId', '')}#|#{r.get('BizID', '')}"),
            ("类目维表.csv", 1, lambda r: f"{r.get('cateId', '')}#|#{r.get('cateId', '')}"),
            ("品牌维表.csv", 1, lambda r: str(r.iloc[1]).strip()),
        ]

        for fname, name_col, id_func in loaders:
            df = safe_read(fname)
            self.dimensions[fname] = []
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
                    if fname == "品牌维表.csv":
                        self.id_translator[name] = name
                        self.dimensions[fname].append(name)
                    elif val and val != "#|#":
                        self.id_translator[name] = val
                        self.dimensions[fname].append(name)
                except:
                    continue
            self.dimensions[fname] = list(dict.fromkeys(self.dimensions[fname]))

    def get_package_meta(self, package_name):
        logic_filename = self.packages.get(package_name)
        if not logic_filename or not os.path.exists(logic_filename): return {}
        try:
            try:
                logic_df = pd.read_csv(logic_filename, encoding='utf-8').set_index("行为")
            except:
                logic_df = pd.read_csv(logic_filename, encoding='gb18030').set_index("行为")
        except:
            return {}

        full_schema = []
        # 🔥 升级：直接遍历清洗后的 DataFrame，彻底摆脱 index 冲突
        for _, config in self.params_df.iterrows():
            pkg_col = config.get('Crowd_Package', '')
            if pd.isna(pkg_col): continue
            if package_name not in [p.strip() for p in str(pkg_col).split(',')]: continue

            item = config.to_dict()
            for k, v in item.items():
                if pd.isna(v): item[k] = ""

            item['key'] = config['Param_Key']
            data_source = item.get('Data_Source')
            # 🔥 精准下发：是行为表，就只下发当前包的专属动作！
            if data_source == '行为维表.csv':
                item['options'] = self.bhv_options.get(package_name, [])
            else:
                item['options'] = self.dimensions.get(data_source, [])
            is_def = str(item.get('Is_Default', '0')).strip().lower()
            item['isDefault'] = is_def in ['1', '1.0', 'true', 'yes', '是']
            full_schema.append(item)

        logic_matrix = {}
        for behavior_name, row in logic_df.iterrows():
            visible_fields = []
            for col_name, val in row.items():
                if str(val).strip() in ['1', '1.0', 'True', 'TRUE']:
                    cn = col_name.strip()
                    real_key = self.label_map.get(cn)
                    if real_key: visible_fields.append(real_key)
            logic_matrix[behavior_name] = visible_fields

        return {"schema": full_schema, "matrix": logic_matrix}

    def generate_json(self, user_data):
        current_pkg = user_data.pop('_package', '类目公域行为')

        selection_lv3 = {}
        force_check_list = ['itemprice', 'frequency', 'price']
        for k in force_check_list:
            if k not in user_data: user_data[k] = ""

        for key, raw_val in user_data.items():
            # 🔥 核心升级 2：精准定位配置行！同时匹配 Param_Key 和 Crowd_Package
            matched_rows = self.params_df[
                (self.params_df['Param_Key'] == key) &
                (self.params_df['Crowd_Package'].str.contains(current_pkg, na=False))
                ]

            # 如果没匹配到，说明是不需要发给后端的脏数据，直接跳过
            if matched_rows.empty: continue

            # 安全取出配置
            config = matched_rows.iloc[0]

            template_str = config.get('Backend_Template')
            json_path = config.get('JSON_Path')

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
                        # 🔥 终极防串台：根据当前包名+动作名，提取专属 ID
                        if key == 'bhv':
                            return self.bhv_translator.get((current_pkg, v), v)
                        return self.id_translator.get(v, v)
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

            if pd.isna(template_str) or str(template_str).strip() == "":
                if state == "isEmpty": continue
                val_to_write = vars_dict.get('val', cleaned_val)
                if key in ['channel', 'stdBrand', 'leafCates', 'bhv', 'title']:
                    if not isinstance(val_to_write, list): val_to_write = [val_to_write]
                self._merge_path(selection_lv3, json_path, val_to_write)
                continue

            try:
                strategies = json.loads(template_str)
            except:
                continue

            matched_template = None
            for strat in strategies:
                cond = strat.get('trigger') or strat.get('if')
                if cond == state: matched_template = strat.get('template'); break
                if cond in ['hasValue', 'HAS_VALUE'] and state != 'isEmpty': matched_template = strat.get(
                    'template'); break

            if matched_template:
                s = json.dumps(matched_template)
                for v_key, v_val in vars_dict.items():
                    s = s.replace(f"\"${{{v_key}}}\"", str(v_val))
                    if v_key in ['start', 'end','days']:
                        s = s.replace(f": {v_val}", f": \"{v_val}\"")
                    s = s.replace(f"${{{v_key}}}", str(v_val))
                self._merge_path(selection_lv3, json_path, json.loads(s))

        real_lv3 = selection_lv3.get('selectionLv3', selection_lv3)

        # 动态获取当前包的 Base_Template 外壳
        base_tmpl = {"selectionLv1": ["COMMON_TOUCH", "PUBLIC_CATE_BHV"]}
        try:
            pkg_rows = self.params_df[self.params_df['Crowd_Package'].str.contains(current_pkg, na=False)]
            if not pkg_rows.empty:
                tmpl_str = pkg_rows.iloc[0]['Base_Template']
                if pd.notna(tmpl_str) and str(tmpl_str).strip() != "":
                    base_tmpl = json.loads(tmpl_str)
        except Exception as e:
            print(f"解析 Base_Template 失败: {e}")

        final_payload = {
            "crowdName": "未命名",
            "list": [{"selectionLv1": base_tmpl.get("selectionLv1", []), "selectionLv3": real_lv3, "fromPoolId": 0}],
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