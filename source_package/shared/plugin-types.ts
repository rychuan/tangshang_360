// ---- plugin:assessment_reminder_feishu_send_1 ----
// ============================================================
// 插件 assessment_reminder_feishu_send_1 (考核催办提醒飞书消息发送) 的类型定义
// 由 get_plugin_ai_json 自动生成
// ============================================================

export interface AssessmentReminderFeishuSendOneInput {
  /** 消息正文内容，支持Markdown格式 */
  cardContentMarkdown: string;
  /** 接收提醒的用户ID列表 */
  receiverUserList: string[];
}

/**
 * capabilityClient.load('assessment_reminder_feishu_send_1').call<AssessmentReminderFeishuSendOneOutput>('send_feishu_message', input)
 * 直接返回此类型，无 .data 包装，直接解构使用：
 * const { success } = result;
 */
export interface AssessmentReminderFeishuSendOneOutput {
  /** [object Object] */
  success: boolean;
}
// ---- end:assessment_reminder_feishu_send_1 ----