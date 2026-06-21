import { Controller, Get, Post, Param, Body, Req } from '@nestjs/common';
import { NeedLogin, CanRole } from '@lark-apaas/fullstack-nestjs-core';
import type { Request } from 'express';
import { AssessmentOperationService } from './assessment-operation.service';
import type {
  RatingSubmitRequest,
  SignRequest,
} from '@shared/api.interface';

@Controller('api/assessment-instances')
export class AssessmentOperationController {
  constructor(private readonly service: AssessmentOperationService) {}

  @CanRole(['admin', 'hrd', 'dept_head', 'supervisor', 'employee'])
  @Get(':id')
  async detail(@Param('id') id: string) {
    return this.service.detail(id);
  }

  @CanRole(['admin', 'supervisor', 'employee'])
  @NeedLogin()
  @Post(':id/self-rating')
  async submitSelfRating(
    @Req() req: Request,
    @Param('id') id: string,
    @Body() body: RatingSubmitRequest,
  ) {
    const { userId } = req.userContext as {
      userId: string;
    };
    return this.service.submitSelfRating(id, body, userId);
  }

  @CanRole(['admin', 'dept_head', 'supervisor'])
  @NeedLogin()
  @Post(':id/supervisor-rating')
  async submitSupervisorRating(
    @Req() req: Request,
    @Param('id') id: string,
    @Body() body: RatingSubmitRequest,
  ) {
    const { userId } = req.userContext as {
      userId: string;
    };
    return this.service.submitSupervisorRating(id, body, userId);
  }

  @CanRole(['admin', 'dept_head', 'supervisor', 'employee'])
  @NeedLogin()
  @Post(':id/sign')
  async sign(
    @Req() req: Request,
    @Param('id') id: string,
    @Body() body: SignRequest,
  ) {
    const { userId, userName } = req.userContext as {
      userId: string;
      userName: string;
    };
    return this.service.sign(id, body, userId, userName);
  }
}