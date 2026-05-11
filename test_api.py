"""
本地自测脚本 — 验证 app.py 改动后所有 API 正常工作
运行方式: .venv\Scripts\python test_api.py
"""
import os
import sys
import json

# 设置环境为 development (模拟本地开发)
os.environ['FLASK_ENV'] = 'development'

# 导入 app
from app import app, engine, IS_PRODUCTION

def run_tests():
    errors = []
    with app.test_client() as client:
        print("=" * 60)
        print("CDP_Project API 自测")
        print("=" * 60)

        # ── 测试 1: 环境检测 ──
        assert IS_PRODUCTION == False, f"IS_PRODUCTION 应为 False"
        print(f"✅ 测试 1: 环境检测 — IS_PRODUCTION=False (开发模式)")

        # ── 测试 2: 健康检查 ──
        r = client.get('/api/health')
        data = r.get_json()
        assert r.status_code == 200, f"健康检查 HTTP {r.status_code}"
        assert data['status'] == 'ok', f"status 应为 ok: {data}"
        assert data['mode'] == 'development', f"mode 应为 development: {data}"
        info_str = f"包数={data['packages']}, 缓存meta={data['cached_meta']}"
        print(f"✅ 测试 2: /api/health — {info_str}")

        # ── 测试 3: 包列表 ──
        r = client.get('/api/packages')
        pkgs = r.get_json()
        assert isinstance(pkgs, list), "packages 应为 list"
        assert len(pkgs) >= 5, f"至少应有 5 个包, 实际 {len(pkgs)}"
        print(f"✅ 测试 3: /api/packages — {len(pkgs)} 个人群包: {', '.join(pkgs[:5])}...")

        # ── 测试 4: 元数据(含缓存) ──
        r = client.get('/api/meta/类目公域行为')
        meta = r.get_json()
        assert 'schema' in meta, "meta 缺少 schema"
        assert 'matrix' in meta, "meta 缺少 matrix"
        assert len(meta['schema']) > 0, "schema 不应为空"
        cache1 = engine._meta_cache.get('类目公域行为') is not None

        # 再次请求 — 应走缓存
        r2 = client.get('/api/package_meta?name=类目公域行为')
        meta2 = r2.get_json()
        cache2 = engine._meta_cache.get('类目公域行为') is not None
        print(f"✅ 测试 4: /api/meta/类目公域行为 — schema={len(meta['schema'])}字段, "
              f"matrix={len(meta['matrix'])}项, 首次缓存={cache1}, 二次缓存={cache2}")

        # ── 测试 5: 模板列表 ──
        r = client.get('/api/list_templates')
        templates = r.get_json()
        assert isinstance(templates, list), "templates 应为 list"
        print(f"✅ 测试 5: /api/list_templates — {len(templates)} 个模板文件")

        # ── 测试 6: JSON 生成 (直接端点) ──
        payload = {
            '_package': '类目公域行为',
            'bhv': ['浏览', '购买'],
            'channel': ['天猫'],
            'time': {'val': {'days': 30}, 'min': 'recent'}
        }
        r = client.post('/api/generate', json=payload,
                        content_type='application/json')
        gen = r.get_json()
        assert 'list' in gen, f"generate 缺少 list 字段: {gen}"
        assert len(gen['list']) > 0, "generate list 不应为空"
        assert 'compute' in gen, "generate 缺少 compute"
        print(f"✅ 测试 6: /api/generate — crowdName='{gen['crowdName']}', "
              f"list={len(gen['list'])}项, compute={gen['compute']}")

        # ── 测试 7: JSON 生成 (具名端点) ──
        payload2 = {
            'pkgName': '预测购买力',
            'params': {
                'attributes': ['高购买力']
            }
        }
        r = client.post('/api/generate_json', json=payload2,
                        content_type='application/json')
        gen2 = r.get_json()
        assert 'list' in gen2, f"generate_json 缺少 list: {gen2}"
        print(f"✅ 测试 7: /api/generate_json (预测购买力) — 生成成功")

        # ── 测试 8: 缓存状态 ──
        health = client.get('/api/health').get_json()
        print(f"✅ 测试 8: 缓存状态 — meta缓存={health['cached_meta']}, "
              f"logic缓存={health['cached_logic']}")

        # ── 测试 9: 404 处理 ──
        r = client.get('/api/non-existent-endpoint')
        assert r.status_code == 404, f"404 应返回 404, 实际 {r.status_code}"
        print(f"✅ 测试 9: 404 错误处理 — HTTP 404 正确")

        # ── 测试 10: 缺少参数 ──
        r = client.get('/api/package_meta')
        assert r.status_code == 400, f"缺参应返回 400, 实际 {r.status_code}"
        print(f"✅ 测试 10: 缺少参数处理 — HTTP 400 正确")

        print("=" * 60)
        print(f"🎉 全部 10 项测试通过！本地开发模式一切正常。")
        print("=" * 60)

if __name__ == '__main__':
    run_tests()
