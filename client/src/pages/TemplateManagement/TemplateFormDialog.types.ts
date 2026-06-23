import { z } from 'zod';

export const indicatorSchema = z.object({
  content: z.string().min(1, '指标内容不能为空'),
  description: z.string().default(''),
  algorithm: z.string().default(''),
  dataSource: z.string().default(''),
  weight: z.coerce.number().min(1, '权重至少为1'),
});

export const dimensionSchema = z.object({
  name: z.string().min(1, '维度名称不能为空'),
  weight: z.coerce.number().min(0, '权重不能为负').max(100, '权重不能超过100'),
  indicators: z.array(indicatorSchema).min(1, '至少需要一个指标'),
});

export const formSchema = z.object({
  name: z.string().min(1, '模板名称不能为空'),
  position: z.string().min(1, '岗位不能为空'),
  type: z.enum(['monthly', 'probation']),
  dimensions: z.array(dimensionSchema).min(1, '至少需要一个维度'),
});

export type FormData = z.infer<typeof formSchema>;

export const POSITION_OPTIONS: string[] = [
  '销售经理',
  '客户成功经理',
  '技术支持工程师',
  '产品经理',
  '研发工程师',
  '市场专员',
];