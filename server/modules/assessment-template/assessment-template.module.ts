import { Module } from '@nestjs/common';
import { AssessmentTemplateController } from './assessment-template.controller';
import { AssessmentTemplateService } from './assessment-template.service';

@Module({
  controllers: [AssessmentTemplateController],
  providers: [AssessmentTemplateService],
  exports: [AssessmentTemplateService],
})
export class AssessmentTemplateModule {}