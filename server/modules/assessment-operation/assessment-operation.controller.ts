import { Controller, Get, Post, Param, Body, Req, Query } from '@nestjs/common';
import { NeedLogin } from '@lark-apaas/fullstack-nestjs-core';
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
  SignSubmissionResponse,
} from '@shared/api.interface';
import { normalizeAppBaseUrl } from '@server/common/assessment/notification';

@Controller('api/assessment-instances')
export class AssessmentOperationController {
  constructor(
    private readonly service: AssessmentOperationService,
    private readonly signTokenService: SignTokenService,
  ) {}

  @NeedLogin()
  @Get('sign-session')
  async signSession(
    @Req() req: Request,
    @Query('token') token: string,
  ): Promise<SignSessionResponse> {
    const { userId } = req.userContext as { userId: string };
    return this.service.getSignSession(token, userId);
  }

  @NeedLogin()
  @RequirePermission('my_assessments', 'edit')
  @Post('sign-session')
  async signByToken(
    @Req() req: Request,
    @Body() body: SignByTokenRequest,
  ): Promise<SignSubmissionResponse> {
    const { userId, userName } = req.userContext as {
      userId: string;
      userName: string;
    };
    return this.service.signByToken(
      body.token,
      userId,
      userName,
      body.signImage,
    );
  }

  @NeedLogin()
  @Get('sign-session/status')
  async signStatus(
    @Req() req: Request,
    @Query('token') token: string,
  ): Promise<SignStatusResponse> {
    const { userId } = req.userContext as { userId: string };
    return this.service.getSignStatus(token, userId);
  }

  @RequirePermission('statistics', 'export')
  @NeedLogin()
  @Get(':id/export-detail')
  async exportDetail(@Req() req: Request, @Param('id') id: string) {
    const { userId } = req.userContext as { userId: string };
    return this.service.detail(id, userId);
  }

  @RequirePermission('my_assessments', 'view')
  @NeedLogin()
  @Get(':id')
  async detail(@Req() req: Request, @Param('id') id: string) {
    const { userId } = req.userContext as { userId: string };
    return this.service.detail(id, userId);
  }

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
    const appBaseUrl = normalizeAppBaseUrl(body.appBaseUrl);
    const session = await this.service.generateSignSession(
      id,
      body.signType,
      userId,
    );
    const token = await this.signTokenService.generateToken({
      instanceId: session.instanceId,
      signType: session.signType,
      userId,
      userName,
    });
    const signUrl = `${appBaseUrl}/mobile-sign?token=${encodeURIComponent(token)}`;

    try {
      await this.signTokenService.sendSignMessage(
        userId,
        signUrl,
        session.period,
        session.signType,
        session.employeeName,
      );
    } catch (error) {
      await this.signTokenService.deleteSession(token);
      throw error;
    }

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
