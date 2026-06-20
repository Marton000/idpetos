$file = "C:\Users\Admin\OneDrive\Desktop\DesktopFile\desktop-pet\index_new.html"
$content = Get-Content $file -Raw -Encoding UTF8

# ============================================================
# Edit 1: Insert computeMoodBaseline() before checkAndResetDailyMood
# ============================================================
$old1 = @"
            function hideMoodModal() {
                var panel = document.getElementById('moodPanel');
                if (panel) panel.classList.remove('open');
            }

            function checkAndResetDailyMood() {
"@

$new1 = @"
            function hideMoodModal() {
                var panel = document.getElementById('moodPanel');
                if (panel) panel.classList.remove('open');
            }

            function computeMoodBaseline() {
                var chatCount = parseInt(localStorage.getItem('chatCount') || '0');
                var totalLight = parseInt(localStorage.getItem('totalLightGiven') || '0');
                var patience = parseInt(localStorage.getItem('patienceLevel') || '100');
                var s = {};
                try { s = JSON.parse(localStorage.getItem('idmanos_pet_settings') || '{}'); } catch (e) {}

                var s_chat = Math.min(1, chatCount / 100);
                var s_light = Math.min(1, totalLight / 500);
                var s_patience = patience / 100;
                var s_profile = (s.userName && s.userJob && s.userIntro && s.botName && s.botIdentity && s.botIntro) ? 1 : 0;
                var s_custom = s.customModelEnabled ? 1 : 0;

                function calc(signals) {
                    var total = 50;
                    for (var i = 0; i < signals.length; i++) {
                        total += signals[i].signal * signals[i].weight;
                    }
                    return Math.round(Math.max(30, Math.min(75, total)));
                }

                return {
                    happy: calc([{signal: s_chat, weight: 15}, {signal: s_light, weight: 10}]),
                    satisfied: calc([{signal: s_light, weight: 15}, {signal: s_profile, weight: 10}]),
                    confident: calc([{signal: s_profile, weight: 15}, {signal: s_custom, weight: 10}]),
                    surprised: calc([{signal: 1 - s_chat, weight: 10}]),
                    bored: calc([{signal: 1 - s_chat, weight: 15}]),
                    resentful: calc([{signal: 1 - s_light, weight: 12}]),
                    sad: calc([{signal: 1 - s_chat, weight: 10}]),
                    angry: calc([{signal: 1 - s_patience, weight: 12}]),
                    lost: calc([{signal: 1 - s_light, weight: 10}]),
                    sleepy: 50
                };
            }

            function checkAndResetDailyMood() {
"@

if ($content.Contains($old1)) {
    $content = $content.Replace($old1, $new1)
    Write-Host "[OK] Edit 1: computeMoodBaseline inserted"
} else {
    Write-Host "[FAIL] Edit 1: could not find anchor text for computeMoodBaseline"
}

# ============================================================
# Edit 2: Rewrite checkAndResetDailyMood() body
# ============================================================
$old2 = @"
            function checkAndResetDailyMood() {
                var today = new Date().toDateString();
                var lastMoodDate = localStorage.getItem('moodDate');
                var savedMoodState = localStorage.getItem('moodState');

                if (!savedMoodState) {
                    // 第一次启动：完全随机初始化
                    var newMoodKeys = Object.keys(moodState);
                    for (var j = 0; j < newMoodKeys.length; j++) {
                        var baseValue = Math.floor(Math.random() * 60) + 20;
                        var variation = Math.floor(Math.random() * 21) - 10;
                        moodState[newMoodKeys[j]] = Math.max(10, Math.min(90, baseValue + variation));
                    }
                    localStorage.setItem('moodDate', today);
                    saveMoodState();
                } else if (lastMoodDate !== today) {
                    // 新的一天：先加载昨天的状态，然后应用衰减
                    loadMoodState();
                    var moodKeys = Object.keys(moodState);
                    for (var i = 0; i < moodKeys.length; i++) {
                        var key = moodKeys[i];
                        var def = moodDefinitions[key];
                        var decay = 0;
                        if (def) {
                            if (def.polarity === 'negative') {
                                decay = Math.floor(Math.random() * 6) + 5;
                            } else if (def.polarity === 'positive') {
                                decay = Math.floor(Math.random() * 2) + 2;
                            } else {
                                decay = Math.floor(Math.random() * 3) + 3;
                            }
                        }
                        moodState[key] = Math.max(10, moodState[key] - decay);
                    }
                    localStorage.setItem('moodDate', today);
                    saveMoodState();
                } else {
                    // 今天：加载已保存的状态
                    loadMoodState();
                }

                // 加载持久化的冷却时间
                var savedLastMoodChange = parseInt(localStorage.getItem('lastMoodChangeTime') || '0');
                if (savedLastMoodChange) {
                    _lastMoodChangeTime = savedLastMoodChange;
                }
                updateMoodButton();
            }
"@

$new2 = @"
            function checkAndResetDailyMood() {
                var today = new Date().toDateString();
                var lastMoodDate = localStorage.getItem('moodDate');
                var savedMoodState = localStorage.getItem('moodState');
                var baseline = computeMoodBaseline();

                if (!savedMoodState) {
                    // 第一次启动：基于实际数据 (聊天次数、光能、人设完整度、耐心值)
                    for (var key in moodState) {
                        if (moodState.hasOwnProperty(key)) {
                            var b = baseline[key] || 50;
                            var noise = Math.floor(Math.random() * 7) - 3;
                            moodState[key] = Math.max(10, Math.min(90, b + noise));
                        }
                    }
                    localStorage.setItem('moodDate', today);
                    saveMoodState();
                } else if (lastMoodDate !== today) {
                    // 新的一天：向基础值回归 (negative 心情回归更快)
                    loadMoodState();
                    for (var key in moodState) {
                        if (moodState.hasOwnProperty(key)) {
                            var def = moodDefinitions[key];
                            var current = moodState[key];
                            var base = baseline[key] || 50;
                            var regress = def && def.polarity === 'negative' ? 0.15 : 0.10;
                            moodState[key] = Math.round(current + (base - current) * regress);
                            moodState[key] = Math.max(0, Math.min(100, moodState[key]));
                        }
                    }
                    localStorage.setItem('moodDate', today);
                    saveMoodState();
                } else {
                    // 今天：加载已保存状态
                    loadMoodState();
                }

                var savedLastMoodChange = parseInt(localStorage.getItem('lastMoodChangeTime') || '0');
                if (savedLastMoodChange) {
                    _lastMoodChangeTime = savedLastMoodChange;
                }
                updateMoodButton();
            }
"@

if ($content.Contains($old2)) {
    $content = $content.Replace($old2, $new2)
    Write-Host "[OK] Edit 2: checkAndResetDailyMood rewritten"
} else {
    Write-Host "[FAIL] Edit 2: could not find old checkAndResetDailyMood body"
}

# ============================================================
# Edit 3: useFeature - remove Math.random()
# ============================================================
$old3 = @"
                    useFeature: function () {
                        var base = Math.round((2 + Math.random() * 3) * mod);
                        return { satisfied: base };
                    },
"@

$new3 = @"
                    useFeature: function () {
                        return { satisfied: Math.round(3 * mod) };
                    },
"@

if ($content.Contains($old3)) {
    $content = $content.Replace($old3, $new3)
    Write-Host "[OK] Edit 3: useFeature Math.random() removed"
} else {
    Write-Host "[FAIL] Edit 3: could not find useFeature body"
}

# ============================================================
# Edit 4: Cap single mood change at ±5
# ============================================================
$old4 = @"
                for (var key in c) {
                    if (moodState.hasOwnProperty(key)) {
                        moodState[key] = Math.max(0, Math.min(100, moodState[key] + c[key]));
                    }
                }
                updateMoodButton();
                saveMoodState();
            }

            function getMoodModifier() {
"@

$new4 = @"
                for (var key in c) {
                    if (moodState.hasOwnProperty(key)) {
                        var delta = c[key];
                        if (delta > 5) delta = 5;
                        if (delta < -5) delta = -5;
                        moodState[key] = Math.max(0, Math.min(100, moodState[key] + delta));
                    }
                }
                updateMoodButton();
                saveMoodState();
            }

            function getMoodModifier() {
"@

if ($content.Contains($old4)) {
    $content = $content.Replace($old4, $new4)
    Write-Host "[OK] Edit 4: delta cap added"
} else {
    Write-Host "[FAIL] Edit 4: could not find delta loop"
}

# Write back
[System.IO.File]::WriteAllText($file, $content, [System.Text.UTF8Encoding]::new($false))
Write-Host "`nAll edits applied and file saved."
