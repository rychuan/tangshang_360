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

// ---- plugin:performance_template_sync_feishu_multitable_crud_analysis_2 ----
// ============================================================
// 插件 performance_template_sync_feishu_multitable_crud_analysis_2 (绩效考核记录) 的类型定义
// 由 get_plugin_ai_json 自动生成
// ============================================================

export interface PerformanceTemplateSyncFeishuMultitableCrudAnalysisTwoBatchaddrecordsInput {
  /** [object Object] */
  records: {
    record: {
      '岗位': string;
      '完成时间': number;
      '部门': string;
      '上级': number[];
      '总分': number;
      '等级': string;
      '状态': string;
      ID: string;
      '绩效周期': string;
      '员工': number[];
    };
  }[];
}

/**
 * capabilityClient.load('performance_template_sync_feishu_multitable_crud_analysis_2').call<PerformanceTemplateSyncFeishuMultitableCrudAnalysisTwoBatchaddrecordsOutput>('batchAddRecords', input)
 * 直接返回此类型，无 .data 包装，直接解构使用：
 * const { records } = result;
 */
export interface PerformanceTemplateSyncFeishuMultitableCrudAnalysisTwoBatchaddrecordsOutput {
  /** [object Object] */
  records: {
    id: string;
  }[];
}

export interface PerformanceTemplateSyncFeishuMultitableCrudAnalysisTwoBatchupdaterecordsInput {
  /** [object Object] */
  records: {
    id: string;
    record: {
      '部门': string;
      '岗位': string;
      '等级': string;
      ID: string;
      '绩效周期': string;
      '总分': number;
      '状态': string;
      '完成时间': number;
      '员工': number[];
      '上级': number[];
    };
  }[];
}

/**
 * capabilityClient.load('performance_template_sync_feishu_multitable_crud_analysis_2').call<PerformanceTemplateSyncFeishuMultitableCrudAnalysisTwoBatchupdaterecordsOutput>('batchUpdateRecords', input)
 * 直接返回此类型，无 .data 包装，直接解构使用：
 * const { records } = result;
 */
export interface PerformanceTemplateSyncFeishuMultitableCrudAnalysisTwoBatchupdaterecordsOutput {
  /** [object Object] */
  records: {
    id: string;
  }[];
}

export interface PerformanceTemplateSyncFeishuMultitableCrudAnalysisTwoSearchrecordsInput {
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
      fieldName: string;
      operator: string;
      value: string[];
    }[];
  };
  /** [object Object] */
  pageToken?: string;
  /** [object Object] */
  pageSize?: number;
}

/**
 * capabilityClient.load('performance_template_sync_feishu_multitable_crud_analysis_2').call<PerformanceTemplateSyncFeishuMultitableCrudAnalysisTwoSearchrecordsOutput>('searchRecords', input)
 * 直接返回此类型，无 .data 包装，直接解构使用：
 * const { records, hasMore, pageToken, ... } = result;
 */
export interface PerformanceTemplateSyncFeishuMultitableCrudAnalysisTwoSearchrecordsOutput {
  /** [object Object] */
  records: {
    record: {
      '总分': number;
      '员工': number[];
      '岗位': string;
      '部门': string;
      '上级': number[];
      '等级': string;
      '状态': string;
      '完成时间': number;
      ID: {
        text: string;
      };
      '绩效周期': unknown;
    };
    id: string;
  }[];
  /** [object Object] */
  hasMore: boolean;
  /** [object Object] */
  pageToken?: string;
  /** [object Object] */
  total?: number;
}
// ---- end:performance_template_sync_feishu_multitable_crud_analysis_2 ----