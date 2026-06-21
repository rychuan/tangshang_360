import { Module } from '@nestjs/common';
import { MyAssessmentController } from './my-assessment.controller';
import { MyAssessmentService } from './my-assessment.service';

@Module({
  controllers: [MyAssessmentController],
  providers: [MyAssessmentService],
})
export class MyAssessmentModule {}