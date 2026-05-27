import sys, re

data = sys.stdin.read()

# Find RSC payload strings
matches = re.findall(r'"([^"]{20,400})"', data)
for m in matches:
    if any(kw in m.lower() for kw in ['fixed', 'added', 'improved', 'new feature', 'bug fix',
                                        'regression', 'update:', 'support', 'allow', 'enable',
                                        'fixes', '/code-review', '/simplify', 'internal',
                                        'infrastructure', 'security']):
        # Clean up escape sequences
        clean = m.replace('\\n', ' ').replace('\\"', '"').replace('\\\\', '\\')
        clean = re.sub(r'\s+', ' ', clean).strip()
        if len(clean) > 20:
            print(clean[:300])
