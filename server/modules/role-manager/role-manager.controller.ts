import {
  BadRequestException,
  BadGatewayException,
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  Query,
  Req,
} from '@nestjs/common';
import { NeedLogin } from '@lark-apaas/fullstack-nestjs-core';
import { CanRole } from '@lark-apaas/fullstack-nestjs-core';
import { RequirePermission } from '@server/common/decorators/require-permission.decorator';
import { AuthorizationSDK } from '@lark-apaas/fullstack-nestjs-core';
import { RoleManagerService } from './role-manager.service';
import { AuthorizationSyncService } from './authorization-sync.service';
import type { Request } from 'express';
import type {
  CreateRoleRequest,
  UpdateRoleRequest,
  AddMembersRequest,
  RemoveMembersRequest,
  SearchMembersRequest,
  UpdateRolePermissionsRequest,
  RolePermissionConfig,
  PermissionItem,
  RoleMemberMutationResponse,
} from '@shared/api.interface';
import { DEFAULT_PERMISSIONS } from '@shared/api.interface';
import { isBuiltinRole } from '@shared/types/permission.types';

@Controller('api/role_manager')
export class RoleManagerController {
  constructor(
    private readonly authzSDK: AuthorizationSDK,
    private readonly roleManagerService: RoleManagerService,
    private readonly authorizationSyncService: AuthorizationSyncService,
  ) {}

  @NeedLogin()
  @Post('my-roles')
  async getMyRoles(@Req() req: Request) {
    const userId = req.userContext?.userId || '';
    const roleList = await this.roleManagerService.getUserRoles(userId);
    return { data: { roleList } };
  }

  @NeedLogin()
  @Post('bootstrap')
  async bootstrap(@Req() req: Request) {
    const userId = req.userContext?.userId || '';
    const status = await this.roleManagerService.bootstrapAdmin(
      userId,
      this.authorizationSyncService,
    );
    return { data: { status } };
  }

  @NeedLogin()
  @Get('my-permissions')
  async getMyPermissions(@Req() req: Request) {
    const userId = req.userContext?.userId || '';
    const permissions =
      await this.roleManagerService.getUserEffectivePermissions(userId);
    return { data: { permissions } };
  }

  @CanRole(['admin', 'hrd'])
  @RequirePermission('permission_management', 'view')
  @Get('roles')
  async listRoles() {
    return this.authzSDK.roles.list();
  }

  @CanRole(['admin', 'hrd'])
  @RequirePermission('permission_management', 'view')
  @Get('roles/:bizID')
  async getRole(@Param('bizID') bizID: string) {
    return this.authzSDK.roles.get(bizID);
  }

  @CanRole(['admin'])
  @RequirePermission('permission_management', 'edit')
  @NeedLogin()
  @Post('roles')
  async createRole(
    @Body() dto: CreateRoleRequest,
    @Req() req: Request,
  ) {
    const operatorId = req.userContext?.userId || '';
    return this.roleManagerService.createRole(dto, operatorId);
  }

  @CanRole(['admin'])
  @RequirePermission('permission_management', 'edit')
  @NeedLogin()
  @Put('roles/:bizID')
  async updateRole(
    @Param('bizID') bizID: string,
    @Body() dto: UpdateRoleRequest,
    @Req() req: Request,
  ) {
    const operatorId = req.userContext?.userId || '';
    return this.roleManagerService.updateRole(bizID, dto, operatorId);
  }

  @CanRole(['admin'])
  @RequirePermission('permission_management', 'edit')
  @NeedLogin()
  @Delete('roles/:bizID')
  async deleteRole(
    @Param('bizID') bizID: string,
    @Req() req: Request,
  ) {
    if (isBuiltinRole(bizID)) {
      throw new BadRequestException('内置角色不可删除');
    }
    const operatorId = req.userContext?.userId || '';
    return this.roleManagerService.deleteCustomRole(
      bizID,
      () => this.authzSDK.roles.delete(bizID),
      operatorId,
    );
  }

  @CanRole(['admin', 'hrd'])
  @RequirePermission('permission_management', 'view')
  @Get('roles/:bizID/members')
  async listMembers(
    @Param('bizID') bizID: string,
    @Query('type') type?: string,
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
  ) {
    const parsedPage = page ? parseInt(page, 10) : NaN;
    const parsedPageSize = pageSize ? parseInt(pageSize, 10) : NaN;
    // 仅合法分页数字（>=1）透传 SDK 分页；0/NaN/负值等脏参数不传平台，
    // 直接拉全量，避免平台参数校验失败导致 403
    if (parsedPage >= 1 || parsedPageSize >= 1) {
      return this.authzSDK.members.list(bizID, {
        type: type as any,
        page: parsedPage >= 1 ? parsedPage : undefined,
        pageSize: parsedPageSize >= 1 ? parsedPageSize : undefined,
      });
    }
    return this.roleManagerService.listAllMembers(bizID, type);
  }

  @CanRole(['admin'])
  @RequirePermission('permission_management', 'edit')
  @NeedLogin()
  @Post('roles/:bizID/members')
  async addMembers(
    @Param('bizID') bizID: string,
    @Body() dto: AddMembersRequest,
    @Req() req: Request,
  ): Promise<RoleMemberMutationResponse> {
    const operatorId = req.userContext?.userId || '';
    const userIds = this.getExplicitUserIds(bizID, dto);
    const result = await this.roleManagerService.mutateCustomRoleMembers(
      bizID,
      userIds,
      'add',
      this.authorizationSyncService,
      operatorId,
    );
    return this.requireSuccessfulMutation(result);
  }

  @CanRole(['admin'])
  @RequirePermission('permission_management', 'edit')
  @NeedLogin()
  @Post('roles/:bizID/members/batch_remove')
  async removeMembers(
    @Param('bizID') bizID: string,
    @Body() dto: RemoveMembersRequest,
    @Req() req: Request,
  ): Promise<RoleMemberMutationResponse> {
    const operatorId = req.userContext?.userId || '';
    const userIds = this.getExplicitUserIds(bizID, dto);
    const result = await this.roleManagerService.mutateCustomRoleMembers(
      bizID,
      userIds,
      'remove',
      this.authorizationSyncService,
      operatorId,
    );
    return this.requireSuccessfulMutation(result);
  }

  @CanRole(['admin', 'hrd'])
  @RequirePermission('permission_management', 'view')
  @Post('search')
  async search(@Body() dto: SearchMembersRequest) {
    return this.authzSDK.search.search(dto);
  }

  @CanRole(['admin', 'hrd'])
  @RequirePermission('permission_management', 'view')
  @Get('roles/:bizID/permissions')
  async getRolePermissions(
    @Param('bizID') bizID: string,
  ): Promise<RolePermissionConfig> {
    const config = await this.roleManagerService.getPermissionConfig(bizID);
    if (config) {
      return config;
    }
    const preset = (DEFAULT_PERMISSIONS as Record<string, PermissionItem[]>)[
      bizID
    ];
    return {
      roleBizId: bizID,
      permissions: preset || [],
    };
  }

  @CanRole(['admin'])
  @RequirePermission('permission_management', 'edit')
  @NeedLogin()
  @Put('roles/:bizID/permissions')
  async updateRolePermissions(
    @Param('bizID') bizID: string,
    @Body() dto: UpdateRolePermissionsRequest,
    @Req() req: Request,
  ): Promise<{ success: boolean }> {
    const operatorId = req.userContext?.userId || '';
    await this.roleManagerService.upsertPermissionConfig(
      bizID,
      dto.permissions,
      operatorId,
    );
    return { success: true };
  }

  private getExplicitUserIds(
    roleBizId: string,
    dto: AddMembersRequest | RemoveMembersRequest,
  ): string[] {
    if (isBuiltinRole(roleBizId)) {
      throw new BadRequestException('内置角色成员只能通过员工或部门管理修改');
    }

    const members = dto?.members;
    if (
      !members ||
      typeof members !== 'object' ||
      Array.isArray(members) ||
      Object.keys(members).some((key) => key !== 'userList') ||
      !Array.isArray(members.userList) ||
      members.userList.length === 0
    ) {
      throw new BadRequestException('仅支持显式用户成员列表');
    }

    const userIds: string[] = [];
    for (const user of members.userList) {
      if (
        !user ||
        typeof user !== 'object' ||
        Array.isArray(user) ||
        Object.getPrototypeOf(user) !== Object.prototype ||
        typeof user.userID !== 'string' ||
        user.userID.trim().length === 0
      ) {
        throw new BadRequestException('用户成员标识无效');
      }
      userIds.push(user.userID.trim());
    }
    return Array.from(new Set(userIds));
  }

  private requireSuccessfulMutation(
    result: RoleMemberMutationResponse,
  ): RoleMemberMutationResponse {
    if (!result.success) {
      throw new BadGatewayException({
        message: '部分成员授权同步失败',
        ...result,
      });
    }
    return result;
  }

  @NeedLogin()
  @CanRole(['admin'])
  @RequirePermission('permission_management', 'edit')
  @Post('authorization/:employeeId/retry')
  async retryAuthorization(
    @Param('employeeId') employeeId: string,
    @Req() req: Request,
  ) {
    // Reject any supplied role arrays; only use DB durable authorizationRoles
    const body = (req as { body?: unknown }).body;
    if (body && typeof body === 'object' && 'roles' in (body as object)) {
      throw new BadRequestException(
        '重试授权不允许提供角色列表，将使用数据库中的期望角色',
      );
    }

    try {
      const result =
        await this.authorizationSyncService.retryEmployeeAuthorization(
          employeeId,
        );
      if (result.status === 'synced') {
        return { data: { status: result.status } };
      }
      return {
        data: {
          status: result.status,
          error: result.error || `授权同步状态: ${result.status}`,
        },
      };
    } catch (error) {
      throw new BadGatewayException({
        message: '授权重试失败',
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }
}
