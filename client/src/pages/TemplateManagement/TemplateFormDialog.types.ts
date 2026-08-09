import { z } from 'zod';

export const indicatorSchema = z.object({
  content: z.string().min(1, '指标内容不能为空'),
  description: z.string().default(''),
  algorithm: z.string().default(''),
  dataSource: z.string().default(''),
  weight: z.coerce.number().min(1, '权重至少为1'),
});

export const dimensionSchema = z
  .object({
    name: z.string().min(1, '维度名称不能为空'),
    weight: z.coerce.number().min(0, '权重不能为负').max(100, '权重不能超过100'),
    /**
     * 加减分维度：不参与权重100校验、无指标（只保留维度名称+说明），
     * 评分支持负分，分数直接加入绩效总分。
     */
    isBonus: z.boolean().default(false),
    description: z.string().default(''),
    indicators: z.array(indicatorSchema).default([]),
  })
  .superRefine((val, ctx) => {
    // 普通维度至少需要一个指标；加减分维度无指标（整体评分）
    if (!val.isBonus && val.indicators.length === 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['indicators'],
        message: '至少需要一个指标',
      });
    }
  });

export const formSchema = z.object({
  name: z.string().min(1, '模板名称不能为空'),
  position: z.string().min(1, '岗位不能为空'),
  type: z.enum(['monthly', 'probation']),
  dimensions: z.array(dimensionSchema).min(1, '至少需要一个维度'),
});

export type FormData = z.infer<typeof formSchema>;

// 岗位选项从字段管理-岗位管理获取，此处仅作为硬编码兜底
export const POSITION_OPTIONS: string[] = [];
