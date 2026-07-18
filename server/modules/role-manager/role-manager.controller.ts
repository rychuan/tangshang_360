import {
  BadRequestException,
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
  async createRole(@Body() dto: CreateRoleRequest) {
    return this.authzSDK.roles.create(dto);
  }

  @CanRole(['admin'])
  @RequirePermission('permission_management', 'edit')
  @NeedLogin()
  @Put('roles/:bizID')
  async updateRole(
    @Param('bizID') bizID: string,
    @Body() dto: UpdateRoleRequest,
  ) {
    return this.authzSDK.roles.update(bizID, dto);
  }

  @CanRole(['admin'])
  @RequirePermission('permission_management', 'edit')
  @NeedLogin()
  @Delete('roles/:bizID')
  async deleteRole(@Param('bizID') bizID: string) {
    if (isBuiltinRole(bizID)) {
      throw new BadRequestException('内置角色不可删除');
    }
    const result = await this.authzSDK.roles.delete(bizID);
    await this.roleManagerService.deletePermissionConfig(bizID);
    return result;
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
    return this.authzSDK.members.list(bizID, {
      type: type as any,
      page: page ? parseInt(page, 10) : undefined,
      pageSize: pageSize ? parseInt(pageSize, 10) : undefined,
    });
  }

  @CanRole(['admin'])
  @RequirePermission('permission_management', 'edit')
  @NeedLogin()
  @Post('roles/:bizID/members')
  async addMembers(
    @Param('bizID') bizID: string,
    @Body() dto: AddMembersRequest,
  ) {
    const userIds = this.getExplicitUserIds(bizID, dto);
    await this.roleManagerService.mutateCustomRoleMembers(
      bizID,
      userIds,
      'add',
      this.authorizationSyncService,
    );
    return { success: true };
  }

  @CanRole(['admin'])
  @RequirePermission('permission_management', 'edit')
  @NeedLogin()
  @Post('roles/:bizID/members/batch_remove')
  async removeMembers(
    @Param('bizID') bizID: string,
    @Body() dto: RemoveMembersRequest,
  ) {
    const userIds = this.getExplicitUserIds(bizID, dto);
    await this.roleManagerService.mutateCustomRoleMembers(
      bizID,
      userIds,
      'remove',
      this.authorizationSyncService,
    );
    return { success: true };
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
  ): Promise<{ success: boolean }> {
    await this.roleManagerService.upsertPermissionConfig(
      bizID,
      dto.permissions,
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

    const userIds = members.userList.map((user) => user.userID?.trim());
    if (userIds.some((userId) => !userId)) {
      throw new BadRequestException('用户成员标识无效');
    }
    return Array.from(new Set(userIds as string[]));
  }
}
