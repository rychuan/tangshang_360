import { Module } from '@nestjs/common';
import { BitableConnectionController } from './bitable-connection.controller';
import { BitableConnectionService } from './bitable-connection.service';
import { EmployeeManagementModule } from '../employee-management/employee-management.module';
import { RoleManagerModule } from '../role-manager/role-manager.module';
import { AccessScopeModule } from '@server/common/access/access-scope.module';

@Module({
  imports: [EmployeeManagementModule, RoleManagerModule, AccessScopeModule],
  controllers: [BitableConnectionController],
  providers: [BitableConnectionService],
})
export class BitableConnectionModule {}
