import { Module } from '@nestjs/common';
import { AssessmentPublishController } from './assessment-publish.controller';
import { AssessmentPublishService } from './assessment-publish.service';

@Module({
  controllers: [AssessmentPublishController],
  providers: [AssessmentPublishService],
  exports: [AssessmentPublishService],
})
export class AssessmentPublishModule {}