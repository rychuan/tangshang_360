-- 导入绩效模板: 主播月度绩效考核
-- 3 个维度，4 个指标

DO $$
DECLARE
  tpl_id uuid := gen_random_uuid();
  dim1_id uuid := gen_random_uuid();
  dim2_id uuid := gen_random_uuid();
  dim3_id uuid := gen_random_uuid();
BEGIN

  -- 创建模板
  INSERT INTO assessment_template (id, name, position, type, is_active)
  VALUES (tpl_id, E'主播月度绩效考核', E'主播', 'monthly', true);

  -- 维度: 显性工作指标 (权重40%)
  INSERT INTO assessment_dimension (id, template_id, name, weight, sort_order)
  VALUES (dim1_id, tpl_id, E'显性工作指标', E'40', 0);

  INSERT INTO assessment_indicator (id, dimension_id, content, description, algorithm, data_source, weight, sort_order)
  VALUES (gen_random_uuid(), dim1_id, E'直播时长', E'直播+助播总时长', E'≥88h                                  100分\n88h＞AR≥60h                     80分\n60h＞AR≥44h                     60分\n＜44h                                 0分', E'实际直播数据', E'20', 0);
  INSERT INTO assessment_indicator (id, dimension_id, content, description, algorithm, data_source, weight, sort_order)
  VALUES (gen_random_uuid(), dim1_id, E'直播业绩', E'实际GMV', E'≥300W                               100分\n300W＞AR≥200W               80分\n200W＞AR≥100W               60分\n＜100W                              0分', E'实际直播数据', E'20', 1);

  -- 维度: 关键行为指标 (权重20%)
  INSERT INTO assessment_dimension (id, template_id, name, weight, sort_order)
  VALUES (dim2_id, tpl_id, E'关键行为指标', E'20', 1);

  INSERT INTO assessment_indicator (id, dimension_id, content, description, algorithm, data_source, weight, sort_order)
  VALUES (gen_random_uuid(), dim2_id, E'直播规范', E'直播期间无违规', E'轻度违规（弹窗）                扣2分/次 \n中度违规（短暂禁播）          扣5分/次 \n严重违规（封号&长久禁播） 扣10分/次', E'实际直播数据', E'20', 0);

  -- 维度: 工作态度 (权重40%)
  INSERT INTO assessment_dimension (id, template_id, name, weight, sort_order)
  VALUES (dim3_id, tpl_id, E'工作态度', E'40', 2);

  INSERT INTO assessment_indicator (id, dimension_id, content, description, algorithm, data_source, weight, sort_order)
  VALUES (gen_random_uuid(), dim3_id, E'工作态度', E'日常工作任务及行为规范', E'每周需提交1次逐字稿，缺少1次扣5分/次 \n抽查直播话术如不符合要求 扣5分/次 \n核实后真实有效的投诉 扣5分/次 \n直播/中控期间玩手机扣5分/次，情节严重影响直播间的，则此项得0分', E'直接上级/跨部门反馈', E'40', 0);

END $$;
