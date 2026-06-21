import { Module } from '@nestjs/common';
import { RoleManagerController } from './role-manager.controller';
import { RoleManagerService } from './role-manager.service';

@Module({
  controllers: [RoleManagerController],
  providers: [RoleManagerService],
  exports: [RoleManagerService],
})
export class RoleManagerModule {}
