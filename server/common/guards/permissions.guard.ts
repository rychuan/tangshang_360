import {
  Injectable,
  CanActivate,
  ExecutionContext,
  Logger,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { RoleManagerService } from '@server/modules/role-manager/role-manager.service';
import {
  PERMISSION_META_KEY,
  type RequiredPermission,
} from '../decorators/require-permission.decorator';

@Injectable()
export class PermissionsGuard implements CanActivate {
  private readonly logger = new Logger(PermissionsGuard.name);

  constructor(
    private readonly reflector: Reflector,
    private readonly roleManagerService: RoleManagerService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const required = this.reflector.get<RequiredPermission>(
      PERMISSION_META_KEY,
      context.getHandler(),
    );

    // 无 @RequirePermission 装饰器 → 放行
    if (!required) {
      return true;
    }

    const request = context.switchToHttp().getRequest();
    const userId: string = request.userContext?.userId || '';

    if (!userId) {
      this.logger.warn(
        'No userId in request context, denying permission check',
      );
      return false;
    }

    const hasPermission = await this.roleManagerService.checkUserPermission(
      userId,
      required.resource,
      required.action,
    );

    if (!hasPermission) {
      this.logger.warn(
        `User ${userId} denied ${required.action} on ${required.resource}`,
      );
    }

    return hasPermission;
  }
}
