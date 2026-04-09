/**
 * 通道路由器
 * 根据任务类型和上下文选择最佳通道
 */

import type { ChannelType, ChannelContext } from '../shared/types.js';

/**
 * 通道选择结果
 */
export interface ChannelSelection {
  /** 选中的通道 */
  channel: ChannelType;
  /** 选择原因 */
  reason: string;
  /** 降级链 */
  fallbackChain: ChannelType[];
  /** 是否从经验库读取了建议 */
  fromExperience: boolean;
}

/**
 * 站点经验中的通道偏好
 */
interface SiteChannelPreference {
  /** 推荐的通道 */
  recommended: ChannelType;
  /** 原因 */
  reason: string;
  /** 是否需要登录态 */
  requiresAuth: boolean;
}

/**
 * 通道路由器类
 */
export class ChannelRouter {
  /**
   * 站点通道偏好缓存（运行时内存缓存）
   */
  private static sitePreferences: Map<string, SiteChannelPreference> = new Map();

  /**
   * 根据上下文选择通道
   */
  static select(context: ChannelContext): ChannelSelection {
    const {
      task_type,
      is_dev_task,
      domain,
    } = context;

    // 1. 检查站点经验是否有推荐
    if (domain) {
      const pref = this.sitePreferences.get(domain);
      if (pref) {
        return {
          channel: pref.recommended,
          reason: `站点经验推荐：${pref.reason}`,
          fallbackChain: this.getFallbackChain(pref.recommended, is_dev_task),
          fromExperience: true,
        };
      }
    }

    // 2. 根据任务类型一级决策
    const primaryChannel = this.selectByTaskType(task_type);

    // 3. 二级修正
    const correctedChannel = this.applyCorrections(
      primaryChannel,
      context
    );

    // 4. 构建降级链
    const fallbackChain = this.getFallbackChain(correctedChannel, is_dev_task);

    return {
      channel: correctedChannel,
      reason: this.getReason(correctedChannel, context),
      fallbackChain,
      fromExperience: false,
    };
  }

  /**
   * 根据任务类型选择通道
   */
  private static selectByTaskType(taskType: string): ChannelType {
    const type = taskType.toLowerCase();

    // 搜索、发现类任务 → 静态通道
    if (type.includes('搜索') || type.includes('search') || type.includes('找')) {
      return 'static';
    }

    // 性能、调试、分析类任务 → DevTools
    if (
      type.includes('性能') ||
      type.includes('perf') ||
      type.includes('调试') ||
      type.includes('debug') ||
      type.includes('分析') ||
      type.includes('network') ||
      type.includes('console')
    ) {
      return 'devtools';
    }

    // 操作、填写、上传类任务 → 自动化通道
    if (
      type.includes('填写') ||
      type.includes('填表') ||
      type.includes('上传') ||
      type.includes('upload') ||
      type.includes('点击') ||
      type.includes('submit')
    ) {
      return 'automation';
    }

    // 默认：浏览器通道（处理动态页面）
    return 'browser';
  }

  /**
   * 应用二级修正
   */
  private static applyCorrections(
    channel: ChannelType,
    context: ChannelContext
  ): ChannelType {
    const { requires_auth, has_antibot, is_dev_task } = context;

    // 需要登录态 → 优先浏览器/自动化
    if (requires_auth && (channel === 'static' || channel === 'devtools')) {
      return 'browser';
    }

    // 已知有反爬 → 浏览器优先
    if (has_antibot && channel === 'static') {
      return 'browser';
    }

    // 开发者任务 → DevTools 优先级提升
    if (is_dev_task && channel !== 'devtools') {
      // 但不强制切换，只是提升优先级
      // 这里简单处理：如果是浏览器通道且是 dev 任务，可以考虑 devtools
      return channel;
    }

    return channel;
  }

  /**
   * 获取降级链
   */
  private static getFallbackChain(
    primary: ChannelType,
    isDevTask = false
  ): ChannelType[] {
    const priority: ChannelType[] = isDevTask
      ? ['devtools', 'browser', 'automation', 'static']
      : ['static', 'browser', 'automation', 'devtools'];

    return this.reorderChain(primary, priority);
  }

  /**
   * 重新排序降级链
   */
  private static reorderChain(
    primary: ChannelType,
    priority: ChannelType[]
  ): ChannelType[] {
    const ordered = priority.filter(channel => channel !== primary);
    return ordered;
  }

  /**
   * 获取选择原因
   */
  private static getReason(channel: ChannelType, context: ChannelContext): string {
    const reasons: Record<ChannelType, string> = {
      static: '静态通道适合文档、文章等静态内容',
      browser: '浏览器通道适合动态页面和登录态访问',
      automation: '自动化通道适合表单填写、文件上传等交互操作',
      devtools: 'DevTools 通道适合性能分析和网络调试',
    };

    let reason = reasons[channel];

    // 追加修正原因
    if (context.requires_auth) {
      reason += '（已考虑登录态需求）';
    }
    if (context.has_antibot) {
      reason += '（已考虑反爬因素）';
    }

    return reason;
  }

  /**
   * 注册站点通道偏好
   */
  static registerPreference(domain: string, preference: SiteChannelPreference): void {
    this.sitePreferences.set(domain, preference);
  }

  /**
   * 清除站点通道偏好
   */
  static clearPreference(domain: string): void {
    this.sitePreferences.delete(domain);
  }

  /**
   * 获取所有注册的偏好
   */
  static getPreferences(): Map<string, SiteChannelPreference> {
    return new Map(this.sitePreferences);
  }
}

export const channelRouter = ChannelRouter;
