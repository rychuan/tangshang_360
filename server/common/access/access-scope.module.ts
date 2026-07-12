import { Module } from '@nestjs/common';
import { RoleManagerModule } from '@server/modules/role-manager/role-manager.module';
import { AccessScopeService } from './access-scope.service';

@Module({
  imports: [RoleManagerModule],
  providers: [AccessScopeService],
  exports: [AccessScopeService],
})
export class AccessScopeModule {}
