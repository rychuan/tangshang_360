import { Module } from '@nestjs/common';
import { TeamStructureController } from './team-structure.controller';
import { TeamStructureService } from './team-structure.service';
import { EmployeeSnapshotModule } from '../employee-snapshot/employee-snapshot.module';

@Module({
  imports: [EmployeeSnapshotModule],
  controllers: [TeamStructureController],
  providers: [TeamStructureService],
  exports: [TeamStructureService],
})
export class TeamStructureModule {}