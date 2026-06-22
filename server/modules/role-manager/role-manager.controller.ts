import {
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
import { AuthorizationSDK } from '@lark-apaas/fullstack-nestjs-core';
import { RoleManagerService } from './role-manager.service';
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

@Controller('api/role_manager')
export class RoleManagerController {
  constructor(
    private readonly authzSDK: AuthorizationSDK,
    private readonly roleManagerService: RoleManagerService,
  ) {}

  @NeedLogin()
  @Post('my-roles')
  async getMyRoles(@Req() req: any) {
    const userId = req.userContext?.userId || '';
    const roleList = await this.roleManagerService.getUserRoles(userId);
    return { data: { roleList } };
  }

  @CanRole(['admin', 'hrd'])
  @Get('roles')
  async listRoles() {
    return this.authzSDK.roles.list();
  }

  @CanRole(['admin', 'hrd'])
  @Get('roles/:bizID')
  async getRole(@Param('bizID') bizID: string) {
    return this.authzSDK.roles.get(bizID);
  }

  @CanRole(['admin'])
  @NeedLogin()
  @Post('roles')
  async createRole(@Body() dto: CreateRoleRequest) {
    return this.authzSDK.roles.create(dto);
  }

  @CanRole(['admin'])
  @NeedLogin()
  @Put('roles/:bizID')
  async updateRole(
    @Param('bizID') bizID: string,
    @Body() dto: UpdateRoleRequest,
  ) {
    return this.authzSDK.roles.update(bizID, dto);
  }

  @CanRole(['admin'])
  @NeedLogin()
  @Delete('roles/:bizID')
  async deleteRole(@Param('bizID') bizID: string) {
    await this.roleManagerService.deletePermissionConfig(bizID);
    return this.authzSDK.roles.delete(bizID);
  }

  @CanRole(['admin', 'hrd'])
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
  @NeedLogin()
  @Post('roles/:bizID/members')
  async addMembers(
    @Param('bizID') bizID: string,
    @Body() dto: AddMembersRequest,
  ) {
    return this.authzSDK.members.add(bizID, dto);
  }

  @CanRole(['admin'])
  @NeedLogin()
  @Post('roles/:bizID/members/batch_remove')
  async removeMembers(
    @Param('bizID') bizID: string,
    @Body() dto: RemoveMembersRequest,
  ) {
    return this.authzSDK.members.remove(bizID, dto);
  }

  @CanRole(['admin'])
  @NeedLogin()
  @Delete('roles/:bizID/members')
  async clearMembers(@Param('bizID') bizID: string) {
    return this.authzSDK.members.clear(bizID);
  }

  @CanRole(['admin', 'hrd'])
  @Post('search')
  async search(@Body() dto: SearchMembersRequest) {
    return this.authzSDK.search.search(dto);
  }

  @CanRole(['admin', 'hrd'])
  @Get('roles/:bizID/permissions')
  async getRolePermissions(
    @Param('bizID') bizID: string,
  ): Promise<RolePermissionConfig> {
    const config = await this.roleManagerService.getPermissionConfig(bizID);
    if (config) {
      return config;
    }
    const preset = (DEFAULT_PERMISSIONS as Record<string, PermissionItem[]>)[bizID];
    return {
      roleBizId: bizID,
      permissions: preset || [],
    };
  }

  @CanRole(['admin'])
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
}
