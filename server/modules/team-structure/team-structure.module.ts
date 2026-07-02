import { Module } from '@nestjs/common';
import { TeamStructureController } from './team-structure.controller';
import { TeamStructureService } from './team-structure.service';
import { EmployeeManagementModule } from '../employee-management/employee-management.module';

@Module({
  imports: [EmployeeManagementModule],
  controllers: [TeamStructureController],
  providers: [TeamStructureService],
  exports: [TeamStructureService],
})
export class TeamStructureModule {}
