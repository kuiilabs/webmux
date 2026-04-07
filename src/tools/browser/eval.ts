/**
 * browser_eval 工具 - 在指定 tab 中执行 JavaScript 代码
 */

import { success, error, pageError, networkError } from '../../shared/result.js';
import type { ToolResult } from '../../shared/types.js';
import { CDP_PROXY } from '../../shared/constants.js';

interface EvalResult {
  targetId: string;
  result: unknown;
  resultType: string;
}

export async function browserEval(params: {
  targetId: string;
  script: string;
}): Promise<ToolResult<EvalResult>> {
  const { targetId, script } = params;

  if (!targetId) {
    return error(
      pageError('缺少必要参数：targetId')
    );
  }

  if (!script) {
    return error(
      pageError('缺少必要参数：script')
    );
  }

  try {
    const response = await fetch(
      `http://localhost:${CDP_PROXY.DEFAULT_PORT}/eval?target=${targetId}`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'text/plain',
        },
        body: script,
      }
    );

    if (!response.ok) {
      return error(
        pageError(`执行脚本失败：${response.statusText}`)
      );
    }

    const result = await response.json();

    // 判断结果类型
    const resultType = typeof result === 'object' && result !== null
      ? Array.isArray(result)
        ? 'array'
        : 'object'
      : typeof result;

    return success(
      {
        targetId,
        result,
        resultType,
      },
      `脚本执行成功，返回类型为 ${resultType}`
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return error(
      networkError(`连接 CDP Proxy 失败：${message}`)
    );
  }
}
