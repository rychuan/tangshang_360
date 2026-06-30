import { Module } from '@nestjs/common';
import { BitableConnectionController } from './bitable-connection.controller';
import { BitableConnectionService } from './bitable-connection.service';
import { EmployeeManagementModule } from '../employee-management/employee-management.module';
import { RoleManagerModule } from '../role-manager/role-manager.module';

@Module({
  imports: [EmployeeManagementModule, RoleManagerModule],
  controllers: [BitableConnectionController],
  providers: [BitableConnectionService],
})
export class BitableConnectionModule {}
