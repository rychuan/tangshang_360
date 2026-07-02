// ---- plugin:assessment_reminder_feishu_send_1 ----
// ============================================================
// 插件 assessment_reminder_feishu_send_1 (考核催办提醒飞书消息发送) 的类型定义
// 由 get_plugin_ai_json 自动生成
// ============================================================

export interface AssessmentReminderFeishuSendOneInput {
  /** 接收提醒的用户ID列表 */
  receiverUserList: string[];
  /** 消息正文内容，支持Markdown格式 */
  cardContentMarkdown: string;
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

// ---- plugin:management_feishu_multitable_crud_analysis_1 ----
// ============================================================
// 插件 management_feishu_multitable_crud_analysis_1 (飞书多维表格) 的类型定义
// 由 get_plugin_ai_json 自动生成
// ============================================================

export interface ManagementFeishuMultitableCrudAnalysisOneBatchaddrecordsInput {
  /** [object Object] */
  records: {
    record: {
      '岗位': string;
      '角色': string;
      '上级': number[];
      '状态': string;
      '编号': string;
      '姓名': number[];
      '部门': string;
    };
  }[];
}

/**
 * capabilityClient.load('management_feishu_multitable_crud_analysis_1').call<ManagementFeishuMultitableCrudAnalysisOneBatchaddrecordsOutput>('batchAddRecords', input)
 * 直接返回此类型，无 .data 包装，直接解构使用：
 * const { records } = result;
 */
export interface ManagementFeishuMultitableCrudAnalysisOneBatchaddrecordsOutput {
  /** [object Object] */
  records: {
    id: string;
  }[];
}

export interface ManagementFeishuMultitableCrudAnalysisOneBatchupdaterecordsInput {
  /** [object Object] */
  records: {
    record: {
      '角色': string;
      '上级': number[];
      '状态': string;
      '编号': string;
      '姓名': number[];
      '部门': string;
      '岗位': string;
    };
    id: string;
  }[];
}

/**
 * capabilityClient.load('management_feishu_multitable_crud_analysis_1').call<ManagementFeishuMultitableCrudAnalysisOneBatchupdaterecordsOutput>('batchUpdateRecords', input)
 * 直接返回此类型，无 .data 包装，直接解构使用：
 * const { records } = result;
 */
export interface ManagementFeishuMultitableCrudAnalysisOneBatchupdaterecordsOutput {
  /** [object Object] */
  records: {
    id: string;
  }[];
}

export interface ManagementFeishuMultitableCrudAnalysisOneSearchrecordsInput {
  /** [object Object] */
  pageToken?: string;
  /** [object Object] */
  pageSize?: number;
  /** [object Object] */
  fieldNames?: string[];
  /** [object Object] */
  sort?: {
    fieldName: string;
    desc: boolean;
  }[];
  /** [object Object] */
  filter?: {
    conjunction: string;
    conditions: {
      value: string[];
      fieldName: string;
      operator: string;
    }[];
  };
}

/**
 * capabilityClient.load('management_feishu_multitable_crud_analysis_1').call<ManagementFeishuMultitableCrudAnalysisOneSearchrecordsOutput>('searchRecords', input)
 * 直接返回此类型，无 .data 包装，直接解构使用：
 * const { hasMore, pageToken, total, ... } = result;
 */
export interface ManagementFeishuMultitableCrudAnalysisOneSearchrecordsOutput {
  /** [object Object] */
  hasMore: boolean;
  /** [object Object] */
  pageToken?: string;
  /** [object Object] */
  total?: number;
  /** [object Object] */
  records: {
    id: string;
    record: {
      '角色': string;
      '上级': number[];
      '状态': string;
      '编号': {
        text: string;
      };
      '姓名': number[];
      '部门': string;
      '岗位': string;
    };
  }[];
}
// ---- end:management_feishu_multitable_crud_analysis_1 ----