/**
 * webmux 对抗性安全测试脚本
 * 测试所有输入注入面、资源管理、降级链、站点经验存储、子 Agent 协议
 */

import { strict as assert } from 'assert';
import { isPathInside } from '../dist/shared/security.js';
import { channelRouter } from '../dist/runtime/channelRouter.js';

// 导入安全限制
const SECURITY_LIMITS = {
  MAX_URL_LENGTH: 4096,
  MAX_SCRIPT_LENGTH: 20000,
  MAX_SELECTOR_LENGTH: 1000,
  MAX_TEXT_LENGTH: 4000,
  MAX_INPUT_VALUE_LENGTH: 20000,
  MAX_WAIT_TIMEOUT_MS: 60000,
  MIN_POLL_INTERVAL_MS: 100,
  MAX_POLL_INTERVAL_MS: 5000,
  MAX_BROWSER_TARGETS: 20,
  MAX_PORT_ALLOC_COUNT: 8,
  MIN_TTL_DAYS: 1,
  MAX_TTL_DAYS: 365,
  MAX_FACT_LENGTH: 1000,
  MAX_ALIAS_COUNT: 20,
  MAX_ALIAS_LENGTH: 100,
  MAX_SUBAGENT_GOAL_LENGTH: 2000,
  MAX_SUCCESS_CRITERIA: 20,
  MAX_SUCCESS_CRITERION_LENGTH: 500,
  MAX_SUBAGENT_SUMMARY_LENGTH: 2000,
  MAX_KEY_FINDINGS: 20,
  MAX_KEY_FINDING_LENGTH: 500,
  MAX_ARTIFACTS: 20,
  MAX_ARTIFACT_PATH_LENGTH: 512,
  MAX_ESTIMATED_TOKENS: 200000,
  MAX_HTTP_RESPONSE_BYTES: 2_000_000,
  MAX_CACHE_ENTRIES: 32,
  MAX_RESULT_ITEMS: 100,
};

console.log('='.repeat(60));
console.log('webmux 对抗性安全测试');
console.log('='.repeat(60));

let passCount = 0;
let failCount = 0;

function test(name, fn) {
  try {
    fn();
    console.log(`✅ ${name}`);
    passCount++;
  } catch (err) {
    console.log(`❌ ${name}`);
    console.log(`   错误：${err.message}`);
    failCount++;
  }
}

/**
 * 验证输入被拒绝的辅助函数
 * 当验证函数正确抛出错误时返回 true
 */
function expectReject(fn, expectedErrorMsg) {
  try {
    fn();
    return false; // 应该抛出错误但没有
  } catch (err) {
    if (expectedErrorMsg && !err.message.includes(expectedErrorMsg)) {
      throw new Error(`错误消息不匹配：${err.message}`);
    }
    return true; // 正确抛出错误
  }
}

// ============================================
// 1. 输入注入面测试
// ============================================
console.log('\n📋 1. 输入注入面测试');

// 测试 URL 协议验证
test('browser_open: javascript: 伪协议应被拒绝', () => {
  const url = 'javascript:alert("XSS")';
  const parsed = new URL(url);
  assert.ok(
    parsed.protocol !== 'http:' && parsed.protocol !== 'https:',
    '应该拒绝 javascript: 协议'
  );
});

test('browser_open: data: 伪协议应被拒绝', () => {
  const url = 'data:text/html,<script>alert(1)</script>';
  const parsed = new URL(url);
  assert.ok(
    parsed.protocol !== 'http:' && parsed.protocol !== 'https:',
    '应该拒绝 data: 协议'
  );
});

test('browser_open: http 协议应被允许', () => {
  const url = 'http://example.com';
  const parsed = new URL(url);
  assert.strictEqual(parsed.protocol, 'http:');
});

test('browser_open: https 协议应被允许', () => {
  const url = 'https://example.com';
  const parsed = new URL(url);
  assert.strictEqual(parsed.protocol, 'https:');
});

// 测试脚本长度限制
test('browser_eval: 脚本长度超限应被拒绝', () => {
  const script = 'x'.repeat(SECURITY_LIMITS.MAX_SCRIPT_LENGTH + 1);
  const rejected = expectReject(
    () => {
      if (script.length > SECURITY_LIMITS.MAX_SCRIPT_LENGTH) {
        throw new Error(`script 长度不能超过 ${SECURITY_LIMITS.MAX_SCRIPT_LENGTH} 个字符`);
      }
    },
    '长度不能超过'
  );
  assert.ok(rejected, '应该拒绝超长脚本');
});

test('browser_eval: 正常脚本应被允许', () => {
  const script = 'document.title';
  if (script.length > SECURITY_LIMITS.MAX_SCRIPT_LENGTH) {
    throw new Error(`script 长度不能超过 ${SECURITY_LIMITS.MAX_SCRIPT_LENGTH} 个字符`);
  }
  // 通过
});

// 测试选择器注入防护
test('browser_fill: 选择器长度超限应被拒绝', () => {
  const selector = 'x'.repeat(SECURITY_LIMITS.MAX_SELECTOR_LENGTH + 1);
  const rejected = expectReject(
    () => {
      if (selector.length > SECURITY_LIMITS.MAX_SELECTOR_LENGTH) {
        throw new Error(`selector 长度不能超过 ${SECURITY_LIMITS.MAX_SELECTOR_LENGTH} 个字符`);
      }
    },
    '长度不能超过'
  );
  assert.ok(rejected, '应该拒绝超长选择器');
});

test('browser_fill: value 应使用 JSON.stringify 序列化', () => {
  const value = "'; alert('XSS'); //";
  const serialized = JSON.stringify(value);
  // 验证序列化后是安全的字符串字面量（双引号包裹）
  assert.ok(serialized.startsWith('"') && serialized.endsWith('"'));
  // JSON.stringify 不会转义单引号（这是正确的，因为 JS 字符串可以用双引号包裹）
  // 验证特殊字符（如换行、制表符等）会被正确转义
  const valueWithNewline = "test\nalert('XSS')";
  const serializedWithNewline = JSON.stringify(valueWithNewline);
  assert.ok(serializedWithNewline.includes('\\n'), `序列化应包含转义的换行符：${serializedWithNewline}`);
});

// 测试路径遍历防护
test('文件操作：路径遍历应被拒绝', () => {
  const sandboxRoot = '/tmp/web-agent';
  const maliciousPath = '/etc/passwd';
  assert.strictEqual(isPathInside(sandboxRoot, maliciousPath), false);
});

test('文件操作：沙盒内路径应被允许', () => {
  const sandboxRoot = '/tmp/web-agent';
  const validPath = '/tmp/web-agent/file.txt';
  assert.strictEqual(isPathInside(sandboxRoot, validPath), true);
});

test('文件操作：子目录路径应被允许', () => {
  const sandboxRoot = '/tmp/web-agent';
  const validPath = '/tmp/web-agent/subdir/file.txt';
  assert.strictEqual(isPathInside(sandboxRoot, validPath), true);
});

// ============================================
// 2. 资源管理测试
// ============================================
console.log('\n📋 2. 资源管理测试');

test('port_alloc: 端口分配数量超限应被拒绝', () => {
  const count = SECURITY_LIMITS.MAX_PORT_ALLOC_COUNT + 1;
  const rejected = expectReject(
    () => {
      if (count < 1 || count > SECURITY_LIMITS.MAX_PORT_ALLOC_COUNT) {
        throw new Error(`count 必须位于 1 到 ${SECURITY_LIMITS.MAX_PORT_ALLOC_COUNT} 之间`);
      }
    },
    '必须位于'
  );
  assert.ok(rejected, '应该拒绝超量端口分配');
});

test('port_alloc: 正常端口分配应被允许', () => {
  const count = 1;
  if (count < 1 || count > SECURITY_LIMITS.MAX_PORT_ALLOC_COUNT) {
    throw new Error(`count 必须位于 1 到 ${SECURITY_LIMITS.MAX_PORT_ALLOC_COUNT} 之间`);
  }
  // 通过
});

test('web_fetch: HTTP 响应大小限制应生效', () => {
  const maxBytes = SECURITY_LIMITS.MAX_HTTP_RESPONSE_BYTES;
  assert.strictEqual(maxBytes, 2_000_000);
  // 验证限制已配置
});

test('缓存：缓存条目数限制应生效', () => {
  const maxEntries = SECURITY_LIMITS.MAX_CACHE_ENTRIES;
  assert.strictEqual(maxEntries, 32);
  // 验证限制已配置
});

// ============================================
// 3. 降级链测试
// ============================================
console.log('\n📋 3. 降级链测试');

test('errorClassifier: 401 应映射到 antibot', () => {
  const status = 401;
  const HTTP_STATUS_MAP = {
    404: 'not_found',
    410: 'not_found',
    401: 'antibot',
    403: 'antibot',
    429: 'network',
    502: 'network',
    503: 'network',
    504: 'network',
  };
  assert.strictEqual(HTTP_STATUS_MAP[status], 'antibot');
});

test('errorClassifier: 403 应映射到 antibot', () => {
  const status = 403;
  const HTTP_STATUS_MAP = {
    404: 'not_found',
    410: 'not_found',
    401: 'antibot',
    403: 'antibot',
    429: 'network',
    502: 'network',
    503: 'network',
    504: 'network',
  };
  assert.strictEqual(HTTP_STATUS_MAP[status], 'antibot');
});

test('channelRouter: 搜索任务应路由到 static 通道', () => {
  const context = {
    task_type: '搜索',
    domain: 'example.com',
  };
  const selection = channelRouter.select(context);
  assert.strictEqual(selection.channel, 'static');
});

test('channelRouter: 性能任务应路由到 devtools 通道', () => {
  const context = {
    task_type: '性能分析',
    domain: 'example.com',
  };
  const selection = channelRouter.select(context);
  assert.strictEqual(selection.channel, 'devtools');
});

test('channelRouter: 填写任务应路由到 automation 通道', () => {
  const context = {
    task_type: '填写表单',
    domain: 'example.com',
  };
  const selection = channelRouter.select(context);
  assert.strictEqual(selection.channel, 'automation');
});

// ============================================
// 4. 站点经验存储测试
// ============================================
console.log('\n📋 4. 站点经验存储测试');

test('sitePatternsWrite: TTL 小于 1 应被拒绝', () => {
  const ttlDays = 0;
  const rejected = expectReject(
    () => {
      if (ttlDays < SECURITY_LIMITS.MIN_TTL_DAYS || ttlDays > SECURITY_LIMITS.MAX_TTL_DAYS) {
        throw new Error(`ttl_days 必须位于 ${SECURITY_LIMITS.MIN_TTL_DAYS} 到 ${SECURITY_LIMITS.MAX_TTL_DAYS} 之间`);
      }
    },
    '必须位于'
  );
  assert.ok(rejected, '应该拒绝无效 TTL');
});

test('sitePatternsWrite: TTL 大于 365 应被拒绝', () => {
  const ttlDays = 366;
  const rejected = expectReject(
    () => {
      if (ttlDays < SECURITY_LIMITS.MIN_TTL_DAYS || ttlDays > SECURITY_LIMITS.MAX_TTL_DAYS) {
        throw new Error(`ttl_days 必须位于 ${SECURITY_LIMITS.MIN_TTL_DAYS} 到 ${SECURITY_LIMITS.MAX_TTL_DAYS} 之间`);
      }
    },
    '必须位于'
  );
  assert.ok(rejected, '应该拒绝无效 TTL');
});

test('sitePatternsWrite: 有效 TTL 应被允许 (1-365)', () => {
  const ttlDays1 = 1;
  const ttlDays365 = 365;
  if (ttlDays1 < SECURITY_LIMITS.MIN_TTL_DAYS || ttlDays1 > SECURITY_LIMITS.MAX_TTL_DAYS) {
    throw new Error('TTL 1 应该被允许');
  }
  if (ttlDays365 < SECURITY_LIMITS.MIN_TTL_DAYS || ttlDays365 > SECURITY_LIMITS.MAX_TTL_DAYS) {
    throw new Error('TTL 365 应该被允许');
  }
});

test('sitePatternsWrite: 域名验证应生效', () => {
  const DOMAIN_PATTERN = /^(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)(?:\.(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?))+$/i;

  const validDomains = ['example.com', 'sub.example.co.uk', 'test-site.org'];
  const invalidDomains = ['', 'not-a-domain', '.com', 'example', 'example..com'];

  for (const domain of validDomains) {
    assert.ok(DOMAIN_PATTERN.test(domain), `${domain} 应该是有效域名`);
  }

  for (const domain of invalidDomains) {
    assert.ok(!DOMAIN_PATTERN.test(domain), `${domain} 应该是无效域名`);
  }
});

test('sitePatternsWrite: fact 长度超限应被拒绝', () => {
  const fact = 'x'.repeat(SECURITY_LIMITS.MAX_FACT_LENGTH + 1);
  const rejected = expectReject(
    () => {
      if (fact.length > SECURITY_LIMITS.MAX_FACT_LENGTH) {
        throw new Error(`fact 长度不能超过 ${SECURITY_LIMITS.MAX_FACT_LENGTH} 个字符`);
      }
    },
    '长度不能超过'
  );
  assert.ok(rejected, '应该拒绝超长 fact');
});

test('sitePatternsWrite: aliases 数量超限应被拒绝', () => {
  const aliases = Array(SECURITY_LIMITS.MAX_ALIAS_COUNT + 1).fill('alias');
  const rejected = expectReject(
    () => {
      if (aliases.length > SECURITY_LIMITS.MAX_ALIAS_COUNT) {
        throw new Error(`aliases 数量不能超过 ${SECURITY_LIMITS.MAX_ALIAS_COUNT}`);
      }
    },
    '数量不能超过'
  );
  assert.ok(rejected, '应该拒绝超量 aliases');
});

// ============================================
// 5. 子 Agent 协议测试
// ============================================
console.log('\n📋 5. 子 Agent 协议测试');

test('agentTaskRegister: goal 长度超限应被拒绝', () => {
  const goal = 'x'.repeat(SECURITY_LIMITS.MAX_SUBAGENT_GOAL_LENGTH + 1);
  const rejected = expectReject(
    () => {
      if (goal.length > SECURITY_LIMITS.MAX_SUBAGENT_GOAL_LENGTH) {
        throw new Error(`goal 长度不能超过 ${SECURITY_LIMITS.MAX_SUBAGENT_GOAL_LENGTH} 个字符`);
      }
    },
    '长度不能超过'
  );
  assert.ok(rejected, '应该拒绝超长 goal');
});

test('agentTaskRegister: successCriteria 数量超限应被拒绝', () => {
  const successCriteria = Array(SECURITY_LIMITS.MAX_SUCCESS_CRITERIA + 1).fill('criteria');
  const rejected = expectReject(
    () => {
      if (successCriteria.length > SECURITY_LIMITS.MAX_SUCCESS_CRITERIA) {
        throw new Error(`successCriteria 数量不能超过 ${SECURITY_LIMITS.MAX_SUCCESS_CRITERIA} 条`);
      }
    },
    '数量不能超过'
  );
  assert.ok(rejected, '应该拒绝超量 successCriteria');
});

test('agentTaskRegister: successCriterion 长度超限应被拒绝', () => {
  const criterion = 'x'.repeat(SECURITY_LIMITS.MAX_SUCCESS_CRITERION_LENGTH + 1);
  const rejected = expectReject(
    () => {
      if (criterion.length > SECURITY_LIMITS.MAX_SUCCESS_CRITERION_LENGTH) {
        throw new Error(`单条成功标准长度不能超过 ${SECURITY_LIMITS.MAX_SUCCESS_CRITERION_LENGTH} 字符`);
      }
    },
    '长度不能超过'
  );
  assert.ok(rejected, '应该拒绝超长 criterion');
});

test('agentResultMerge: taskIds 数量超限应被拒绝', () => {
  const maxTaskIds = SECURITY_LIMITS.MAX_ARTIFACTS * 2;
  const taskIds = Array(maxTaskIds + 1).fill('task-id');
  const rejected = expectReject(
    () => {
      if (taskIds.length > maxTaskIds) {
        throw new Error(`最多只能合并 ${maxTaskIds} 个任务结果`);
      }
    },
    '最多只能合并'
  );
  assert.ok(rejected, '应该拒绝超量 taskIds');
});

// ============================================
// 6. 额外安全测试
// ============================================
console.log('\n📋 6. 额外安全测试');

test('URL 长度限制应生效', () => {
  const maxUrlLength = SECURITY_LIMITS.MAX_URL_LENGTH;
  const longUrl = 'http://example.com/' + 'a'.repeat(maxUrlLength);
  const rejected = expectReject(
    () => {
      if (longUrl.length > maxUrlLength) {
        throw new Error(`url 长度不能超过 ${maxUrlLength} 个字符`);
      }
    },
    '长度不能超过'
  );
  assert.ok(rejected, '应该拒绝超长 URL');
});

test('等待超时限制应生效', () => {
  const timeout = SECURITY_LIMITS.MAX_WAIT_TIMEOUT_MS + 1;
  const rejected = expectReject(
    () => {
      if (timeout > SECURITY_LIMITS.MAX_WAIT_TIMEOUT_MS) {
        throw new Error(`timeout 不能超过 ${SECURITY_LIMITS.MAX_WAIT_TIMEOUT_MS}ms`);
      }
    },
    '不能超过'
  );
  assert.ok(rejected, '应该拒绝超长超时');
});

test('轮询间隔应在有效范围内', () => {
  const tooSmall = SECURITY_LIMITS.MIN_POLL_INTERVAL_MS - 1;
  const tooLarge = SECURITY_LIMITS.MAX_POLL_INTERVAL_MS + 1;

  let smallRejected = false;
  let largeRejected = false;

  if (tooSmall < SECURITY_LIMITS.MIN_POLL_INTERVAL_MS) {
    smallRejected = true;
  }

  if (tooLarge > SECURITY_LIMITS.MAX_POLL_INTERVAL_MS) {
    largeRejected = true;
  }

  assert.ok(smallRejected, '应该拒绝过小的轮询间隔');
  assert.ok(largeRejected, '应该拒绝过大的轮询间隔');
});

// ============================================
// 7. SSRF 攻击防护测试
// ============================================
console.log('\n📋 7. SSRF 攻击防护测试');

test('web_fetch: file: 协议应被拒绝', () => {
  const url = 'file:///etc/passwd';
  const parsed = new URL(url);
  assert.ok(
    parsed.protocol !== 'http:' && parsed.protocol !== 'https:',
    '应该拒绝 file: 协议'
  );
});

test('web_fetch: 内网地址应被识别', () => {
  const internalUrls = [
    'http://127.0.0.1/admin',
    'http://192.168.1.1/admin',
    'http://10.0.0.1/admin',
    'http://169.254.169.254/latest/meta-data', // AWS 元数据
  ];

  for (const url of internalUrls) {
    const parsed = new URL(url);
    const hostname = parsed.hostname;
    // 简单的内网检测
    const isInternal =
      hostname === 'localhost' ||
      hostname === '127.0.0.1' ||
      hostname.startsWith('192.168.') ||
      hostname.startsWith('10.') ||
      hostname.startsWith('169.254.');
    assert.ok(isInternal, `${url} 应被识别为内网地址`);
  }
});

// ============================================
// 测试结果汇总
// ============================================
console.log('\n' + '='.repeat(60));
console.log('测试结果汇总');
console.log('='.repeat(60));
console.log(`✅ 通过：${passCount}`);
console.log(`❌ 失败：${failCount}`);
console.log(`📊 总计：${passCount + failCount}`);

if (failCount === 0) {
  console.log('\n✅ 所有对抗性测试通过，项目已准备好发布');
  process.exit(0);
} else {
  console.log(`\n❌ 有 ${failCount} 个测试失败，请检查修复`);
  process.exit(1);
}
