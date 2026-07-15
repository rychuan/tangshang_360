import { Controller, Get, Post, Param, Body, Req, Query } from '@nestjs/common';
import { NeedLogin, CanRole } from '@lark-apaas/fullstack-nestjs-core';
import { RequirePermission } from '@server/common/decorators/require-permission.decorator';
import type { Request } from 'express';
import { AssessmentOperationService } from './assessment-operation.service';
import { SignTokenService } from './sign-token.service';
import type {
  RatingSubmitRequest,
  RatingSubmitWithSignRequest,
  SignRequest,
  SignTokenRequest,
  SignTokenResponse,
  SignSessionResponse,
  SignByTokenRequest,
  SignStatusResponse,
} from '@shared/api.interface';

@Controller('api/assessment-instances')
export class AssessmentOperationController {
  constructor(
    private readonly service: AssessmentOperationService,
    private readonly signTokenService: SignTokenService,
  ) {}

  @Get('sign-session')
  async signSession(@Query('token') token: string): Promise<SignSessionResponse> {
    if (!token) {
      return { instanceId: '', signType: 'self', employeeName: '', period: '' };
    }
    const payload = this.signTokenService.validateToken(token);
    if (!payload) {
      return { instanceId: '', signType: 'self', employeeName: '', period: '' };
    }
    const session = await this.service.getSignSession(
      payload.instanceId,
      payload.signType,
    );
    return session;
  }

  @Post('sign-session')
  async signByToken(
    @Req() req: Request,
    @Body() body: SignByTokenRequest,
  ): Promise<{ success: boolean; status: string }> {
    const payload = this.signTokenService.consumeToken(body.token);
    if (!payload) {
      return { success: false, status: 'expired' };
    }
    return this.service.signByToken(payload, body.signName, body.signImage);
  }

  @Get('sign-session/status')
  async signStatus(@Query('token') token: string): Promise<SignStatusResponse> {
    const payload = this.signTokenService.validateToken(token);
    return { signed: !payload };
  }

  @CanRole(['admin', 'hrd', 'dept_head', 'supervisor', 'employee'])
  @RequirePermission('my_assessments', 'view')
  @Get(':id')
  async detail(@Req() req: Request, @Param('id') id: string) {
    const { userId } = req.userContext as { userId: string };
    return this.service.detail(id, userId);
  }

  @CanRole(['admin', 'hrd', 'dept_head', 'supervisor', 'employee'])
  @RequirePermission('my_assessments', 'edit')
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

  @CanRole(['admin', 'hrd', 'dept_head', 'supervisor', 'employee'])
  @RequirePermission('my_assessments', 'edit')
  @NeedLogin()
  @Post(':id/self-rating-with-sign')
  async submitSelfRatingWithSign(
    @Req() req: Request,
    @Param('id') id: string,
    @Body() body: RatingSubmitWithSignRequest,
  ) {
    const { userId, userName } = req.userContext as {
      userId: string;
      userName: string;
    };
    return this.service.submitSelfRatingWithSign(id, body, userId, userName);
  }

  @CanRole(['admin', 'hrd', 'dept_head', 'supervisor'])
  @RequirePermission('my_assessments', 'edit')
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

  @CanRole(['admin', 'hrd', 'dept_head', 'supervisor'])
  @RequirePermission('my_assessments', 'edit')
  @NeedLogin()
  @Post(':id/supervisor-rating-with-sign')
  async submitSupervisorRatingWithSign(
    @Req() req: Request,
    @Param('id') id: string,
    @Body() body: RatingSubmitWithSignRequest,
  ) {
    const { userId, userName } = req.userContext as {
      userId: string;
      userName: string;
    };
    return this.service.submitSupervisorRatingWithSign(
      id,
      body,
      userId,
      userName,
    );
  }

  @CanRole(['admin', 'hrd', 'dept_head', 'supervisor', 'employee'])
  @RequirePermission('my_assessments', 'edit')
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

  @CanRole(['admin', 'hrd', 'dept_head', 'supervisor', 'employee'])
  @RequirePermission('my_assessments', 'edit')
  @NeedLogin()
  @Post(':id/sign-token')
  async generateSignToken(
    @Req() req: Request,
    @Param('id') id: string,
    @Body() body: SignTokenRequest,
  ): Promise<SignTokenResponse> {
    const { userId, userName } = req.userContext as {
      userId: string;
      userName: string;
    };
    const session = await this.service.generateSignSession(id, body.signType, userId, userName);
    const token = this.signTokenService.generateToken({
      instanceId: session.instanceId,
      signType: session.signType,
      userId,
      userName,
    });
    const signUrl = `${body.appBaseUrl}/mobile-sign?token=${encodeURIComponent(token)}`;

    void this.signTokenService.sendSignMessage(
      userId,
      signUrl,
      session.period,
      session.signType,
      session.employeeName,
    );

    return {
      token,
      signUrl,
      instanceId: session.instanceId,
      signType: session.signType,
      employeeName: session.employeeName,
      period: session.period,
    };
  }

}
