// ==========================================
// 全局状态与 PostHog 商业级埋点配置
// ==========================================
let currentPayload = null;
let dmpPresets = [];
let beautyDict = [];
let conditionCache = {};
let globalUserNickname = ""; // 全局保存当前使用者的花名
let columnVisibility = {};   // 字段可见性状态
let currentTableData = [];   // 当前表格数据缓存（用于字段切换时重新渲染）
let renderTableRef = null;   // renderTable 全局引用（解决闭包跨作用域调用问题）
let totalCoverageCount = 0;  // 总覆盖人数（从页面DOM提取，用于计算Rebase后人数）
let rebaseExcludedTagIds = new Set();  // 不做rebase的标签tagId集合

const ALL_COLUMNS = ["所属大类", "标签类型", "标签名称", "特征明细", "人群占比", "覆盖人数", "Rebase", "Rebase后人数", "CTR", "PPC"];

// 🚨 你的专属 PostHog 配置
const POSTHOG_API_KEY = "phc_vfpPNzPngXL4YKQy5a2VMEWgDTr6D3q7TA6n8aFKb7yD";
const POSTHOG_HOST = "https://us.i.posthog.com";

// 🔮 PostHog 极速埋点上报引擎
function trackEvent(eventName, properties = {}) {
    const payload = {
        api_key: POSTHOG_API_KEY,
        event: eventName,
        distinct_id: globalUserNickname || "匿名用户",
        properties: {
            $lib: "chrome_extension",
            $current_url: location.href,
            ...properties
        }
    };

    fetch(`${POSTHOG_HOST}/capture/`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
    }).catch(() => {}); // 静默发送，绝不打扰正常业务
}

function showToast(message) {
    let toast = document.getElementById('dmp-copilot-toast');
    if (!toast) {
        toast = document.createElement('div');
        toast.id = 'dmp-copilot-toast';
        toast.style.cssText = `
            position: fixed; top: 30px; left: 50%; transform: translateX(-50%) translateY(-20px);
            background: rgba(0, 0, 0, 0.75); color: #ffffff; padding: 10px 24px;
            border-radius: 30px; font-size: 13px; font-weight: 500; z-index: 9999999;
            box-shadow: 0 8px 24px rgba(0,0,0,0.15); backdrop-filter: blur(8px); -webkit-backdrop-filter: blur(8px);
            opacity: 0; transition: all 0.4s cubic-bezier(0.175, 0.885, 0.32, 1.275);
            pointer-events: none; text-align: center; letter-spacing: 0.5px;
        `;
        document.body.appendChild(toast);
    }
    
    if (toast.hideTimer) clearTimeout(toast.hideTimer);
    toast.innerHTML = message;
    toast.style.display = 'block';
    toast.offsetHeight; 
    
    toast.style.opacity = '1';
    toast.style.transform = 'translateX(-50%) translateY(0)';

    toast.hideTimer = setTimeout(() => {
        toast.style.opacity = '0';
        toast.style.transform = 'translateX(-50%) translateY(-20px)';
        setTimeout(() => { toast.style.display = 'none'; }, 400); 
    }, 2500);
}

window.addEventListener('DMP_PAYLOAD_INTERCEPTED', (e) => {
    currentPayload = e.detail;
    
    if (currentPayload.payload && currentPayload.payload.multiGroupOptions && currentPayload.payload.multiGroupOptions.length > 0) {
        const tagId = String(currentPayload.payload.multiGroupOptions[0].tagId);
        conditionCache[tagId] = currentPayload.payload.multiGroupOptions;
        
        chrome.storage.local.set({ 'dmpConditionCache': conditionCache }, () => {
            updateTagStatusUI(tagId);
        });
    }
    
    const dot = document.getElementById('heartbeat-dot');
    if (dot) {
        dot.style.background = '#52c41a';
        dot.style.boxShadow = '0 0 10px rgba(82,196,26,0.8)';
        dot.title = '雷达已锁定，可随时提取数据';
    }

    updateCoverageCount();
});

function updateTagStatusUI(tagId) {
    const checkboxes = document.querySelectorAll('.tag-checkbox');
    checkboxes.forEach(cb => {
        if (cb.value === tagId) {
            const label = cb.parentNode;
            const iconSpan = label.querySelector('.tag-icon');
            if (iconSpan && (iconSpan.innerText === '⚙️' || iconSpan.innerText === '✅(已就绪)')) {
                iconSpan.innerText = '✅(已就绪)';
                label.style.color = '#28a745'; 
            }
        }
    });
}

function updateCoverageCount() {
    const valueEl = document.getElementById('coverageValue');
    const dotEl = document.getElementById('coverageDot');

    if (!valueEl || !dotEl) return;

    try {
        const xpath = "/html/body/div[1]/div[3]/div[2]/div/div[2]/div/div[1]/div/div[1]/div[3]/div[2]/strong";
        const result = document.evaluate(xpath, document, null, XPathResult.FIRST_ORDERED_NODE_TYPE, null);
        const node = result.singleNodeValue;

        if (node && node.textContent.trim()) {
            const raw = node.textContent.trim();
            const numStr = raw.replace(/[^\d.]/g, '');
            const num = parseInt(numStr, 10);

            if (!isNaN(num) && num > 0) {
                totalCoverageCount = num;
                const formatted = num.toLocaleString('zh-CN');
                if (valueEl.textContent !== formatted) {
                    valueEl.style.opacity = '0';
                    setTimeout(() => {
                        valueEl.textContent = formatted;
                        valueEl.style.opacity = '1';
                    }, 150);
                }
                dotEl.style.background = '#52c41a';
                dotEl.style.boxShadow = '0 0 5px rgba(82,196,26,0.5)';
                return;
            }
        }

        valueEl.textContent = '--';
        dotEl.style.background = '#e0e0e0';
        dotEl.style.boxShadow = 'none';
    } catch (e) {
        valueEl.textContent = '--';
        dotEl.style.background = '#e0e0e0';
        dotEl.style.boxShadow = 'none';
    }
}

// 每隔 4 秒轮询覆盖人数（应对页面切换但未触发 payload 的情况）
setInterval(updateCoverageCount, 4000);

function initColumnSelector() {
    const btn = document.getElementById('columnSelectorBtn');
    const dropdown = document.getElementById('columnSelectorDropdown');
    if (!btn || !dropdown) return;

    chrome.storage.local.get(['columnVisibility'], (res) => {
        if (res.columnVisibility) {
            columnVisibility = res.columnVisibility;
        } else {
            ALL_COLUMNS.forEach(k => { columnVisibility[k] = true; });
        }
        renderDropdown();
    });

    function renderDropdown() {
        dropdown.innerHTML = ALL_COLUMNS.map(k => `
            <label style="display: flex; align-items: center; gap: 8px; padding: 7px 14px; cursor: pointer; font-size: 12px; color: #444; transition: background 0.15s; white-space: nowrap;"
                   onmouseover="this.style.background='#f5f6f8'" onmouseout="this.style.background='transparent'">
                <input type="checkbox" value="${k}" ${columnVisibility[k] !== false ? 'checked' : ''}
                       style="accent-color: #FF8A98; cursor: pointer;">
                <span>${k}</span>
            </label>
        `).join('');
    }

    dropdown.addEventListener('change', (e) => {
        if (e.target.type === 'checkbox') {
            columnVisibility[e.target.value] = e.target.checked;
            chrome.storage.local.set({ columnVisibility });
            trackEvent("切换字段可见", { field: e.target.value, visible: e.target.checked });
            if (currentTableData.length && renderTableRef) {
                renderTableRef(currentTableData);
            }
        }
    });

    dropdown.addEventListener('click', (e) => {
        e.stopPropagation();
    });

    btn.onclick = (e) => {
        e.stopPropagation();
        dropdown.style.display = dropdown.style.display === 'none' ? 'block' : 'none';
    };

    document.addEventListener('click', () => {
        dropdown.style.display = 'none';
    });
}

function initRebaseSelector() {
    const btn = document.getElementById('rebaseSettingBtn');
    const dropdown = document.getElementById('rebaseSettingDropdown');
    const tagList = document.getElementById('rebaseTagList');
    const toggleAll = document.getElementById('rebaseToggleAll');
    const searchInput = document.getElementById('rebaseSearchInput');
    if (!btn || !dropdown || !tagList || !toggleAll) return;

    let rebaseSearchQuery = '';

    const CAT_COLORS = {
        '用户特征': { bg: '#E6F4FF', text: '#0958D9' },
        '品类特征': { bg: '#FFF2E8', text: '#D4380D' },
        '渠道特征': { bg: '#F6FFED', text: '#389E0D' },
        '私域特征': { bg: '#F9F0FF', text: '#531DAB' }
    };

    chrome.storage.local.get(['rebaseExcludedTagIds'], (res) => {
        if (res.rebaseExcludedTagIds) {
            rebaseExcludedTagIds = new Set(res.rebaseExcludedTagIds);
        }
        renderRebaseList();
    });

    function buildTagTree() {
        const tree = {};
        const seen = new Set();
        beautyDict.forEach(t => {
            if (seen.has(t.tagId)) return;
            seen.add(t.tagId);
            if (!tree[t.mainCategory]) tree[t.mainCategory] = {};
            if (!tree[t.mainCategory][t.category]) tree[t.mainCategory][t.category] = [];
            tree[t.mainCategory][t.category].push(t);
        });
        return tree;
    }

    function renderRebaseList() {
        const tree = buildTagTree();
        const query = rebaseSearchQuery.toLowerCase().trim();
        let total = 0;
        let html = '';

        for (const [mainCat, subCats] of Object.entries(tree)) {
            let catHtml = '';
            let catVisible = false;

            for (const [, tags] of Object.entries(subCats)) {
                const filtered = query ? tags.filter(t => t.tagName.toLowerCase().includes(query)) : tags;
                if (!filtered.length) continue;

                filtered.forEach(t => {
                    total++;
                    catVisible = true;
                    const excluded = rebaseExcludedTagIds.has(t.tagId);
                    const catColor = CAT_COLORS[t.mainCategory] || { text: '#FF8A98' };
                    catHtml += `
                        <label style="display: flex; align-items: center; gap: 8px; padding: 5px 14px 5px 22px; cursor: pointer; font-size: 11px; color: ${excluded ? '#c0c0c0' : '#444'}; transition: background 0.15s; white-space: nowrap;"
                               onmouseover="this.style.background='rgba(0,0,0,0.02)'" onmouseout="this.style.background='transparent'">
                            <input type="checkbox" value="${t.tagId}" ${!excluded ? 'checked' : ''}
                                   style="accent-color: ${catColor.text}; cursor: pointer;">
                            <span style="${excluded ? 'text-decoration: line-through;' : ''}">${t.tagName}</span>
                        </label>
                    `;
                });
            }

            if (catVisible) {
                const mc = CAT_COLORS[mainCat] || { bg: '#F5F5F5', text: '#595959' };
                html += `<div style="padding: 6px 14px 2px 14px; font-size: 10px; font-weight: 600; color: ${mc.text}; letter-spacing: 0.5px; margin-top: 2px;">${mainCat}</div>`;
                html += catHtml;
            }
        }

        if (!html) {
            html = '<div style="padding: 20px; text-align: center; font-size: 11px; color: #bbb;">无匹配标签</div>';
        }

        tagList.innerHTML = html;

        const allTotal = new Set(beautyDict.map(t => t.tagId)).size;
        const excluded = rebaseExcludedTagIds.size;
        const enabled = allTotal - excluded;
        toggleAll.textContent = enabled === 0 ? '全部启用' : '全部停用';
        btn.textContent = excluded > 0 ? `⚡ Rebase (${enabled}/${allTotal})` : '⚡ Rebase';
    }

    dropdown.addEventListener('click', (e) => {
        e.stopPropagation();
    });

    if (searchInput) {
        searchInput.addEventListener('input', () => {
            rebaseSearchQuery = searchInput.value;
            renderRebaseList();
        });
        searchInput.addEventListener('click', (e) => {
            e.stopPropagation();
        });
    }

    dropdown.addEventListener('change', (e) => {
        if (e.target.type === 'checkbox') {
            const tagId = e.target.value;
            const tagInfo = beautyDict.find(t => t.tagId === tagId);
            if (e.target.checked) {
                rebaseExcludedTagIds.delete(tagId);
            } else {
                rebaseExcludedTagIds.add(tagId);
            }
            chrome.storage.local.set({ rebaseExcludedTagIds: [...rebaseExcludedTagIds] });
            trackEvent("Rebase标签切换", { tagId, tagName: tagInfo?.tagName || tagId, excluded: !e.target.checked });
            renderRebaseList();
            if (currentTableData.length && renderTableRef) {
                renderTableRef(currentTableData);
            }
        }
    });

    toggleAll.onclick = () => {
        const allIds = [...new Set(beautyDict.map(t => t.tagId))];
        const action = rebaseExcludedTagIds.size === 0 ? '全部停用' : '全部启用';
        if (rebaseExcludedTagIds.size === 0) {
            allIds.forEach(id => rebaseExcludedTagIds.add(id));
        } else {
            rebaseExcludedTagIds.clear();
        }
        chrome.storage.local.set({ rebaseExcludedTagIds: [...rebaseExcludedTagIds] });
        trackEvent("Rebase全部操作", { action, totalTags: allIds.length });
        renderRebaseList();
        if (currentTableData.length && renderTableRef) {
            renderTableRef(currentTableData);
        }
    };

    btn.onclick = (e) => {
        e.stopPropagation();
        const isOpen = dropdown.style.display === 'flex';
        dropdown.style.display = isOpen ? 'none' : 'flex';
        if (!isOpen) {
            rebaseSearchQuery = '';
            if (searchInput) searchInput.value = '';
            renderRebaseList();
        }
    };

    document.addEventListener('click', () => {
        dropdown.style.display = 'none';
    });
}

async function loadLocalConfig() {
    const tagBox = document.getElementById('dynamicTagsContainer');
    try {
        const response = await fetch(chrome.runtime.getURL('dmp_tags_dictionary.json'));
        beautyDict = await response.json();
        
        chrome.storage.local.get(['dmpConditionCache', 'dmpPresets', 'dmp_user_nickname'], (res) => {
            if (res.dmpConditionCache) {
                conditionCache = res.dmpConditionCache;
            }
            dmpPresets = res.dmpPresets || [];
            globalUserNickname = res.dmp_user_nickname || ""; // 加载花名
            
            renderStaticCheckboxes();
            renderPresets();
        });
    } catch (err) {
        console.error("❌ 无法加载配置", err);
        if(tagBox) tagBox.innerHTML = '<div style="color:red;padding:20px;font-size:13px;line-height:1.5;">❌ 致命错误：未能加载字典！</div>';
    }
}

fetch(chrome.runtime.getURL('panel.html')).then(r => r.text()).then(html => {
    const wrapper = document.createElement('div');
    wrapper.id = 'dmp-copilot-root';
    wrapper.style.cssText = "position: fixed; top: 60px; right: 20px; width: 1000px; z-index: 999999; box-shadow: 0 15px 50px rgba(0,0,0,0.25); border-radius: 12px; display: none; flex-direction: column; background:transparent;";
    wrapper.innerHTML = html;
    document.body.appendChild(wrapper);

    const miniBtn = document.createElement('div');
    miniBtn.id = 'dmp-copilot-mini-btn';
    miniBtn.innerHTML = '✨ 展开助手';
    miniBtn.style.cssText = `
        position: fixed; top: 50%; right: 0; transform: translateY(-50%);
        background: #ffffff; border: 1px solid #eaeaea; border-right: none;
        color: #FF8A98; padding: 16px 8px; border-radius: 8px 0 0 8px;
        cursor: pointer; font-weight: 600; font-size: 13px;
        box-shadow: -4px 0 12px rgba(0,0,0,0.05);
        writing-mode: vertical-rl; text-orientation: upright; letter-spacing: 2px;
        z-index: 999999; display: none; transition: 0.3s;
    `;
    miniBtn.onmouseover = () => { miniBtn.style.boxShadow = '-6px 0 16px rgba(255, 138, 152, 0.15)'; miniBtn.style.paddingRight = '12px'; };
    miniBtn.onmouseout = () => { miniBtn.style.boxShadow = '-4px 0 12px rgba(0,0,0,0.05)'; miniBtn.style.paddingRight = '8px'; };
    
    miniBtn.onclick = () => {
        miniBtn.style.display = 'none';
        wrapper.style.display = 'flex';
        trackEvent("面板打开", { source: "最小化按钮" });
    };
    document.body.appendChild(miniBtn);

    initCopilotLogic();
    loadLocalConfig();
    initDragFeature(wrapper);
    startObserverForInjectButton();
    checkOnboarding();
    updateCoverageCount();
});

function checkOnboarding() {
    chrome.storage.local.get(['hasSeenOnboarding', 'dmp_user_nickname'], (res) => {
        if (!res.hasSeenOnboarding || !res.dmp_user_nickname) {
            const overlay = document.getElementById('onboarding-overlay');
            if (overlay) {
                overlay.style.display = 'flex';
                document.getElementById('close-onboarding-btn').onclick = () => {
                    let name = "";
                    const nameInput = document.getElementById('user-nickname-input');
                    // 弹性降级：如果 HTML 里有输入框就取输入框，没有就弹窗
                    if (nameInput && nameInput.value.trim()) {
                        name = nameInput.value.trim();
                    } else {
                        name = prompt("👉 请输入您的花名或姓名（必填，用于数据资产归属记录）：");
                    }

                    if (!name) {
                        alert("⚠️ 必须输入花名才能开启插件哦！");
                        return;
                    }

                    chrome.storage.local.set({ hasSeenOnboarding: true, dmp_user_nickname: name }, () => {
                        globalUserNickname = name;
                        overlay.style.opacity = '0';
                        overlay.style.transition = 'opacity 0.3s ease';
                        setTimeout(() => { overlay.style.display = 'none'; }, 300);
                        
                        // 【埋点】：系统激活
                        trackEvent("系统激活", { message: `用户 [${name}] 首次启用插件` });
                    });
                };
            }
        } else {
            globalUserNickname = res.dmp_user_nickname;
        }
    });
}

function startObserverForInjectButton() {
    const observer = new MutationObserver(() => {
        if (document.getElementById('open-copilot-btn')) return;

        let targetRow = null;
        const spans = document.querySelectorAll('span');
        
        for (let span of spans) {
            if (span.innerText && span.innerText.trim() === '私域特征') {
                let p = span.parentElement;
                while (p && p !== document.body) {
                    if (p.innerText.includes('用户特征') && p.tagName !== 'A') {
                        let hasAtag = Array.from(p.children).some(child => child.tagName === 'A');
                        if (hasAtag) {
                            targetRow = p;
                            break;
                        }
                    }
                    p = p.parentElement;
                }
                if (targetRow) break;
            }
        }

        if (targetRow) {
            const btn = document.createElement('button');
            btn.id = 'open-copilot-btn';
            btn.innerText = '启动助手'; 
            
            btn.style.cssText = `
                background: #ffffff; color: #595959; border: 1px solid #d9d9d9; 
                border-radius: 6px; padding: 5px 16px; cursor: pointer; font-weight: 500; 
                margin-left: 20px; box-shadow: 0 2px 4px rgba(0,0,0,0.02); transition: all 0.3s ease; 
                font-size: 13px; letter-spacing: 0.5px; display: inline-flex; align-items: center; height: 32px;
            `;
            
            btn.onmouseover = () => { btn.style.color = '#FF8A98'; btn.style.borderColor = '#FFB8C6'; btn.style.boxShadow = '0 2px 8px rgba(255, 138, 152, 0.15)'; };
            btn.onmouseout = () => { btn.style.color = '#595959'; btn.style.borderColor = '#d9d9d9'; btn.style.boxShadow = '0 2px 4px rgba(0,0,0,0.02)'; };
            
            btn.onclick = () => {
                const copilot = document.getElementById('dmp-copilot-root');
                const isOpening = copilot.style.display === 'none';
                copilot.style.display = isOpening ? 'flex' : 'none';
                if (isOpening) trackEvent("面板打开", { source: "DMP按钮" });
                const mini = document.getElementById('dmp-copilot-mini-btn');
                if(mini) mini.style.display = 'none';
            };

            targetRow.style.display = 'flex';
            targetRow.style.alignItems = 'center';
            targetRow.appendChild(btn);
        }
    });
    observer.observe(document.body, { childList: true, subtree: true });
}

function initCopilotLogic() {
    const logEl = document.getElementById('log');
    const container = document.getElementById('resultContainer');

    initColumnSelector();
    initRebaseSelector();

    const resizer = document.getElementById('resizer');
    const rightPanel = document.getElementById('right-panel');
    const wrapper = document.getElementById('dmp-copilot-root');
    let isResizing = false;

    if (resizer && rightPanel && wrapper) {
        resizer.addEventListener('mousedown', (e) => {
            isResizing = true;
            document.body.style.userSelect = 'none'; 
        });

        document.addEventListener('mousemove', (e) => {
            if (!isResizing) return;
            if (e.buttons === 0) {
                isResizing = false;
                document.body.style.userSelect = '';
                return;
            }
            const containerRect = wrapper.getBoundingClientRect();
            const newRightWidth = containerRect.right - e.clientX;
            if (newRightWidth >= 380 && newRightWidth <= 680) {
                rightPanel.style.width = newRightWidth + 'px';
            }
        });

        document.addEventListener('mouseup', () => {
            if (isResizing) {
                isResizing = false;
                document.body.style.userSelect = '';
            }
        });
    }

    const searchInput = document.getElementById('newPresetName');
    if (searchInput) {
        searchInput.addEventListener('input', (e) => {
            const keyword = e.target.value.trim().toLowerCase();
            const allLabels = document.querySelectorAll('.tag-label-wrapper');
            
            allLabels.forEach(label => {
                const text = label.querySelector('.tag-text').innerText.toLowerCase();
                if (text.includes(keyword)) {
                    label.style.display = 'inline-flex';
                } else {
                    label.style.display = 'none';
                }
            });

            document.querySelectorAll('.sub-cat-container').forEach(subContainer => {
                const visibleLabelsInSub = subContainer.querySelectorAll('.tag-label-wrapper[style*="inline-flex"], .tag-label-wrapper:not([style*="display: none"])');
                if (visibleLabelsInSub.length === 0) {
                    subContainer.style.display = 'none';
                } else {
                    subContainer.style.display = 'block';
                }
            });

            document.querySelectorAll('.main-cat-container').forEach(mainContainer => {
                const visibleLabelsInMain = mainContainer.querySelectorAll('.tag-label-wrapper[style*="inline-flex"], .tag-label-wrapper:not([style*="display: none"])');
                if (visibleLabelsInMain.length === 0) {
                    mainContainer.style.display = 'none';
                } else {
                    mainContainer.style.display = 'block';
                }
            });
        });
    }

    const closeBtn = document.getElementById('copilot-close');
    if (closeBtn) {
        closeBtn.onclick = () => {
            document.getElementById('dmp-copilot-root').style.display = 'none';
            const mini = document.getElementById('dmp-copilot-mini-btn');
            if(mini) mini.style.display = 'none';
        };
    }

    const minBtn = document.getElementById('copilot-minimize');
    if (minBtn) {
        minBtn.onclick = () => {
            document.getElementById('dmp-copilot-root').style.display = 'none';
            const mini = document.getElementById('dmp-copilot-mini-btn');
            if(mini) mini.style.display = 'block';
        };
    }

    const clearTagsBtn = document.getElementById('clearAllTagsBtn');
    if (clearTagsBtn) {
        clearTagsBtn.onclick = () => {
            const checkboxes = document.querySelectorAll('.tag-checkbox');
            let count = 0;
            checkboxes.forEach(cb => {
                if (cb.checked) {
                    cb.checked = false;
                    count++;
                }
            });
            if (count > 0) {
                showToast(`🧹 已为您清空 ${count} 项特征勾选`);
            }
        };
    }

    window.renderStaticCheckboxes = function() {
        const tagBox = document.getElementById('dynamicTagsContainer');
        if(!tagBox) return;
        tagBox.innerHTML = ''; 

        const tree = {};
        beautyDict.forEach(t => {
            if (!tree[t.mainCategory]) tree[t.mainCategory] = {};
            if (!tree[t.mainCategory][t.category]) tree[t.mainCategory][t.category] = [];
            tree[t.mainCategory][t.category].push(t);
        });

        for (const [mainCat, subCats] of Object.entries(tree)) {
            const mainDiv = document.createElement('div');
            mainDiv.className = 'main-cat-container';
            mainDiv.style.marginBottom = "15px";
            
            const header = document.createElement('div');
            header.className = "main-cat-header";
            header.innerText = `📂 ${mainCat}`;
            mainDiv.appendChild(header);

            const bodyDiv = document.createElement('div');
            bodyDiv.style.paddingLeft = "10px";

            for (const [subCat, tags] of Object.entries(subCats)) {
                const subDiv = document.createElement('div');
                subDiv.className = 'sub-cat-container'; 
                
                subDiv.innerHTML = `<div style="font-size: 12px; font-weight: bold; color: #888; border-bottom: 1px dashed #eee; margin-bottom: 8px; padding-bottom: 4px; margin-top: 10px;">${subCat}</div>`;
                
                const grid = document.createElement('div');
                grid.style.cssText = "display: grid; grid-template-columns: 1fr 1fr; gap: 8px; font-size: 11px;";
                
                tags.forEach(t => {
                    let hasCondition = !!conditionCache[t.tagId];
                    let style = t.needCondition ? (hasCondition ? 'color: #28a745;' : 'color: #FF4D6D;') : '';
                    let tip = t.annotation ? `title="${t.annotation}"` : '';
                    let icon = t.needCondition ? (hasCondition ? '✅(已就绪)' : '⚙️') : '';
                    
                    grid.innerHTML += `
                        <label class="tag-label-wrapper" ${tip} style="${style}">
                            <input type="checkbox" value="${t.tagId}" class="tag-checkbox"> 
                            <span class="tag-text" style="margin-left: 4px;">${t.tagName}</span> 
                            <span class="tag-icon" style="margin-left: 4px;">${icon}</span>
                        </label>`;
                });
                subDiv.appendChild(grid);
                bodyDiv.appendChild(subDiv);
            }
            mainDiv.appendChild(bodyDiv);
            tagBox.appendChild(mainDiv);
        }

        tagBox.addEventListener('change', (e) => {
            if (e.target.classList.contains('tag-checkbox') && e.target.checked) {
                const tagId = e.target.value;
                const tagInfo = beautyDict.find(t => t.tagId === tagId);
                if (tagInfo && tagInfo.needCondition && !conditionCache[tagId]) {
                    alert(`⚠️ 【${tagInfo.tagName}】需配置下钻条件！\n\n请立刻在网页左侧找到该标签进行配置，待右侧图表加载后，雷达会自动捕获并亮绿灯！`);
                }
            }
        });
    };

    window.renderPresets = function() {
        const list = document.getElementById('presetListContainer');
        if(!list) return;
        list.innerHTML = '';
        
        if (dmpPresets.length === 0) {
            list.style.display = 'none';
            return;
        }
        
        list.style.display = 'flex'; 
        
        dmpPresets.forEach((p, index) => {
            const capsule = document.createElement('div');
            capsule.className = 'preset-capsule';
            
            capsule.innerHTML = `
                <span class="capsule-title">🏷️ ${p.name}</span>
                <div class="capsule-actions">
                    <span class="apply-act" style="color: #28a745;">应用</span>
                    <span style="color: #eee;">|</span>
                    <span class="share-act" style="color: #666;">分享</span>
                    <span style="color: #eee;">|</span>
                    <span class="delete-act" style="color: #FF4D6D;">删除</span>
                </div>
            `;
            
            const titleEl = capsule.querySelector('.capsule-title');
            const actionsEl = capsule.querySelector('.capsule-actions');
            
            capsule.onclick = (e) => {
                if(e.target.classList.contains('apply-act') || e.target.classList.contains('delete-act') || e.target.classList.contains('share-act')) return;
                
                document.querySelectorAll('.preset-capsule').forEach(cap => {
                    cap.querySelector('.capsule-title').style.display = 'inline-block';
                    cap.querySelector('.capsule-actions').style.display = 'none';
                    cap.style.borderColor = '#e4e4e4';
                });

                titleEl.style.display = 'none';
                actionsEl.style.display = 'flex';
                capsule.style.borderColor = '#FF8A98';
            };

            capsule.querySelector('.apply-act').onclick = (e) => {
                e.stopPropagation(); 
                document.querySelectorAll('.tag-checkbox').forEach(cb => cb.checked = false);
                p.tagIds.forEach(id => {
                    const cb = document.querySelector(`.tag-checkbox[value="${id}"]`);
                    if (cb) cb.checked = true;
                });
                showToast(`✅ 已为您一键载入模型：${p.name}`);
                
                // 【埋点】：应用已有方案
                trackEvent("应用已有方案", { presetName: p.name });

                titleEl.style.display = 'inline-block';
                actionsEl.style.display = 'none';
                capsule.style.borderColor = '#e4e4e4';
            };

            capsule.querySelector('.share-act').onclick = (e) => {
                e.stopPropagation();
                try {
                    // 分享时悄悄把创建者的名字塞进去
                    const presetToShare = { ...p, creator: p.creator || globalUserNickname };
                    const jsonStr = JSON.stringify(presetToShare);
                    const bytes = new TextEncoder().encode(jsonStr);
                    const binString = Array.from(bytes, (byte) => String.fromCodePoint(byte)).join("");
                    const token = 'DMP_MODEL_' + btoa(binString);
                    
                    navigator.clipboard.writeText(token).then(() => {
                        showToast(`🔗 模型 [${p.name}] 口令已复制，快发给同事吧！`);
                        
                        // 【埋点】：分享模型口令
                        trackEvent("分享模型口令", { presetName: p.name, tagsCount: p.tagIds.length });

                        titleEl.style.display = 'inline-block';
                        actionsEl.style.display = 'none';
                        capsule.style.borderColor = '#e4e4e4';
                    });
                } catch (err) {
                    showToast('❌ 生成模型口令失败');
                }
            };

            capsule.querySelector('.delete-act').onclick = (e) => {
                e.stopPropagation();
                if (confirm(`确定删除方案 [${p.name}] 吗？`)) { 
                    dmpPresets.splice(index, 1); 
                    chrome.storage.local.set({ 'dmpPresets': dmpPresets }, () => renderPresets()); 
                } else {
                    titleEl.style.display = 'inline-block';
                    actionsEl.style.display = 'none';
                    capsule.style.borderColor = '#e4e4e4';
                }
            };
            
            list.appendChild(capsule);
        });

        document.addEventListener('click', function(e) {
            if (!e.target.closest('.preset-capsule')) {
                document.querySelectorAll('.preset-capsule').forEach(cap => {
                    cap.querySelector('.capsule-title').style.display = 'inline-block';
                    cap.querySelector('.capsule-actions').style.display = 'none';
                    cap.style.borderColor = '#e4e4e4';
                });
            }
        });
    }
    const addPresetBtn = document.getElementById('addPresetBtn');
    if (addPresetBtn) {
        addPresetBtn.onclick = () => {
            const name = document.getElementById('newPresetName').value.trim();
            const ids = Array.from(document.querySelectorAll('.tag-checkbox:checked')).map(cb => cb.value);
            if (!name || ids.length === 0) return alert("请在下方勾选需要的特征，并输入名称后再保存");
            
            dmpPresets.push({ name, tagIds: ids, creator: globalUserNickname });
            chrome.storage.local.set({ 'dmpPresets': dmpPresets }, () => { 
                document.getElementById('newPresetName').value = ''; 
                document.querySelectorAll('.tag-label-wrapper').forEach(l => l.style.display = 'inline-flex');
                document.querySelectorAll('.sub-cat-container').forEach(c => c.style.display = 'block');
                document.querySelectorAll('.main-cat-container').forEach(c => c.style.display = 'block');
                renderPresets(); 
                showToast(`💾 模型 [${name}] 已归档保存`);

                // 👇 新代码：把 ID 数组翻译成中文标签名数组，并一起发给 PostHog
                const savedTags = ids.map(id => beautyDict.find(t => t.tagId === id)?.tagName);
                trackEvent("保存新方案", { 
                    presetName: name, 
                    tagsIncluded: ids.length,
                    tagList: savedTags  // 核心！增加了这个详细列表
                });
            });
        };
    }


    const importPresetBtn = document.getElementById('importPresetBtn');
    if (importPresetBtn) {
        importPresetBtn.onclick = () => {
            const token = prompt("📦 请在此粘贴同事分享给您的 DMP_MODEL 口令：");
            if (!token) return;
            if (!token.startsWith('DMP_MODEL_')) {
                return alert("❌ 无效的口令格式，必须以 DMP_MODEL_ 开头");
            }
            try {
                const base64Str = token.replace('DMP_MODEL_', '');
                const binString = atob(base64Str);
                const bytes = Uint8Array.from(binString, (m) => m.codePointAt(0));
                const parsedModel = JSON.parse(new TextDecoder().decode(bytes));

                if (parsedModel && parsedModel.name && parsedModel.tagIds && Array.isArray(parsedModel.tagIds)) {
                    const existIndex = dmpPresets.findIndex(x => x.name === parsedModel.name);
                    if (existIndex !== -1) {
                        if (confirm(`⚠️ 方案库中已存在名为 [${parsedModel.name}] 的模型，是否覆盖？`)) {
                            dmpPresets[existIndex] = parsedModel;
                        } else {
                            return; 
                        }
                    } else {
                        dmpPresets.push(parsedModel);
                    }
                    chrome.storage.local.set({ 'dmpPresets': dmpPresets }, () => {
                        renderPresets();
                        showToast(`🎉 成功导入分享模型：[${parsedModel.name}]`);

                        // 【埋点】：导入他人方案
                        trackEvent("导入分享方案", { 
                            presetName: parsedModel.name, 
                            originalCreator: parsedModel.creator || "未知创建者" 
                        });
                    });
                } else {
                    throw new Error("Invalid structure");
                }
            } catch(err) {
                alert("❌ 解析口令失败，口令可能已被篡改或损坏");
            }
        };
    }

    const startBtn = document.getElementById('startExtractBtn');
    if (startBtn) {
        startBtn.onclick = async () => {
            const extractStartTime = Date.now();
            const selectedIds = Array.from(document.querySelectorAll('.tag-checkbox:checked')).map(cb => cb.value);
            if (selectedIds.length === 0) {
                showToast("⚠️ 请先勾选需要提取的标签");
                return;
            }
            if (!currentPayload) {
                showToast("⚠️ 未获取到有效凭证！请点网页画像激活绿灯");
                return;
            }

            const currentTags = selectedIds.map(id => beautyDict.find(t => t.tagId === id)?.tagName);

            showToast("🚀 正在极速穿透底层数据...");
            const emptyTip = document.getElementById('emptyTip');
            if (emptyTip) emptyTip.style.display = 'none';

            try {
                let rawResList = [];
                for (let id of selectedIds) {
                    const tagDictInfo = beautyDict.find(t => t.tagId === id);
                    const mainCatName = tagDictInfo ? tagDictInfo.mainCategory : "未知大类"; 
                    const subCatName = tagDictInfo ? tagDictInfo.category : "未知类型";

                    let reqBody = JSON.parse(JSON.stringify(currentPayload.payload));
                    delete reqBody.multiGroupOptions; 

                    if (tagDictInfo && tagDictInfo.needCondition === true) {
                        if (conditionCache[id]) {
                            reqBody.multiGroupOptions = conditionCache[id];
                        } else {
                            rawResList.push({
                                "所属大类": mainCatName,
                                "标签类型": subCatName,
                                "标签名称": tagDictInfo.tagName + " ❌",
                                "特征明细": "⚠️ 未配置下钻条件",
                                "人群占比": "-", "覆盖人数": "-", "CTR": "-", "PPC": "-",
                                "_dictTagName": tagDictInfo.tagName,
                                "_dictTagId": id
                            });
                            continue; 
                        }
                    }

                    let url = currentPayload.url;
                    if (/\/tag\/\d+/.test(url)) url = url.replace(/\/tag\/\d+/, `/tag/${id}`);
                    if (/tagId=\d+/.test(url)) url = url.replace(/tagId=\d+/, `tagId=${id}`);
                    if (/\/analysis\/\d+/.test(url)) url = url.replace(/\/analysis\/\d+/, `/analysis/${id}`);

                    if (reqBody.tagId !== undefined) reqBody.tagId = parseInt(id);

                    const resp = await fetch(url, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json;charset=UTF-8' },
                        body: JSON.stringify(reqBody)
                    });
                    const json = await resp.json();
                    if (json?.data?.chartDataFull) {
                        json.data.chartDataFull.forEach(it => {
                            const rateRaw = parseFloat(it.rate || 0);
                            const coverageNum = totalCoverageCount > 0 ? Math.round(totalCoverageCount * rateRaw) : 0;
                            rawResList.push({
                                "所属大类": mainCatName,
                                "标签类型": subCatName,
                                "标签名称": it.tagName || "-",
                                "特征明细": it.optionName || "-",
                                "人群占比": (rateRaw * 100).toString() + '%',
                                "覆盖人数": coverageNum > 0 ? coverageNum.toString() : "-",
                                "CTR": it.ctrIndex || "-",
                                "PPC": it.ppcIndex || "-",
                                "_dictTagName": tagDictInfo.tagName,
                                "_dictTagId": id
                            });
                        });
                    }
                }

                // ==========================================
                // 【智能归一化处理引擎】
                // ==========================================
                const sumMap = {};
                rawResList.forEach(item => {
                    const tagName = item['标签名称'];
                    if (!sumMap[tagName]) sumMap[tagName] = 0;
                    
                    if (item['人群占比'] !== '-' && !item['特征明细'].includes('⚠️')) {
                        sumMap[tagName] += parseFloat(item['人群占比'].replace('%', ''));
                    }
                });

                const finalResList = rawResList.map(item => {
                    const tagName = item['标签名称'];
                    const totalSum = sumMap[tagName];
                    let rebaseVal = '-';

                    if (item['人群占比'] !== '-' && !item['特征明细'].includes('⚠️')) {
                        const currentVal = parseFloat(item['人群占比'].replace('%', ''));
                        const dictTagId = item['_dictTagId'];

                        if (dictTagId && rebaseExcludedTagIds.has(dictTagId)) {
                            rebaseVal = item['人群占比'];
                        } else if (totalSum > 0) {
                            rebaseVal = ((currentVal / totalSum) * 100).toString() + '%';
                        } else {
                            rebaseVal = '0%';
                        }
                    }

                    let rebaseCount = '-';
                    const dictTagId = item['_dictTagId'];
                    if (dictTagId && rebaseExcludedTagIds.has(dictTagId) && item['覆盖人数'] !== '-') {
                        rebaseCount = item['覆盖人数'];
                    } else if (rebaseVal !== '-' && totalCoverageCount > 0) {
                        const rebasePct = parseFloat(rebaseVal.replace('%', ''));
                        if (!isNaN(rebasePct)) {
                            rebaseCount = Math.round(totalCoverageCount * rebasePct / 100).toString();
                        }
                    }

                    return {
                        "所属大类": item['所属大类'],
                        "标签类型": item['标签类型'],
                        "标签名称": item['标签名称'],
                        "特征明细": item['特征明细'],
                        "人群占比": item['人群占比'],
                        "覆盖人数": item['覆盖人数'] || "-",
                        "Rebase": rebaseVal,
                        "Rebase后人数": rebaseCount,
                        "CTR": item['CTR'],
                        "PPC": item['PPC']
                    };
                });

                trackEvent("启动提取", { tagsCount: selectedIds.length, tagList: currentTags, duration: Date.now() - extractStartTime });
                renderTable(finalResList);
                showToast(`🎉 成功为您提取 ${finalResList.length} 行洞察数据！`);
            } catch (e) {
                trackEvent("提取失败", { error: e.message });
                showToast("❌ 提取发生异常: " + e.message);
            }
        };
    }

    function renderTable(data) {
        renderTableRef = renderTable;
        const actionGroup = document.getElementById('actionBtnGroup');
        if(!container) return;
        container.innerHTML = '';
        container.style.paddingTop = '0px';

        if (!data.length) {
            if(actionGroup) actionGroup.style.display = 'none';
            return;
        }

        currentTableData = data;

        const allKeys = Object.keys(data[0]);
        const visibleKeys = allKeys.filter(k => columnVisibility[k] !== false);

        const table = document.createElement('table');
        table.style.cssText = "width: 100%; border-collapse: collapse; font-size: 11px; text-align: left; margin-top: 10px;";
        
        table.innerHTML = `
            <thead><tr>${visibleKeys.map(k => `<th style="border:1px solid #eaeaea;padding:8px;background:#f8f9fa;position:sticky;top:0;z-index:10;box-shadow:0 1px 2px rgba(0,0,0,0.05);color:#333;font-weight:600;white-space:nowrap;">${k}</th>`).join('')}</tr></thead>
            <tbody>${data.map(r => `<tr>${visibleKeys.map(k => {
                
                let rawText = r[k];
                let displayHtml = rawText; 
                let colorStyle = typeof rawText === 'string' && rawText.includes('⚠️') ? 'color:#FF4D6D;font-weight:bold;' : 'color:#555;';
                let tdStyle = `border:1px solid #eaeaea;padding:6px;${colorStyle}`;
                let mainCategoryText = r['所属大类'] || '';

                if (k === '所属大类' || k === '标签类型') {
                    let themeMainBg = '#F5F5F5', themeMainText = '#595959', themeMainBorder = '#D9D9D9';
                    let themeSubBg = '#ffffff', themeSubText = '#595959', themeSubBorder = '#D9D9D9';

                    if (mainCategoryText === '用户特征') { 
                        themeMainBg = '#E6F4FF'; themeMainText = '#0958D9'; themeMainBorder = '#91D5FF';
                        themeSubText = '#0958D9'; themeSubBorder = '#91D5FF';
                    } else if (mainCategoryText === '品类特征') { 
                        themeMainBg = '#FFF2E8'; themeMainText = '#D4380D'; themeMainBorder = '#FFBB96';
                        themeSubText = '#D4380D'; themeSubBorder = '#FFBB96';
                    } else if (mainCategoryText === '私域特征') { 
                        themeMainBg = '#F9F0FF'; themeMainText = '#531DAB'; themeMainBorder = '#D3ADF7';
                        themeSubText = '#531DAB'; themeSubBorder = '#D3ADF7';
                    } else if (mainCategoryText === '渠道特征') { 
                        themeMainBg = '#F6FFED'; themeMainText = '#389E0D'; themeMainBorder = '#B7EB8F';
                        themeSubText = '#389E0D'; themeSubBorder = '#B7EB8F';
                    }
                    
                    if (k === '所属大类') {
                        displayHtml = `<span style="display:inline-block; padding:2px 8px; border-radius:4px; font-size:11px; font-weight:600; background:${themeMainBg}; color:${themeMainText}; border:1px solid ${themeMainBorder}; white-space:nowrap;">${rawText}</span>`;
                    } else if (k === '标签类型') {
                        displayHtml = `<span style="display:inline-block; padding:2px 8px; border-radius:4px; font-size:11px; background:${themeSubBg}; color:${themeSubText}; border:1px dashed ${themeSubBorder}; white-space:nowrap;">${rawText}</span>`;
                    }
                } 
                else if (k === '人群占比' && rawText !== '-' && rawText.includes('%')) {
                    let percentVal = parseFloat(rawText.replace('%', ''));
                    if (!isNaN(percentVal)) {
                        let widthPercent = Math.min(percentVal, 100);
                        let displayText = percentVal.toFixed(2) + '%';
                        displayHtml = `
                        <div style="position: relative; width: 100%; min-width: 65px; background: #f4f5f7; border-radius: 3px; overflow: hidden; display: flex; align-items: center; padding: 2px 4px; height: 18px;">
                            <div style="position: absolute; left: 0; top: 0; bottom: 0; width: ${widthPercent}%; background: rgba(255, 138, 152, 0.25); border-right: 2px solid rgba(255, 138, 152, 0.8); z-index: 1;"></div>
                            <span style="position: relative; z-index: 2; font-weight: 600; font-size: 11px; color: #444;">${displayText}</span>
                        </div>`;
                    }
                }
                else if (k === 'Rebase' && rawText !== '-' && rawText.includes('%')) {
                    let percentVal = parseFloat(rawText.replace('%', ''));
                    if (!isNaN(percentVal)) {
                        let widthPercent = Math.min(percentVal, 100);
                        let displayText = percentVal.toFixed(2) + '%';
                        displayHtml = `
                        <div style="position: relative; width: 100%; min-width: 65px; background: #f4f5f7; border-radius: 3px; overflow: hidden; display: flex; align-items: center; padding: 2px 4px; height: 18px;">
                            <div style="position: absolute; left: 0; top: 0; bottom: 0; width: ${widthPercent}%; background: rgba(54, 193, 250, 0.25); border-right: 2px solid rgba(54, 193, 250, 0.8); z-index: 1;"></div>
                            <span style="position: relative; z-index: 2; font-weight: 600; font-size: 11px; color: #444;">${displayText}</span>
                        </div>`;
                    }
                }
                else if ((k === '覆盖人数' || k === 'Rebase后人数') && rawText !== '-' && !isNaN(parseInt(rawText, 10))) {
                    displayHtml = `<span style="font-weight: 600; font-size: 11px; color: #444;">${parseInt(rawText, 10).toLocaleString('zh-CN')}</span>`;
                }

                return `<td style="${tdStyle}">${displayHtml}</td>`;
            }).join('')}</tr>`).join('')}</tbody>
        `;
        container.appendChild(table);
        
        if(actionGroup) {
            actionGroup.style.display = 'flex';
            
            const copyBtn = document.getElementById('copilotCopyBtn');
            if (copyBtn) {
                copyBtn.onclick = () => {
                    const tsv = visibleKeys.join('\t') + '\n' + data.map(r => visibleKeys.map(k => r[k]).join('\t')).join('\n');
                    navigator.clipboard.writeText(tsv).then(() => {
                        showToast('📋 纯净数据已成功复制到剪贴板！可直接粘贴至 Excel');
                        // 【埋点】：复制到剪贴板
                        trackEvent("复制到剪贴板", { rowCount: data.length });
                    });
                };
            }

            const exportBtn = document.getElementById('copilotExportBtn');
            if (exportBtn) {
                exportBtn.onclick = () => {
                    const csvRows = [];
                    csvRows.push(allKeys.join(','));

                    data.forEach(r => {
                        const values = allKeys.map(k => {
                            let val = r[k] || '';
                            if (String(val).includes(',')) {
                                val = `"${String(val).replace(/"/g, '""')}"`;
                            }
                            return val;
                        });
                        csvRows.push(values.join(','));
                    });

                    const csvString = '\uFEFF' + csvRows.join('\n'); 
                    const blob = new Blob([csvString], { type: 'text/csv;charset=utf-8;' });
                    const url = URL.createObjectURL(blob);
                    const a = document.createElement('a');
                    a.href = url;
                    a.download = `DMP_洞察数据_${new Date().toISOString().slice(0,10)}.csv`; 
                    document.body.appendChild(a);
                    a.click();
                    document.body.removeChild(a);
                    URL.revokeObjectURL(url);
                    
                    showToast('💾 CSV 数据文件导出成功！');
                    
                    // 【埋点】：导出CSV表格
                    trackEvent("导出CSV表格", { rowCount: data.length });
                };
            }
        }
    }
}

function initDragFeature(wrapper) {
    const header = document.getElementById('copilot-drag-header');
    if(!header) return;

    let isDrag = false;
    let currentX = 0, currentY = 0; 
    let initialMouseX = 0, initialMouseY = 0;

    header.addEventListener('mousedown', (e) => {
        if (e.target.id === 'copilot-close' || e.target.id === 'copilot-minimize' || e.target.id === 'heartbeat-dot') return;
        isDrag = true;
        initialMouseX = e.clientX - currentX;
        initialMouseY = e.clientY - currentY;
        document.body.style.userSelect = 'none'; 
    });

    window.addEventListener('mousemove', (e) => {
        if (!isDrag) return;
        if (e.buttons === 0) {
            isDrag = false;
            document.body.style.userSelect = '';
            return;
        }

        e.preventDefault();
        currentX = e.clientX - initialMouseX;
        currentY = e.clientY - initialMouseY;
        wrapper.style.transform = `translate(${currentX}px, ${currentY}px)`;
    });

    window.addEventListener('mouseup', () => {
        if (isDrag) {
            isDrag = false;
            document.body.style.userSelect = '';
        }
    });
}