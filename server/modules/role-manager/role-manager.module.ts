import { Module } from '@nestjs/common';
import { RoleManagerController } from './role-manager.controller';
import { RoleManagerService } from './role-manager.service';
import { AuthorizationSyncService } from './authorization-sync.service';

@Module({
  controllers: [RoleManagerController],
  providers: [RoleManagerService, AuthorizationSyncService],
  exports: [RoleManagerService, AuthorizationSyncService],
})
export class RoleManagerModule {}
