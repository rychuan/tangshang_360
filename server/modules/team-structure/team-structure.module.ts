import { Module } from '@nestjs/common';
import { TeamStructureController } from './team-structure.controller';
import { TeamStructureService } from './team-structure.service';
import { EmployeeManagementModule } from '../employee-management/employee-management.module';
import { RoleManagerModule } from '../role-manager/role-manager.module';
import { AccessScopeModule } from '@server/common/access/access-scope.module';

@Module({
  imports: [EmployeeManagementModule, RoleManagerModule, AccessScopeModule],
  controllers: [TeamStructureController],
  providers: [TeamStructureService],
  exports: [TeamStructureService],
})
export class TeamStructureModule {}
